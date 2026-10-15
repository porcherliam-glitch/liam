using System;
using System.Linq;
using Aetherfall.Core;
using Aetherfall.Player;
using Aetherfall.World;
using Aetherfall.WorldState;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Detective mode (GDD 02 5.1 type 18, GDD 03 "Untersuchen → Aether-Sicht", task list S37) on the pasture of quest 2:
    /// holding Investigate near the torn sheep lights the clue up (5 m), Aether sight (flag set by the tour, normally HQ 4)
    /// reaches 40 m and only lets the player walk.
    /// </summary>
    public static partial class PlayTour
    {
        /// <summary>Stands 3 m from the clue, investigates, then tries Aether sight.</summary>
        private static Func<bool> InvestigateNear(string clueId)
        {
            int phase = 0;
            InvestigateHighlight clue = null;
            int normal = 0;
            return () =>
            {
                PlayerInvestigator investigator = FindPlayer().GetComponent<PlayerInvestigator>();
                IWorldState world = Services.Locator.Get<IWorldState>();
                switch (phase)
                {
                    case 0:
                        clue = Object.FindObjectsByType<InvestigateHighlight>(FindObjectsInactive.Exclude)
                            .FirstOrDefault(h => h.TryGetComponent(out QuestObjectMarker m) && m.ObjectId == clueId);
                        if (clue == null || investigator == null)
                        {
                            return Fail(true, "Hinweis " + clueId + " ohne Leuchten oder Spieler ohne Untersuchen.");
                        }

                        Fail(clue.IsRevealed, "Der Hinweis leuchtet schon ohne Untersuchen.");
                        Vector3 spot = clue.transform.position + (FindPlayer().transform.position - clue.transform.position).normalized * 3f;
                        PlaceOnGround(spot, clue.transform.position - spot);
                        investigator.ExternalHold = true;
                        phase = 1;
                        _stepStart = EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        if (!clue.IsRevealed)
                        {
                            return Fail(Elapsed > 2.0, "Beim Untersuchen leuchtet " + clueId + " nicht (3 m entfernt).");
                        }

                        normal = investigator.RevealedCount;
                        Note("Untersuchen an der Weide: " + normal + " Hinweis(e) leuchten im Umkreis von 5 m, Aether-Sicht " + investigator.IsAetherSight + ".");
                        phase = 2;
                        return false;
                    case 2:
                        // Capture with the HUD: the warm frame and the line „Untersuchen: … leuchten“.
                        if (!Capture("q04a_untersuchen", null))
                        {
                            return false;
                        }

                        world.SetInt(InvestigateRules.AetherSightFlag, 1, "rundgang");
                        phase = 3;
                        _stepStart = EditorApplication.timeSinceStartup;
                        return false;
                    case 3:
                        if (!investigator.IsAetherSight || Elapsed < 0.6)
                        {
                            return Fail(Elapsed > 2.0, "Aether-Sicht geht nicht an.");
                        }

                        PlayerMotor motor = FindPlayer();
                        Note("Aether-Sicht: " + investigator.RevealedCount + " Dinge leuchten im Umkreis von 40 m, nur Gehen: " + motor.IsSenseSlow + ".");
                        Fail(investigator.RevealedCount < normal, "Die Aether-Sicht zeigt weniger als das Untersuchen.");
                        Fail(!motor.IsSenseSlow, "In der Aether-Sicht kann man noch laufen.");
                        phase = 4;
                        return false;
                    case 4:
                        if (!Capture("q04a_aether_sicht", null))
                        {
                            return false;
                        }

                        world.SetInt(InvestigateRules.AetherSightFlag, 0, "rundgang");
                        investigator.ExternalHold = false;
                        phase = 5;
                        _stepStart = EditorApplication.timeSinceStartup;
                        return false;
                    default:
                        if (investigator.IsActive || clue.IsRevealed)
                        {
                            return Fail(Elapsed > 1.0, "Nach dem Loslassen leuchtet der Hinweis weiter.");
                        }

                        return true;
                }
            };
        }
    }
}
