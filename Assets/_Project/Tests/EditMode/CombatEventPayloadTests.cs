using System.Runtime.InteropServices;
using Aetherfall.Events;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Payload of the new combat events (architecture 4.3, #10 DamageDealt, #12 EnemyKilled) and of PlayerDied, plus the
    /// stable values of the enums moved to the events assembly.
    /// </summary>
    [TestFixture]
    public sealed class CombatEventPayloadTests
    {
        [Test]
        public void DamageDealt_KeepsPayload()
        {
            var evt = new DamageDealt("player", "wolf_1", 37, DamageType.Slash, true, HitZone.WeakPoint);

            Assert.That(evt.AttackerId, Is.EqualTo("player"));
            Assert.That(evt.TargetId, Is.EqualTo("wolf_1"));
            Assert.That(evt.Amount, Is.EqualTo(37));
            Assert.That(evt.DamageType, Is.EqualTo(DamageType.Slash));
            Assert.That(evt.IsCritical, Is.True);
            Assert.That(evt.Zone, Is.EqualTo(HitZone.WeakPoint));
            Assert.That(evt.ToString(), Does.Contain("wolf_1").And.Contain("crit"));
        }

        [Test]
        public void DamageDealt_NullIdsBecomeEmpty()
        {
            var evt = new DamageDealt(null, null, 1, DamageType.Blunt, false, HitZone.Body);

            Assert.That(evt.AttackerId, Is.Empty);
            Assert.That(evt.TargetId, Is.Empty);
        }

        [Test]
        public void EnemyKilled_KeepsPayload()
        {
            Vector3 position = default;
            position.x = 4f;
            position.y = 0.5f;
            position.z = -7f;

            var evt = new EnemyKilled("enemy.wolf.grauwolf", "normal", "wolf_1", "player", string.Empty, null, 8, position);

            Assert.That(evt.EnemyTypeId, Is.EqualTo("enemy.wolf.grauwolf"));
            Assert.That(evt.VariantId, Is.EqualTo("normal"));
            Assert.That(evt.UniqueId, Is.EqualTo("wolf_1"));
            Assert.That(evt.KillerId, Is.EqualTo("player"));
            Assert.That(evt.RegionId, Is.Empty);
            Assert.That(evt.LootTableId, Is.Empty, "Loot tables come later; never null.");
            Assert.That(evt.EnemyLevel, Is.EqualTo(8));
            Assert.That(evt.Position.x, Is.EqualTo(4f));
            Assert.That(evt.Position.z, Is.EqualTo(-7f));
        }

        [Test]
        public void EnemyKilled_IsExactly64Bytes()
        {
            Assert.That(Marshal.SizeOf(typeof(EnemyKilled)), Is.EqualTo(64));
        }

        [Test]
        public void PlayerDied_KeepsPayload()
        {
            Vector3 position = default;
            position.x = 1f;
            position.y = 2f;
            position.z = 3f;

            var evt = new PlayerDied(position, "enemy.wolf.grauwolf", null);

            Assert.That(evt.Position.y, Is.EqualTo(2f));
            Assert.That(evt.KillerTypeId, Is.EqualTo("enemy.wolf.grauwolf"));
            Assert.That(evt.RegionId, Is.Empty);
        }

        [Test]
        public void HitZone_HasStableValues()
        {
            Assert.That((int)HitZone.Body, Is.EqualTo(0));
            Assert.That((int)HitZone.Limb, Is.EqualTo(1));
            Assert.That((int)HitZone.Head, Is.EqualTo(2));
            Assert.That((int)HitZone.WeakPoint, Is.EqualTo(3));
        }
    }
}
