using Aetherfall.Combat;
using Aetherfall.Events;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Element reactions of GDD 03 6.6: explosion damage with its level floor, the fire/blunt split, the attacks of barrel and keg.</summary>
    public sealed class ElementReactionsTests
    {
        [Test]
        public void ExplosionDamage_Is150PercentOfTheTrigger_AtLeastTheLevelFloor()
        {
            Assert.That(ElementReactions.ExplosionDamage(50f, 1), Is.EqualTo(75f).Within(0.001f));
            Assert.That(ElementReactions.ExplosionDamage(5f, 1), Is.EqualTo(20f).Within(0.001f), "L1 floor 20");
            Assert.That(ElementReactions.ExplosionDamage(0f, 10), Is.EqualTo(41.6f).Within(0.001f), "L10 floor 42 (GDD rounds)");
            Assert.That(ElementReactions.ExplosionDamage(0f, 40), Is.EqualTo(113.6f).Within(0.001f), "L40 floor 114");
            Assert.That(ElementReactions.ExplosionDamage(0f, 80), Is.EqualTo(209.6f).Within(0.001f), "L80 floor 210");
        }

        [Test]
        public void ExplosionPacket_Is60PercentFire_40PercentBlunt()
        {
            DamagePacket packet = ElementReactions.ExplosionPacket(100f);
            Assert.That(packet.Get(DamageType.Fire), Is.EqualTo(60f).Within(0.001f));
            Assert.That(packet.Get(DamageType.Blunt), Is.EqualTo(40f).Within(0.001f));
            Assert.That(packet.Total, Is.EqualTo(100f).Within(0.001f));
        }

        [Test]
        public void OilExplosion_CarriesBurning60_Stun30_AndIsAnExplosion()
        {
            AttackSpec attack = ElementReactions.CreateOilExplosion();
            Assert.That(attack.IsExplosion, Is.True);
            Assert.That(attack.Buildup.Get(StatusEffectId.Burning), Is.EqualTo(60f));
            Assert.That(attack.Buildup.Get(StatusEffectId.Stun), Is.EqualTo(30f));
            Assert.That(attack.KnockbackDistance, Is.EqualTo(2f));
            Assert.That(attack.Validate(), Is.Empty);

            AttackSpec keg = ElementReactions.CreateKegExplosion();
            Assert.That(keg.Buildup.Get(StatusEffectId.Burning), Is.EqualTo(20f));
            Assert.That(keg.KnockbackDistance, Is.EqualTo(3f));
            Assert.That(ElementReactions.KegRadius, Is.EqualTo(5f));
            Assert.That(ElementReactions.KegPoise, Is.EqualTo(100f));
        }

        [Test]
        public void AttackSpec_Clone_KeepsTheBuildup_AndPlusAddsBars()
        {
            AttackSpec attack = ElementReactions.CreateOilExplosion();
            AttackSpec copy = attack.Clone();
            Assert.That(copy.Buildup.Get(StatusEffectId.Burning), Is.EqualTo(60f));

            StatusBuildup sum = attack.Buildup.Plus(StatusBuildup.None.With(StatusEffectId.Burning, 10f).With(StatusEffectId.AetherCorruption, 5f));
            Assert.That(sum.Get(StatusEffectId.Burning), Is.EqualTo(70f));
            Assert.That(sum.Get(StatusEffectId.Stun), Is.EqualTo(30f));
            Assert.That(sum.Get(StatusEffectId.AetherCorruption), Is.EqualTo(5f));
        }
    }
}
