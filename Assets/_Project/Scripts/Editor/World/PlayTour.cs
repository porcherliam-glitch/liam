using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Aetherfall.Core;
using Aetherfall.Dialogue;
using Aetherfall.NPC;
using Aetherfall.Player;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Screens;
using Aetherfall.World.Dungeons;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Automatic play-mode check ("Spiel-Rundgang"): opens a scene, enters Play Mode, starts a new game (from the boot
    /// scene through the main menu, from a test scene through <c>DevPlayStarter</c>), waits until the player is in the
    /// world, saves screenshots and writes every warning, error and exception of the session to a report.
    /// </summary>
    /// <remarks>
    /// <para>Batch call (with graphics, i.e. without <c>-nographics</c>, and without <c>-quit</c>; Unity exits by itself with
    /// exit code 1 if errors or exceptions from project code were logged):
    /// <c>Unity.exe -batchmode -projectPath . -executeMethod Aetherfall.EditorTools.World.PlayTour.RunBatch -tourScene Assets/_Project/Scenes/Boot/Boot.unity -logFile Logs\tour.log</c></para>
    /// <para>Output: <c>Logs/Tour/&lt;scene&gt;/</c> with PNG screenshots and <c>bericht.txt</c>. Batch mode has no game view, so
    /// every shot renders a camera into a render texture and, for the UI, points the UI Toolkit panels at a second render
    /// texture for two frames and blends both images.</para>
    /// </remarks>
    public static partial class PlayTour
    {
        private const string MenuPath = "Aetherfall/Entwicklung/Spiel-Rundgang (Screenshots)";
        private const string DefaultScene = "Assets/_Project/Scenes/Boot/Boot.unity";
        private const double ServiceTimeoutSeconds = 60.0;
        private const double PlayingTimeoutSeconds = 180.0;
        private const int ShotWidth = 1600;
        private const int ShotHeight = 900;

        private static readonly List<string> Messages = new List<string>();
        private static readonly Queue<Func<bool>> Steps = new Queue<Func<bool>>();
        private static string _scenePath;
        private static string _outputFolder;
        private static double _stepStart;
        private static int _projectErrors;
        private static int _engineErrors;
        private static int _warningCount;
        private static bool _batch;
        private static bool _failed;
        private static bool _exiting;
        private static IGameStateService _gameState;
        private static PendingShot _pending;
        private static NpcInteractable _npc;
        private static DungeonPortal _portal;
        private static bool _portalUsed;
        private static bool _quickSaveDone;
        private static bool _bossShown;
        private static string _sceneBefore = string.Empty;

        /// <summary>Menu entry: runs the tour for the boot scene in the open editor.</summary>
        [MenuItem(MenuPath)]
        public static void RunFromMenu()
        {
            Start(DefaultScene, false);
        }

        /// <summary>Batch entry point; reads <c>-tourScene &lt;path&gt;</c> from the command line.</summary>
        public static void RunBatch()
        {
            Start(ReadArgument("-tourScene") ?? DefaultScene, true);
        }

        private static void Start(string scenePath, bool batch)
        {
            _scenePath = scenePath;
            _batch = batch;
            _projectErrors = 0;
            _engineErrors = 0;
            _warningCount = 0;
            _failed = false;
            _exiting = false;
            _pending = null;
            _npc = null;
            _portal = null;
            _portalUsed = false;
            Messages.Clear();
            Steps.Clear();
            string projectRoot = Path.GetDirectoryName(Application.dataPath) ?? ".";
            string mode = ReadArgument("-tourMode");
            _outputFolder = Path.Combine(projectRoot, "Logs", "Tour", Path.GetFileNameWithoutExtension(scenePath) +
                                                                      (mode == "quests" ? "_Quests" : mode == "magier" ? "_Magier" :
                                                                          mode == "waffen" ? "_Waffen" : string.Empty));
            Directory.CreateDirectory(_outputFolder);
            foreach (string old in Directory.GetFiles(_outputFolder))
            {
                File.Delete(old);
            }

            if (!EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single).IsValid())
            {
                Note("FEHLER: Szene konnte nicht geöffnet werden: " + scenePath);
                _failed = true;
                Finish();
                return;
            }

            BuildPlan();
            Application.logMessageReceivedThreaded -= OnLog;
            Application.logMessageReceivedThreaded += OnLog;
            EditorApplication.update -= Tick;
            EditorApplication.update += Tick;
            _stepStart = EditorApplication.timeSinceStartup;
            Note("Rundgang startet in " + scenePath);
            EditorApplication.EnterPlaymode();
        }

        private static void BuildPlan()
        {
            Steps.Enqueue(WaitForServices);
            if (IsBootScene())
            {
                Steps.Enqueue(() => WaitForState(GameState.MainMenu, ServiceTimeoutSeconds));
                Steps.Enqueue(() => Wait(2.0));
                Steps.Enqueue(() => Capture("01_hauptmenue", null));
                Steps.Enqueue(StartNewGame);
            }

            Steps.Enqueue(() => WaitForState(GameState.Playing, PlayingTimeoutSeconds));
            Steps.Enqueue(() => Wait(4.0));
            if (ReadArgument("-tourMode") == "quests")
            {
                // Automated play-through of the mini slice quests instead of the screenshot tour (PlayTour.Quests.cs).
                BuildQuestPlan();
                return;
            }

            if (ReadArgument("-tourMode") == "magier")
            {
                // The mage class: start values, staff, fire bolts, mana potion (PlayTour.Mage.cs).
                BuildMagePlan();
                return;
            }

            if (ReadArgument("-tourMode") == "waffen")
            {
                // Mace and bow of the warrior (PlayTour.Weapons.cs).
                BuildWeaponsPlan();
                return;
            }

            Steps.Enqueue(ReportPlayer);
            Steps.Enqueue(() => Capture("02_spiel_mit_hud", null));
            Steps.Enqueue(() => Capture("03_hinter_spieler", ViewBehindPlayer));
            Steps.Enqueue(() => Capture("04_umgebung", ViewOverview));
            Steps.Enqueue(() => Capture("05_von_oben", ViewTopDown));
            Steps.Enqueue(PauseGame);
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(() => Capture("06_pausemenue", null));
            Steps.Enqueue(ResumeGame);
            Steps.Enqueue(() => Wait(0.5));

            // Conversation with the first NPC of the scene (skipped if there is none).
            Steps.Enqueue(WalkToNpc);
            Steps.Enqueue(() => Wait(1.5));
            Steps.Enqueue(ReportInteractionTarget);
            Steps.Enqueue(() => _npc == null || Capture("07_npc_hinweis", null));
            Steps.Enqueue(TalkToNpc);
            Steps.Enqueue(() => Wait(1.5));
            Steps.Enqueue(() => _npc == null || Capture("08_dialog_zeile", null));
            Steps.Enqueue(ContinueToChoice);
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(() => _npc == null || Capture("09_dialog_auswahl", null));
            Steps.Enqueue(EndConversation);

            // Portal round trip (skipped without a portal): half health, through the portal, quick save on the other side,
            // back through the exit, then load the quick save from there (must change the scene again).
            Steps.Enqueue(() => Wait(0.5));
            Steps.Enqueue(HurtPlayer);
            Steps.Enqueue(UsePortal);
            Steps.Enqueue(WaitForSceneChange);
            Steps.Enqueue(() => Wait(2.0));
            Steps.Enqueue(() => ReportTravel("nach dem Portal"));
            Steps.Enqueue(() => !_portalUsed || Capture("10_nach_portal", null));
            Steps.Enqueue(QuickSave);
            Steps.Enqueue(WaitForQuickSave);
            Steps.Enqueue(UsePortal);
            Steps.Enqueue(WaitForSceneChange);
            Steps.Enqueue(() => Wait(2.0));
            Steps.Enqueue(() => ReportTravel("zurück"));
            Steps.Enqueue(() => !_portalUsed || Capture("11_zurueck", null));
            Steps.Enqueue(LoadQuickSave);
            Steps.Enqueue(WaitForSceneChange);
            Steps.Enqueue(() => Wait(2.0));
            Steps.Enqueue(() => ReportTravel("nach dem Schnellladen"));
            Steps.Enqueue(() => !_portalUsed || Capture("12_schnellladen", null));

            // Boss bar of the HUD (only in a scene with a boss): shown through the service, photographed, hidden again.
            Steps.Enqueue(ShowBossBar);
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(() => !_bossShown || Capture("13_bossbalken", null));
            Steps.Enqueue(HideBossBar);

            // Death and re-entry: the death screen appears, "am Spawnpunkt wiederbeleben" brings the player back alive.
            Steps.Enqueue(KillPlayer);
            Steps.Enqueue(() => WaitForState(GameState.Paused, 15.0));
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(() => Capture("14_tod", null));
            Steps.Enqueue(Respawn);
            Steps.Enqueue(() => WaitForState(GameState.Playing, 15.0));
            Steps.Enqueue(() => Wait(1.5));
            Steps.Enqueue(ReportAlive);

            // Back to the main menu, then "Fortsetzen" with the newest save (from the boot scene only).
            if (IsBootScene())
            {
                Steps.Enqueue(PauseGame);
                Steps.Enqueue(() => Wait(0.5));
                Steps.Enqueue(ReturnToMainMenu);
                Steps.Enqueue(() => WaitForState(GameState.MainMenu, 30.0));
                Steps.Enqueue(() => Wait(1.0));
                Steps.Enqueue(ContinueLatest);
                Steps.Enqueue(() => WaitForState(GameState.Playing, PlayingTimeoutSeconds));
                Steps.Enqueue(() => Wait(2.0));
                Steps.Enqueue(ReportPlayer);
                Steps.Enqueue(() => Capture("15_fortsetzen", null));
            }
        }

        private static bool KillPlayer()
        {
            PlayerMotor player = FindPlayer();
            if (player == null)
            {
                return true;
            }

            Note("Spielfigur stirbt (Test).");
            player.GetComponent<Aetherfall.Combat.DamageableComponent>().Health.Kill("tour.test");
            return true;
        }

        private static bool Respawn()
        {
            Note("Wiederbeleben am Spawnpunkt.");
            Services.Locator.Get<IGameFlow>().RespawnAtSpawnPoint();
            return true;
        }

        private static bool ReportAlive()
        {
            PlayerMotor player = FindPlayer();
            Aetherfall.Combat.Health health = player.GetComponent<Aetherfall.Combat.DamageableComponent>().Health;
            Note("Nach dem Wiederbeleben: " + (health.IsAlive ? "lebt" : "TOT") + ", Lebenspunkte " + health.Current.ToString("0") + " / " +
                 health.Max.ToString("0") + ", Position " + player.transform.position.ToString("F1") + ".");
            return Fail(!health.IsAlive, "Spielfigur ist nach dem Wiederbeleben nicht am Leben.") || true;
        }

        private static bool ReturnToMainMenu()
        {
            Note("Zurück ins Hauptmenü.");
            Services.Locator.Get<IGameFlow>().ReturnToMainMenu();
            return true;
        }

        private static bool ContinueLatest()
        {
            if (Services.Locator.Get<IGameFlow>().TryGetLatestSave(out SaveSlotInfo slot))
            {
                Note("„Fortsetzen“ mit " + slot.SlotId + " (Welt " + slot.WorldSpaceId + ").");
            }

            Services.Locator.Get<IGameFlow>().ContinueLatest();
            return true;
        }

        private static bool ShowBossBar()
        {
            var boss = UnityEngine.Object.FindAnyObjectByType<Aetherfall.AI.Bosses.BossController>(FindObjectsInactive.Include);
            _bossShown = boss != null && Services.Locator.TryGet(out Aetherfall.AI.Bosses.IBossBarService bosses);
            if (!_bossShown)
            {
                return true;
            }

            Services.Locator.Get<Aetherfall.AI.Bosses.IBossBarService>().Show(
                new Aetherfall.AI.Bosses.BossBarState("tour.boss", "Der Wachende Ritter", "Test des Bossbalkens", 0.62f, 1, 2, true));
            Note("Bossbalken eingeblendet (Boss in der Szene: " + boss.name + ").");
            return true;
        }

        private static bool HideBossBar()
        {
            if (_bossShown)
            {
                Services.Locator.Get<Aetherfall.AI.Bosses.IBossBarService>().Hide("tour.boss");
            }

            return true;
        }

        private static bool HurtPlayer()
        {
            PlayerMotor player = FindPlayer();
            _portal = UnityEngine.Object.FindAnyObjectByType<DungeonPortal>();
            _portalUsed = _portal != null && player != null;
            if (!_portalUsed)
            {
                Note("Kein Portal in der Szene – Rundreise übersprungen.");
                return true;
            }

            Aetherfall.Combat.Health health = player.GetComponent<Aetherfall.Combat.DamageableComponent>().Health;
            health.RestoreState(health.Max * 0.5f);
            Note("Lebenspunkte vor der Reise auf die Hälfte gesetzt: " + health.Current.ToString("0") + " / " + health.Max.ToString("0") + ".");
            return true;
        }

        private static bool UsePortal()
        {
            if (!_portalUsed)
            {
                return true;
            }

            PlayerMotor player = FindPlayer();
            _portal = UnityEngine.Object.FindAnyObjectByType<DungeonPortal>();
            if (_portal == null)
            {
                return Fail(true, "Kein Portal in der Szene " + player.gameObject.scene.name + ".");
            }

            _sceneBefore = player.gameObject.scene.name;
            bool started = _portal.Interact(new InteractionContext("player", player.transform.position, false));
            Note("Portal „" + _portal.InteractionPrompt + "“ (" + _portal.ObjectId + " → " + _portal.TargetSceneKey + ") benutzt: " + started + ".");
            return started || Fail(true, "Das Portal ließ sich nicht benutzen.");
        }

        private static bool WaitForSceneChange()
        {
            if (!_portalUsed)
            {
                return true;
            }

            PlayerMotor player = FindPlayer();
            if (player != null && player.gameObject.scene.name != _sceneBefore && _gameState.Current == GameState.Playing)
            {
                Note("Neue Szene „" + player.gameObject.scene.name + "“ nach " + Elapsed.ToString("0.0") + " s.");
                return true;
            }

            return Fail(Elapsed > PlayingTimeoutSeconds, "Szenenwechsel aus „" + _sceneBefore + "“ nicht abgeschlossen (Zustand " + _gameState.Current + ").");
        }

        private static bool ReportTravel(string when)
        {
            if (!_portalUsed)
            {
                return true;
            }

            PlayerMotor player = FindPlayer();
            Aetherfall.Combat.Health health = player.GetComponent<Aetherfall.Combat.DamageableComponent>().Health;
            Note("Spielfigur " + when + ": Szene " + player.gameObject.scene.name + ", Position " + player.transform.position.ToString("F1") +
                 ", Lebenspunkte " + health.Current.ToString("0") + " / " + health.Max.ToString("0") + ".");
            _sceneBefore = player.gameObject.scene.name;
            return true;
        }

        private static bool QuickSave()
        {
            if (!_portalUsed)
            {
                return true;
            }

            _quickSaveDone = false;
            Services.Locator.Get<IGameFlow>().QuickSave(result =>
            {
                _quickSaveDone = true;
                Note("Schnellspeichern in " + _sceneBefore + ": " + (result.Success ? "ok, " + result.SlotId : "FEHLER " + result.ReasonKey) + ".");
            });
            return true;
        }

        private static bool WaitForQuickSave()
        {
            return !_portalUsed || _quickSaveDone || Fail(Elapsed > 30.0, "Schnellspeichern wurde nicht fertig.");
        }

        private static bool LoadQuickSave()
        {
            if (!_portalUsed)
            {
                return true;
            }

            ISaveManager saves = Services.Locator.Get<ISaveManager>();
            if (!saves.TryGetLatestSlot(Aetherfall.Events.SaveKind.Quick, out SaveSlotInfo slot))
            {
                return Fail(true, "Kein Schnellspeicherstand gefunden.");
            }

            Note("Lade " + slot.SlotId + " (Welt " + slot.WorldSpaceId + ") über IGameLoader.");
            Services.Locator.Get<IGameLoader>().LoadSlot(slot.SlotId);
            return true;
        }

        private static bool ResumeGame()
        {
            _gameState.Pop(GameState.Paused);
            return true;
        }

        private static bool WalkToNpc()
        {
            _npc = UnityEngine.Object.FindAnyObjectByType<NpcInteractable>();
            PlayerMotor player = FindPlayer();
            if (_npc == null || player == null)
            {
                _npc = null;
                Note("Keine NPCs in der Szene – Gespräch übersprungen.");
                return true;
            }

            // Place the player 1.5 m before the NPC along the camera's view, so the NPC is straight ahead like after walking up to
            // it (the camera keeps its direction; the CharacterController must be off to move the player).
            Transform npc = _npc.transform;
            Camera view = Camera.main;
            Vector3 look = view != null ? Vector3.ProjectOnPlane(view.transform.forward, Vector3.up).normalized : Vector3.forward;
            Vector3 target = npc.position - look * 1.5f;
            var controller = player.GetComponent<CharacterController>();
            if (controller != null)
            {
                controller.enabled = false;
            }

            player.transform.SetPositionAndRotation(target, Quaternion.LookRotation(look, Vector3.up));
            if (controller != null)
            {
                controller.enabled = true;
            }

            Note("Spielfigur vor NPC „" + _npc.name + "“ gestellt, Hinweis: " + _npc.InteractionPrompt);
            return true;
        }

        private static bool ReportInteractionTarget()
        {
            PlayerMotor player = FindPlayer();
            PlayerInteractor interactor = player != null ? player.GetComponentInChildren<PlayerInteractor>() : null;
            if (_npc != null)
            {
                IInteractable target = interactor != null ? interactor.CurrentTarget : null;
                Vector3 offset = _npc.InteractionPosition - player.transform.position;
                Note("Interaktionsziel der Spielfigur: " + (target != null ? target.InteractionPrompt : "keins") + " (Frame " + Time.frameCount +
                     ", Abstand zum NPC-Punkt " + offset.magnitude.ToString("0.00") + " m, Blick " + player.transform.eulerAngles.y.ToString("0") + "°).");
            }

            return true;
        }

        private static bool TalkToNpc()
        {
            if (_npc == null)
            {
                return true;
            }

            PlayerMotor player = FindPlayer();
            bool started = _npc.Interact(new InteractionContext("player", player.transform.position, false));
            Note(started ? "Gespräch gestartet (Dialog " + _npc.DialogueId + "), Zustand " + _gameState.Current + "." : "FEHLER: Gespräch ließ sich nicht starten.");
            if (!started)
            {
                _failed = true;
            }

            return true;
        }

        private static bool ContinueToChoice()
        {
            if (_npc == null || !Services.Locator.TryGet(out IDialogueService dialogues))
            {
                return true;
            }

            if (dialogues.View.State == DialogueViewState.Choice || !dialogues.IsRunning)
            {
                Note("Auswahl erreicht: " + dialogues.View.Options.Count + " Antworten.");
                return true;
            }

            if (Elapsed > 0.8)
            {
                dialogues.Continue();
                _stepStart = EditorApplication.timeSinceStartup;
            }

            return false;
        }

        private static bool EndConversation()
        {
            if (_npc != null && Services.Locator.TryGet(out IDialogueService dialogues) && dialogues.IsRunning)
            {
                dialogues.ForceEnd("Spiel-Rundgang");
                Note("Gespräch beendet, Zustand " + _gameState.Current + ".");
            }

            return true;
        }

        private static void Tick()
        {
            if (_exiting)
            {
                if (EditorApplication.isPlaying)
                {
                    return;
                }

                EditorApplication.update -= Tick;
                Application.logMessageReceivedThreaded -= OnLog;
                if (_batch)
                {
                    EditorApplication.Exit(_failed || _projectErrors > 0 ? 1 : 0);
                }

                return;
            }

            if (!EditorApplication.isPlaying || Steps.Count == 0)
            {
                return;
            }

            bool done;
            try
            {
                done = Steps.Peek()();
            }
            catch (Exception exception)
            {
                Note("FEHLER im Rundgang: " + exception);
                _failed = true;
                Finish();
                return;
            }

            if (_failed)
            {
                Finish();
                return;
            }

            if (!done)
            {
                return;
            }

            Steps.Dequeue();
            _stepStart = EditorApplication.timeSinceStartup;
            if (Steps.Count == 0)
            {
                Finish();
            }
        }

        private static double Elapsed => EditorApplication.timeSinceStartup - _stepStart;

        private static bool WaitForServices()
        {
            if (Services.Locator != null && Services.Locator.TryGet(out IGameStateService state))
            {
                _gameState = state;
                Note("Dienste bereit, Zustand: " + state.Current);
                return true;
            }

            return Fail(Elapsed > ServiceTimeoutSeconds, "Nach " + ServiceTimeoutSeconds + " s keine Dienste (Boot fehlgeschlagen?).");
        }

        private static bool WaitForState(GameState state, double timeout)
        {
            if (_gameState.Current == state)
            {
                Note("Zustand " + state + " nach " + Elapsed.ToString("0.0") + " s.");
                return true;
            }

            return Fail(Elapsed > timeout, state + " nicht erreicht, Zustand: " + _gameState.Current);
        }

        private static bool Wait(double seconds)
        {
            return Elapsed >= seconds;
        }

        private static bool StartNewGame()
        {
            if (!Services.Locator.TryGet(out IGameFlow flow))
            {
                return Fail(true, "IGameFlow nicht registriert.");
            }

            if (ReadArgument("-tourMode") == "magier")
            {
                // Like the class choice of the main menu (GDD 03 11.2).
                if (!Services.Locator.TryGet(out Aetherfall.Classes.IClassService classes) || !classes.ChooseForNewGame("class.magier"))
                {
                    return Fail(true, "Klasse Magier nicht wählbar (ClassInstaller fehlt in der BootConfig?).");
                }

                Note("Klasse gewählt: Magier.");
            }

            Note("Starte „Neues Spiel“.");
            flow.StartNewGame();
            return true;
        }

        private static bool PauseGame()
        {
            if (_gameState.Push(GameState.Paused, "Spiel-Rundgang"))
            {
                Note("Pause geöffnet.");
            }
            else
            {
                Note("Hinweis: Pause ließ sich nicht öffnen (Zustand " + _gameState.Current + ").");
            }

            return true;
        }

        private static bool ReportPlayer()
        {
            PlayerMotor player = FindPlayer();
            if (player == null)
            {
                return Fail(true, "Keine Spielfigur (PlayerMotor) in der Szene.");
            }

            var combatant = player.GetComponent<Aetherfall.Combat.Combatant>();
            Aetherfall.Combat.Health health = combatant != null ? combatant.Health : null;
            Note("Spielfigur bei " + player.transform.position.ToString("F1") + ", Szene " + player.gameObject.scene.name +
                 (combatant != null ? ", Stufe " + combatant.Level : string.Empty) +
                 (health != null ? ", Lebenspunkte " + health.Current.ToString("0") + " / " + health.Max.ToString("0") : string.Empty) + ".");
            return true;
        }

        private static bool Fail(bool condition, string message)
        {
            if (condition)
            {
                Note("FEHLER: " + message);
                _failed = true;
            }

            return false;
        }

        // ---- Views --------------------------------------------------------------------------------------------------

        private static Pose ViewBehindPlayer(Transform player)
        {
            Vector3 p = player.position;
            return Look(p - player.forward * 6f + Vector3.up * 3f, p + Vector3.up * 1.2f);
        }

        private static Pose ViewOverview(Transform player)
        {
            Vector3 p = player.position;
            if (IsIndoors(player, out float ceiling))
            {
                // Dungeon: from the back of the room, just below the ceiling.
                return Look(p - player.forward * 5f + Vector3.up * Mathf.Min(ceiling - 0.5f, 4f), p + player.forward * 8f);
            }

            return Look(p - player.forward * 25f + Vector3.up * 18f, p + player.forward * 10f);
        }

        private static Pose ViewTopDown(Transform player)
        {
            Vector3 p = player.position;
            if (IsIndoors(player, out float ceiling))
            {
                // Under a ceiling a top-down view would only show the roof: look along the room instead.
                return Look(p + Vector3.up * Mathf.Min(ceiling - 0.3f, 5f) + player.forward * 2f, p + player.forward * 14f);
            }

            return Look(p + Vector3.up * 120f - player.forward, p);
        }

        private static bool IsIndoors(Transform player, out float ceilingHeight)
        {
            ceilingHeight = 0f;
            if (Physics.Raycast(player.position + Vector3.up * 2f, Vector3.up, out RaycastHit hit, 30f, ~0, QueryTriggerInteraction.Ignore))
            {
                ceilingHeight = hit.distance + 2f;
                return true;
            }

            return false;
        }

        private static Pose Look(Vector3 from, Vector3 to)
        {
            return new Pose(from, Quaternion.LookRotation(to - from, Vector3.up));
        }

        // ---- Screenshots --------------------------------------------------------------------------------------------

        private sealed class PendingShot
        {
            public string Name;
            public Texture2D World;
            public RenderTexture UiTarget;
            public List<PanelSettings> Panels;
            public int ReadyFrame;
        }

        /// <summary>Two-frame capture: world now, UI after the panels rendered into the render texture.</summary>
        private static bool Capture(string name, Func<Transform, Pose> view)
        {
            if (_pending == null)
            {
                Texture2D world = RenderWorld(view);
                if (world == null)
                {
                    Note("Hinweis: keine Kamera für " + name + ".");
                    return true;
                }

                _pending = new PendingShot { Name = name, World = world, Panels = new List<PanelSettings>() };
                if (view == null)
                {
                    BeginUiCapture(_pending);
                }

                _pending.ReadyFrame = Time.frameCount + 3;
                return false;
            }

            if (_pending.UiTarget != null && Time.frameCount < _pending.ReadyFrame)
            {
                return false;
            }

            PendingShot shot = _pending;
            _pending = null;
            try
            {
                if (shot.UiTarget != null)
                {
                    Texture2D ui = ReadTexture(shot.UiTarget, TextureFormat.RGBA32);
                    Blend(shot.World, ui);
                    UnityEngine.Object.DestroyImmediate(ui);
                }

                File.WriteAllBytes(Path.Combine(_outputFolder, shot.Name + ".png"), shot.World.EncodeToPNG());
                Note("Bild gespeichert: " + shot.Name + ".png" + (shot.UiTarget != null ? " (mit Oberfläche)" : string.Empty));
            }
            finally
            {
                EndUiCapture(shot);
                UnityEngine.Object.DestroyImmediate(shot.World);
            }

            return true;
        }

        private static Texture2D RenderWorld(Func<Transform, Pose> view)
        {
            Camera source = Camera.main;
            if (source == null)
            {
                foreach (Camera candidate in Camera.allCameras)
                {
                    if (candidate.isActiveAndEnabled && candidate.targetTexture == null)
                    {
                        source = candidate;
                        break;
                    }
                }
            }

            if (source == null)
            {
                return null;
            }

            PlayerMotor player = FindPlayer();
            if (view != null && player == null)
            {
                return null;
            }

            // Always a fresh camera: rendering the game camera itself into a texture mixed up its GPU culling history
            // (houses, trees and the player were missing in some shots).
            var go = new GameObject("PlayTourCamera");
            try
            {
                Camera camera = go.AddComponent<Camera>();
                camera.CopyFrom(source);
                if (view != null)
                {
                    Pose pose = view(player.transform);
                    camera.transform.SetPositionAndRotation(pose.position, pose.rotation);
                    camera.fieldOfView = 60f;
                    camera.farClipPlane = Mathf.Max(camera.farClipPlane, 1000f);
                }

                return RenderCamera(camera);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
            }
        }

        private static Texture2D RenderCamera(Camera camera)
        {
            RenderTexture previousTarget = camera.targetTexture;
            var rt = new RenderTexture(ShotWidth, ShotHeight, 24, RenderTextureFormat.ARGB32);
            try
            {
                camera.targetTexture = rt;
                camera.Render();
                return ReadTexture(rt, TextureFormat.RGB24);
            }
            finally
            {
                camera.targetTexture = previousTarget;
                rt.Release();
                UnityEngine.Object.DestroyImmediate(rt);
            }
        }

        private static Texture2D ReadTexture(RenderTexture rt, TextureFormat format)
        {
            RenderTexture previous = RenderTexture.active;
            var image = new Texture2D(rt.width, rt.height, format, false);
            RenderTexture.active = rt;
            image.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
            image.Apply();
            RenderTexture.active = previous;
            return image;
        }

        private static void BeginUiCapture(PendingShot shot)
        {
            foreach (UIDocument document in UnityEngine.Object.FindObjectsByType<UIDocument>(FindObjectsInactive.Exclude))
            {
                PanelSettings panel = document.panelSettings;
                if (panel != null && panel.targetTexture == null && !shot.Panels.Contains(panel))
                {
                    shot.Panels.Add(panel);
                }
            }

            if (shot.Panels.Count == 0)
            {
                return;
            }

            shot.UiTarget = new RenderTexture(ShotWidth, ShotHeight, 24, RenderTextureFormat.ARGB32);
            foreach (PanelSettings panel in shot.Panels)
            {
                panel.targetTexture = shot.UiTarget;
                panel.clearColor = true;
                panel.colorClearValue = Color.clear;
            }
        }

        private static void EndUiCapture(PendingShot shot)
        {
            foreach (PanelSettings panel in shot.Panels)
            {
                if (panel != null)
                {
                    panel.targetTexture = null;
                    panel.clearColor = false;
                }
            }

            if (shot.UiTarget != null)
            {
                shot.UiTarget.Release();
                UnityEngine.Object.DestroyImmediate(shot.UiTarget);
            }
        }

        private static void Blend(Texture2D world, Texture2D ui)
        {
            Color32[] back = world.GetPixels32();
            Color32[] front = ui.GetPixels32();
            for (int i = 0; i < back.Length && i < front.Length; i++)
            {
                // UI Toolkit writes premultiplied colours into the render texture.
                int a = front[i].a;
                back[i].r = (byte)Mathf.Min(255, front[i].r + back[i].r * (255 - a) / 255);
                back[i].g = (byte)Mathf.Min(255, front[i].g + back[i].g * (255 - a) / 255);
                back[i].b = (byte)Mathf.Min(255, front[i].b + back[i].b * (255 - a) / 255);
            }

            world.SetPixels32(back);
            world.Apply();
        }

        // ---- Report -------------------------------------------------------------------------------------------------

        private static void Finish()
        {
            if (_exiting)
            {
                return;
            }

            if (_pending != null)
            {
                EndUiCapture(_pending);
                _pending = null;
            }

            Note("Ende: " + _projectErrors + " Fehler/Ausnahmen aus dem Projekt, " + _engineErrors + " Unity-interne, " + _warningCount + " Warnungen.");
            WriteReport();
            _exiting = true;
            if (EditorApplication.isPlaying)
            {
                EditorApplication.ExitPlaymode();
            }
        }

        private static void WriteReport()
        {
            var builder = new StringBuilder();
            lock (Messages)
            {
                foreach (string line in Messages)
                {
                    builder.AppendLine(line);
                }
            }

            File.WriteAllText(Path.Combine(_outputFolder, "bericht.txt"), builder.ToString(), new UTF8Encoding(false));
            Debug.Log("[Spiel-Rundgang] Bericht: " + Path.Combine(_outputFolder, "bericht.txt"));
        }

        private static void OnLog(string condition, string stackTrace, LogType type)
        {
            if (type == LogType.Log || condition.StartsWith("[Spiel-Rundgang]", StringComparison.Ordinal) ||
                condition.IndexOf("Administrator privileges", StringComparison.Ordinal) >= 0)
            {
                return;
            }

            string stack = stackTrace ?? string.Empty;
            bool isError = type == LogType.Error || type == LogType.Exception || type == LogType.Assert;

            // Exceptions from editor internals (e.g. UnityEditor.Search indexing) are reported separately.
            bool engineOnly = isError && stack.IndexOf("Aetherfall", StringComparison.Ordinal) < 0 &&
                              stack.IndexOf("UnityEditor.", StringComparison.Ordinal) >= 0;
            string detail = string.Empty;
            if (isError)
            {
                string[] lines = stack.Split('\n');
                detail = "  @ " + string.Join(" | ", lines, 0, Math.Min(4, lines.Length));
            }

            lock (Messages)
            {
                if (!isError)
                {
                    _warningCount++;
                }
                else if (engineOnly)
                {
                    _engineErrors++;
                }
                else
                {
                    _projectErrors++;
                }

                Messages.Add("[" + type + (engineOnly ? ", Unity-intern" : string.Empty) + "] " + condition + detail);
            }
        }

        private static void Note(string message)
        {
            lock (Messages)
            {
                Messages.Add("[Rundgang " + DateTime.Now.ToString("HH:mm:ss") + "] " + message);
            }

            Debug.Log("[Spiel-Rundgang] " + message);
        }

        private static PlayerMotor FindPlayer()
        {
            return UnityEngine.Object.FindAnyObjectByType<PlayerMotor>();
        }

        private static bool IsBootScene()
        {
            return string.Equals(_scenePath, DefaultScene, StringComparison.Ordinal);
        }

        private static string ReadArgument(string name)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (string.Equals(args[i], name, StringComparison.Ordinal))
                {
                    return args[i + 1];
                }
            }

            return null;
        }
    }
}
