using System;
using System.Collections.Generic;
using DeadZone.Core;
using UnityEngine;
#if DZ_URP
using UnityEngine.Rendering.Universal;
#endif

namespace DeadZone.Game
{
    /// <summary>
    /// Entry point of Dead Zone 3D. Creates itself in any scene (no setup needed), owns the simulation (GameCore),
    /// runs the raid at a fixed 60 Hz and connects it to the 3D views, audio and the IMGUI interface.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public sealed class GameRoot : MonoBehaviour, IFeedback
    {
        public static GameRoot Instance { get; private set; }
        public const double FixedDt = 1.0 / 60.0;

        public GameCore core;
        public string state = "menu";
        public bool paused;
        public RaidResult lastResult;
        public AudioSystem audioSys;
        public CameraRig rig;
        public InputReader input;
        public LightingRig lighting;
        public FxSystem fx;
        public WorldView worldView;
        public RaidView raidView;
        public ViewModel viewModel;
        public UiRoot ui;
        private double _acc;
        // first person
        private float _eye = EyeStand, _deathCam, _aim, _prevYawDeg, _prevPitch;
        private bool _lastFirstPerson;
        /// <summary>0..1 how far the right-mouse zoom is in (first person).</summary>
        public float AimAmount => _aim;
        private const float EyeStand = 1.62f, EyeCrouch = 1.12f;
        private float _menuAngle, _playAcc;
        private World _menuWorld;

        public Raid Raid => core?.raid;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void AutoCreate()
        {
            if (Instance != null) return;
            var go = new GameObject("DeadZone");
            go.AddComponent<GameRoot>();
        }

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            Log.InfoSink = m => Debug.Log(m);
            Log.WarnSink = m => Debug.LogWarning(m);
            Log.ErrorSink = m => Debug.LogError(m);
            Application.targetFrameRate = 144;
            DisableSceneLightsAndCameras();
            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            camGo.transform.SetParent(transform, false);
            var cam = camGo.AddComponent<Camera>();
#if DZ_URP
            // bloom, vignette and tonemapping come from the volume profile of the URP asset
            if (UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline != null) cam.GetUniversalAdditionalCameraData().renderPostProcessing = true;
#endif
            rig = new CameraRig(cam);
            viewModel = new ViewModel(cam.transform);
            viewModel.SetVisible(false);
            lighting = new LightingRig(transform);
            fx = new FxSystem(transform);
            audioSys = new AudioSystem(transform);
            input = new InputReader { rig = rig };
            core = new GameCore(new FileStorage(), this);
            ui = gameObject.AddComponent<UiRoot>();
            ui.game = this;
            ApplySettings();
            audioSys.Preload();
            EnterMenu();
        }

        private void DisableSceneLightsAndCameras()
        {
            // scene objects only (Resources.FindObjectsOfTypeAll also returns assets and hidden objects)
            foreach (var l in Resources.FindObjectsOfTypeAll<Light>()) if (InScene(l) && l.transform.root != transform) l.gameObject.SetActive(false);
            foreach (var c in Resources.FindObjectsOfTypeAll<Camera>()) if (InScene(c) && c.transform.root != transform) c.gameObject.SetActive(false);
            foreach (var a in Resources.FindObjectsOfTypeAll<AudioListener>()) if (InScene(a) && a.transform.root != transform) a.enabled = false;
        }

        private static bool InScene(Component c) => c != null && c.gameObject.scene.IsValid() && c.gameObject.scene.isLoaded && (c.gameObject.hideFlags & HideFlags.HideInHierarchy) == 0;

        public void ApplySettings()
        {
            var s = core.settings;
            audioSys.master = (float)s.master; audioSys.sfx = (float)s.sfx; audioSys.music = (float)s.music;
            rig.shakeEnabled = s.screenShake;
            rig.fov = (float)s.fov;
            input.sensitivity = (float)s.mouseSens;
            input.invertY = s.invertY;
            lighting.SetQuality(s.quality);
            fx.quality = s.quality == "low" ? 0 : s.quality == "medium" ? 1 : 2;
        }

        public void SaveSettings() { core.save.SaveSettings(core.settings); ApplySettings(); }

        /// <summary>First-person camera chosen in the settings (V switches it during a raid).</summary>
        public bool FirstPerson => core.settings.view != "topdown";

