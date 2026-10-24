using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using DeadZone.Core;
using UnityEngine;
#if DZ_URP
using UnityEngine.Rendering.Universal;
#endif

namespace DeadZone.Game
{
    /// <summary>
    /// Automatic play test with screenshots ("Automatischer Test"). Inactive unless the editor tool sets <see cref="Requested"/>
    /// before Play Mode (menu Dead Zone > Automatischer Test) or the game is started with -dzAutoTest.
    /// Plays a scripted round through GameRoot's public API: new game, raid in the city, looking around, walking, shooting,
    /// reloading, inventory, grenade, top-down view and back, death, back to base. The save lives in memory only, so the
    /// player's real save and settings on disk stay untouched.
    /// Screenshots render the camera view into a texture (works in batch mode; the IMGUI interface is not in these pictures,
    /// outside batch mode an extra *_mit_oberflaeche.png captures the whole window).
    /// Output: Logs/DeadZoneTest/ next to Assets (in a build: next to the game, or -dzTestOut &lt;dir&gt;) with PNGs and report.txt.
    /// </summary>
    public sealed class AutoTest : MonoBehaviour
    {
        /// <summary>Set by the editor tool before Play Mode starts; consumed when the scene loads.</summary>
        public static bool Requested;
        /// <summary>True once the run is over and the report is written (the editor tool waits for it).</summary>
        public static bool Finished { get; private set; }
        /// <summary>Errors and exceptions from the game plus failed steps; 0 = passed.</summary>
        public static int Problems { get; private set; }
        public static string ReportPath { get; private set; }

        public const string LogTag = "[DZ-Test]";
        private const uint Seed = 20261024u;
        private const float TimeoutSeconds = 150f, SlowFrameMs = 33.4f;
        private const int ShotWidth = 1600, ShotHeight = 900, MaxMessages = 80;
        private static readonly string[] DirNames = { "geradeaus", "rechts", "hinten", "links" };
        private static readonly string[] DirFiles = { "vorne", "rechts", "hinten", "links" };

        // log capture (Unity may call it from other threads)
        private static readonly object Lock = new object();
        private static readonly List<string> Messages = new List<string>();
        private static int _errors, _exceptions, _engineErrors, _warnings;

        private struct Step { public string name; public Func<bool> tick; }

        private sealed class FrameStats
        {
            public int count, slow;
            public double sum;
            public float worst;
            public string worstAt;

            public void Add(float ms, string at)
            {
                count++; sum += ms;
                if (ms > SlowFrameMs) slow++;
                if (ms > worst) { worst = ms; worstAt = at; }
            }

            public string Text() => count == 0 ? "keine Messung" :
                $"Schnitt {sum / count:0.0} ms ({1000.0 / (sum / count):0} Bilder/s), schlechteste {worst:0.0} ms (bei „{worstAt}“), über {SlowFrameMs:0} ms: {slow} von {count} Bildern";
        }

        private readonly List<Step> _steps = new List<Step>();
        private readonly List<string> _log = new List<string>();
        private readonly List<string> _issues = new List<string>();
        private readonly FrameStats _allFrames = new FrameStats(), _raidFrames = new FrameStats();
        private GameRoot _game;
        private string _dir;
        private int _index, _skipStats, _stepFailures, _shots, _shotsBefore, _zombiesStart = -1, _zombiesEnd = -1;
        private float _t0, _stepStart, _raidStatsFrom = float.MaxValue;
        private double _startYaw, _distBefore;
        private bool _done, _grenadeThrown;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Boot()
        {
            var args = Environment.GetCommandLineArgs();
            bool cmd = Array.IndexOf(args, "-dzAutoTest") >= 0 || Array.IndexOf(args, "DeadZone.EditorTools.PlayTest.RunBatch") >= 0;
            if (!Requested && !cmd) return;
            Requested = false;
            Finished = false;
            Problems = 0;
            ReportPath = null;
            lock (Lock) { Messages.Clear(); _errors = _exceptions = _engineErrors = _warnings = 0; }
            // hooked before the scene wakes up, so errors from GameRoot.Awake are counted too
            Application.logMessageReceivedThreaded -= OnLog;
            Application.logMessageReceivedThreaded += OnLog;
            var go = new GameObject("DeadZone AutoTest");
            DontDestroyOnLoad(go);
            go.AddComponent<AutoTest>();
        }

