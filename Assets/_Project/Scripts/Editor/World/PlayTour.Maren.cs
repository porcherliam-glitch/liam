using System;
using System.Linq;
using Aetherfall.Companions;
using Aetherfall.Core;
using Aetherfall.GameTime;
using Aetherfall.WorldState;
using UnityEngine;
using N = Aetherfall.EditorTools.Narrative.MiniSliceDialogueLibrary;
using Object = UnityEngine.Object;
using Q = Aetherfall.EditorTools.Narrative.MiniSliceQuestLibrary;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Ser Maren in full (GDD 01 10.3, 10.4, 10.6; GDD 03 13.1; task list S46): combat modes, the loyalty after the crypt
    /// (seal stone taken: −5), two campfire talks while resting (+2 each), the warning at 20 and leaving at 10.
    /// </summary>
    public static partial class PlayTour
    {
        private static CompanionController FindMaren()
        {
            return Object.FindObjectsByType<CompanionController>(FindObjectsInactive.Exclude).FirstOrDefault();
        }

        private static void EnqueueMaren()
        {
            Steps.Enqueue(MarenMode(1, CompanionMode.Aggressive));
            Steps.Enqueue(MarenMode(3, CompanionMode.Passive));
            Steps.Enqueue(MarenMode(2, CompanionMode.Supportive));
            Steps.Enqueue(MarenMode(0, CompanionMode.Defensive));
            Steps.Enqueue(RestAtCampfire(1));
            Steps.Enqueue(() => Capture("q19_lagerfeuer", ViewNpc));
            Steps.Enqueue(RestAtCampfire(2));
            Steps.Enqueue(MarenLeaves());
            Steps.Enqueue(() => Capture("q20_maren_geht", ViewNpc));
        }

        /// <summary>Checks Maren's loyalty (e.g. after the crypt: the seal stone taken costs 5).</summary>
        private static bool CheckMarenLoyalty(int expected, string why)
        {
            IWorldState world = Services.Locator.Get<IWorldState>();
            int loyalty = world.GetInt(Q.MarenLoyalty);
            Note("Marens Loyalität " + why + ": " + loyalty + " („" + CompanionLoyalty.TierWord(loyalty) + "“).");
            return Fail(loyalty != expected, "Marens Loyalität ist " + loyalty + " statt " + expected + ".") || true;
        }

        /// <summary>Sets her combat mode (the dialogue does the same) and waits until she follows it.</summary>
        private static Func<bool> MarenMode(int value, CompanionMode expected)
        {
            bool set = false;
            return () =>
            {
                CompanionController maren = FindMaren();
                if (maren == null)
                {
                    return Fail(Elapsed > 5.0, "Maren fehlt.");
                }

                if (!set)
                {
                    Services.Locator.Get<IWorldState>().SetInt(Q.MarenMode, value, "rundgang");
                    set = true;
                    return false;
                }

                if (maren.Mode != expected)
                {
                    return Fail(Elapsed > 2.0, "Maren bleibt im Modus " + maren.Mode + " statt " + expected + ".");
                }

                Note("Maren kämpft jetzt " + expected + " (" + maren.DebugStateText + ", anvisierbar " + maren.Combatant.IsTargetable + ").");
                return Fail(expected == CompanionMode.Passive == maren.Combatant.IsTargetable, "Passiv: Gegner sollen sie in Ruhe lassen.") || true;
            };
        }

        /// <summary>Rests at the campfire of Lindenhain: the time jumps and Maren starts her next campfire talk.</summary>
        private static Func<bool> RestAtCampfire(int talkNumber)
        {
            double minutesBefore = -1.0;
            int loyaltyBefore = 0;
            Func<bool> use = null;
            return () =>
            {
                IGameClock clock = Services.Locator.Get<IGameClock>();
                IWorldState world = Services.Locator.Get<IWorldState>();
                if (use == null)
                {
                    minutesBefore = clock.TotalGameMinutes;
                    loyaltyBefore = world.GetInt(Q.MarenLoyalty);
                    use = UseTarget(() => Object.FindObjectsByType<CampfireRest>(FindObjectsInactive.Exclude).FirstOrDefault(), "Lagerfeuer",
                        ExpectDialogue(N.MarenCampfireDialogue));
                }

                if (!use())
                {
                    return false;
                }

                double hours = (clock.TotalGameMinutes - minutesBefore) / 60.0;
                int talks = world.GetInt(Q.MarenCampfire);
                int loyalty = world.GetInt(Q.MarenLoyalty);
                Note("Rast am Lagerfeuer: " + hours.ToString("0.0") + " Spielstunden, jetzt " + clock.Now + "; Lagerfeuer-Gespräch " + talks +
                     ", Loyalität " + loyaltyBefore + " → " + loyalty + ".");
                _viewNpc = FindMaren() != null ? FindMaren().transform : null;
                return Fail(hours < 2.9 || talks != talkNumber || loyalty != loyaltyBefore + 2, "Rasten oder Lagerfeuer-Gespräch " + talkNumber +
                                                                                              " stimmt nicht.") || true;
            };
        }

        /// <summary>Loyalty 18 makes her warn, 8 makes her leave the group and go back to her post.</summary>
        private static Func<bool> MarenLeaves()
        {
            int phase = 0;
            return () =>
            {
                CompanionController maren = FindMaren();
                IWorldState world = Services.Locator.Get<IWorldState>();
                switch (phase)
                {
                    case 0:
                        world.SetInt(Q.MarenLoyalty, 18, "rundgang");
                        phase = 1;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        if (world.GetInt(Q.MarenWarned) != 1)
                        {
                            return Fail(Elapsed > 2.0, "Maren warnt bei Loyalität 18 nicht.");
                        }

                        Note("Loyalität 18: Maren warnt (Flag gesetzt), sie ist noch dabei: " + maren.IsJoined + ".");
                        world.SetInt(Q.MarenLoyalty, 8, "rundgang");
                        phase = 2;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    default:
                        if (!maren.HasLeft || maren.IsJoined)
                        {
                            return Fail(Elapsed > 3.0, "Maren verlässt die Gruppe bei Loyalität 8 nicht.");
                        }

                        _viewNpc = maren.transform;
                        Note("Loyalität 8: Maren verlässt die Gruppe und steht wieder am Wachposten (" +
                             Vector3.Distance(maren.transform.position, FindPlayer().transform.position).ToString("0") + " m vom Spieler).");
                        return Fail(world.GetInt(Q.MarenInParty) != 0, "„In der Gruppe“ bleibt gesetzt.") || true;
                }
            };
        }
    }
}
