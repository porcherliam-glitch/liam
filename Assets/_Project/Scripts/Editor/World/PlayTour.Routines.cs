using System;
using System.Linq;
using Aetherfall.Core;
using Aetherfall.GameTime;
using Aetherfall.World;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Game clock, NPC daily routines and barks (GDD 01 6.1, 7.1, 7.4; task list S43/S44): the clock runs, Hollmann leaves
    /// the herd in the evening and walks to his farm, Ulf says a line when the player comes to the inn.
    /// </summary>
    public static partial class PlayTour
    {
        private static Transform _viewNpc;

        private static void EnqueueRoutines()
        {
            Steps.Enqueue(CheckClock());
            Steps.Enqueue(RoutineAt("npc.eichental.bauer_hollmann", 18.5f, "Feierabend am Hof"));
            Steps.Enqueue(() => Capture("q17_hollmann_feierabend", ViewNpc));
            Steps.Enqueue(BarkAt("npc.eichental.wirt_ulf"));
            Steps.Enqueue(() => Capture("q18_ulf_spruch", ViewNpc));
        }

        private static NpcScheduleRunner FindRoutine(string npcId)
        {
            return Object.FindObjectsByType<NpcScheduleRunner>(FindObjectsInactive.Exclude)
                .FirstOrDefault(r => r.TryGetComponent(out NpcMarker marker) && marker.NpcId == npcId);
        }

        /// <summary>The clock runs: day, weekday and time of day are known.</summary>
        private static Func<bool> CheckClock()
        {
            double start = -1.0;
            return () =>
            {
                if (!Services.Locator.TryGet(out IGameClock clock))
                {
                    return Fail(true, "Keine Spieluhr (IGameClock).");
                }

                if (start < 0.0)
                {
                    start = clock.TotalGameMinutes;
                    return false;
                }

                if (clock.TotalGameMinutes - start < 1.0)
                {
                    return Fail(Elapsed > 6.0, "Die Spieluhr steht (" + clock.Now + ").");
                }

                Note("Spieluhr: " + clock.Now + ", " + GameCalendar.MoonName(clock.Now.MoonDay) + ", Phase " + clock.Now.Phase + ", 1 Spieltag = " +
                     (clock.RealSecondsPerGameDay / 60f).ToString("0") + " min.");
                return true;
            };
        }

        /// <summary>Lets the time pass to <paramref name="hour"/> and waits until the NPC stands at the place of its routine.</summary>
        private static Func<bool> RoutineAt(string npcId, float hour, string activity)
        {
            int phase = 0;
            return () =>
            {
                NpcScheduleRunner runner = FindRoutine(npcId);
                IGameClock clock = Services.Locator.Get<IGameClock>();
                if (runner == null)
                {
                    return Fail(Elapsed > 5.0, "Kein Tagesablauf für " + npcId + ".");
                }

                switch (phase)
                {
                    case 0:
                        Note(npcId + " um " + clock.Now.ClockText + ": " + runner.CurrentActivity + ".");
                        // Watch him from close by, so he walks instead of simply arriving.
                        PlaceOnGround(runner.transform.position + runner.transform.forward * 6f, -runner.transform.forward);
                        _viewNpc = runner.transform;
                        double wait = GameCalendar.MinutesUntil(clock.TotalGameMinutes, (int)hour) + (hour - (int)hour) * 60.0;
                        clock.AdvanceHours((float)(wait / 60.0), "debug.rundgang");
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 1;
                        return false;
                    default:
                        if (runner.CurrentActivity != activity)
                        {
                            return Fail(Elapsed > 3.0, npcId + " um " + clock.Now.ClockText + ": " + runner.CurrentActivity + " statt " + activity + ".");
                        }

                        if (runner.IsWalking)
                        {
                            return Fail(Elapsed > 45.0, npcId + " kommt nicht an (45 s).");
                        }

                        Note(npcId + " um " + clock.Now.ClockText + ": " + runner.CurrentActivity + " (nach " + Elapsed.ToString("0") + " s Weg).");
                        return true;
                }
            };
        }

        /// <summary>The player walks up to an NPC: it says a line that fits the time of day.</summary>
        private static Func<bool> BarkAt(string npcId)
        {
            int phase = 0;
            int saidBefore = 0;
            NpcBarker barker = null;
            return () =>
            {
                switch (phase)
                {
                    case 0:
                        barker = Object.FindObjectsByType<NpcBarker>(FindObjectsInactive.Exclude)
                            .FirstOrDefault(b => b.GetComponentInParent<NpcMarker>() != null && b.GetComponentInParent<NpcMarker>().NpcId == npcId);
                        if (barker == null)
                        {
                            return Fail(Elapsed > 5.0, "Keine Sprüche für " + npcId + ".");
                        }

                        Transform npc = barker.transform.parent;
                        _viewNpc = npc;
                        // The tour talked to this NPC before: only a new line counts.
                        saidBefore = barker.Said;
                        PlaceOnGround(npc.position + npc.forward * 9f, -npc.forward);
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 1;
                        return false;
                    case 1:
                        if (Elapsed < 0.5)
                        {
                            return false;
                        }

                        Transform target = barker.transform.parent;
                        PlaceOnGround(target.position + target.forward * 2.5f, -target.forward);
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 2;
                        return false;
                    default:
                        if (barker.Said <= saidBefore || barker.Current.Length == 0)
                        {
                            return Fail(Elapsed > 3.0, npcId + " sagt nichts, obwohl der Spieler daneben steht.");
                        }

                        Note(npcId + " sagt: „" + barker.Current.Trim('„', '“') + "“");
                        return true;
                }
            };
        }

        private static Pose ViewNpc(Transform player)
        {
            Transform npc = _viewNpc != null ? _viewNpc : player;
            Vector3 front = npc.forward;
            front.y = 0f;
            front = front.sqrMagnitude > 0.01f ? front.normalized : Vector3.forward;
            Vector3 side = Vector3.Cross(Vector3.up, front);
            return Look(npc.position + front * 4.5f + side * 1.5f + Vector3.up * 2.2f, npc.position + Vector3.up * 1.6f);
        }
    }
}
