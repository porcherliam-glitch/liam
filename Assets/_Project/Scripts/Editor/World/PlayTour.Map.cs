using System;
using Aetherfall.Core;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using Aetherfall.World.Exploration;
using UnityEditor;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// World map and exploration (S34/S63, task list "Weltkarte und Erkundung"): the map page at the start, a place discovered
    /// by walking in, the crow's nest of the Wachturm Grauwacht climbed (viewpoint: fog cleared, places marked with "?"), the
    /// map again, an own marker set with the cursor, then a quick save and load that must keep the fog, the viewpoint and the
    /// marker, two fast travels, and the compass markers
    /// (S60) at the start and at the tower foot.
    /// </summary>
    public static partial class PlayTour
    {
        private static float _fogBeforeSave;
        private static bool _mapSaveDone;

        private static void BuildMapPlan()
        {
            Steps.Enqueue(() => ReportFog("am Start"));
            Steps.Enqueue(CheckCompass("k00_kompass_start"));
            Steps.Enqueue(OpenMap("k01_karte_start"));
            Steps.Enqueue(VisitPlace("loc.eichental.lindenhain"));
            Steps.Enqueue(() => FindTower());
            Steps.Enqueue(GrabLadder());
            Steps.Enqueue(ClimbToTheTop());
            Steps.Enqueue(() => EndClimbing());
            Steps.Enqueue(ExpectViewpoint("loc.eichental.wachturm_grauwacht"));
            Steps.Enqueue(OpenMap("k02_karte_nach_kraehennest"));

            // GDD 05 1.8: an own marker with the cursor (X / F, move, A / Enter); the save and load below must keep it.
            Steps.Enqueue(PlaceOwnMarker("k02b_eigene_markierung"));
            Steps.Enqueue(RememberOwnMarkers);
            Steps.Enqueue(MapQuickSave);
            Steps.Enqueue(() => _mapSaveDone || Fail(Elapsed > 30.0, "Schnellspeichern wurde nicht fertig."));
            Steps.Enqueue(MapLoadAndWait());
            Steps.Enqueue(() => Wait(2.0));
            Steps.Enqueue(CheckMapAfterLoad);
            Steps.Enqueue(CheckOwnMarkersAfterLoad);
            Steps.Enqueue(OpenMap("k03_karte_nach_laden"));

            // S50: fast travel through the map page to Lindenhain (discovered) and to the tower foot (viewpoint activated).
            Steps.Enqueue(TravelOnMap("loc.eichental.lindenhain", "k04_schnellreise_lindenhain"));
            Steps.Enqueue(TravelOnMap("loc.eichental.wachturm_grauwacht", "k05_schnellreise_wachturm"));

            // S60: compass markers at the tower foot (places nearby, the quest targets).
            Steps.Enqueue(CheckCompass("k06_kompass_wachturm"));
        }

        private static ExplorationState MapState()
        {
            return Services.Locator != null && Services.Locator.TryGet(out IExplorationService exploration) ? exploration.ActiveState : null;
        }

        private static bool ReportFog(string when)
        {
            ExplorationState state = MapState();
            if (state == null)
            {
                return Fail(Elapsed > 5.0, "Keine aktive Karte (RegionMapAnchor oder ExplorationService fehlt).");
            }

            state.CountPlaces(out int places, out int total);
            Note("Karte " + when + ": " + (state.Fog.RevealedFraction * 100f).ToString("0.0") + " % aufgedeckt, Orte " + places + " / " + total + ".");
            return true;
        }

        /// <summary>Opens the journal on the map page, logs what it shows, photographs it and closes it again.</summary>
        private static Func<bool> OpenMap(string picture)
        {
            int phase = 0;
            return () =>
            {
                IServiceLocator locator = Services.Locator;
                JournalScreen journal = locator.TryGet(out IUIManager ui) ? ui.Top as JournalScreen : null;
                switch (phase)
                {
                    case 0:
                        UIRoot root = Object.FindAnyObjectByType<UIRoot>();
                        if (root == null || !root.OpenJournal(JournalPage.Map))
                        {
                            return Fail(Elapsed > 3.0, "Die Karte öffnet sich nicht.");
                        }

                        phase = 1;
                        _stepStart = EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        if (journal == null || journal.Page != JournalPage.Map || Elapsed < 0.4)
                        {
                            return Fail(Elapsed > 4.0, "Das Tagebuch zeigt nicht die Karte.");
                        }

                        Note("Karte geöffnet: " + (journal.Map.ShownMap != null ? journal.Map.ShownMap.RegionName : "keine") + ", " +
                             journal.Map.VisibleIcons + " Orte und " + journal.Map.VisibleQuestMarkers + " Questziele sichtbar (" + journal.Map.CountText + ").");
                        if (journal.Map.ShownMap == null)
                        {
                            return Fail(true, "Die Kartenseite zeigt keine Karte.");
                        }

                        phase = 2;
                        return false;
                    case 2:
                        if (!Capture(picture, null))
                        {
                            return false;
                        }

                        journal?.Back(false);
                        phase = 3;
                        _stepStart = EditorApplication.timeSinceStartup;
                        return false;
                    default:
                        return (ui != null && !(ui.Top is JournalScreen) && Elapsed > 0.3) || Fail(Elapsed > 3.0, "Die Karte schließt nicht.");
                }
            };
        }

        /// <summary>Stands in the middle of a place: it is discovered and the fog clears there.</summary>
        private static Func<bool> VisitPlace(string placeId)
        {
            bool placed = false;
            float fogBefore = 0f;
            return () =>
            {
                ExplorationState state = MapState();
                if (state == null || !state.Map.TryGetPlace(placeId, out MapPlace place))
                {
                    return Fail(true, "Ort " + placeId + " ist nicht auf der Karte.");
                }

                if (!placed)
                {
                    fogBefore = state.Fog.RevealedFraction;
                    PlaceOnGround(new UnityEngine.Vector3(place.X, 0f, place.Z), UnityEngine.Vector3.forward);
                    placed = true;
                    _stepStart = EditorApplication.timeSinceStartup;
                    return false;
                }

                if (!state.IsDiscovered(placeId) || state.Fog.RevealedFraction <= fogBefore)
                {
                    return Fail(Elapsed > 4.0, place.DisplayName + " wird nicht entdeckt oder der Nebel lichtet sich nicht.");
                }

                Note("Entdeckt: " + place.DisplayName + ", Nebel " + (fogBefore * 100f).ToString("0.0") + " % → " +
                     (state.Fog.RevealedFraction * 100f).ToString("0.0") + " %.");
                return true;
            };
        }

        /// <summary>The crow's nest was reached: the viewpoint is active, fog cleared around it, places marked with "?".</summary>
        private static Func<bool> ExpectViewpoint(string placeId)
        {
            return () =>
            {
                ExplorationState state = MapState();
                if (state == null || !state.IsViewpointActivated(placeId))
                {
                    return Fail(Elapsed > 3.0, "Der Aussichtspunkt " + placeId + " wird oben nicht aktiviert.");
                }

                int unknown = 0;
                foreach (MapPlace place in state.Map.Places)
                {
                    if (state.IsRevealed(place.Id))
                    {
                        unknown++;
                    }
                }

                Note("Aussichtspunkt aktiv: Nebel " + (state.Fog.RevealedFraction * 100f).ToString("0.0") + " % aufgedeckt, " + unknown +
                     " Orte mit „?“ markiert.");
                return Fail(unknown < 2, "Vom Krähennest aus wurden kaum Orte markiert.") || true;
            };
        }

        private static bool MapQuickSave()
        {
            ExplorationState state = MapState();
            _fogBeforeSave = state != null ? state.Fog.RevealedFraction : 0f;
            _mapSaveDone = false;
            Services.Locator.Get<IGameFlow>().QuickSave(result =>
            {
                _mapSaveDone = true;
                Note("Schnellspeichern: " + (result.Success ? "ok, " + result.SlotId : "FEHLER " + result.ReasonKey) + ".");
            });
            return true;
        }

        private static Func<bool> MapLoadAndWait()
        {
            int phase = 0;
            return () =>
            {
                switch (phase)
                {
                    case 0:
                        ISaveManager saves = Services.Locator.Get<ISaveManager>();
                        if (!saves.TryGetLatestSlot(Aetherfall.Events.SaveKind.Quick, out SaveSlotInfo slot))
                        {
                            return Fail(true, "Kein Schnellspeicherstand gefunden.");
                        }

                        Note("Lade " + slot.SlotId + ".");
                        Services.Locator.Get<IGameLoader>().LoadSlot(slot.SlotId);
                        phase = 1;
                        _stepStart = EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        // Leaves Playing for the loading screen, then comes back.
                        if (_gameState.Current == GameState.Playing && Elapsed < 3.0)
                        {
                            return false;
                        }

                        phase = 2;
                        return false;
                    default:
                        return _gameState.Current == GameState.Playing || Fail(Elapsed > 60.0, "Nach dem Laden geht das Spiel nicht weiter.");
                }
            };
        }

        private static bool CheckMapAfterLoad()
        {
            ExplorationState state = MapState();
            if (state == null)
            {
                return Fail(Elapsed > 5.0, "Nach dem Laden gibt es keine aktive Karte.");
            }

            Note("Nach dem Laden: Nebel " + (state.Fog.RevealedFraction * 100f).ToString("0.0") + " % (vorher " + (_fogBeforeSave * 100f).ToString("0.0") +
                 " %), Krähennest aktiv: " + state.IsViewpointActivated("loc.eichental.wachturm_grauwacht") + ".");
            return Fail(state.Fog.RevealedFraction + 0.001f < _fogBeforeSave, "Der Kartennebel ist nach dem Laden zurück.") ||
                   Fail(!state.IsViewpointActivated("loc.eichental.wachturm_grauwacht"), "Der Aussichtspunkt ist nach dem Laden vergessen.") || true;
        }
    }
}
