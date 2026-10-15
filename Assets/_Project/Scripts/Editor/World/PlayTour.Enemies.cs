using System;
using System.Linq;
using Aetherfall.AI;
using Aetherfall.AI.Bosses;
using Aetherfall.Combat;
using Aetherfall.Core;
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

        /// <summary>Finds the boss fight of a spawn group (active group only).</summary>
        private static NamedBossEncounter FindNamedBoss(string spawnId)
        {
            SpawnGroupMarker marker = Object.FindObjectsByType<SpawnGroupMarker>(FindObjectsInactive.Exclude).FirstOrDefault(m => m.SpawnId == spawnId);
            return marker != null && marker.Group != null && marker.Group.activeInHierarchy ? marker.Group.GetComponentInChildren<NamedBossEncounter>() : null;
        }

        /// <summary>S42: the Aether-Stoß broke the shell of the Rissbrut – it takes full damage now.</summary>
        private static Func<bool> CheckShellBroken(string spawnId)
        {
            return () =>
            {
                NamedBossEncounter boss = FindNamedBoss(spawnId);
                AetherShell shell = boss != null ? boss.GetComponent<AetherShell>() : null;
                if (shell == null)
                {
                    return Fail(Elapsed > 5.0, "Die Rissbrut hat keine Aether-Schale.");
                }

                if (shell.BreakCount < 1)
                {
                    return Fail(Elapsed > 3.0, "Der Aether-Stoß hat die Schale der Rissbrut nicht gebrochen.");
                }

                Combatant combatant = boss.GetComponent<Combatant>();
                Note("Aether-Schale gebrochen (" + shell.BreakCount + "×), Schadensfaktor jetzt " + combatant.DamageTakenFactor.ToString("0.00") + ".");
                return Fail(combatant.DamageTakenFactor < 0.99f, "Nach dem Bruch nimmt die Rissbrut noch immer weniger Schaden.") || true;
            };
        }

        /// <summary>
        /// S42: starts the boss fight of a group (boss bar), brings the boss to 45 % health and checks that phase 2 calls its
        /// helpers.
        /// </summary>
        private static Func<bool> BossPhaseTwo(string spawnId)
        {
            int phase = 0;
            return () =>
            {
                NamedBossEncounter boss = FindNamedBoss(spawnId);
                if (boss == null)
                {
                    return Fail(Elapsed > 10.0, "Kein Boss in " + spawnId + ".");
                }

                Combatant combatant = boss.GetComponent<Combatant>();
                switch (phase)
                {
                    case 0:
                        if (!boss.IsBarShown)
                        {
                            Vector3 toward = boss.transform.forward;
                            toward.y = 0f;
                            PlaceOnGround(boss.transform.position + toward.normalized * 6f, -toward);
                            boss.GetComponent<EnemyController>().Alert();
                        }

                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 1;
                        return false;
                    case 1:
                        if (!boss.IsBarShown)
                        {
                            return Fail(Elapsed > 8.0, "Der Bossbalken von " + boss.BossId + " erscheint nicht.");
                        }

                        BossBarState bar = Services.Locator.Get<IBossBarService>().Current;
                        Note("Bossbalken: " + bar.DisplayName + " – " + bar.Title + ", Phase " + bar.Phase + " von " + bar.PhaseCount + ".");
                        combatant.Health.RestoreState(combatant.Health.Max * 0.45f);
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 2;
                        return false;
                    default:
                        GameObject helpers = boss.PhaseHelpers.Count > 0 ? boss.PhaseHelpers[0] : null;
                        if (boss.Phase < 2 || helpers == null || !helpers.activeSelf)
                        {
                            return Fail(Elapsed > 3.0, "Bei 45 % beginnt keine Phase 2 mit Helfern (" + boss.BossId + ").");
                        }

                        if (Elapsed < 1.0)
                        {
                            return false;
                        }

                        int awake = helpers.GetComponentsInChildren<EnemyController>().Count(e => !e.Dormant);
                        Note("Phase 2 von " + boss.BossId + ": " + awake + " Helfer im Kampf (" + string.Join(", ",
                            helpers.GetComponentsInChildren<EnemyController>().Select(e => e.Definition.DisplayName)) + ").");
                        _spellTarget = combatant;
                        return Fail(awake < 2, "Nicht alle Helfer greifen an.") || true;
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
