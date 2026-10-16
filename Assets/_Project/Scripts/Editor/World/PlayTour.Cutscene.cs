using System;
using System.Collections.Generic;
using Aetherfall.Cinematics;
using Aetherfall.Cinematics.Playback;
using Aetherfall.Core;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Events;
using Aetherfall.Input;
using Aetherfall.Player;
using Aetherfall.Quests;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using Aetherfall.World;
using Aetherfall.WorldState;
using Unity.Cinemachine;
using UnityEngine;
using Object = UnityEngine.Object;
using Q = Aetherfall.EditorTools.Narrative.MiniSliceQuestLibrary;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Cutscenes (S58, <c>-tourMode zwischensequenz</c>): a new game opens with the prologue cutscene "cs.prolog.erwachen". The
    /// tour checks that it starts in the same frame as the game (the first picture is the black title card), that the game is
    /// held meanwhile (UI map, HUD hidden, saving refused, NPC signs hidden, player at the spawn point), photographs the five
    /// shots, checks the hand-over to the exploration camera at the natural end, then plays it again and skips it (hold bar,
    /// veil, everything back as before). Every other tour skips the cutscene right after the start (<see cref="SkipRunningCutscene"/>).
    /// </summary>
    public static partial class PlayTour
    {
        private const string TourSource = "Rundgang";

        private static readonly List<CutsceneStarted> CutsceneStarts = new List<CutsceneStarted>();
        private static readonly List<CutsceneFinished> CutsceneEnds = new List<CutsceneFinished>();
        private static readonly List<KeyValuePair<GameStateChanged, int>> StateChanges = new List<KeyValuePair<GameStateChanged, int>>();
        private static bool _cutsceneWatch;
        private static bool _handOverSeen;
        private static Vector3 _handOverPosition;
        private static Quaternion _handOverRotation;

        private static void BuildCutscenePlan()
        {
            Steps.Enqueue(CheckCutsceneStart);
            Steps.Enqueue(() => WaitForCutsceneTime(1.0));
            Steps.Enqueue(CheckGameHeldDuringCutscene);
            Steps.Enqueue(CaptureAt("z01_titelkarte", 1.5, CheckTitleCard));
            Steps.Enqueue(CaptureAt("z02_riss_ueber_dem_dorf", 7.0, null));
            Steps.Enqueue(CaptureAt("z03_lina_im_licht", 12.5, CheckLinaShot));
            Steps.Enqueue(CaptureAt("z04_schwarz", 16.5, CheckBlackCard));
            Steps.Enqueue(CaptureAt("z05_erwachen", 21.5, CheckVoice));
            Steps.Enqueue(CaptureAt("z06_uebergabe", 25.0, null));
            Steps.Enqueue(WaitForNaturalEnd);
            Steps.Enqueue(() => Wait(1.2));
            Steps.Enqueue(CheckAfterCutscene);
            Steps.Enqueue(CheckHandOver);
            Steps.Enqueue(() => Capture("z07_nach_dem_ende", null));

            // Played again and skipped: hold bar half full, then the skip through the service (no tour simulates keys).
            Steps.Enqueue(RequestReplay);
            Steps.Enqueue(() => WaitForCutsceneTime(6.0));
            Steps.Enqueue(ShowHalfHold);
            Steps.Enqueue(() => Capture("z08_ueberspringen_halten", null));
            Steps.Enqueue(SkipReplay);
            Steps.Enqueue(() => Capture("z09_nach_dem_ueberspringen", null));
            Steps.Enqueue(() => Wait(1.0));
            Steps.Enqueue(CheckAfterCutscene);
            Steps.Enqueue(() => Capture("z10_spiel", null));
            Steps.Enqueue(EndCutsceneWatch);
        }

        /// <summary>Before "Neues Spiel": records the cutscene events and the state changes with their frame.</summary>
        private static bool StartCutsceneWatch()
        {
            CutsceneStarts.Clear();
            CutsceneEnds.Clear();
            StateChanges.Clear();
            _handOverSeen = false;
            if (!_cutsceneWatch && Services.Locator.TryGet(out IEventBus bus))
            {
                bus.Subscribe<CutsceneStarted>(OnCutsceneStarted);
                bus.Subscribe<CutsceneFinished>(OnCutsceneFinished);
                bus.Subscribe<GameStateChanged>(OnTourStateChanged);
                _cutsceneWatch = true;
            }

            return _cutsceneWatch || Fail(true, "Kein IEventBus – Zwischensequenz-Ereignisse nicht beobachtet.");
        }

        private static bool EndCutsceneWatch()
        {
            if (_cutsceneWatch && Services.Locator.TryGet(out IEventBus bus))
            {
                bus.Unsubscribe<CutsceneStarted>(OnCutsceneStarted);
                bus.Unsubscribe<CutsceneFinished>(OnCutsceneFinished);
                bus.Unsubscribe<GameStateChanged>(OnTourStateChanged);
            }

            _cutsceneWatch = false;
            Note("Zwischensequenzen im Rundgang: " + CutsceneStarts.Count + " gestartet, " + CutsceneEnds.Count + " beendet.");
            return true;
        }

        private static void OnCutsceneStarted(CutsceneStarted evt)
        {
            CutsceneStarts.Add(evt);
        }

        private static void OnCutsceneFinished(CutsceneFinished evt)
        {
            CutsceneEnds.Add(evt);
        }

        private static void OnTourStateChanged(GameStateChanged evt)
        {
            StateChanges.Add(new KeyValuePair<GameStateChanged, int>(evt, Time.frameCount));
        }

        private static ICutsceneService Cutscenes()
        {
            return Services.Locator != null && Services.Locator.TryGet(out ICutsceneService cutscenes) ? cutscenes : null;
        }

        /// <summary>Waits until the game runs or a cutscene plays (a new game opens with the prologue cutscene).</summary>
        private static bool WaitForPlayingOrCutscene(double timeout)
        {
            GameState state = _gameState.Current;
            if (state == GameState.Playing || state == GameState.Cutscene)
            {
                Note("Zustand " + state + " nach " + Elapsed.ToString("0.0") + " s.");
                return true;
            }

            return Fail(Elapsed > timeout, "Weder Playing noch Cutscene erreicht, Zustand: " + state);
        }

        /// <summary>Every tour except the cutscene tour: skips a running cutscene (a pending one gets 5 s to start).</summary>
        private static bool SkipRunningCutscene()
        {
            ICutsceneService cutscenes = Cutscenes();
            if (cutscenes == null)
            {
                return true;
            }

            if (cutscenes.IsPlaying)
            {
                string id = cutscenes.CurrentId;
                double at = cutscenes.CurrentTime;
                if (cutscenes.Skip(TourSource))
                {
                    Note("Zwischensequenz " + id + " übersprungen (" + TourSource + ") nach " + at.ToString("0.0") + " s.");
                }

                return true;
            }

            return !cutscenes.IsPending || Elapsed > 5.0;
        }

        private static bool CheckCutsceneStart()
        {
            ICutsceneService cutscenes = Cutscenes();
            if (cutscenes == null)
            {
                return Fail(true, "Kein ICutsceneService (CinematicsInstaller fehlt in der BootConfig).");
            }

            if (_gameState.Current != GameState.Cutscene || !cutscenes.IsPlaying)
            {
                return Fail(true, "Nach „Neues Spiel“ läuft keine Zwischensequenz (Zustand " + _gameState.Current + ").");
            }

            Fail(cutscenes.CurrentId != CutsceneIds.PrologueAwakening, "Es läuft " + cutscenes.CurrentId + " statt " + CutsceneIds.PrologueAwakening + ".");
            Fail(CutsceneStarts.Count != 1, CutsceneStarts.Count + " CutsceneStarted statt 1.");
            int playingFrame = -1;
            int cutsceneFrame = -1;
            foreach (KeyValuePair<GameStateChanged, int> change in StateChanges)
            {
                if (change.Key.Previous == GameState.Loading && change.Key.Current == GameState.Playing && playingFrame < 0)
                {
                    playingFrame = change.Value;
                }
                else if (change.Key.Previous == GameState.Playing && change.Key.Current == GameState.Cutscene && cutsceneFrame < 0)
                {
                    cutsceneFrame = change.Value;
                }
            }

            Note("Prolog-Zwischensequenz läuft (" + cutscenes.CurrentDuration.ToString("0.0") + " s): Loading→Playing in Bild " + playingFrame +
                 ", Playing→Cutscene in Bild " + cutsceneFrame + ".");
            return Fail(playingFrame < 0 || playingFrame != cutsceneFrame,
                "Die Zwischensequenz startet nicht im selben Bild wie das Spiel (das erste Bild wäre die Welt statt der Titelkarte).") || true;
        }

        private static bool WaitForCutsceneTime(double seconds)
        {
            ICutsceneService cutscenes = Cutscenes();
            if (cutscenes != null && cutscenes.IsPlaying && cutscenes.CurrentTime >= seconds)
            {
                return true;
            }

            return Fail(Elapsed > seconds + 30.0, "Zwischensequenz erreicht " + seconds.ToString("0.0") + " s nicht (läuft: " +
                                                  (cutscenes != null && cutscenes.IsPlaying) + ").");
        }

        private static bool CheckGameHeldDuringCutscene()
        {
            IServiceLocator locator = Services.Locator;
            if (locator.TryGet(out IInputService input))
            {
                Fail(input.ActiveMap != ActionMapId.UI, "Aktive Eingabe " + input.ActiveMap + " statt UI.");
            }

            if (locator.TryGet(out IUIManager ui))
            {
                Fail(ui.IsLayerVisible(UILayer.Hud), "Das HUD ist während der Zwischensequenz sichtbar.");
                Fail(!(ui.Top is CutsceneScreen), "Oben liegt " + (ui.Top != null ? ui.Top.ScreenId : "kein Bildschirm") + " statt des Zwischensequenz-Bildschirms.");
            }

            if (locator.TryGet(out ISaveManager saves))
            {
                Fail(saves.IsSaveAllowed(out string _), "Speichern ist während der Zwischensequenz erlaubt.");
            }

            int shownSigns = 0;
            foreach (CameraFacingLabel label in Object.FindObjectsByType<CameraFacingLabel>())
            {
                if (label.TryGetComponent(out Renderer renderer) && renderer.enabled)
                {
                    shownSigns++;
                }
            }

            Fail(shownSigns > 0, shownSigns + " NPC-Schilder sind in der Zwischensequenz sichtbar.");
            PlayerMotor player = FindPlayer();
            PlayerSpawnPoint spawn = Object.FindAnyObjectByType<PlayerSpawnPoint>();
            if (player != null && spawn != null)
            {
                float distance = Vector3.Distance(player.transform.position, spawn.transform.position);
                Fail(distance > 0.1f, "Die Spielfigur steht " + distance.ToString("0.00") + " m neben dem Startpunkt.");
            }

            Note("Während der Zwischensequenz: Zustand " + _gameState.Current + ", Mauszeiger " + Cursor.lockState + ", NPC-Schilder sichtbar: " + shownSigns +
                 ".");
            return true;
        }

        /// <summary>Waits for a moment of the cutscene, checks what it shows and photographs it (with the UI).</summary>
        private static Func<bool> CaptureAt(string name, double seconds, Func<CutsceneOverlay, string> check)
        {
            bool waiting = true;
            return () =>
            {
                ICutsceneService cutscenes = Cutscenes();
                if (waiting)
                {
                    if (!WaitForCutsceneTime(seconds))
                    {
                        return false;
                    }

                    waiting = false;
                    CutsceneOverlay overlay = cutscenes.Overlay;
                    CutsceneScreen screen = Services.Locator.TryGet(out IUIManager ui) ? ui.Get<CutsceneScreen>() : null;
                    Note(name + " bei " + cutscenes.CurrentTime.ToString("0.0") + " s: Abblende " + overlay.FadeAlpha.ToString("0.00") + " " +
                         overlay.FadeColor + ", Tafel „" + overlay.Caption + "“, Untertitel " +
                         (overlay.Text.Length > 0 ? "„" + overlay.Speaker + ": " + overlay.Text + "“" : "–") +
                         (screen != null ? ", Balken " + (screen.ShownBarFraction * 100f).ToString("0.0") + " %" : ", kein Bildschirm") + ".");
                    string problem = check != null ? check(overlay) : null;
                    Fail(problem != null, name + ": " + problem);
                }

                return Capture(name, null);
            };
        }

        private static string CheckTitleCard(CutsceneOverlay overlay)
        {
            return overlay.FadeAlpha < 0.99f || overlay.Caption != EichentalCutscenes.TitleText ? "keine schwarze Titelkarte mit „" + EichentalCutscenes.TitleText + "“." : null;
        }

        private static string CheckLinaShot(CutsceneOverlay overlay)
        {
            if (overlay.Speaker != EichentalCutscenes.LinaSpeaker || overlay.Text != EichentalCutscenes.LinaText)
            {
                return "Linas Zeile fehlt.";
            }

            TimelineCutscenePlayer player = Object.FindAnyObjectByType<TimelineCutscenePlayer>();
            Transform light = player != null ? player.transform.Find(CutsceneTimelineBuilder.PropRootName + "/" + EichentalCutscenes.LightColumnKey) : null;
            return light == null || !light.gameObject.activeInHierarchy ? "Die Lichtsäule leuchtet nicht." : null;
        }

        private static string CheckBlackCard(CutsceneOverlay overlay)
        {
            return overlay.FadeAlpha < 0.99f || overlay.Caption != EichentalCutscenes.BlackText ? "keine schwarze Tafel „" + EichentalCutscenes.BlackText + "“." : null;
        }

        private static string CheckVoice(CutsceneOverlay overlay)
        {
            return overlay.Speaker != EichentalCutscenes.VoiceSpeaker ? "Die Stimme („" + EichentalCutscenes.VoiceText + "“) fehlt." : null;
        }

        private static bool WaitForNaturalEnd()
        {
            ICutsceneService cutscenes = Cutscenes();
            if (cutscenes != null && cutscenes.IsPlaying)
            {
                if (cutscenes.CurrentTime >= EichentalCutscenes.PrologueDuration - 0.4 && Camera.main != null)
                {
                    // The last picture of the cutscene: the exploration camera must take over from exactly here.
                    _handOverSeen = true;
                    _handOverPosition = Camera.main.transform.position;
                    _handOverRotation = Camera.main.transform.rotation;
                }

                return Fail(Elapsed > 60.0, "Die Zwischensequenz endet nicht von selbst.");
            }

            Fail(CutsceneEnds.Count != 1 || CutsceneEnds[0].Skipped, "Erwartet: genau ein CutsceneFinished ohne Überspringen, gemeldet: " + CutsceneEnds.Count +
                                                                     (CutsceneEnds.Count > 0 ? " (übersprungen: " + CutsceneEnds[0].Skipped + ")" : string.Empty) + ".");
            Note("Zwischensequenz von selbst beendet, Zustand " + _gameState.Current + ".");
            return true;
        }

        private static bool CheckAfterCutscene()
        {
            Fail(_gameState.Current != GameState.Playing, "Nach der Zwischensequenz Zustand " + _gameState.Current + " statt Playing.");
            TimelineCutscenePlayer player = Object.FindAnyObjectByType<TimelineCutscenePlayer>();
            if (player == null)
            {
                return Fail(true, "Keine Zwischensequenz (TimelineCutscenePlayer) in der Szene.");
            }

            Transform cameras = player.transform.Find(CutsceneTimelineBuilder.CameraRootName);
            Transform light = player.transform.Find(CutsceneTimelineBuilder.PropRootName + "/" + EichentalCutscenes.LightColumnKey);
            Fail(cameras == null || cameras.gameObject.activeSelf, "Die Kameras der Zwischensequenz sind noch an.");
            Fail(light == null || light.gameObject.activeSelf, "Die Lichtsäule ist noch an.");
            Fail(GameObject.Find("Brand (Prolog)") == null, "Der Brand des Prologs ist nicht mehr zu sehen.");
            if (Services.Locator.TryGet(out IQuestService quests) && Services.Locator.TryGet(out IWorldState world))
            {
                Fail(!quests.IsStageReached(Q.Prologue, "s10"), "Der Prolog steht nicht bei s10.");
                Fail(world.GetInt(Q.FlagVillageDestroyed) != 1 && !world.GetBool(Q.FlagVillageDestroyed), Q.FlagVillageDestroyed + " ist nicht gesetzt.");
            }

            if (Services.Locator.TryGet(out IUIManager ui))
            {
                Fail(!ui.IsLayerVisible(UILayer.Hud), "Das HUD ist nach der Zwischensequenz nicht sichtbar.");
            }

            Note("Nach der Zwischensequenz: Zustand " + _gameState.Current + ", Kameras aus, Lichtsäule aus, Brand sichtbar.");
            return true;
        }

        private static bool CheckHandOver()
        {
            Camera main = Camera.main;
            CinemachineBrain brain = main != null ? main.GetComponent<CinemachineBrain>() : null;
            string active = brain != null && brain.ActiveVirtualCamera != null ? brain.ActiveVirtualCamera.Name : "–";
            Fail(active != "CM_Explore", "Nach der Zwischensequenz führt " + active + " statt CM_Explore.");
            if (!_handOverSeen || main == null)
            {
                return Fail(true, "Das letzte Bild der Zwischensequenz wurde nicht gesehen.");
            }

            float distance = Vector3.Distance(main.transform.position, _handOverPosition);
            float angle = Quaternion.Angle(main.transform.rotation, _handOverRotation);
            Note("Übergabe an CM_Explore: " + distance.ToString("0.00") + " m und " + angle.ToString("0.0") + "° Unterschied zum letzten Bild.");
            return Fail(distance > 0.3f || angle > 3f, "Sprung bei der Übergabe an die Spielkamera (höchstens 0,3 m und 3°).") || true;
        }

        private static bool RequestReplay()
        {
            ICutsceneService cutscenes = Cutscenes();
            if (cutscenes == null || !cutscenes.Request(CutsceneIds.PrologueAwakening, TourSource))
            {
                return Fail(true, "Die Zwischensequenz ließ sich nicht noch einmal anfordern.");
            }

            Note("Zwischensequenz erneut angefordert.");
            return true;
        }

        private static bool ShowHalfHold()
        {
            CutsceneScreen screen = Services.Locator.TryGet(out IUIManager ui) ? ui.Get<CutsceneScreen>() : null;
            if (screen == null)
            {
                return Fail(true, "Kein Zwischensequenz-Bildschirm.");
            }

            Fail(!screen.HintShown, "Der Hinweis „Überspringen (halten)“ fehlt.");
            screen.HoldProgress(0, 0.5f);
            Note("Halte-Balken zur Hälfte gezeigt (Hinweis sichtbar: " + screen.HintShown + ").");
            return true;
        }

        private static bool SkipReplay()
        {
            ICutsceneService cutscenes = Cutscenes();
            int before = CutsceneEnds.Count;
            double at = cutscenes != null ? cutscenes.CurrentTime : 0d;
            if (cutscenes == null || !cutscenes.Skip(TourSource))
            {
                return Fail(true, "Die Zwischensequenz ließ sich nicht überspringen.");
            }

            bool finished = CutsceneEnds.Count == before + 1 && CutsceneEnds[CutsceneEnds.Count - 1].Skipped;
            Fail(!finished, "Überspringen meldete kein CutsceneFinished mit Überspringen.");
            Fail(_gameState.Current != GameState.Playing, "Nach dem Überspringen Zustand " + _gameState.Current + " statt Playing.");
            Note("Zwischensequenz nach " + at.ToString("0.0") + " s übersprungen, Abblende " + cutscenes.Overlay.FadeAlpha.ToString("0.00") + ".");
            return true;
        }
    }
}
