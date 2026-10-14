using Aetherfall.Combat;
using Aetherfall.Events;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// The Aether-Stoß (GDD 03 6.5): time line with wind-up, effect and recovery, cooldown, refusals (locked, busy, cooldown,
    /// mana), damage split half Aether and half blunt from max(weapon damage, spell power), attack data and the cone.
    /// </summary>
    [TestFixture]
    public sealed class AbilityTests
    {
        private static AbilitySpec AetherPush()
        {
            return new AbilitySpec { Id = "ability.aether.aether_stoss", DisplayName = "Aether-Stoß" };
        }

        [Test]
        public void Defaults_AreTheValuesOfGdd03()
        {
            AbilitySpec spec = AetherPush();

            Assert.That(spec.ManaCost, Is.EqualTo(15f));
            Assert.That(spec.CooldownSeconds, Is.EqualTo(8f));
            Assert.That(spec.Range, Is.EqualTo(6f));
            Assert.That(spec.HalfAngle, Is.EqualTo(45f));
            Assert.That(spec.KnockbackDistance, Is.EqualTo(3f));
            Assert.That(spec.PoiseDamage, Is.EqualTo(30f));
            Assert.That(spec.Validate(), Is.Empty);
        }

        [Test]
        public void Runner_WindupThenEffectThenRecovery_StartsTheCooldown()
        {
            var runner = new AbilityRunner(AetherPush());

            Assert.That(runner.TryStart(true, true, 50f, out AbilityRefusal refusal), Is.True, refusal.ToString());
            Assert.That(runner.Phase, Is.EqualTo(AbilityPhase.Windup));
            Assert.That(runner.Tick(0.2f), Is.False, "still winding up");
            Assert.That(runner.Tick(0.1f), Is.True, "effect at the end of the wind-up");
            Assert.That(runner.Phase, Is.EqualTo(AbilityPhase.Recovery));
            Assert.That(runner.CooldownRemaining, Is.EqualTo(8f));
            Assert.That(runner.Tick(0.4f), Is.False);
            Assert.That(runner.Phase, Is.EqualTo(AbilityPhase.Ready));
            Assert.That(runner.Cooldown01, Is.EqualTo(7.6f / 8f).Within(1e-4f));
        }

        [Test]
        public void Runner_RefusesWhileCoolingDown_ThenAllowsAgain()
        {
            var runner = new AbilityRunner(AetherPush());
            runner.TryStart(true, true, 50f, out _);
            runner.Tick(0.25f);
            runner.Tick(0.35f);

            Assert.That(runner.TryStart(true, true, 50f, out AbilityRefusal refusal), Is.False);
            Assert.That(refusal, Is.EqualTo(AbilityRefusal.Cooldown));

            runner.Tick(8f);

            Assert.That(runner.TryStart(true, true, 50f, out refusal), Is.True, refusal.ToString());
        }

        [TestCase(false, true, 50f, AbilityRefusal.Locked)]
        [TestCase(true, false, 50f, AbilityRefusal.Busy)]
        [TestCase(true, true, 14.9f, AbilityRefusal.NotEnoughMana)]
        [TestCase(true, true, 15f, AbilityRefusal.None)]
        public void Runner_Check_GivesTheReason(bool unlocked, bool idle, float mana, AbilityRefusal expected)
        {
            Assert.That(new AbilityRunner(AetherPush()).Check(unlocked, idle, mana), Is.EqualTo(expected));
        }

        [Test]
        public void Runner_CancelInTheWindup_HasNoEffectAndNoCooldown()
        {
            var runner = new AbilityRunner(AetherPush());
            runner.TryStart(true, true, 50f, out _);

            runner.Cancel();

            Assert.That(runner.Tick(1f), Is.False);
            Assert.That(runner.Phase, Is.EqualTo(AbilityPhase.Ready));
            Assert.That(runner.CooldownRemaining, Is.EqualTo(0f));
        }

        [Test]
        public void BaseDamage_IsHalfAetherHalfBlunt_FromTheLargerReference()
        {
            AbilitySpec spec = AetherPush();

            DamagePacket weapon = spec.BaseDamage(50f, 12f);
            DamagePacket magic = spec.BaseDamage(20f, 80f);

            Assert.That(weapon.Get(DamageType.Aether), Is.EqualTo(25f));
            Assert.That(weapon.Get(DamageType.Blunt), Is.EqualTo(25f));
            Assert.That(magic.Total, Is.EqualTo(80f));
            Assert.That(weapon.Get(DamageType.Slash), Is.EqualTo(0f));
        }

        [Test]
        public void Attack_CarriesMultiplierAndKnockback_AndCannotBeParried()
        {
            AttackSpec attack = AetherPush().CreateAttack();

            Assert.That(attack.DamageMultiplier, Is.EqualTo(1.2f));
            Assert.That(attack.KnockbackDistance, Is.EqualTo(3f));
            Assert.That(attack.Unparryable, Is.True);
            Assert.That(attack.StaminaCost, Is.EqualTo(0f));
            Assert.That(attack.Validate(), Is.Empty);
        }

        [TestCase(3f, 0f, true)]
        [TestCase(6.4f, 10f, true)]
        [TestCase(6.6f, 0f, false)]
        [TestCase(3f, 44f, true)]
        [TestCase(3f, 50f, false)]
        [TestCase(0.4f, 170f, true)]
        [TestCase(2f, -120f, false)]
        public void Cone_CountsBodiesInsideRangeAndAngle(float distance, float bearing, bool expected)
        {
            Assert.That(CombatantQueries.IsInCone(distance, bearing, 6f, 45f), Is.EqualTo(expected));
        }

        [Test]
        public void Validate_RejectsWrongIdsAndRanges()
        {
            Assert.That(new AbilitySpec { Id = "skill.aether" }.Validate(), Does.Contain("ability."));
            Assert.That(new AbilitySpec { Id = "ability.x", Range = 0f }.Validate(), Does.Contain("range"));
        }
    }
}