        private static string Arg(string name)
        {
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
            return null;
        }

        /// <summary>Logs/DeadZoneTest in the project folder (in a build: the game folder).</summary>
        public static string OutputFolder() => Arg("-dzTestOut") ?? Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? ".", "Logs", "DeadZoneTest");

        private void Awake()
        {
            _t0 = _stepStart = Time.realtimeSinceStartup;
            _dir = OutputFolder();
            try
            {
                Directory.CreateDirectory(_dir);
                // only the pictures of an earlier run ("01_hauptmenue.png" ...), never other files in a folder given with -dzTestOut
                foreach (var f in Directory.GetFiles(_dir, "??_*.png"))
                {
                    string n = Path.GetFileName(f);
                    if (char.IsDigit(n[0]) && char.IsDigit(n[1])) File.Delete(f);
                }
            }
            catch (Exception e)
            {
                _dir = Path.Combine(Application.persistentDataPath, "DeadZoneTest");
                Directory.CreateDirectory(_dir);
                Issue("Ausgabeordner nicht beschreibbar (" + e.Message + "), stattdessen " + _dir);
            }
            ReportPath = Path.Combine(_dir, "report.txt");
            BuildPlan();
            Note("Automatischer Test startet, Ausgabe: " + _dir);
        }

        // ------------------------------------------------------------------ plan
        private void BuildPlan()
        {
            Add("Spiel bereit", () =>
            {
                _game = GameRoot.Instance;
                if (_game != null && _game.core != null && _game.ui != null && _game.rig != null) { Note("Spiel bereit (Zustand „" + _game.state + "“)"); return true; }
                if (Elapsed > 30f) Abort("GameRoot wurde nicht erzeugt – das Spiel ist nicht gestartet");
                return false;
            });
            Wait(1.5f);
            Shot("01_hauptmenue");
            Do("Neues Spiel (Test-Spielstand nur im Speicher)", NewTestGame);
            Wait(1.5f);
            Shot("02_basis");
            Do("Einsatz in der Stadt starten", StartTestRaid);
            Wait(2f);
            Shot("03_einsatz_start");
            for (int k = 0; k < 4; k++)
            {
                int dir = k;
                Do("Umsehen: " + DirNames[k], () => { if (InRaid()) { _game.input.yaw = M.NormAngle(_startYaw + dir * Math.PI / 2); _game.input.pitch = 0f; } });
                Wait(0.6f);
                Shot("04_blick_" + (k + 1) + "_" + DirFiles[k]);
            }
            Do("Vorwärts gehen", () => { if (!InRaid()) return; _game.input.yaw = _startYaw; _distBefore = _game.Raid.player.stats.distance; _game.input.scriptedMove = Vector2.up; });
            Wait(3f);
            Shot("05_gehen");
            Do("Stehen bleiben", () =>
            {
                _game.input.scriptedMove = Vector2.zero;
                if (!InRaid()) return;
                double m = (_game.Raid.player.stats.distance - _distBefore) * Coords.S;
                Note($"Strecke: {m:0.0} m");
                if (m < 1) Issue("Die Figur ist beim Vorwärtsgehen kaum vorangekommen (" + m.ToString("0.0") + " m) – Wand im Weg oder Bewegung kaputt?");
            });
            Do("Schießen", () => { if (!InRaid()) return; _shotsBefore = _game.Raid.player.stats.shotsFired; _game.input.scriptedFire = true; });
            WaitFor("erster Schuss", () => !InRaid() || _game.Raid.player.stats.shotsFired > _shotsBefore, 1f);
            Shot("06_schuss");
            Add("weitere Schüsse", () =>
            {
                // release and press again: three more single shots
                _game.input.scriptedFire = Elapsed % 0.3f < 0.12f;
                if (Elapsed < 0.9f) return false;
                _game.input.scriptedFire = false;
                return true;
            });
            Do("Schüsse zählen", () =>
            {
                if (!InRaid()) return;
                var p = _game.Raid.player;
                int n = p.stats.shotsFired - _shotsBefore;
                Note("Schüsse abgegeben: " + n + ", Magazin jetzt: " + (p.WeaponInst?.mag?.ToString() ?? "-"));
                if (n == 0) Issue("Es wurde kein Schuss abgegeben (Waffe " + (p.WeaponInst?.id ?? "keine") + ")");
            });
            Do("Nachladen", () => { if (InRaid()) _game.input.Push("reload"); });
            Wait(0.4f);
            Shot("07_nachladen");
            WaitFor("Nachladen fertig", () => !InRaid() || !(_game.Raid.player.WeaponInst?.rt?.reloading ?? false), 4f);
            Do("Inventar öffnen", () => _game.ui.inventoryOpen = true);
            Wait(0.8f);
            Shot("08_inventar");
            Do("Inventar schließen", () =>
            {
                if (_game.state == "raid" && !_game.input.blocked) Issue("Offenes Inventar hat die Steuerung nicht gesperrt");
                _game.ui.inventoryOpen = false;
            });
            Wait(0.5f);
            Do("Granate werfen", () =>
            {
                if (!InRaid()) return;
                if (_game.Raid.player.equipment.grenade == null) { Note("übersprungen: keine Granate ausgerüstet"); return; }
                _game.input.pitch = -12f; // looking up a little throws farther
                _game.input.Push("grenade");
                _grenadeThrown = true;
            });
            Wait(0.35f);
            Shot("09_granate_wurf");
            Do("wieder geradeaus schauen", () =>
            {
                if (!InRaid()) return;
                _game.input.pitch = 0f;
                if (_grenadeThrown && _game.Raid.grenades.Count == 0) Issue("Die Granate wurde nicht geworfen");
            });
            WaitFor("Explosion", () => !InRaid() || _game.Raid.grenades.Count == 0, 5f);
            Shot("10_granate_explosion");
            Wait(1f);
            Do("Ansicht von oben (V)", () => { if (_game.FirstPerson) _game.ToggleView(); });
            Wait(1.5f);
            Shot("11_von_oben");
            Do("zurück zur Ego-Perspektive (V)", () => { if (!_game.FirstPerson) _game.ToggleView(); });
            Wait(1f);
            Shot("12_ego_perspektive");
            Do("Spieler stirbt", () =>
            {
                if (!InRaid()) return;
                var p = _game.Raid.player;
                _zombiesEnd = _game.Raid.zombies.AliveCount();
                p.god = false;
                p.TakeDamage(9999, "Test");
                if (!p.dead) Issue("Der Spieler ist trotz 9999 Schaden nicht gestorben");
            });
            Wait(0.9f);
            Shot("13_tod");
            WaitFor("Ergebnis-Bildschirm", () => _game.state == "result", 3f);
            Wait(1.5f);
            Shot("14_ergebnis");
            Do("zurück zur Basis", () =>
            {
                if (_game.state != "result") { Issue("Nach dem Tod kam kein Ergebnis-Bildschirm (Zustand „" + _game.state + "“)"); return; }
                Note("Ergebnis: " + _game.lastResult?.outcome + ", Ursache: " + _game.lastResult?.causeOfDeath);
                _game.LeaveResult();
            });
            Wait(1.5f);
            Shot("15_basis_zurueck");
            Do("Zustand prüfen", () => { if (_game.state != "base") Issue("Am Ende nicht in der Basis (Zustand „" + _game.state + "“)"); });
        }

