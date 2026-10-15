using System;
using System.Linq;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.World;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Enemy part of the tours (GDD 01 11.4): the Risslinge wait hidden in ambush and break out when the player comes close; the
    /// Mühlbach bandits are a mixed group (Schläger, Anführer, Armbrustschütze) and the crossbowman shoots bolts from range.
    /// </summary>
    public static partial class PlayTour
    {
        /// <summary>Checks that the group lies in ambush, walks up to the first one and waits until it has broken out.</summary>
        private static Func<bool> CheckAmbush(string spawnId)
        {
            int phase = 0;
            EnemyAmbush first = null;
            return () =>
            {
                SpawnGroupMarker marker = Object.FindObjectsByType<SpawnGroupMarker>(FindObjectsInactive.Exclude).FirstOrDefault(m => m.SpawnId == spawnId);
                if (marker == null || marker.Group == null || !marker.Group.activeInHierarchy)
                {
                    return Fail(Elapsed > 10.0, "Gegnergruppe " + spawnId + " ist nicht aktiv.");
                }

                switch (phase)
                {
                    case 0:
                        if (Elapsed < 0.6)
                        {
                            return false;
                        }

                        EnemyAmbush[] ambushers = marker.Group.GetComponentsInChildren<EnemyAmbush>();
                        int hidden = ambushers.Count(a => a.IsHidden);
                        Note("Hinterhalt " + spawnId + ": " + ambushers.Length + " Risslinge, davon " + hidden + " versteckt.");
                        first = ambushers.FirstOrDefault(a => a.IsHidden);
                        if (first == null)
                        {
                            return Fail(true, "Kein Rissling wartet im Hinterhalt.");
                        }

                        Vector3 toward = first.transform.forward;
                        toward.y = 0f;
                        PlaceOnGround(first.transform.position + toward.normalized * 5f, -toward);
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 1;
                        return false;
                    default:
                        if (first.IsHidden)
                        {
                            return Fail(Elapsed > 3.0, "Der Rissling bricht nicht hervor, obwohl der Spieler 5 m entfernt steht.");
                        }

                        if (Elapsed < 0.7)
                        {
                            return false;
                        }

                        _spellTarget = first.GetComponent<Combatant>();
                        Note("Ein Rissling bricht aus dem Boden hervor (Spieler stand 5 m entfernt, Auslöser 8 m; jetzt " +
                             Vector3.Distance(FindPlayer().transform.position, first.transform.position).ToString("0.0") + " m).");
                        return true;
                }
            };
        }

        /// <summary>Camera behind the player on the line from the enemy (<c>_spellTarget</c>) to the player, looking at the enemy.</summary>
        private static Pose ViewAtTarget(Transform player)
        {
            Vector3 p = player.position;
            Vector3 t = _spellTarget != null ? _spellTarget.transform.position : p + player.forward * 5f;
            Vector3 back = p - t;
            back.y = 0f;
            back = back.sqrMagnitude > 0.01f ? back.normalized : -player.forward;
            return Look(p + back * 4f + Vector3.up * 5f, t + Vector3.up * 0.3f);
        }

        /// <summary>Visits the Mühlbach bandits: notes the group and waits until the crossbowman shoots a bolt.</summary>
        private static Func<bool> VisitBandits()
        {
            int phase = 0;
            int firedBefore = 0;
            ProjectileLauncher launcher = null;
            return () =>
            {
                SpawnGroupMarker marker = Object.FindObjectsByType<SpawnGroupMarker>(FindObjectsInactive.Exclude)
                    .FirstOrDefault(m => m.SpawnId == "spawn.eichental.muehlbach_banditen");
                if (marker == null || marker.Group == null)
                {
                    return Fail(Elapsed > 5.0, "Die Mühlbach-Banditen fehlen.");
                }

                switch (phase)
                {
                    case 0:
                        EnemyController[] members = marker.Group.GetComponentsInChildren<EnemyController>();
                        Note("Mühlbach-Banditen: " + string.Join(", ", members.Select(e => e.Definition.DisplayName + " (" + e.Definition.VariantId + ", Stufe " +
                                                                                           e.Definition.Level + ")")) + ".");
                        EnemyController shooter = members.FirstOrDefault(e => e.Definition.EnemyTypeId == SliceEnemyAssets.CrossbowType);
                        launcher = shooter != null ? shooter.GetComponentInChildren<ProjectileLauncher>() : null;
                        if (shooter == null || launcher == null)
                        {
                            return Fail(true, "Kein Armbrustschütze mit Geschoss-Werfer in der Gruppe.");
                        }

                        if (!members.Any(e => e.Definition.VariantId == "elite"))
                        {
                            return Fail(true, "Die Gruppe hat keinen Elite-Anführer.");
                        }

                        Vector3 toward = shooter.transform.forward;
                        toward.y = 0f;
                        PlaceOnGround(shooter.transform.position + toward.normalized * 13f, -toward);
                        _spellTarget = shooter.GetComponent<Combatant>();
                        firedBefore = launcher.FiredCount;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 1;
                        return false;
                    default:
                        if (launcher.FiredCount <= firedBefore)
                        {
                            return Fail(Elapsed > 15.0, "Der Armbrustschütze schießt nicht (15 s).");
                        }

                        Note("Der Armbrustschütze schießt einen Bolzen aus " + Vector3.Distance(FindPlayer().transform.position, _spellTarget.transform.position)
                            .ToString("0") + " m Abstand.");
                        return true;
                }
            };
        }
    }
}
