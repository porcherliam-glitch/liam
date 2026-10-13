using Aetherfall.Combat;
using Aetherfall.Stats;
using Aetherfall.Tests.Shared;
using Aetherfall.Utilities;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// <see cref="DamageCalculator"/>: the number example of GDD 03 8.3 and the test cases 1–23 of 8.4
    /// (case 21, E(x), is in <see cref="StatFormulasTests"/>).
    /// </summary>
    [TestFixture]
    public sealed class DamageCalculatorTests
    {
        private const float NoCrit = 0.99f;
        private const float Crit = 0.0f;

        private DamageCalculator _calculator;

        [SetUp]
        public void SetUp()
        {
            _calculator = new DamageCalculator();
        }

        // ---------------------------------------------------------------- GDD 03 8.3 example

        /// <summary>Level 10 warrior: strength 20, dexterity 10, constitution 18; +15 % bonus (Kampfgeist + Schleifstein).</summary>
        private static AttackerSnapshot Warrior()
        {
            return new AttackerSnapshot
            {
                Level = 10f,
                Attributes = new AttributeSet(20f, 10f, 8f, 10f, 18f, 10f),
                CritChance = 0.05f,
                CritDamage = 1.5f,
                DamageBonus = 0.15f
            };
        }

        /// <summary>Grey wolf level 8, normal: armor 28, slash resistance 0, fire −0.5.</summary>
        private static DefenderSnapshot GreyWolf()
        {
            DefenderSnapshot wolf = DefenderSnapshot.Create(8f, 28f);
            wolf.Resistances = default(ResistanceProfile).With(DamageType.Fire, -0.5f);
            return wolf;
        }

        /// <summary>"Eisernes Langschwert": 50 slash, one-handed sword scaling.</summary>
        private static DamageRequest LongswordHit(float attackMultiplier)
        {
            DamageRequest request = DamageRequest.Create(Warrior(), GreyWolf(), DamagePacket.Single(DamageType.Slash, 50f));
            request.AttackMultiplier = attackMultiplier;
            request.Scaling = AttributeScaling.OneHandedSword;
            request.Zone = HitZone.Body;
            return request;
        }

        [Test]
        public void Case1_HeavyCriticalHit_OnGreyWolf_Is123()
        {
            DamageResult result = _calculator.Calculate(LongswordHit(1.5f), new SequenceRandom(Crit));

            Assert.That(result.Damage, Is.EqualTo(123));
            Assert.That(result.RawDamage, Is.EqualTo(123.21f).Within(0.01f));
            Assert.That(result.Has(HitFlags.Critical), Is.True);
        }

        [Test]
        public void Case2_SameHitWithoutCritical_Is82()
        {
            DamageResult result = _calculator.Calculate(LongswordHit(1.5f), new SequenceRandom(NoCrit));

            Assert.That(result.Damage, Is.EqualTo(82));
            Assert.That(result.Has(HitFlags.Critical), Is.False);
        }

        [Test]
        public void Case3_LightHitWithoutCritical_Is55()
        {
            DamageResult result = _calculator.Calculate(LongswordHit(1f), new SequenceRandom(NoCrit));

            Assert.That(result.Damage, Is.EqualTo(55));
        }

        [Test]
        public void Example_GreyWolfBitesTheWarrior_Is25()
        {
            // GDD 03 8.3 "Gegenrichtung": bite 46 stab, wolf level 8 against the warrior (armor 60, level 10).
            DamageRequest bite = DamageRequest.Create(AttackerSnapshot.ForEnemy(8f), DefenderSnapshot.Create(10f, 60f, isPlayerSide: true),
                DamagePacket.Single(DamageType.Stab, 46f));

            DamageResult result = _calculator.Calculate(bite, new SequenceRandom(NoCrit));

            Assert.That(result.Damage, Is.EqualTo(25));
        }

        // ---------------------------------------------------------------- helpers for the plain cases

        /// <summary>Level 10 against level 10, no scaling, no bonus, no critical roll: the base value passes unchanged.</summary>
        private static DamageRequest Plain(DamagePacket packet, float armor = 0f, bool playerDefender = false)
        {
            var attacker = new AttackerSnapshot { Level = 10f, Attributes = AttributeSet.Neutral, CritDamage = 1.5f };
            DamageRequest request = DamageRequest.Create(attacker, DefenderSnapshot.Create(10f, armor, playerDefender), packet);
            request.SuppressCritical = true;
            return request;
        }

        private int Damage(in DamageRequest request)
        {
            return _calculator.Calculate(request, new SequenceRandom(NoCrit)).Damage;
        }

        [Test]
        public void Case4_ArmorZero_NoReduction()
        {
            Assert.That(_calculator.ArmorReduction(0f, 0f, false, 10f), Is.EqualTo(0f));
            Assert.That(Damage(Plain(DamagePacket.Single(DamageType.Slash, 100f))), Is.EqualTo(100));
        }

        [Test]
        public void Case5_Armor100AgainstLevel10_HalvesTheDamage()
        {
            Assert.That(_calculator.ArmorReduction(100f, 0f, false, 10f), Is.EqualTo(0.5f).Within(1e-6f));
            Assert.That(Damage(Plain(DamagePacket.Single(DamageType.Slash, 100f), armor: 100f)), Is.EqualTo(50));
        }

        [Test]
        public void Case6_ArmorTowardsInfinity_IsCappedAt85Percent()
        {
            Assert.That(_calculator.ArmorReduction(1e9f, 0f, false, 10f), Is.EqualTo(0.85f).Within(1e-6f));
            Assert.That(_calculator.ArmorReduction(float.PositiveInfinity, 0f, false, 10f), Is.EqualTo(0.85f));
            Assert.That(Damage(Plain(DamagePacket.Single(DamageType.Slash, 100f), armor: 1e9f)), Is.EqualTo(15));
        }

        [Test]
        public void Case7_ArmorDoesNotReduceElementalDamage()
        {
            Assert.That(Damage(Plain(DamagePacket.Single(DamageType.Fire, 100f), armor: 500f)), Is.EqualTo(100));
        }

        [Test]
        public void Case8_MixedPacket_ArmorReducesOnlyThePhysicalShare()
        {
            DamagePacket packet = DamagePacket.Single(DamageType.Slash, 50f).With(DamageType.Fire, 20f);

            Assert.That(Damage(Plain(packet, armor: 100f)), Is.EqualTo(45), "50 × 0.5 + 20");
        }

        [Test]
        public void Case9_WeaknessAndImmunity()
        {
            DamageRequest weak = Plain(DamagePacket.Single(DamageType.Fire, 100f));
            DefenderSnapshot defender = weak.Defender;
            defender.Resistances = default(ResistanceProfile).With(DamageType.Fire, -0.5f);
            weak.Defender = defender;
            DamageResult weakResult = _calculator.Calculate(weak, new SequenceRandom(NoCrit));
            Assert.That(weakResult.Damage, Is.EqualTo(150));
            Assert.That(weakResult.Has(HitFlags.Weakness), Is.True);

            DamageRequest immune = Plain(DamagePacket.Single(DamageType.Poison, 100f));
            DefenderSnapshot undead = immune.Defender;
            undead.Resistances = default(ResistanceProfile).WithImmunity(DamageType.Poison);
            immune.Defender = undead;
            DamageResult immuneResult = _calculator.Calculate(immune, new SequenceRandom(NoCrit));
            Assert.That(immuneResult.Damage, Is.EqualTo(0), "immune: no minimum damage");
            Assert.That(immuneResult.Has(HitFlags.Immune), Is.True);
        }

        [Test]
        public void Case10_PlayerResistanceIsClampedTo75Percent_EnemiesTo90()
        {
            DamageRequest player = Plain(DamagePacket.Single(DamageType.Ice, 100f), playerDefender: true);
            DefenderSnapshot p = player.Defender;
            p.Resistances = default(ResistanceProfile).With(DamageType.Ice, 0.9f);
            player.Defender = p;

            DamageRequest enemy = player;
            DefenderSnapshot e = enemy.Defender;
            e.IsPlayerSide = false;
            enemy.Defender = e;

            Assert.That(Damage(player), Is.EqualTo(25), "0.9 clamped to 0.75");
            Assert.That(Damage(enemy), Is.EqualTo(10), "enemies keep 0.9");
        }

        [Test]
        public void Case11_CriticalBoundary_RollBelowChanceIsCritical()
        {
            var attacker = new AttackerSnapshot { Level = 10f, Attributes = AttributeSet.Neutral, CritChance = 0.05f, CritDamage = 1.5f };
            DamageRequest request = DamageRequest.Create(attacker, DefenderSnapshot.Create(10f, 0f), DamagePacket.Single(DamageType.Slash, 100f));

            DamageResult critical = _calculator.Calculate(request, new SequenceRandom(0.049f));
            DamageResult normal = _calculator.Calculate(request, new SequenceRandom(0.050f));

            Assert.That(critical.Has(HitFlags.Critical), Is.True);
            Assert.That(critical.Damage, Is.EqualTo(150));
            Assert.That(normal.Has(HitFlags.Critical), Is.False);
            Assert.That(normal.Damage, Is.EqualTo(100));
        }

        [Test]
        public void Case12_MinimumDamageIsOne()
        {
            Assert.That(Damage(Plain(DamagePacket.Single(DamageType.Slash, 0.3f))), Is.EqualTo(1));
        }

        [Test]
        public void Case13_RoundsHalfAwayFromZero()
        {
            Assert.That(Damage(Plain(DamagePacket.Single(DamageType.Fire, 54.5f))), Is.EqualTo(55));
            Assert.That(Damage(Plain(DamagePacket.Single(DamageType.Fire, 54.49f))), Is.EqualTo(54));
        }

        [Test]
        public void Case14_LevelDifferenceFactorIsClamped()
        {
            Assert.That(_calculator.LevelFactor(30f, 10f), Is.EqualTo(1.15f).Within(1e-6f), "+20 levels");
            Assert.That(_calculator.LevelFactor(10f, 30f), Is.EqualTo(0.70f).Within(1e-6f), "−20 levels");
            Assert.That(_calculator.LevelFactor(10f, 8f), Is.EqualTo(1.06f).Within(1e-6f));

            DamageRequest strong = Plain(DamagePacket.Single(DamageType.Fire, 100f));
            AttackerSnapshot attacker = strong.Attacker;
            attacker.Level = 30f;
            strong.Attacker = attacker;
            Assert.That(Damage(strong), Is.EqualTo(115));
        }

        [Test]
        public void Case15_ArmorPenetration25Percent_LowersEffectiveArmorFrom100To75()
        {
            float reduction = _calculator.ArmorReduction(100f, 0.25f, false, 10f);

            Assert.That(reduction, Is.EqualTo(75f / 175f).Within(1e-6f));
        }

        [Test]
        public void Case16_BluntDamage_UsesEightyPercentOfTheArmor()
        {
            Assert.That(_calculator.ArmorReduction(100f, 0f, true, 10f), Is.EqualTo(80f / 180f).Within(1e-6f));
            Assert.That(Damage(Plain(DamagePacket.Single(DamageType.Blunt, 180f), armor: 100f)), Is.EqualTo(100), "180 × (1 − 80/180)");
        }

        [Test]
        public void Case17_HeadHit_Ranged175_Melee150()
        {
            DamageRequest melee = Plain(DamagePacket.Single(DamageType.Stab, 100f));
            melee.Zone = HitZone.Head;
            DamageRequest ranged = melee;
            ranged.IsRanged = true;

            DamageResult meleeResult = _calculator.Calculate(melee, new SequenceRandom(NoCrit));
            Assert.That(meleeResult.Damage, Is.EqualTo(150));
            Assert.That(meleeResult.Has(HitFlags.Head), Is.True);
            Assert.That(Damage(ranged), Is.EqualTo(175));

            DamageRequest weakPoint = melee;
            weakPoint.Zone = HitZone.WeakPoint;
            Assert.That(Damage(weakPoint), Is.EqualTo(200));
            DamageRequest limb = melee;
            limb.Zone = HitZone.Limb;
            Assert.That(Damage(limb), Is.EqualTo(90));
        }

        [Test]
        public void Case18_PerfectParry_NoDamageNoPoise()
        {
            DamageRequest request = LongswordHit(1.5f);
            request.WeaponPoise = 10f;
            request.Buildup = StatusBuildup.None.With(StatusEffectId.Bleeding, 12f);
            DefenderSnapshot defender = request.Defender;
            defender.Block = BlockState.PerfectParry;
            request.Defender = defender;
            var random = new SequenceRandom(Crit);

            DamageResult result = _calculator.Calculate(request, random);

            Assert.That(result.Damage, Is.EqualTo(0));
            Assert.That(result.Has(HitFlags.Parried), Is.True);
            Assert.That(result.PoiseDamage, Is.EqualTo(0f));
            Assert.That(result.Buildup.IsEmpty, Is.True);
            Assert.That(random.DrawCount, Is.EqualTo(0), "no critical roll for a parried hit");
        }

        [Test]
        public void Case19_WoodenShieldBlock_80PercentPhysical_20PercentElemental()
        {
            DamageRequest request = Plain(DamagePacket.Single(DamageType.Slash, 50f).With(DamageType.Fire, 50f));
            request.StaminaDamage = 30f;
            request.WeaponPoise = 10f;
            DefenderSnapshot defender = request.Defender;
            defender.Block = BlockState.Blocking;
            defender.BlockPhysicalReduction = 0.8f;
            defender.BlockElementalReduction = 0.2f;
            defender.BlockStability = 0.4f;
            request.Defender = defender;

            DamageResult result = _calculator.Calculate(request, new SequenceRandom(NoCrit));

            Assert.That(result.Damage, Is.EqualTo(50), "50 × 0.2 + 50 × 0.8");
            Assert.That(result.Has(HitFlags.Blocked), Is.True);
            Assert.That(result.PoiseDamage, Is.EqualTo(0f), "blocking prevents poise damage");
            Assert.That(result.BlockStaminaCost, Is.EqualTo(18f).Within(1e-4f), "bandit hit 30 against wooden shield (40 %) = 18 (GDD 03 4.7)");
        }

        [Test]
        public void Case20_DifficultyFactorAppliesOnlyWhenThePlayerIsHit()
        {
            DamageRequest onPlayer = Plain(DamagePacket.Single(DamageType.Slash, 100f), playerDefender: true);
            onPlayer.EnemyDamageFactor = 1.35f;
            DamageRequest onEnemy = Plain(DamagePacket.Single(DamageType.Slash, 100f));
            onEnemy.EnemyDamageFactor = 1.35f;

            Assert.That(Damage(onPlayer), Is.EqualTo(135));
            Assert.That(Damage(onEnemy), Is.EqualTo(100));
        }

        [Test]
        public void Case22_SameInputAndSeed_GiveTheSameResult1000Times()
        {
            DamageRequest request = LongswordHit(1f);
            AttackerSnapshot attacker = request.Attacker;
            attacker.CritChance = 0.4f;
            request.Attacker = attacker;
            DamageResult first = _calculator.Calculate(request, new Pcg32Random(2026UL));

            var a = new Pcg32Random(77UL);
            var b = new Pcg32Random(77UL);
            int criticals = 0;
            for (int i = 0; i < 1000; i++)
            {
                Assert.That(_calculator.Calculate(request, new Pcg32Random(2026UL)).Damage, Is.EqualTo(first.Damage));
                DamageResult ra = _calculator.Calculate(request, a);
                DamageResult rb = _calculator.Calculate(request, b);
                Assert.That(ra.Damage, Is.EqualTo(rb.Damage));
                Assert.That(ra.Flags, Is.EqualTo(rb.Flags));
                if (ra.Has(HitFlags.Critical))
                {
                    criticals++;
                }
            }

            Assert.That(criticals, Is.InRange(330, 470), "about 40 % critical hits");
        }

        [Test]
        public void Case23_PoiseDamage_GreyWolfBreaksAfterFourHitsWithFinisher()
        {
            // One-handed sword: poise value 10; light hit × 1.0 (slash 1.0); combo finisher is a stab × 1.5 (stab 0.9).
            DamageRequest light = LongswordHit(1f);
            light.WeaponPoise = 10f;
            DamageRequest finisher = DamageRequest.Create(Warrior(), GreyWolf(), DamagePacket.Single(DamageType.Stab, 50f));
            finisher.AttackMultiplier = 1.2f;
            finisher.WeaponPoise = 10f;
            finisher.PoiseMultiplier = 1.5f;

            float lightPoise = _calculator.Calculate(light, new SequenceRandom(NoCrit)).PoiseDamage;
            float finisherPoise = _calculator.Calculate(finisher, new SequenceRandom(NoCrit)).PoiseDamage;

            Assert.That(lightPoise, Is.EqualTo(10f).Within(1e-4f));
            Assert.That(finisherPoise, Is.EqualTo(13.5f).Within(1e-4f));
            float greyWolfPoise = 30f * (1f + 0.025f * (8f - 1f)); // GDD 03 4.9: 35
            Assert.That(greyWolfPoise, Is.EqualTo(35.25f).Within(1e-4f));
            Assert.That(3f * lightPoise + finisherPoise, Is.GreaterThanOrEqualTo(greyWolfPoise), "43.5 ≥ 35: the poise breaks");
            Assert.That(2f * lightPoise + finisherPoise, Is.LessThan(greyWolfPoise), "not after three hits");
        }

        [Test]
        public void StabAsPrimaryType_AddsFivePercentagePointsCriticalChance()
        {
            var attacker = new AttackerSnapshot { Level = 10f, Attributes = AttributeSet.Neutral, CritChance = 0.05f, CritDamage = 1.5f };
            DamageRequest stab = DamageRequest.Create(attacker, DefenderSnapshot.Create(10f, 0f), DamagePacket.Single(DamageType.Stab, 100f));
            DamageRequest slash = DamageRequest.Create(attacker, DefenderSnapshot.Create(10f, 0f), DamagePacket.Single(DamageType.Slash, 100f));

            Assert.That(_calculator.Calculate(stab, new SequenceRandom(0.08f)).Has(HitFlags.Critical), Is.True, "10 % for stab");
            Assert.That(_calculator.Calculate(slash, new SequenceRandom(0.08f)).Has(HitFlags.Critical), Is.False, "5 % for slash");
        }

        [Test]
        public void ForcedAndSuppressedCriticals()
        {
            DamageRequest sneak = Plain(DamagePacket.Single(DamageType.Stab, 100f));
            sneak.SuppressCritical = false;
            sneak.ForceCritical = true;
            Assert.That(_calculator.Calculate(sneak, new SequenceRandom(NoCrit)).Damage, Is.EqualTo(150), "guaranteed critical");

            var random = new SequenceRandom(Crit);
            DamageRequest counter = Plain(DamagePacket.Single(DamageType.Slash, 100f));
            Assert.That(_calculator.Calculate(counter, random).Has(HitFlags.Critical), Is.False);
            Assert.That(random.DrawCount, Is.EqualTo(0), "no roll for a counter");
        }

        [Test]
        public void DefenderMultipliers_LetAtLeastTenPercentThrough()
        {
            DamageRequest marked = Plain(DamagePacket.Single(DamageType.Slash, 100f));
            DefenderSnapshot defender = marked.Defender;
            defender.IncomingDamageMultiplier = 1.3f;
            marked.Defender = defender;
            Assert.That(Damage(marked), Is.EqualTo(130), "marked +0.3");

            defender.IncomingDamageMultiplier = 0.4f * 0.5f * 0.2f; // stacked reductions far below 10 %
            marked.Defender = defender;
            Assert.That(Damage(marked), Is.EqualTo(10), "at least 10 % (GDD 03 10.5)");
        }

        [Test]
        public void EmptyPacket_DealsNoDamage()
        {
            Assert.That(Damage(Plain(default(DamagePacket))), Is.EqualTo(0));
        }

        [Test]
        public void StatusBuildup_IsPassedThrough_AndScaledWhenThePlayerIsHit()
        {
            DamageRequest arrow = Plain(DamagePacket.Single(DamageType.Fire, 30f));
            arrow.Buildup = StatusBuildup.None.With(StatusEffectId.Burning, 35f);
            arrow.EnemyStatusBuildupFactor = 1.25f;
            Assert.That(_calculator.Calculate(arrow, new SequenceRandom(NoCrit)).Buildup.Get(StatusEffectId.Burning), Is.EqualTo(35f), "enemy hit: unchanged");

            DamageRequest onPlayer = Plain(DamagePacket.Single(DamageType.Fire, 30f), playerDefender: true);
            onPlayer.Buildup = arrow.Buildup;
            onPlayer.EnemyStatusBuildupFactor = 1.25f;
            Assert.That(_calculator.Calculate(onPlayer, new SequenceRandom(NoCrit)).Buildup.Get(StatusEffectId.Burning), Is.EqualTo(43.75f).Within(1e-4f));
        }

        [Test]
        public void SnapshotsFromStats_ReadTheCurrentValues()
        {
            var stats = new StatCollection();
            stats.SetBase(StatId.Level, 5f);
            stats.SetBase(StatId.Dexterity, 30f);
            stats.SetBase(StatId.Armor, 40f);
            stats.SetBase(StatId.ResistFire, 0.3f);
            stats.AddModifier(StatModifier.Flat(StatId.DamageBonus, 0.1f, "buff:x"));

            AttackerSnapshot attacker = AttackerSnapshot.FromStats(stats, 0.05f);
            DefenderSnapshot defender = DefenderSnapshot.FromStats(stats, true);

            Assert.That(attacker.Level, Is.EqualTo(5f));
            Assert.That(attacker.CritChance, Is.EqualTo(0.1f).Within(1e-5f), "5 % + 0.25 % × 20");
            Assert.That(attacker.DamageBonus, Is.EqualTo(0.15f).Within(1e-5f));
            Assert.That(defender.Armor, Is.EqualTo(40f));
            Assert.That(defender.Resistances.Get(DamageType.Fire), Is.EqualTo(0.3f).Within(1e-6f));
            Assert.That(defender.IncomingDamageMultiplier, Is.EqualTo(1f));
            Assert.That(DamageTypes.ResistanceStat(DamageType.Aether), Is.EqualTo(StatId.ResistAether));
        }
    }
}