        private void NewTestGame()
        {
            var keep = _game.core.settings;
            // throwaway save in memory: NewGame would otherwise delete the real save
            _game.core = new GameCore(new MemoryStorage(), _game, Seed) { settings = Settings.FromJson(keep.ToJson()) };
            _game.core.settings.view = "fps";
            _game.ApplySettings();
            _game.NewGame();
            var eq = _game.core.Profile.equipment;
            if (eq.grenade == null && eq.Equip(Items.Create("grenade_frag", 2), "grenade").ok) Note("Testausrüstung: 2 Splittergranaten dazu");
            if (_game.state != "base") Issue("Nach „Neues Spiel“ nicht in der Basis (Zustand „" + _game.state + "“)");
        }

        private void StartTestRaid()
        {
            _game.core.settings.view = "fps";
            var sw = System.Diagnostics.Stopwatch.StartNew();
            _game.StartRaid("city");
            sw.Stop();
            var raid = _game.Raid;
            if (raid == null || _game.state != "raid") throw new InvalidOperationException("Kein Einsatz nach StartRaid (Zustand " + _game.state + ")");
            raid.player.god = true; // zombies must not end the test early; the death at the end is forced
            _game.input.scripted = true;
            _startYaw = _game.input.yaw;
            _zombiesStart = raid.zombies.AliveCount();
            _raidStatsFrom = Time.realtimeSinceStartup + 1f;
            int renderers = _game.GetComponentsInChildren<Renderer>(true).Length;
            Note($"Einsatz geladen in {sw.ElapsedMilliseconds} ms: {raid.map.name}, Seed {raid.seed}, {raid.world.w}x{raid.world.h} Felder, Zombies {_zombiesStart}, Objekte mit Renderer {renderers}");
            if (renderers < 10) Issue("Sehr wenige 3D-Objekte im Einsatz (" + renderers + ") – wurde die Welt gebaut?");
        }