        /// <summary>Switches between first person and the top-down view.</summary>
        public void ToggleView()
        {
            core.settings.view = FirstPerson ? "topdown" : "fps";
            SaveSettings();
            Toast(FirstPerson ? "Ansicht: Ego-Perspektive" : "Ansicht: von oben", "info", 1500);
        }

        // ------------------------------------------------------------------ states
        private void ClearViews()
        {
            raidView?.Destroy(); raidView = null;
            worldView?.Destroy(); worldView = null;
            fx.Clear();
        }

        private void BuildMenuBackground()
        {
            if (worldView != null && worldView.world == _menuWorld && _menuWorld != null) return;
            ClearViews();
            _menuWorld = WorldGenerator.Generate("city", 20261023u);
            worldView = new WorldView(_menuWorld, transform);
            lighting.SetMap(_menuWorld.map);
            rig.distance = 46f;
            worldView.SetFirstPerson(false);
            rig.Snap(Coords.ToWorld(_menuWorld.PixelW / 2, _menuWorld.PixelH / 2));
        }

        /// <summary>Menu and base use the orbiting overview camera, never the first-person lens.</summary>
        private void OverviewCamera()
        {
            rig.SetFirstPerson(false);
            viewModel.SetVisible(false);
        }

        public void EnterMenu()
        {
            state = "menu";
            paused = false;
            OverviewCamera();
            BuildMenuBackground();
            audioSys.StartAmbient("city");
            ui.ResetOverlays();
        }

        public void EnterBase()
        {
            state = "base";
            paused = false;
            OverviewCamera();
            BuildMenuBackground();
            audioSys.StartAmbient("city");
            ui.ResetOverlays();
            core.profileMgr.UnlockedMaps();
        }

        public void NewGame()
        {
            core.NewGame();
            EnterBase();
            Toast("Willkommen in der Zone. Pack deinen Rucksack und plane deinen ersten Einsatz.", "info", 5000);
        }

        public void ContinueGame()
        {
            var r = core.Continue();
            if (!r.ok) { Toast("Kein gültiger Spielstand" + (r.error != null ? ": " + r.error : ""), "warning", 4000); return; }
            EnterBase();
            if (r.mia) Toast("Dein letzter Einsatz wurde abgebrochen – Ausrüstung verloren.", "danger", 6000);
            if (r.repaired.Count > 0) Toast("Spielstand repariert: " + string.Join(", ", r.repaired.GetRange(0, Math.Min(2, r.repaired.Count))), "warning", 5000);
        }

        public void StartRaid(string mapId)
        {
            var pm = core.profileMgr;
            var warns = pm.LoadoutWarnings();
            if (warns.Count > 0) Toast(warns[0], "warning", 3500);
            ClearViews();
            _menuWorld = null;
            var raid = core.StartRaid(mapId, null, null, input);
            raid.OnOpenLoot = c => ui.OpenLoot(c);
            raid.OnEnded = OnRaidEnded;
            worldView = new WorldView(raid.world, transform);
            raidView = new RaidView(raid, worldView, fx, transform);
            lighting.SetMap(raid.map);
            rig.distance = 24f;
            rig.Snap(Coords.ToWorld(raid.player.x, raid.player.y));
            input.yaw = raid.player.angle;
            input.pitch = 0f;
            _eye = EyeStand; _deathCam = 0f; _aim = 0f;
            _prevYawDeg = Coords.YawDeg(raid.player.angle); _prevPitch = 0f;
            audioSys.StartAmbient(raid.mapId);
            state = "raid";
            paused = false;
            _acc = 0;
            input.ClearPending();
            ui.ResetOverlays();
            Toast(raid.map.name + " – finde Beute und einen Weg hinaus.", "info", 3500);
        }

        private void OnRaidEnded(RaidResult result)
        {
            lastResult = result;
            state = "result";
            paused = false;
            ui.ResetOverlays();
            ui.resultAt = Time.unscaledTime;
            audioSys.Play(result.outcome == "extracted" ? "extract_done" : "player_hurt", null, 1f);
        }

        public void AbortRaid()
        {
            Raid?.Abort();
        }

