using System;
using System.Linq;
using Aetherfall.Core;
using Aetherfall.GameTime;
using Aetherfall.Player;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Fast travel (S50): on the map page the travel list offers the unlocked travel points; the first press asks, the second
    /// travels. The clock must jump by the travel time, the player must stand at the arrival point, and travelling to the place
    /// the player stands at is refused.
    /// </summary>
    public static partial class PlayTour
    {
        /// <summary>Travels through the map page and checks clock, position and real time.</summary>
        private static Func<bool> TravelOnMap(string placeId, string picture)
        {
            int phase = 0;
            double expectedHours = 0.0;
            double minutesBefore = 0.0;
            double realStart = 0.0;
            return () =>
            {
                IServiceLocator locator = Services.Locator;
                JournalScreen journal = locator.TryGet(out IUIManager ui) ? ui.Top as JournalScreen : null;
                if (!locator.TryGet(out IFastTravelService travel) || !locator.TryGet(out IGameClock clock))
                {
                    return Fail(true, "Kein Schnellreise-Dienst (PlayerInstaller fehlt in der BootConfig).");
                }

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

                        int index = journal.Map.TravelTargets.ToList().FindIndex(p => p.Id == placeId);
                        Note("Reiseziele: " + string.Join(", ", journal.Map.TravelTargets.Select(p => p.DisplayName)) + ".");
                        if (index < 0)
                        {
                            return Fail(true, "Das Reiseziel " + placeId + " fehlt in der Liste.");
                        }

                        expectedHours = travel.HoursTo(placeId);
                        minutesBefore = clock.TotalGameMinutes;
                        journal.Submit(index);
                        if (journal.Map.ConfirmIndex != index)
                        {
                            return Fail(true, "Der erste Druck fragt nicht nach („" + journal.Map.TravelStatus + "“).");
                        }

                        realStart = EditorApplication.timeSinceStartup;
                        journal.Submit(index);
                        phase = 2;
                        _stepStart = EditorApplication.timeSinceStartup;
                        return false;
                    case 2:
                        if (travel.IsTravelling || _gameState.Current != GameState.Playing || Elapsed < 0.3)
                        {
                            return Fail(Elapsed > 10.0, "Die Schnellreise endet nicht.");
                        }

                        Vector3 position = FindPlayer().transform.position;
                        MapPlaceArrival(placeId, out Vector3 arrival);
                        double hours = (clock.TotalGameMinutes - minutesBefore) / 60.0;
                        double real = EditorApplication.timeSinceStartup - realStart;
                        float off = new Vector2(position.x - arrival.x, position.z - arrival.z).magnitude;
                        Note("Schnellreise nach " + placeId + ": " + hours.ToString("0.00") + " Spielstunden (erwartet " + expectedHours.ToString("0.00") +
                             "), " + real.ToString("0.0") + " s echte Zeit, " + off.ToString("0.0") + " m neben dem Ankunftspunkt, jetzt " + clock.Now + ".");
                        if (Fail(Math.Abs(hours - expectedHours) > 0.02, "Die Uhr springt nicht um die Reisezeit.") ||
                            Fail(off > 3f, "Der Spieler steht nicht am Ankunftspunkt.") || Fail(real > 5.0, "Die Schnellreise dauert länger als 5 s."))
                        {
                            return false;
                        }

                        FastTravelBlock here = travel.Check(placeId, out _);
                        Note("Noch einmal zum selben Ziel: " + here + ".");
                        if (Fail(here != FastTravelBlock.AlreadyThere, "Eine Reise an den eigenen Standort wird nicht abgelehnt."))
                        {
                            return false;
                        }

                        phase = 3;
                        return false;
                    default:
                        return Capture(picture, null);
                }
            };
        }

        private static void MapPlaceArrival(string placeId, out Vector3 arrival)
        {
            arrival = Vector3.zero;
            Aetherfall.World.Exploration.ExplorationState state = MapState();
            if (state != null && state.Map.TryGetPlace(placeId, out Aetherfall.World.Exploration.MapPlace place))
            {
                arrival = new Vector3(place.ArrivalX, place.ArrivalY, place.ArrivalZ);
            }
        }
    }
}