        private bool InRaid() => _game != null && _game.state == "raid" && _game.Raid != null && !_game.Raid.ended;

        // ------------------------------------------------------------------ step helpers
        private float Elapsed => Time.realtimeSinceStartup - _stepStart;
        private float T => Time.realtimeSinceStartup - _t0;
        private string StepName => _index < _steps.Count ? _steps[_index].name : "Ende";

        private void Add(string name, Func<bool> tick) => _steps.Add(new Step { name = name, tick = tick });
        private void Wait(float seconds) => Add("warten " + seconds.ToString("0.0") + " s", () => Elapsed >= seconds);
        private void Shot(string name) => Add("Bild " + name, () => { Capture(name); return true; });

        private void Do(string name, Action action) => Add(name, () =>
        {
            Note(name);
            _skipStats = 2; // world building and screenshots are no frame-time measurement
            action();
            return true;
        });

        private void WaitFor(string what, Func<bool> condition, float timeout) => Add(what, () =>
        {
            if (condition()) return true;
            if (Elapsed < timeout) return false;
            Issue("Zeitüberschreitung beim Warten auf: " + what);
            return true;
        });

        private void Note(string text)
        {
            _log.Add($"[{T,6:0.0} s] {text}");
            Debug.Log(LogTag + " " + text);
        }

        private void Issue(string text) { _issues.Add(text); Note("AUFFÄLLIG: " + text); }

        private void Fail(string text) { _stepFailures++; _issues.Add("Schritt fehlgeschlagen: " + text); Note("FEHLER: " + text); }

        private void Abort(string text) { Fail(text); Finish(); }

        // ------------------------------------------------------------------ frame
        private void Update()
        {
            if (_done) return;
            RecordFrame();
            // losing the focus (batch mode, a click into another window) pauses a raid: the test keeps it running
            if (_game != null && _game.state == "raid") _game.paused = false;
            if (T > TimeoutSeconds) { Abort("Zeitlimit von " + TimeoutSeconds + " s überschritten bei „" + StepName + "“"); return; }
            if (_index >= _steps.Count) { Finish(); return; }
            bool next;
            try { next = _steps[_index].tick(); }
            catch (Exception e) { Fail("„" + StepName + "“: " + e); next = true; }
            if (_done || !next) return;
            _index++;
            _stepStart = Time.realtimeSinceStartup;
            if (_index >= _steps.Count) Finish();
        }

        private void RecordFrame()
        {
            if (_game == null) return;
            if (_skipStats > 0) { _skipStats--; return; }
            float ms = Time.unscaledDeltaTime * 1000f;
            _allFrames.Add(ms, StepName);
            if (_game.state == "raid" && Time.realtimeSinceStartup >= _raidStatsFrom) _raidFrames.Add(ms, StepName);
        }

