using System;
using Aetherfall.Core;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using Aetherfall.World.Exploration;
using UnityEditor;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Own map markers (GDD 05 1.8, task list "Weltkarte und Erkundung"): opens the map, starts the cursor with X / F like a
    /// player, moves it, sets a marker with A / Enter, photographs the map and closes it again (Back puts the cursor away first).
    /// The quick save and load of the map tour then must keep the marker.
    /// </summary>
    public static partial class PlayTour
    {
        private static int _ownMarkersBeforeSave = -1;

        private static Func<bool> PlaceOwnMarker(string picture)
        {
            int phase = 0;
            int before = 0;
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
                        if (journal == null || journal.Page != JournalPage.Map || journal.Map.ShownMap == null || Elapsed < 0.4)
                        {
                            return Fail(Elapsed > 4.0, "Das Tagebuch zeigt nicht die Karte.");
                        }

                        ExplorationState state = MapState();
                        before = state != null ? state.Markers.Count : 0;
                        journal.Secondary(-1);
                        if (!journal.Map.CursorActive)
                        {
                            return Fail(true, "X / F zeigt keinen Zeiger für eigene Markierungen.");
                        }

                        for (int i = 0; i < 6; i++)
                        {
                            journal.TryNavigate(NavDirection.Right);
                        }

                        for (int i = 0; i < 3; i++)
                        {
                            journal.TryNavigate(NavDirection.Up);
                        }

                        journal.SubTab(1);
                        journal.Submit(0);
                        state = MapState();
                        if (state == null || state.Markers.Count != before + 1)
                        {
                            return Fail(true, "Mit A / Enter wurde keine Markierung gesetzt (" + journal.Map.TravelStatus + ").");
                        }

                        MapMarker marker = state.Markers[state.Markers.Count - 1];
                        Note("Eigene Markierung gesetzt: „" + MapMarkerSymbols.Name(marker.Symbol) + "“ bei (" + marker.X.ToString("0") + ", " +
                             marker.Z.ToString("0") + "), " + state.Markers.Count + " auf der Karte; Hinweis: " + journal.Map.TravelStatus + ".");
                        phase = 2;
                        _stepStart = EditorApplication.timeSinceStartup;
                        return false;
                    case 2:
                        if (Elapsed < 0.3)
                        {
                            return false;
                        }

                        if (journal == null || journal.Map.VisibleOwnMarkers < before + 1)
                        {
                            return Fail(true, "Die Karte zeichnet die neue Markierung nicht.");
                        }

                        if (!Capture(picture, null))
                        {
                            return false;
                        }

                        // The first Back puts the cursor away and keeps the journal open, the second closes it.
                        journal.Back(false);
                        if (journal.Map.CursorActive || !(ui.Top is JournalScreen))
                        {
                            return Fail(true, "Zurück legt den Zeiger nicht zuerst weg.");
                        }

                        journal.Back(false);
                        phase = 3;
                        _stepStart = EditorApplication.timeSinceStartup;
                        return false;
                    default:
                        return (ui != null && !(ui.Top is JournalScreen) && Elapsed > 0.3) || Fail(Elapsed > 3.0, "Die Karte schließt nicht.");
                }
            };
        }

        private static bool RememberOwnMarkers()
        {
            ExplorationState state = MapState();
            _ownMarkersBeforeSave = state != null ? state.Markers.Count : -1;
            return true;
        }

        private static bool CheckOwnMarkersAfterLoad()
        {
            ExplorationState state = MapState();
            int count = state != null ? state.Markers.Count : -1;
            Note("Eigene Markierungen nach dem Laden: " + count + " (vorher " + _ownMarkersBeforeSave + ").");
            return Fail(count != _ownMarkersBeforeSave || count < 1, "Die eigenen Markierungen sind nach dem Laden nicht mehr da.") || true;
        }
    }
}
