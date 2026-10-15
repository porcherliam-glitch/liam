using Aetherfall.Combat;
using Aetherfall.Events;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// The spells of the mage and the ability bar (GDD 03 6.3, 6.4, 11.8): kinds and their checks, element damage from the spell
    /// power, status build-up, projectiles (pierce, explosion), the chain falloff, mana costs by level, the 2 × 4 bar with its
    /// switch lock and the timed self-buffs.
    /// </summary>
    [TestFixture]
    public sealed class SpellTests
    {
        private static AbilitySpec Fireball()
        {
            return new AbilitySpec
            {
                Id = "ability.feuer.feuerball", DisplayName = "Feuerball", Kind = AbilityKind.Projectile, Element = DamageType.Fire, ElementShare = 1f,
                ScalesWithWeapon = false, DamageMultiplier = 1.6f, BuildupEffect = StatusEffectId.Burning, Buildup = 30f, ProjectileSpeed = 24f,
                ExplosionRadius = 2f, ExplosionShare = 0.7f, Corruption = 0f, Range = 30f
            };
        }

        [Test]
        public void Spell_DamageIsAllElement_FromTheSpellPowerAlone()
        {
            DamagePacket damage = Fireball().BaseDamage(60f, 20f);

            Assert.That(damage.Get(DamageType.Fire), Is.EqualTo(20f));
            Assert.That(damage.Get(DamageType.Blunt), Is.EqualTo(0f));
            Assert.That(damage.Total, Is.EqualTo(20f), "weapon damage does not count for spells");
        }

        [Test]
        public void Split_UsesTheElementShare()
        {
            var spec = new AbilitySpec { Id = "ability.x", Element = DamageType.Ice, ElementShare = 0.75f };

            DamagePacket damage = spec.Split(40f);

            Assert.That(damage.Get(DamageType.Ice), Is.EqualTo(30f));
            Assert.That(damage.Get(DamageType.Blunt), Is.EqualTo(10f));
        }

        [Test]
        public void ProjectileAttack_CarriesFlightValuesElementAndBuildup()
        {
            AbilitySpec spec = Fireball();
            spec.MaxTargets = 2;

            AttackSpec attack = spec.CreateAttack();

            Assert.That(attack.IsProjectile, Is.True);
            Assert.That(attack.ProjectileSpeed, Is.EqualTo(24f));
            Assert.That(attack.ProjectileRange, Is.EqualTo(30f));
            Assert.That(attack.ProjectileGravity, Is.EqualTo(0f));
            Assert.That(attack.ProjectileMaxTargets, Is.EqualTo(2));
            Assert.That(attack.DamageType, Is.EqualTo(DamageType.Fire));
            Assert.That(attack.OverrideDamageType, Is.True);
            Assert.That(attack.Buildup.Get(StatusEffectId.Burning), Is.EqualTo(30f));
            Assert.That(attack.Unparryable, Is.True);
        }

        [Test]
        public void Explosion_IsAnExplosionWithItsShareOfTheDamage_AndNoProjectile()
        {
            AttackSpec explosion = Fireball().CreateExplosionAttack();

            Assert.That(explosion, Is.Not.Null);
            Assert.That(explosion.IsExplosion, Is.True);
            Assert.That(explosion.IsProjectile, Is.False);
            Assert.That(explosion.DamageMultiplier, Is.EqualTo(1.6f * 0.7f).Within(1e-4f));
            Assert.That(explosion.Buildup.Get(StatusEffectId.Burning), Is.EqualTo(30f));
            Assert.That(new AbilitySpec { Id = "ability.x" }.CreateExplosionAttack(), Is.Null, "a cone has no explosion");
        }

        [Test]
        public void GroundArea_TicksAsLightHitsWithoutStaminaDamage()
        {
            var spec = new AbilitySpec { Id = "ability.feuer.flammenteppich", Kind = AbilityKind.GroundArea, Element = DamageType.Fire };

            AttackSpec attack = spec.CreateAttack();

            Assert.That(attack.Kind, Is.EqualTo(AttackKind.Light));
            Assert.That(attack.StaminaDamage, Is.EqualTo(0f));
            Assert.That(attack.IsProjectile, Is.False);
        }

        [TestCase(1, 15f)]
        [TestCase(8, 17.1f)]
        [TestCase(0, 15f)]
        public void ManaCost_GrowsTwoPercentPerLevel(int level, float expected)
        {
            Assert.That(new AbilitySpec { Id = "ability.x", ManaCost = 15f }.ManaCostAt(level), Is.EqualTo(expected).Within(1e-4f));
        }

        [Test]
        public void Runner_CostFactor_RaisesTheManaNeeded()
        {
            var runner = new AbilityRunner(new AbilitySpec { Id = "ability.x", ManaCost = 15f }) { CostFactor = 1.14f };

            Assert.That(runner.ManaCost, Is.EqualTo(17.1f).Within(1e-4f));
            Assert.That(runner.Check(true, true, 17f), Is.EqualTo(AbilityRefusal.NotEnoughMana));
            Assert.That(runner.Check(true, true, 17.2f), Is.EqualTo(AbilityRefusal.None));
        }

        [Test]
        public void Validate_ChecksTheValuesOfTheKind()
        {
            Assert.That(Fireball().Validate(), Is.Empty);
            Assert.That(new AbilitySpec { Id = "ability.x", Kind = AbilityKind.Projectile, MaxTargets = 0 }.Validate(), Does.Contain("projectile"));
            Assert.That(new AbilitySpec { Id = "ability.x", Kind = AbilityKind.Chain, ChainFalloff = 1f }.Validate(), Does.Contain("chain"));
            Assert.That(new AbilitySpec { Id = "ability.x", Kind = AbilityKind.GroundArea, AreaSeconds = 0f }.Validate(), Does.Contain("area"));
            Assert.That(new AbilitySpec { Id = "ability.x", Kind = AbilityKind.Strikes, StrikeCount = 0 }.Validate(), Does.Contain("strike"));
            Assert.That(new AbilitySpec { Id = "ability.x", Kind = AbilityKind.SelfBuff }.Validate(), Does.Contain("buff"));
            Assert.That(new AbilitySpec { Id = "ability.x", Kind = AbilityKind.SelfBuff, BuffKind = AbilityBuffKind.IceArmor }.Validate(), Is.Empty);
            Assert.That(new AbilitySpec { Id = "ability.x", Kind = AbilityKind.Cone, ConeAngle = 360f }.Validate(), Is.Empty, "Frostnova: all around");
        }

        [Test]
        public void ChainTargets_NeedATarget_OthersDoNot()
        {
            Assert.That(new AbilitySpec { Id = "ability.x", Kind = AbilityKind.Chain }.NeedsTarget, Is.True);
            Assert.That(Fireball().NeedsTarget, Is.False);
        }

        [TestCase(0, 1f)]
        [TestCase(1, 0.8f)]
        [TestCase(2, 0.64f)]
        public void ChainFactor_LosesTwentyPercentPerJump(int jump, float expected)
        {
            Assert.That(AbilityMath.ChainFactor(jump, 0.2f), Is.EqualTo(expected).Within(1e-4f));
        }

        [Test]
        public void NextChainTarget_IsTheNearestUnusedWithinRange()
        {
            float[] xs = { 0f, 3f, 5f, 20f };
            float[] zs = { 0f, 0f, 1f, 0f };
            bool[] used = { true, false, false, false };

            Assert.That(AbilityMath.NextChainTarget(0f, 0f, xs, zs, used, 4, 6f), Is.EqualTo(1));
            used[1] = true;
            Assert.That(AbilityMath.NextChainTarget(3f, 0f, xs, zs, used, 4, 6f), Is.EqualTo(2));
            used[2] = true;
            Assert.That(AbilityMath.NextChainTarget(5f, 1f, xs, zs, used, 4, 6f), Is.EqualTo(-1), "20 m is too far for a jump");
        }

        [Test]
        public void StrikeOffsets_StartInTheCentre_AndStayInside()
        {
            AbilityMath.StrikeOffset(0, 6f, out float x0, out float z0);
            Assert.That(x0, Is.EqualTo(0f));
            Assert.That(z0, Is.EqualTo(0f));
            for (int i = 1; i < 6; i++)
            {
                AbilityMath.StrikeOffset(i, 6f, out float x, out float z);
                float distance = (float)System.Math.Sqrt(x * x + z * z);
                Assert.That(distance, Is.GreaterThan(0.5f).And.LessThanOrEqualTo(6f * 0.7f + 1e-4f));
            }
        }

        [Test]
        public void Bar_PlacesNewAbilities_BarOneFirst_AetherPushOnSlotFour()
        {
            var bar = new AbilityBar();

            Assert.That(bar.Place("ability.feuer.feuerball"), Is.EqualTo(0));
            Assert.That(bar.Place("ability.aether.aether_stoss", 3), Is.EqualTo(3));
            Assert.That(bar.Place("ability.eis.eislanze"), Is.EqualTo(1));
            Assert.That(bar.Place("ability.blitz.kettenblitz"), Is.EqualTo(2));
            Assert.That(bar.Place("ability.feuer.flammenteppich"), Is.EqualTo(4), "then bar 2");
            Assert.That(bar.Place("ability.feuer.feuerball"), Is.EqualTo(0), "already placed: stays");
            Assert.That(bar.GetActive(3), Is.EqualTo("ability.aether.aether_stoss"));
        }

        [Test]
        public void Bar_KeepsSlotFourOfBarOneForTheAetherPush()
        {
            var bar = new AbilityBar();
            for (int i = 0; i < AbilityBar.SlotCount - 1; i++)
            {
                Assert.That(bar.Place("ability.x" + i), Is.Not.EqualTo(3));
            }

            Assert.That(bar.Place("ability.zu_viel"), Is.EqualTo(-1), "without a wish, slot 4 of bar 1 stays free");
            Assert.That(bar.Get(3), Is.Empty);
            Assert.That(bar.Place("ability.aether.aether_stoss", 3), Is.EqualTo(3));
        }

        [Test]
        public void Bar_Assign_KeepsEachAbilityOnce_AndSwaps()
        {
            var bar = new AbilityBar();
            bar.Assign(0, "a");
            bar.Assign(5, "b");

            bar.Assign(5, "a");

            Assert.That(bar.Get(5), Is.EqualTo("a"));
            Assert.That(bar.Get(0), Is.EqualTo("b"), "the ability that was in slot 6 moves to the old slot");
            Assert.That(bar.IndexOf("a"), Is.EqualTo(5));
            Assert.That(bar.Remove("b"), Is.True);
            Assert.That(bar.Get(0), Is.Empty);
        }

        [Test]
        public void Bar_Switch_ShowsTheOtherBar_AtMostEveryHalfSecond()
        {
            var bar = new AbilityBar();
            bar.Assign(4, "zweite");

            Assert.That(bar.TrySwitch(), Is.True);
            Assert.That(bar.ActiveBar, Is.EqualTo(1));
            Assert.That(bar.GetActive(0), Is.EqualTo("zweite"));
            Assert.That(bar.TrySwitch(), Is.False, "0.5 s lock");
            bar.Tick(0.3f);
            Assert.That(bar.TrySwitch(), Is.False);
            bar.Tick(0.25f);
            Assert.That(bar.TrySwitch(), Is.True);
            Assert.That(bar.ActiveBar, Is.EqualTo(0));
        }

        [Test]
        public void Bar_LoadRoundTrip_DropsDuplicates()
        {
            var bar = new AbilityBar();
            bar.Load(new[] { "a", "b", "a", null, "c" }, 1);

            Assert.That(bar.ActiveBar, Is.EqualTo(1));
            Assert.That(bar.Get(0), Is.EqualTo("a"));
            Assert.That(bar.Get(2), Is.Empty, "duplicate");
            Assert.That(bar.Get(3), Is.Empty);
            Assert.That(bar.Get(4), Is.EqualTo("c"));
            var copy = new AbilityBar();
            copy.Load(bar.ToArray(), bar.ActiveBar);
            Assert.That(copy.ToArray(), Is.EqualTo(bar.ToArray()));
        }

        [Test]
        public void Buffs_RunOut_AndRaiseStartAndEndOnce()
        {
            var buffs = new AbilityBuffs();
            int started = 0;
            int ended = 0;
            buffs.Started += kind => started++;
            buffs.Ended += kind => ended++;

            buffs.Start(AbilityBuffKind.IceArmor, 12f, 0.3f, 10f);
            buffs.Start(AbilityBuffKind.IceArmor, 12f, 0.3f, 10f);
            buffs.Tick(11f);

            Assert.That(started, Is.EqualTo(1), "refreshing does not start again");
            Assert.That(buffs.IsActive(AbilityBuffKind.IceArmor), Is.True);
            Assert.That(buffs.Value(AbilityBuffKind.IceArmor), Is.EqualTo(0.3f));
            Assert.That(buffs.Buildup(AbilityBuffKind.IceArmor), Is.EqualTo(10f));
            buffs.Tick(1.5f);
            Assert.That(buffs.IsActive(AbilityBuffKind.IceArmor), Is.False);
            Assert.That(buffs.Value(AbilityBuffKind.IceArmor), Is.EqualTo(0f));
            Assert.That(ended, Is.EqualTo(1));
        }

        [Test]
        public void Buffs_Clear_EndsEverythingRunning()
        {
            var buffs = new AbilityBuffs();
            int ended = 0;
            buffs.Ended += kind => ended++;
            buffs.Start(AbilityBuffKind.FireMantle, 10f, 0.2f, 10f);
            buffs.Start(AbilityBuffKind.StormStep, 8f, 0.2f, 0f);
            buffs.Start(AbilityBuffKind.None, 8f, 0.2f, 0f);

            buffs.Clear();

            Assert.That(ended, Is.EqualTo(2));
            Assert.That(buffs.IsActive(AbilityBuffKind.FireMantle), Is.False);
        }
    }
}