        // ------------------------------------------------------------------ screenshots
        private void Capture(string name)
        {
            _skipStats = 2;
            var src = _game != null && _game.rig != null ? _game.rig.cam : Camera.main;
            if (src == null) { Issue("Bild " + name + ": keine Kamera gefunden"); return; }
            string file = name + ".png";
            Texture2D img = null;
            var go = new GameObject("AutoTest Camera");
            try
            {
                // a fresh camera with the same settings: rendering the game camera itself into a texture can mix up
                // its GPU culling history (parts of the world missing in later shots)
                var cam = go.AddComponent<Camera>();
                cam.CopyFrom(src);
                cam.aspect = (float)ShotWidth / ShotHeight;
#if DZ_URP
                if (UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline != null)
                {
                    var from = src.GetUniversalAdditionalCameraData();
                    var to = cam.GetUniversalAdditionalCameraData();
                    to.renderPostProcessing = from.renderPostProcessing;
                    to.antialiasing = from.antialiasing;
                    to.antialiasingQuality = from.antialiasingQuality;
                }
#endif
                img = Render(cam);
                File.WriteAllBytes(Path.Combine(_dir, file), img.EncodeToPNG());
                _shots++;
                Analyse(img, out float bright, out float spread, out float magenta, out float cyan);
                Note($"Bild {file}: Helligkeit {bright:0}/255, Kontrast {spread:0}, Magenta {magenta:0.0} %, Türkis {cyan:0.0} % | {Snapshot()}");
                if (bright < 6f) Issue(file + ": fast schwarz (Helligkeit " + bright.ToString("0") + ")");
                else if (spread < 3f) Issue(file + ": fast einfarbig – zeigt die Kamera nur den Hintergrund?");
                if (magenta > 2f) Issue(file + ": " + magenta.ToString("0") + " % Magenta – vermutlich fehlt ein Shader oder Material");
                if (cyan > 5f) Issue(file + ": " + cyan.ToString("0") + " % Türkis – Unity hat beim Aufnehmen noch Shader übersetzt (Test einfach noch einmal starten)");
            }
            finally
            {
                if (img != null) Destroy(img);
                DestroyImmediate(go);
            }
            // outside batch mode the window exists: a second picture with the interface (written at the end of the frame)
            if (!Application.isBatchMode) ScreenCapture.CaptureScreenshot(Path.Combine(_dir, name + "_mit_oberflaeche.png"));
        }

        private static Texture2D Render(Camera cam)
        {
            var rt = new RenderTexture(ShotWidth, ShotHeight, 24, RenderTextureFormat.ARGB32);
            var prevTarget = cam.targetTexture;
            var prevActive = RenderTexture.active;
            try
            {
                cam.targetTexture = rt;
                cam.Render();
                RenderTexture.active = rt;
                var img = new Texture2D(ShotWidth, ShotHeight, TextureFormat.RGB24, false);
                img.ReadPixels(new Rect(0, 0, ShotWidth, ShotHeight), 0, 0);
                img.Apply();
                return img;
            }
            finally
            {
                cam.targetTexture = prevTarget;
                RenderTexture.active = prevActive;
                rt.Release();
                DestroyImmediate(rt);
            }
        }

        /// <summary>
        /// Mean brightness, its spread and the shares of pure magenta (Unity's colour for a broken shader) and cyan
        /// (the Editor's placeholder while a shader still compiles).
        /// </summary>
        private static void Analyse(Texture2D img, out float bright, out float spread, out float magenta, out float cyan)
        {
            var px = img.GetPixels32();
            double sum = 0, sum2 = 0;
            int n = 0, mag = 0, cy = 0;
            for (int i = 0; i < px.Length; i += 7)
            {
                var c = px[i];
                double l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
                sum += l; sum2 += l * l; n++;
                if (c.r > 200 && c.b > 200 && c.g < 60) mag++;
                if (c.g > 200 && c.b > 200 && c.r < 60) cy++;
            }
            double mean = n > 0 ? sum / n : 0;
            bright = (float)mean;
            spread = n > 0 ? (float)Math.Sqrt(Math.Max(0, sum2 / n - mean * mean)) : 0f;
            magenta = n > 0 ? 100f * mag / n : 0f;
            cyan = n > 0 ? 100f * cy / n : 0f;
        }