        public void LeaveResult()
        {
            core.raid = null;
            EnterBase();
            if (lastResult != null && lastResult.leveledUp) Toast("Stufe " + lastResult.levelAfter + " erreicht!", "success", 4000);
        }

        public void QuitGame()
        {
            if (state == "base" || state == "result") core.save.Save(core.Profile);
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        private void OnApplicationQuit()
        {
            // a raid that is still running stays marked: the next start counts it as MIA (rule of the game)
            if (core?.Profile != null && state != "raid") core.save.Save(core.Profile);
            core?.save.SaveSettings(core.settings);
        }

        // ------------------------------------------------------------------ frame
        private void Update()
        {
            float dt = Time.unscaledDeltaTime;
            input.blocked = ui.BlocksGameplay || paused || state != "raid";
            bool fp = FirstPerson;
            input.firstPerson = fp;
            if (fp != _lastFirstPerson)
            {
                // switched in the settings or with V: look where the player currently faces
                _lastFirstPerson = fp;
                if (fp && Raid != null) { input.yaw = Raid.player.angle; input.pitch = 0f; }
            }
            UpdateCursor(fp && state == "raid" && Raid != null && !Raid.ended && !input.blocked);
            input.Tick(dt);
            bool stepped = false;
            if (state == "raid" && Raid != null)
            {
                var pl = Raid.player;
                pl.interactByLook = fp;
                // first person: looking up throws grenades farther, looking down drops them closer
                pl.throwPower = fp ? Mathf.Clamp(1f - input.pitch / InputReader.MaxPitch * 0.5f, 0.5f, 1.45f) : 1.0;
                if (fp && !input.blocked && Mathf.Abs(input.scroll) > 0.01f) CycleWeapon(pl, input.scroll > 0 ? -1 : 1);
                if (!paused && !ui.helpOpen && !Raid.ended)
                {
                    _acc += Math.Min(dt, 0.25);
                    int steps = 0;
                    while (_acc >= FixedDt && steps < 6 && !Raid.ended)
                    {
                        raidView?.BeginStep();
                        Raid.Update(FixedDt);
                        _acc -= FixedDt;
                        steps++;
                        stepped = true;
                    }
                    if (steps >= 6) _acc = 0;
                    PlayTime(dt);
                }
                if (state == "raid" && Raid != null) UpdateRaidVisuals(dt, (float)(_acc / FixedDt));
            }
            else if (state == "menu" || state == "base")
            {
                _menuAngle += dt * 2.5f;
                if (_menuWorld != null)
                {
                    var c = Coords.ToWorld(_menuWorld.PixelW / 2, _menuWorld.PixelH / 2);
                    rig.yaw = _menuAngle;
                    rig.pitch = 38f;
                    rig.distance = 70f;
                    rig.Follow(c + Quaternion.Euler(0, _menuAngle * 0.7f, 0) * new Vector3(0, 0, 30f), dt, 0.6f);
                    lighting.fogScale = 0.35f;
                    lighting.Apply(0.55f, 18.7f);
                    lighting.Flashlight(false, Vector3.zero, 0);
                    worldView.darkness = 0.55f;
                    worldView.focus = rig.cam.transform.position + rig.cam.transform.forward * 50f;
                    worldView.Update(dt);
                }
                if (state == "base") PlayTime(dt);
                audioSys.Update(dt, rig.cam.transform.position);
            }
            else if (state == "result" && Raid != null)
            {
                UpdateRaidVisuals(dt, 1f);
            }
            input.EndFrame(stepped);
            fx.Update(dt);
            lighting.Update(dt);
            if (!fp) rig.Zoom(state == "raid" && !ui.BlocksGameplay ? input.scroll : 0f);
        }

        private void OnDisable() { Cursor.lockState = CursorLockMode.None; Cursor.visible = true; }

        /// <summary>Captures the mouse for looking around while a first-person raid runs without any window open.</summary>
        private void UpdateCursor(bool want)
        {
            want &= Application.isFocused;
            if (want && Cursor.lockState != CursorLockMode.Locked) { Cursor.lockState = CursorLockMode.Locked; Cursor.visible = false; }
            else if (!want && Cursor.lockState != CursorLockMode.None) { Cursor.lockState = CursorLockMode.None; Cursor.visible = true; }
            input.lookActive = want && Cursor.lockState == CursorLockMode.Locked;
        }

        /// <summary>Mouse wheel in first person: next or previous weapon slot (primary, secondary, melee).</summary>
        private void CycleWeapon(Player p, int dir)
        {
            var slots = p.WeaponSlots();
            int cur = p.activeSlot <= 2 ? p.activeSlot : (dir > 0 ? -1 : 3);
            for (int k = 1; k <= 3; k++)
            {
                int i = ((cur + dir * k) % 3 + 3) % 3;
                if (slots[i] != null) { if (i != p.activeSlot) input.Push("slot" + (i + 1)); return; }
            }
        }

        private void PlayTime(float dt)
        {
            if (core.Profile == null) return;
            _playAcc += dt;
            if (_playAcc >= 1f) { core.Profile.AddStat("playTime", Mathf.Floor(_playAcc)); _playAcc -= Mathf.Floor(_playAcc); }
        }

        private void UpdateRaidVisuals(float dt, float alpha)
        {
            var raid = Raid;
            var p = raid.player;
            bool fp = FirstPerson;
            raidView.showPlayerBody = !fp;
            raidView.losRange = fp ? 1500 : 760;
            raidView.geometryOcclusion = fp;
            raidView.Update(dt, Mathf.Clamp01(alpha), p.interactTarget);
            worldView.SetFirstPerson(fp);
            rig.SetFirstPerson(fp);
            if (fp) { UpdateFirstPersonVisuals(dt, raid, p); return; }
            viewModel.SetVisible(false);
            rig.yaw = 0f;
            rig.pitch = 58f;
            var ppos = raidView.PlayerRenderPos;
            var look = new Vector3((float)Math.Cos(p.angle), 0, (float)-Math.Sin(p.angle)) * 3f;
            rig.Follow(ppos + look, dt);
            lighting.fogScale = 1f;
            lighting.Apply((float)raid.darkness, (float)raid.hour);
            var fwd = new Vector3((float)Math.Cos(p.angle), 0, (float)-Math.Sin(p.angle));
            lighting.Flashlight(p.flashlightOn && !p.dead, ppos + Vector3.up * 1.35f + fwd * 0.45f, Coords.YawDeg(p.angle));
            worldView.darkness = (float)raid.darkness;
            worldView.generatorOn = raid.generatorOn;
            worldView.focus = ppos;
            worldView.UpdateRoofs(p.x, p.y);
            worldView.Update(dt);
            audioSys.Update(dt, ppos + Vector3.up * 1.6f);
            rig.cam.backgroundColor = RenderSettings.fogColor;
        }

        private void UpdateFirstPersonVisuals(float dt, Raid raid, Player p)
        {
            var feet = raidView.PlayerRenderPos;
            // eye height: smooth crouch, and the view sinks to the ground on death
            _eye = Mathf.MoveTowards(_eye, p.crouching ? EyeCrouch : EyeStand, dt * 3.5f);
            float roll = 0f, eye = _eye;
            if (p.dead)
            {
                _deathCam = Mathf.Min(1f, _deathCam + dt * 1.6f);
                float k = 1f - (1f - _deathCam) * (1f - _deathCam);
                eye = Mathf.Lerp(_eye, 0.3f, k);
                roll = 72f * k;
            }
            float moving = p.moving && !p.dead ? (p.sprinting ? 1.3f : 1f) : 0f;
            bool bob = core.settings.screenShake;
            var bobOff = bob ? new Vector3(0, Mathf.Abs(Mathf.Cos((float)p.legPhase)) * 0.045f * moving, 0) : Vector3.zero;
            float yawDeg = Coords.YawDeg(p.dead ? p.angle : input.yaw);
            float pitchDeg = p.dead ? Mathf.Lerp(input.pitch, 30f, _deathCam) : input.pitch;
            var eyePos = feet + Vector3.up * eye + bobOff;
            // zoom on the right mouse button (visual only; the simulation has no aiming mode)
            string cls = RaidView.HeldClass(p);
            bool gun = p.activeSlot <= 2 && cls != null && cls != "melee";
            _aim = Mathf.MoveTowards(_aim, input.AimHeld && gun && !p.sprinting && !p.dead ? 1f : 0f, dt * 7f);
            float zoomTo = cls == "sniper" ? 0.4f : cls == "rifle" || cls == "lmg" ? 0.7f : 0.82f;
            rig.zoom = Mathf.Lerp(1f, zoomTo, _aim);
            input.sensitivityScale = rig.zoom;
            rig.FirstPerson(eyePos, yawDeg, pitchDeg, roll, dt);
            var camRot = rig.cam.transform.rotation;

            // view model
            var rt = p.WeaponInst?.rt;
            float reload = -1f;
            if (rt != null && rt.reloading && p.activeSlot <= 2)
            {
                double total = Items.Def(p.WeaponInst)?.weapon?.reloadTime ?? 2;
                if (total <= 0) total = 2;
                reload = Mathf.Clamp01(1f - (float)(rt.reloadTimer / total));
            }
            float yawDelta = Mathf.DeltaAngle(_prevYawDeg, yawDeg), pitchDelta = pitchDeg - _prevPitch;
            _prevYawDeg = yawDeg; _prevPitch = pitchDeg;
            viewModel.Update(dt, new ViewModelState
            {
                cls = cls, moving = moving, legPhase = (float)p.legPhase, aim = _aim, melee = (float)p.meleeAnim,
                throwing = Mathf.Clamp01((float)(p.grenadeCooldown - 0.5) / 0.3f), yawDelta = yawDelta, pitchDelta = pitchDelta,
                reload = reload, sprinting = p.sprinting, crouching = p.crouching, usingItem = p.usingItem != null, dead = p.dead,
            });

            lighting.fogScale = 1f;
            lighting.Apply((float)raid.darkness, (float)raid.hour);
            // shoulder lamp on the left: the gun (right, or centred when zooming) stays outside the cone,
            // otherwise the beam would light the view model blindingly from right next to it
            var lampPos = eyePos + camRot * new Vector3(-0.22f, -0.12f, 0.3f);
            lighting.Flashlight(p.flashlightOn && !p.dead, lampPos, camRot, eyePos);
            worldView.darkness = (float)raid.darkness;
            worldView.generatorOn = raid.generatorOn;
            worldView.focus = feet;
            worldView.Update(dt);
            audioSys.Update(dt, eyePos, Quaternion.Euler(0f, yawDeg, 0f));
            rig.cam.backgroundColor = RenderSettings.fogColor;
        }

        // ------------------------------------------------------------------ IFeedback
        public void Sfx(string name, double x = double.NaN, double y = double.NaN, double volume = 1, double pitch = 1)
        {
            Vector3? pos = double.IsNaN(x) ? (Vector3?)null : Coords.ToWorld(x, y, 1.2f);
            audioSys?.Play(name, pos, (float)volume, (float)pitch);
        }

        public void Toast(string text, string kind = "info", double ms = 2500) { ui?.Toast(text, kind, (float)ms); }

        public void Shake(double strength) { rig?.AddShake((float)strength); }

        private float _fireThrottle;

        /// <summary>A first-person raid is on screen (the player's own effects come from the view model).</summary>
        private bool FirstPersonView => FirstPerson && Raid != null && (state == "raid" || state == "result") && !Raid.player.dead;

        private static float RecoilFor(string cls)
        {
            switch (cls)
            {
                case "shotgun": return 3.2f;
                case "sniper": return 3.6f;
                case "rifle": case "lmg": return 1.2f;
                case "smg": return 0.8f;
                default: return 1.4f;
            }
        }

        public void Effect(Fx kind, double x, double y, double a = 0, double b = 0, string text = null, string color = null)
        {
            var pos = Coords.ToWorld(x, y, 1.1f);
            var dir = new Vector3((float)Math.Cos(a), 0, (float)-Math.Sin(a));
            switch (kind)
            {
                case Fx.MuzzleFlash:
                    if (FirstPersonView)
                    {
                        // the shot comes out of the view model; the light sits a little ahead so the gun is not blown out
                        var muzzle = viewModel.MuzzleWorld;
                        var fwd = rig.cam.transform.forward;
                        lighting.MuzzleFlash(muzzle + fwd * 0.6f, (float)b);
                        viewModel.Fire((float)b);
                        rig.Kick(RecoilFor(RaidView.HeldClass(Raid.player)));
                        for (int i = 0; i < 3; i++) fx.Emit(muzzle + fwd * 0.05f, fwd * 5f + UnityEngine.Random.insideUnitSphere * 1.2f, fx.spark, 0.025f, 0.06f, false);
                        break;
                    }
                    lighting.MuzzleFlash(Coords.ToWorld(x, y, 1.3f), (float)b);
                    for (int i = 0; i < 3; i++) fx.Emit(Coords.ToWorld(x, y, 1.3f), (dir * 6f + UnityEngine.Random.insideUnitSphere * 1.5f), fx.spark, 0.06f, 0.08f, false);
                    break;
                case Fx.Casing:
                    if (FirstPersonView)
                    {
                        var right = rig.cam.transform.right;
                        fx.Emit(viewModel.EjectWorld, right * 1.6f + Vector3.up * 1.4f, fx.brass, 0.02f, 0.8f, true);
                        break;
                    }
                    fx.Emit(Coords.ToWorld(x, y, 1.2f), Quaternion.Euler(0, 90, 0) * dir * 2f + Vector3.up * 2f, fx.brass, 0.05f, 1.2f, true);
                    break;
                case Fx.Blood:
                    {
                        int n = Mathf.Clamp(Mathf.RoundToInt((float)b * 5), 1, 12);
                        for (int i = 0; i < n; i++) fx.Emit(pos, (dir * UnityEngine.Random.Range(1f, 4f) + UnityEngine.Random.insideUnitSphere * 1.2f + Vector3.up * 1.5f), fx.blood, 0.08f, 0.7f, true);
                        if (b >= 0.6 || UnityEngine.Random.value < 0.25f) fx.Decal(Coords.ToWorld(x, y) + dir * 0.4f, 0.4f + (float)b * 0.5f, fx.bloodDecal, 35f);
                        break;
                    }
                case Fx.Impact:
                    {
                        bool metal = (int)b == T.FENCE || (int)b == T.DOOR_CLOSED;
                        fx.Burst(Coords.ToWorld(x, y, 1.25f), metal ? 6 : 4, metal ? fx.spark : fx.dust, 3f, metal ? 0.04f : 0.07f, metal ? 0.25f : 0.5f, true);
                        break;
                    }
                case Fx.HitMarker: ui.HitMarker(); break;
                case Fx.FloatingText:
                    if (core.settings.damageNumbers || b > 0) ui.FloatingText(Coords.ToWorld(x, y, 2.2f), text, color, b > 0);
                    break;
                case Fx.Explosion: fx.Explosion(Coords.ToWorld(x, y, 0.2f), Mathf.Max(1.2f, (float)a * Coords.S), a < 70); break;
                case Fx.ToxicCloud:
                    for (int i = 0; i < 8; i++)
                    {
                        var off = UnityEngine.Random.insideUnitCircle * (float)a * Coords.S;
                        fx.Emit(Coords.ToWorld(x, y, 0.3f) + new Vector3(off.x, 0, off.y), Vector3.up * UnityEngine.Random.Range(0.3f, 0.9f), fx.toxic, 0.35f, 1.8f, false, 0.4f, true);
                    }
                    break;
                case Fx.Fire:
                    _fireThrottle += 0.35f;
                    if (_fireThrottle >= 1f)
                    {
                        _fireThrottle = 0;
                        var off = UnityEngine.Random.insideUnitCircle * (float)a * Coords.S;
                        fx.Emit(Coords.ToWorld(x, y, 0.2f) + new Vector3(off.x, 0, off.y), Vector3.up * UnityEngine.Random.Range(1f, 2.5f), fx.fire, 0.18f, 0.6f, false);
                    }
                    break;
                case Fx.FootDust: fx.Emit(Coords.ToWorld(x, y, 0.1f), UnityEngine.Random.insideUnitSphere * 0.5f + Vector3.up * 0.4f, fx.dust, 0.12f, 0.5f, false, 0.2f); break;
                case Fx.DamageFlash: ui.DamageFlash((float)a); break;
                case Fx.HitDirection: ui.HitDirection(a); break;
                case Fx.Flash: ui.FlashBang((float)a); break;
                case Fx.LightFlash: fx.Explosion(Coords.ToWorld(x, y, 0.5f), 1.5f, true); break;
            }
        }
    }
}
