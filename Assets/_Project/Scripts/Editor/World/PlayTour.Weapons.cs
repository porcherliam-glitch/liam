using System;
using System.Linq;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Player;
using Aetherfall.Stats;
using Unity.Cinemachine;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Check run of the weapon types of Stufe A (<c>-tourMode waffen</c>, GDD 03 5.3): the warrior puts on the iron mace (moveset,
    /// model, three blows on a wolf), then a hunting bow from the bag (F takes it into the hand), shoots a fully drawn arrow at a
    /// wolf the way the crosshair does and puts the bow back on the back. The quest run uses <see cref="ShootStrawTarget"/> for
    /// the straw targets of "Die Wölfe vom Nordhang".
    /// </summary>
    public static partial class PlayTour
    {
        private const int MaxShotsPerTarget = 3;

        private static float _wolfHealthBefore;
        private static EnemyController _wolf;

        private static void BuildWeaponsPlan()
        {
            Steps.Enqueue(MakePlayerInvulnerable);
            Steps.Enqueue(EquipMace());
            Steps.Enqueue(() => Capture("w01_streitkolben", ViewBesidePlayer));
            Steps.Enqueue(StandBeforeWolf(1.7f));
            Steps.Enqueue(QueueBlow);
            Steps.Enqueue(() => Wait(0.32));
            Steps.Enqueue(() => Capture("w02_streitkolben_schlag", ViewBesidePlayer));
            Steps.Enqueue(() => Wait(0.4));
            Steps.Enqueue(QueueBlow);
            Steps.Enqueue(() => Wait(0.7));
            Steps.Enqueue(QueueBlow);
            Steps.Enqueue(() => Wait(1.3));
            Steps.Enqueue(ReportMaceDamage);

            Steps.Enqueue(GiveBow);
            Steps.Enqueue(EnterBowStance);
            Steps.Enqueue(() => Capture("w03_bogen_haltung", ViewBesidePlayer));
            Steps.Enqueue(StandBeforeWolf(12f));
            Steps.Enqueue(ShootWolf());
            Steps.Enqueue(() => Wait(1.0));
            // A picture through the aim camera while the string is drawn (crosshair, arrows left).
            Steps.Enqueue(StandBeforeWolf(14f));
            Steps.Enqueue(ShootWolf(true));
            Steps.Enqueue(() => Capture("w04_bogen_zielen", null));
            Steps.Enqueue(() => Wait(2.0));
            Steps.Enqueue(LeaveBowStance);
            Steps.Enqueue(() => Wait(0.5));
            Steps.Enqueue(() => Capture("w05_bogen_ruecken", ViewBehindPlayer));
        }

        private static Pose ViewBesidePlayer(Transform player)
        {
            Vector3 p = player.position;
            return Look(p + player.forward * 2.6f + player.right * 1.6f + Vector3.up * 1.7f, p + Vector3.up * 1.2f);
        }

        /// <summary>Puts a new iron mace from the bag into the main hand and checks moveset and model.</summary>
        private static Func<bool> EquipMace()
        {
            bool equipped = false;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                IInventoryService inventory = Services.Locator.Get<IInventoryService>();
                if (!equipped)
                {
                    if (!inventory.TryAddNew(InventoryOwners.Player, TestGroundItemAssets.MaceId, 1, "rundgang") ||
                        !TryEquipFromBag(inventory, TestGroundItemAssets.MaceId, EquipmentSlot.MainHand, out string reason))
                    {
                        return Fail(true, "Streitkolben lässt sich nicht anlegen.");
                    }

                    equipped = true;
                    return false;
                }

                PlayerCombatController combat = player.GetComponent<PlayerCombatController>();
                if (combat.WeaponType != WeaponType.Mace)
                {
                    return Fail(Elapsed > 3.0, "Bewegungsset: " + combat.WeaponType + " statt Streitkolben.");
                }

                Transform mace = player.transform.Find("SwordHand/Streitkolben");
                Transform sword = player.transform.Find("SwordHand/Schwert");
                WeaponSpec weapon = combat.StateMachine.Weapon;
                Note("Streitkolben: Bewegungsset " + combat.WeaponType + ", Kombo " + weapon.LightCombo.Length + " Schläge, Schadensart " + weapon.DamageType +
                     ", Waffenschaden " + combat.WeaponDamage.ToString("0") + ", Modell sichtbar " + (mace != null && mace.gameObject.activeInHierarchy) +
                     ", Schwert ausgeblendet " + (sword == null || !sword.gameObject.activeInHierarchy) + ".");
                return weapon.LightCombo.Length == 3 && weapon.DamageType == Aetherfall.Events.DamageType.Blunt ||
                       Fail(true, "Streitkolben-Werte falsch (Kombo " + weapon.LightCombo.Length + ", " + weapon.DamageType + ").");
            };
        }

        private static bool TryEquipFromBag(IInventoryService inventory, string itemId, EquipmentSlot slot, out string reason)
        {
            ItemInstance item = inventory.PlayerContainer.Entries.LastOrDefault(e => e.ItemId == itemId);
            if (item == null)
            {
                reason = itemId + " nicht in der Tasche.";
                return false;
            }

            return inventory.TryEquip(item.InstanceId, slot, out reason);
        }

        /// <summary>Stands <paramref name="distance"/> metres in front of a living wolf, facing it.</summary>
        private static Func<bool> StandBeforeWolf(float distance)
        {
            return () =>
            {
                PlayerMotor player = FindPlayer();
                _wolf = Object.FindObjectsByType<EnemyController>(FindObjectsInactive.Exclude)
                    .Where(e => e.GetComponent<Combatant>().IsAlive)
                    .OrderBy(e => Vector3.Distance(e.transform.position, player.transform.position))
                    .FirstOrDefault();
                if (_wolf == null)
                {
                    return Fail(Elapsed > 5.0, "Kein lebender Gegner in der Szene.");
                }

                Vector3 front = _wolf.transform.forward;
                front.y = 0f;
                PlaceOnGround(_wolf.transform.position + front.normalized * distance, -front);
                _wolfHealthBefore = _wolf.GetComponent<Combatant>().Health.Current;
                Note("Ziel: " + _wolf.GetComponent<Combatant>().CombatantId + " in " + distance.ToString("0.0") + " m (LP " + _wolfHealthBefore.ToString("0") + ").");
                return true;
            };
        }

        private static bool QueueBlow()
        {
            FindPlayer().GetComponent<PlayerCombatController>().QueueLightAttack();
            return true;
        }

        private static bool ReportMaceDamage()
        {
            Combatant wolf = _wolf != null ? _wolf.GetComponent<Combatant>() : null;
            if (wolf == null)
            {
                return Fail(true, "Der Wolf ist verschwunden.");
            }

            float after = wolf.IsAlive ? wolf.Health.Current : 0f;
            Note("Streitkolben: drei Schläge, Wolf LP " + _wolfHealthBefore.ToString("0") + " → " + after.ToString("0") + (wolf.IsAlive ? "." : " (tot)."));
            return after < _wolfHealthBefore || Fail(true, "Der Streitkolben hat den Wolf nicht getroffen.");
        }

        private static bool GiveBow()
        {
            IInventoryService inventory = Services.Locator.Get<IInventoryService>();
            bool ok = inventory.TryAddNew(InventoryOwners.Player, TestGroundItemAssets.HuntingBowId, 1, "rundgang") &&
                      inventory.TryAddNew(InventoryOwners.Player, TestGroundItemAssets.ArrowId, 20, "rundgang");
            return ok || Fail(true, "Bogen oder Pfeile lassen sich nicht in die Tasche legen.");
        }

        private static bool EnterBowStance()
        {
            PlayerMotor player = FindPlayer();
            PlayerBow bow = player.GetComponent<PlayerBow>();
            if (bow == null)
            {
                return Fail(true, "Die Spielfigur hat keinen PlayerBow.");
            }

            if (!bow.TryEnterStance(out string reason))
            {
                return Fail(true, "Fernkampf-Haltung: " + reason);
            }

            Transform inHand = player.transform.Find("ShieldHand/Jagdbogen");
            Transform onBack = CharacterModels.Find(player.transform, "Jagdbogen_Ruecken");
            Transform shield = player.transform.Find("ShieldHand/Holzschild");
            Note("Fernkampf-Haltung (F): Bogen angelegt " + bow.HasBow + " (aus der Tasche), in der Hand " + (inHand != null && inHand.gameObject.activeInHierarchy) +
                 ", auf dem Rücken " + (onBack != null && onBack.gameObject.activeInHierarchy) + ", Schild ausgeblendet " +
                 (shield == null || !shield.gameObject.activeInHierarchy) + ", Pfeile " + bow.Arrows + ".");
            return bow.HasBow || Fail(true, "Der Bogen wurde nicht angelegt.");
        }

        /// <summary>Shoots a fully drawn arrow at the wolf; with <paramref name="forPicture"/> it draws longer and returns mid-draw.</summary>
        private static Func<bool> ShootWolf(bool forPicture = false)
        {
            int phase = 0;
            int arrowsBefore = 0;
            float staminaBefore = 0f;
            int shotsBefore = 0;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                PlayerBow bow = player.GetComponent<PlayerBow>();
                Combatant wolf = _wolf != null ? _wolf.GetComponent<Combatant>() : null;
                if (wolf == null || !wolf.IsAlive)
                {
                    Note("Der Wolf lebt nicht mehr – kein weiterer Schuss.");
                    return true;
                }

                CharacterStatsComponent stats = player.GetComponent<CharacterStatsComponent>();
                switch (phase)
                {
                    case 0:
                        arrowsBefore = bow.Arrows;
                        staminaBefore = stats.Stamina.Current;
                        shotsBefore = bow.ShotsFired;
                        PointCamera(wolf.TargetPosition);
                        if (!bow.ShootAt(wolf.TargetPosition, forPicture ? 1.4f : BowDraw.FullDrawSeconds, out string reason))
                        {
                            return Fail(true, "Schuss nicht möglich: " + reason);
                        }

                        phase = 1;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        if (forPicture)
                        {
                            // Aim camera blended in (0.25 s), string drawn about three quarters.
                            if (Elapsed >= 0.6)
                            {
                                Note("Zielen fürs Bild: Ziel-Kamera " + bow.IsAiming + ", Spannen " + bow.Draw01.ToString("0.00") + ".");
                                return true;
                            }

                            return false;
                        }

                        if (bow.ShotsFired <= shotsBefore)
                        {
                            return Fail(Elapsed > 3.0, "Der Bogen schießt nicht (Spannen " + bow.Draw01.ToString("0.00") + ").");
                        }

                        Projectile arrow = bow.LastArrow;
                        if (arrow != null && arrow.IsFlying && Elapsed < 3.0)
                        {
                            return false;
                        }

                        Combatant hit = arrow != null ? arrow.LastHit : null;
                        Note("Pfeil (voll gespannt, " + bow.LastShot.Speed.ToString("0") + " m/s, Schaden ×" + bow.LastShot.DamageMultiplier.ToString("0.00") + "): " +
                             (hit != null ? "Treffer auf " + hit.CombatantId + " (LP " + (hit.IsAlive ? hit.Health.Current : 0f).ToString("0") + "/" + hit.Health.Max.ToString("0") + ")" : "kein Treffer") +
                             ", Pfeile " + arrowsBefore + " → " + bow.Arrows + ", Ausdauer " + staminaBefore.ToString("0") + " → " + stats.Stamina.Current.ToString("0") + ".");
                        if (bow.Arrows != arrowsBefore - 1)
                        {
                            return Fail(true, "Der Schuss hat keinen Pfeil verbraucht.");
                        }

                        return hit != null || Fail(true, "Der Pfeil hat den Wolf verfehlt.");
                    default:
                        return true;
                }
            };
        }

        private static bool LeaveBowStance()
        {
            PlayerMotor player = FindPlayer();
            PlayerBow bow = player.GetComponent<PlayerBow>();
            bow.LeaveStance();
            Transform onBack = CharacterModels.Find(player.transform, "Jagdbogen_Ruecken");
            Transform mace = player.transform.Find("SwordHand/Streitkolben");
            Note("Haltung verlassen: Bogen auf dem Rücken " + (onBack != null && onBack.gameObject.activeInHierarchy) + ", Streitkolben wieder in der Hand " +
                 (mace != null && mace.gameObject.activeInHierarchy) + ".");
            return true;
        }

        /// <summary>
        /// Shoots the straw target <paramref name="objectId"/> with the bow (quest 2, s10 o2): stands 8 m in front of it, draws fully
        /// and shoots; tries the other side if something is in the way.
        /// </summary>
        private static Func<bool> ShootStrawTarget(string objectId)
        {
            int phase = 0;
            int attempt = 0;
            int hitsBefore = 0;
            int shotsBefore = 0;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                PlayerBow bow = player.GetComponent<PlayerBow>();
                ArrowTarget target = Object.FindObjectsByType<ArrowTarget>(FindObjectsInactive.Exclude).FirstOrDefault(t => t.ObjectId == objectId);
                if (bow == null || target == null)
                {
                    return Fail(Elapsed > 5.0, bow == null ? "Die Spielfigur hat keinen PlayerBow." : "Strohziel " + objectId + " nicht gefunden.");
                }

                Combatant combatant = target.GetComponent<Combatant>();
                switch (phase)
                {
                    case 0:
                        Vector3 axis = target.transform.forward;
                        axis.y = 0f;
                        float side = Vector3.Dot(player.transform.position - target.transform.position, axis) >= 0f ? 1f : -1f;
                        if (attempt % 2 == 1)
                        {
                            side = -side;
                        }

                        PlaceOnGround(target.transform.position + axis.normalized * (side * 8f), -axis * side);
                        hitsBefore = target.HitCount;
                        phase = 1;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        if (Elapsed < 0.5)
                        {
                            return false;
                        }

                        shotsBefore = bow.ShotsFired;
                        PointCamera(combatant.TargetPosition);
                        if (!bow.ShootAt(combatant.TargetPosition, BowDraw.FullDrawSeconds, out string reason))
                        {
                            return Fail(true, "Schuss auf " + objectId + " nicht möglich: " + reason);
                        }

                        phase = 2;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    default:
                        Projectile arrow = bow.LastArrow;
                        bool flying = bow.ShotsFired <= shotsBefore || (arrow != null && arrow.IsFlying);
                        if (flying && Elapsed < 4.0)
                        {
                            return false;
                        }

                        if (target.HitCount > hitsBefore)
                        {
                            Note("Strohziel " + objectId + " getroffen (Versuch " + (attempt + 1) + ", noch " + bow.Arrows + " Pfeile).");
                            return true;
                        }

                        attempt++;
                        if (attempt >= MaxShotsPerTarget)
                        {
                            return Fail(true, "Strohziel " + objectId + " nach " + attempt + " Pfeilen nicht getroffen (zuletzt: " +
                                              (arrow != null && arrow.LastHit != null ? arrow.LastHit.CombatantId : "Wand/Boden") + ").");
                        }

                        phase = 0;
                        return false;
                }
            };
        }

        private static bool ReportArrowsAndLeaveStance()
        {
            PlayerBow bow = FindPlayer().GetComponent<PlayerBow>();
            Note("Strohziele erledigt: " + bow.ShotsFired + " Pfeile verschossen, " + bow.Arrows + " in der Tasche (30 von Hollmann, +10 Belohnung).");
            bow.LeaveStance();
            return true;
        }

        /// <summary>Turns the exploration camera (and with it the aim camera) towards a point, like the mouse would.</summary>
        private static void PointCamera(Vector3 point)
        {
            PlayerMotor player = FindPlayer();
            CinemachineOrbitalFollow orbit = Object.FindObjectsByType<CinemachineOrbitalFollow>(FindObjectsInactive.Include).FirstOrDefault();
            if (orbit == null || player == null)
            {
                return;
            }

            Vector3 to = point - player.transform.position;
            orbit.HorizontalAxis.Value = orbit.HorizontalAxis.ClampValue(Mathf.Atan2(to.x, to.z) * Mathf.Rad2Deg);
            orbit.VerticalAxis.Value = orbit.VerticalAxis.ClampValue(15f);
        }
    }
}
