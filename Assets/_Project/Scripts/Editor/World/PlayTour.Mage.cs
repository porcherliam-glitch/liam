using System;
using System.Linq;
using Aetherfall.AI;
using Aetherfall.Classes;
using Aetherfall.Combat;
using Aetherfall.Inventory;
using Aetherfall.Player;
using Aetherfall.Stats;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Check run of the mage class (<c>-tourMode magier</c>): a new game with the class "Magier" (as chosen in the main menu)
    /// must have the start values of GDD 03 11.2, the apprentice staff in the hand and the fire bolt moveset; then the tour
    /// fires bolts at a wolf the way the left mouse button does, takes a picture of a bolt in flight and drinks a mana potion
    /// from quick slot 6.
    /// </summary>
    public static partial class PlayTour
    {
        private static int _boltsBefore;

        private static void BuildMagePlan()
        {
            Steps.Enqueue(MakePlayerInvulnerable);
            Steps.Enqueue(CheckMage);
            Steps.Enqueue(() => Capture("m01_magier", ViewBehindPlayer));
            Steps.Enqueue(ShootAtWolf());
            // A picture of a bolt in flight: fire once more, then capture 0.12 s later (a bolt flies 30 m/s).
            Steps.Enqueue(() => Wait(1.4));
            Steps.Enqueue(FireOnce());
            Steps.Enqueue(() => Capture("m02_feuergeschoss", ViewBehindPlayer));
            Steps.Enqueue(ReportBolt);
            // The wolves fight back; drinking needs a calm moment (a stagger breaks it off).
            Steps.Enqueue(KillEnemiesInScene());
            Steps.Enqueue(WaitOutOfCombat);
            Steps.Enqueue(DrinkManaPotion());
            Steps.Enqueue(() => Capture("m03_ende", null));
        }

        private static bool CheckMage()
        {
            PlayerMotor player = FindPlayer();
            if (player == null || Elapsed < 0.5)
            {
                return Fail(Elapsed > 5.0, "Keine Spielfigur.");
            }

            PlayerClass playerClass = player.GetComponent<PlayerClass>();
            PlayerCombatController combat = player.GetComponent<PlayerCombatController>();
            CharacterStatsComponent stats = player.GetComponent<CharacterStatsComponent>();
            if (playerClass == null || playerClass.AppliedClassId != "class.magier")
            {
                return Fail(Elapsed > 5.0, "Klasse an der Figur: " + (playerClass != null ? playerClass.AppliedClassId : "PlayerClass fehlt") + ", erwartet class.magier.");
            }

            if (combat.WeaponType != Aetherfall.Items.WeaponType.Staff)
            {
                return Fail(Elapsed > 5.0, "Bewegungsset: " + combat.WeaponType + " statt Zauberstab.");
            }

            float intelligence = stats.Stats.Get(StatId.Intelligence);
            Transform staff = player.transform.Find("SwordHand/Zauberstab");
            Note("Magier: Intelligenz " + intelligence.ToString("0") + ", Stärke " + stats.Stats.Get(StatId.Strength).ToString("0") + ", max. Mana " +
                 stats.Mana.Max.ToString("0") + ", max. LP " + player.GetComponent<DamageableComponent>().Health.Max.ToString("0") + ", Stab sichtbar: " +
                 (staff != null && staff.gameObject.activeInHierarchy) + ", Waffenschaden " + combat.WeaponDamage.ToString("0") + ".");
            if (intelligence < 15f)
            {
                return Fail(true, "Intelligenz " + intelligence + " statt mindestens 15 (GDD 03 11.2).");
            }

            return true;
        }

        /// <summary>Stands 9 m in front of a wolf and fires up to three bolts (light attack, like the left mouse button).</summary>
        private static Func<bool> ShootAtWolf()
        {
            int phase = 0;
            int shots = 0;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                PlayerCombatController combat = player != null ? player.GetComponent<PlayerCombatController>() : null;
                ProjectileLauncher launcher = combat != null ? combat.Projectiles : null;
                if (launcher == null)
                {
                    return Fail(true, "Die Spielfigur hat keinen ProjectileLauncher.");
                }

                switch (phase)
                {
                    case 0:
                        EnemyController wolf = Object.FindObjectsByType<EnemyController>(FindObjectsInactive.Exclude)
                            .FirstOrDefault(e => e.GetComponent<Combatant>().IsAlive);
                        if (wolf == null)
                        {
                            return Fail(Elapsed > 5.0, "Kein lebender Gegner in der Szene.");
                        }

                        Vector3 front = wolf.transform.forward;
                        front.y = 0f;
                        PlaceOnGround(wolf.transform.position + front.normalized * 9f, -front);
                        _boltsBefore = launcher.FiredCount;
                        Note("Ziel: " + wolf.GetComponent<Combatant>().CombatantId + " in 9 m.");
                        phase = 1;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        if (Elapsed < 0.4)
                        {
                            return false;
                        }

                        combat.QueueLightAttack();
                        shots++;
                        phase = 2;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    case 2:
                        if (launcher.FiredCount <= _boltsBefore)
                        {
                            return Fail(Elapsed > 2.0, "Der Stab feuert kein Geschoss (Zustand " + combat.StateMachine.State + ").");
                        }

                        Projectile bolt = launcher.LastFired;
                        if (bolt != null && bolt.IsFlying && Elapsed < 2.0)
                        {
                            return false;
                        }

                        Combatant hit = bolt != null ? bolt.LastHit : null;
                        Note("Feuergeschoss " + shots + ": " + (hit != null ? "Treffer auf " + hit.CombatantId + " (LP " + hit.Health.Current.ToString("0") + "/" +
                                                                                hit.Health.Max.ToString("0") + ")" : "kein Treffer") + ".");
                        if (hit != null)
                        {
                            return true;
                        }

                        if (shots >= 3)
                        {
                            return Fail(true, "Drei Feuergeschosse ohne Treffer.");
                        }

                        _boltsBefore = launcher.FiredCount;
                        phase = 1;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    default:
                        return true;
                }
            };
        }

        /// <summary>Fires one bolt and returns 0.12 s after it left the staff.</summary>
        private static Func<bool> FireOnce()
        {
            bool fired = false;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                PlayerCombatController combat = player != null ? player.GetComponent<PlayerCombatController>() : null;
                if (combat == null || combat.Projectiles == null)
                {
                    return Fail(true, "Spielfigur ohne Stab-Geschosse.");
                }

                if (!fired)
                {
                    _boltsBefore = combat.Projectiles.FiredCount;
                    combat.QueueLightAttack();
                    fired = true;
                    _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                    return false;
                }

                if (combat.Projectiles.FiredCount <= _boltsBefore)
                {
                    return Fail(Elapsed > 2.0, "Kein Geschoss für das Bild.");
                }

                return Elapsed >= combat.StateMachine.Weapon.LightCombo[0].WindupSeconds + 0.12;
            };
        }

        private static bool ReportBolt()
        {
            PlayerMotor player = FindPlayer();
            ProjectileLauncher launcher = player != null ? player.GetComponent<ProjectileLauncher>() : null;
            Projectile bolt = launcher != null ? launcher.LastFired : null;
            if (bolt != null)
            {
                Note("Geschoss auf dem Bild: fliegt " + bolt.IsFlying + ", Höhe " + (bolt.transform.position.y - player.transform.position.y).ToString("0.0") +
                     " m, Abstand " + Vector3.Distance(bolt.transform.position, player.transform.position).ToString("0.0") + " m.");
            }

            return true;
        }

        /// <summary>Spends mana, then drinks the mana potion of quick slot 6 and checks mana and bag.</summary>
        private static Func<bool> DrinkManaPotion()
        {
            int phase = 0;
            float manaBefore = 0f;
            int potionsBefore = 0;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                PlayerQuickSlots quick = player != null ? player.GetComponent<PlayerQuickSlots>() : null;
                CharacterStatsComponent stats = player != null ? player.GetComponent<CharacterStatsComponent>() : null;
                IInventoryService inventory = Aetherfall.Core.Services.Locator.Get<IInventoryService>();
                if (quick == null || stats == null)
                {
                    return Fail(true, "Spielfigur ohne PlayerQuickSlots.");
                }

                switch (phase)
                {
                    case 0:
                        if (Elapsed < 1.0)
                        {
                            return false;
                        }

                        stats.Mana.Spend(stats.Mana.Max * 0.6f);
                        manaBefore = stats.Mana.Current;
                        potionsBefore = inventory.CountInBag(InventoryOwners.Player, TestGroundItemAssets.ManaPotionId);
                        if (!quick.TryUse(1, out string reason))
                        {
                            return Fail(Elapsed > 4.0, "Manatrank lässt sich nicht trinken: " + reason);
                        }

                        phase = 1;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    default:
                        if (quick.IsDrinking)
                        {
                            return Fail(Elapsed > 3.0, "Das Trinken endet nicht.");
                        }

                        int potions = inventory.CountInBag(InventoryOwners.Player, TestGroundItemAssets.ManaPotionId);
                        Note("Manatrank getrunken: Mana " + manaBefore.ToString("0") + " → " + stats.Mana.Current.ToString("0") + ", Tränke " + potionsBefore +
                             " → " + potions + ".");
                        return potions == potionsBefore - 1 && stats.Mana.Current > manaBefore + 1f ||
                               Fail(true, "Der Manatrank wirkt nicht (Mana " + stats.Mana.Current + ", Tränke " + potions + ").");
                }
            };
        }
    }
}