        private string Snapshot()
        {
            if (_game == null) return "kein Spiel";
            var sb = new StringBuilder();
            sb.Append("Zustand ").Append(_game.state).Append(", Ansicht ").Append(_game.FirstPerson ? "Ego" : "von oben");
            var raid = _game.Raid;
            if (raid != null && (_game.state == "raid" || _game.state == "result"))
            {
                var p = raid.player;
                sb.Append($", LP {p.hp:0}, Feld ({(int)(p.x / World.TILE)},{(int)(p.y / World.TILE)}), Blick {_game.input.yaw * Mathf.Rad2Deg:0}°/{_game.input.pitch:0}°");
                sb.Append(", Waffe ").Append(p.WeaponInst?.id ?? "-").Append(" (Magazin ").Append(p.WeaponInst?.mag?.ToString() ?? "-").Append(')');
                sb.Append($", Zombies {raid.zombies.AliveCount()} (in 30 m: {raid.zombies.InRadius(p.x, p.y, 30 / Coords.S).Count}), Uhrzeit {Raid.FormatHour(raid.hour)}");
            }
            return sb.ToString();
        }

        // ------------------------------------------------------------------ log capture
        private static void OnLog(string message, string stack, LogType type)
        {
            if (type == LogType.Log || message == null || message.StartsWith(LogTag, StringComparison.Ordinal)) return;
            if (message.IndexOf("Administrator privileges", StringComparison.Ordinal) >= 0) return;
            stack = stack ?? "";
            bool error = type != LogType.Warning;
            // errors from editor internals (search index, inspector, ...) are listed but do not fail the test
            bool engine = error && stack.IndexOf("DeadZone", StringComparison.Ordinal) < 0 && stack.IndexOf("UnityEditor.", StringComparison.Ordinal) >= 0;
            string where = "";
            if (error && stack.Length > 0)
            {
                var lines = stack.Split('\n');
                where = "\n      @ " + string.Join(" | ", lines, 0, Math.Min(4, lines.Length)).Trim();
            }
            lock (Lock)
            {
                if (!error) _warnings++;
                else if (engine) _engineErrors++;
                else if (type == LogType.Exception) _exceptions++;
                else _errors++;
                if (Messages.Count < MaxMessages) Messages.Add("[" + type + (engine ? ", Unity-intern" : "") + "] " + message.Trim() + where);
            }
        }

        // ------------------------------------------------------------------ end
        private void Finish()
        {
            if (_done) return;
            _done = true;
            var inp = _game != null ? _game.input : null;
            if (inp != null) { inp.scripted = false; inp.scriptedMove = Vector2.zero; inp.scriptedFire = false; }
            Application.logMessageReceivedThreaded -= OnLog;
            int errors, exceptions;
            lock (Lock) { errors = _errors; exceptions = _exceptions; }
            Problems = errors + exceptions + _stepFailures;
            Note("Ende: " + (Problems == 0 ? "keine Fehler" : Problems + " Problem(e)"));
            try { File.WriteAllText(ReportPath, BuildReport(), new UTF8Encoding(false)); }
            catch (Exception e) { Debug.LogWarning(LogTag + " Bericht konnte nicht geschrieben werden: " + e.Message); }
            Finished = true;
            Debug.Log(LogTag + " Bericht: " + ReportPath);
            // a build started with -dzAutoTest closes itself; the exit code tells whether the test passed
            if (!Application.isEditor) Invoke(nameof(QuitGame), 0.5f);
        }

        private void QuitGame() => Application.Quit(Problems == 0 ? 0 : 1);

        private void OnDestroy()
        {
            if (_done) return;
            Fail("Test vorzeitig beendet bei „" + StepName + "“ (Play Mode gestoppt oder Spiel geschlossen)");
            Finish();
        }

        private string BuildReport()
        {
            int errors, exceptions, engine, warnings;
            List<string> messages;
            lock (Lock) { errors = _errors; exceptions = _exceptions; engine = _engineErrors; warnings = _warnings; messages = new List<string>(Messages); }
            var rp = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline;
            var q = QualitySettings.names;
            int ql = QualitySettings.GetQualityLevel();
            var sb = new StringBuilder();
            sb.AppendLine("DEAD ZONE: EXTRACTION – Automatischer Test");
            sb.AppendLine("==========================================");
            sb.AppendLine(Problems == 0 ? "Ergebnis: BESTANDEN (keine Fehler, keine Ausnahmen)" : $"Ergebnis: PROBLEME ({errors} Fehler, {exceptions} Ausnahmen, {_stepFailures} fehlgeschlagene Schritte)");
            sb.AppendLine("Datum: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + $", Dauer {T:0.0} s");
            sb.AppendLine($"Unity {Application.unityVersion} ({Application.platform}), Batchmode: {(Application.isBatchMode ? "ja" : "nein")}");
            sb.AppendLine($"Grafik: {SystemInfo.graphicsDeviceName} ({SystemInfo.graphicsDeviceType}), Renderpipeline: {(rp != null ? rp.name : "eingebaut (keine URP)")}");
            sb.AppendLine($"Fenster: {Screen.width}x{Screen.height}, Qualitätsstufe: {(ql >= 0 && ql < q.Length ? q[ql] : ql.ToString())}, Bilder: {ShotWidth}x{ShotHeight}");
            sb.AppendLine();
            sb.AppendLine("Zusammenfassung");
            sb.AppendLine("  Fehler aus dem Spiel: " + errors);
            sb.AppendLine("  Ausnahmen (Exceptions): " + exceptions);
            sb.AppendLine("  Fehler aus Unity selbst (Editor, zählen nicht): " + engine);
            sb.AppendLine("  Warnungen: " + warnings);
            sb.AppendLine("  Fehlgeschlagene Schritte: " + _stepFailures + $" (Schritte erledigt: {Math.Min(_index, _steps.Count)} von {_steps.Count})");
            sb.AppendLine("  Bildzeit gesamt: " + _allFrames.Text());
            sb.AppendLine("  Bildzeit im Einsatz: " + _raidFrames.Text());
            sb.AppendLine($"  Zombies lebend: beim Start {(_zombiesStart < 0 ? "-" : _zombiesStart.ToString())}, vor dem Tod {(_zombiesEnd < 0 ? "-" : _zombiesEnd.ToString())}");
            sb.AppendLine("  Bilder gespeichert: " + _shots + " in " + _dir);
            sb.AppendLine();
            sb.AppendLine("Auffälligkeiten");
            if (_issues.Count == 0) sb.AppendLine("  keine");
            foreach (var i in _issues) sb.AppendLine("  - " + i);
            sb.AppendLine();
            sb.AppendLine("Ablauf");
            foreach (var l in _log) sb.AppendLine("  " + l);
            sb.AppendLine();
            sb.AppendLine($"Meldungen (Fehler, Ausnahmen, Warnungen; höchstens {MaxMessages})");
            if (messages.Count == 0) sb.AppendLine("  keine");
            foreach (var m in messages) sb.AppendLine("  " + m);
            sb.AppendLine();
            sb.AppendLine("Hinweise");
            sb.AppendLine("  - Die Bilder zeigen nur die 3D-Welt. Menüs und Anzeigen (IMGUI) fehlen darin; ohne Batchmode gibt es dazu *_mit_oberflaeche.png.");
            sb.AppendLine("  - Im Editor sind die Bildzeiten höher als im fertigen Spiel. Bilder direkt nach Ladevorgängen und Aufnahmen zählen nicht mit.");
            sb.AppendLine("  - Der Test benutzt einen Spielstand nur im Speicher; der echte Spielstand bleibt unverändert.");
            return sb.ToString();
        }
    }
}
