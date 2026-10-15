using System.Collections.Generic;
using System.Linq;
using Aetherfall.Classes;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Progression;
using Aetherfall.Skills;
using Aetherfall.Stats;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Progression
{
    /// <summary>
    /// Skill trees (GDD 03 11.1–11.4): the free core of the class, stages by points in the branch, requirements, forks,
    /// learning with skill points, taking back while the page is open (not when other nodes need it), saving, and what the
    /// learned nodes give (stats, abilities, element bonuses, upgrades, warrior bonuses).
    /// </summary>
    [TestFixture]
    public sealed class SkillTreeTests
    {
        private const string Core = "skill.test.kern";
        private const string Passive = "skill.test.a.passiv";
        private const string Active = "skill.test.a.aktiv";
        private const string Second = "skill.test.a.zweite";
        private const string UpgradeLeft = "skill.test.a.links";
        private const string UpgradeRight = "skill.test.a.rechts";
        private const string Other = "skill.test.b.anderer";

        private EventBus _bus;
        private ProgressionService _progression;
        private ClassService _classes;
        private SkillService _skills;

        private static SkillTree Tree()
        {
            return new SkillTree("class.krieger", "Test", new[] { "Ast A", "Ast B", "Ast C" }, new List<SkillNode>
            {
                new SkillNode(Core, "Kern", "", SkillNodeKind.Core, 0, 1, 1, 0, null, null,
                    new[] { SkillEffect.ForStat(StatId.MaxStamina, 10f, false), SkillEffect.Learn("ability.test.start") }),
                new SkillNode(Passive, "Passiv", "", SkillNodeKind.Passive, 1, 1, 3, 1, null, null,
                    new[] { SkillEffect.ForStat(StatId.Armor, 0.05f, true), SkillEffect.Bonus(SkillEffectKind.LightAttackDamage, 0.04f) }),
                new SkillNode(Active, "Aktiv", "", SkillNodeKind.Active, 1, 1, 1, 1, null, null, new[] { SkillEffect.Learn("ability.test.wirbel") }),
                new SkillNode(Second, "Stufe II", "", SkillNodeKind.Passive, 1, 2, 1, 1, null, null,
                    new[] { SkillEffect.ForElement(SkillEffectKind.ElementDamage, DamageType.Fire, 0.06f) }),
                new SkillNode(UpgradeLeft, "Links", "", SkillNodeKind.Upgrade, 1, 2, 1, 1, new[] { Active }, UpgradeRight,
                    new[] { SkillEffect.ForAbility(SkillEffectKind.AbilityPull, "ability.test.wirbel", 2f) }),
                new SkillNode(UpgradeRight, "Rechts", "", SkillNodeKind.Upgrade, 1, 2, 1, 1, new[] { Active }, UpgradeLeft,
                    new[] { SkillEffect.ForAbility(SkillEffectKind.AbilityHits, "ability.test.wirbel", 1f) }),
                new SkillNode(Other, "Anderer Ast", "", SkillNodeKind.Passive, 2, 1, 1, 1, null, null, new[] { SkillEffect.Bonus(SkillEffectKind.ParryStamina, 20f) })
            });
        }

        [SetUp]
        public void SetUp()
        {
            _bus = new EventBus();
            _progression = new ProgressionService(_bus);
            _classes = new ClassService(new[] { new ClassSpec("class.krieger", "Krieger", "", "", null, null) }, null);
            _skills = new SkillService(new[] { Tree() }, _classes, _progression);
        }

        [TearDown]
        public void TearDown()
        {
            _skills.Dispose();
            _progression.Dispose();
        }

        [Test]
        public void TheCoreOfTheClassIsLearnedForFree()
        {
            Assert.That(_skills.CurrentTree, Is.Not.Null);
            Assert.That(_skills.Rank(Core), Is.EqualTo(1));
            Assert.That(_skills.Check(Core), Is.EqualTo(SkillCheck.MaxRank));
            Assert.That(_skills.Bonuses.Abilities, Does.Contain("ability.test.start"));
        }

        [Test]
        public void LearningCostsPoints_AndNeedsThem()
        {
            Assert.That(_skills.Check(Passive), Is.EqualTo(SkillCheck.NotEnoughPoints));
            _progression.AddSkillPoints(2, "test");

            Assert.That(_skills.TryLearn(Passive), Is.True);
            Assert.That(_skills.TryLearn(Passive), Is.True);

            Assert.That(_skills.Rank(Passive), Is.EqualTo(2));
            Assert.That(_skills.FreePoints, Is.EqualTo(0));
            Assert.That(_skills.TryLearn(Passive), Is.False);
        }

        [Test]
        public void StageTwo_NeedsThreePointsInTheLowerStagesOfTheBranch()
        {
            _progression.AddSkillPoints(5, "test");
            _skills.TryLearn(Passive);
            _skills.TryLearn(Other);
            Assert.That(_skills.Check(Second), Is.EqualTo(SkillCheck.TierLocked), "points in another branch do not count");

            _skills.TryLearn(Passive);
            _skills.TryLearn(Active);

            Assert.That(_skills.Check(Second), Is.EqualTo(SkillCheck.Ok));
        }

        [Test]
        public void Upgrades_NeedTheirAbility_AndAForkAllowsOnlyOneSide()
        {
            _progression.AddSkillPoints(6, "test");
            _skills.TryLearn(Passive);
            _skills.TryLearn(Passive);
            _skills.TryLearn(Passive);
            Assert.That(_skills.Check(UpgradeLeft), Is.EqualTo(SkillCheck.NeedsRequirement));

            _skills.TryLearn(Active);
            Assert.That(_skills.TryLearn(UpgradeLeft), Is.True);

            Assert.That(_skills.Check(UpgradeRight), Is.EqualTo(SkillCheck.ForkTaken));
        }

        [Test]
        public void TakingBack_WorksForThisSession_ButNotWhenAnotherNodeNeedsIt()
        {
            _progression.AddSkillPoints(5, "test");
            _skills.TryLearn(Passive);
            _skills.TryLearn(Passive);
            _skills.TryLearn(Active);
            _skills.TryLearn(UpgradeLeft);

            Assert.That(_skills.CanRefund(Active), Is.False, "the upgrade needs the ability");
            Assert.That(_skills.CanRefund(Passive), Is.False, "the upgrade needs 3 points below stage II");
            Assert.That(_skills.TryRefund(UpgradeLeft), Is.True);
            Assert.That(_skills.FreePoints, Is.EqualTo(2));
            Assert.That(_skills.TryRefund(Active), Is.True);

            _skills.LockSession();
            Assert.That(_skills.CanRefund(Passive), Is.False, "closing the page makes it final");
            Assert.That(_skills.CanRefund(Core), Is.False);
        }

        [Test]
        public void Bonuses_CollectStatsAbilitiesElementsUpgradesAndCombat()
        {
            _progression.AddSkillPoints(7, "test");
            _skills.TryLearn(Passive);
            _skills.TryLearn(Passive);
            _skills.TryLearn(Active);
            _skills.TryLearn(Second);
            _skills.TryLearn(UpgradeRight);
            _skills.TryLearn(Other);

            SkillBonuses bonuses = _skills.Bonuses;
            Assert.That(bonuses.Stats.Count(m => m.Stat == StatId.Armor), Is.EqualTo(1));
            Assert.That(bonuses.Stats.First(m => m.Stat == StatId.Armor).Value, Is.EqualTo(0.1f).Within(1e-5f), "2 ranks × 5 %");
            Assert.That(bonuses.Abilities, Does.Contain("ability.test.wirbel"));
            Assert.That(bonuses.TreeAbilities, Does.Contain("ability.test.start"));
            Assert.That(bonuses.LightAttackDamage, Is.EqualTo(0.08f).Within(1e-5f));
            Assert.That(bonuses.ParryStamina, Is.EqualTo(20f));
            Assert.That(bonuses.AbilityModifiers.ElementDamage(DamageType.Fire), Is.EqualTo(0.06f).Within(1e-5f));
            Assert.That(bonuses.AbilityModifiers.Upgrades["ability.test.wirbel"].ExtraHits, Is.EqualTo(1));
        }

        [Test]
        public void SaveRoundTrip_KeepsTheRanks_AndANewGameStartsWithTheCoreOnly()
        {
            _progression.AddSkillPoints(2, "test");
            _skills.TryLearn(Passive);
            _skills.TryLearn(Active);
            _skills.Capture(out string[] nodes, out int[] ranks);

            _skills.Restore(null, null);
            Assert.That(_skills.Rank(Passive), Is.EqualTo(0));
            Assert.That(_skills.Rank(Core), Is.EqualTo(1));

            _skills.Restore(nodes, ranks);
            Assert.That(_skills.Rank(Passive), Is.EqualTo(1));
            Assert.That(_skills.Rank(Active), Is.EqualTo(1));
            Assert.That(_skills.CanRefund(Active), Is.False, "loaded ranks are final");
        }

        [Test]
        public void Validate_FindsBrokenTrees()
        {
            Assert.That(Tree().Validate(), Is.Empty);
            var noCore = new SkillTree("class.x", "X", null, new[] { new SkillNode(Passive, "P", "", SkillNodeKind.Passive, 1, 1, 1, 1, null, null, null) });
            Assert.That(noCore.Validate(), Does.Contain("core"));
            var badFork = new SkillTree("class.x", "X", null, new[]
            {
                new SkillNode(Core, "K", "", SkillNodeKind.Core, 0, 1, 1, 0, null, null, null),
                new SkillNode(UpgradeLeft, "L", "", SkillNodeKind.Upgrade, 1, 1, 1, 1, null, "skill.fehlt", null)
            });
            Assert.That(badFork.Validate(), Does.Contain("fork"));
            var activeWithout = new SkillTree("class.x", "X", null, new[]
            {
                new SkillNode(Core, "K", "", SkillNodeKind.Core, 0, 1, 1, 0, null, null, null),
                new SkillNode(Active, "A", "", SkillNodeKind.Active, 1, 1, 1, 1, null, null, null)
            });
            Assert.That(activeWithout.Validate(), Does.Contain("teaches no ability"));
        }

        [Test]
        public void AbilityUpgrade_ChangesACopyOnly()
        {
            var whirl = new AbilitySpec { Id = "ability.krieger.wirbelklinge", Kind = AbilityKind.Cone, ConeAngle = 360f, Repeats = 2, StaminaCost = 30f };
            var upgrade = new AbilityUpgrade { ExtraHits = 1, StaminaCostDelta = 10f, PullDistance = 2f };

            AbilitySpec changed = upgrade.ApplyTo(whirl);

            Assert.That(changed.Repeats, Is.EqualTo(3));
            Assert.That(changed.StaminaCost, Is.EqualTo(40f));
            Assert.That(changed.PullDistance, Is.EqualTo(2f));
            Assert.That(whirl.Repeats, Is.EqualTo(2), "the base data stays");
            var lance = new AbilitySpec { Id = "ability.eis.eislanze", Kind = AbilityKind.Projectile, MaxTargets = 2 };
            Assert.That(new AbilityUpgrade { ExtraTargets = 1 }.ApplyTo(lance).MaxTargets, Is.EqualTo(3));
        }

        [Test]
        public void AbilityModifiers_RaiseDamageAndBuildupOfTheElement()
        {
            var modifiers = new AbilityModifiers { AllDamage = 0.05f };
            modifiers.AddElementDamage(DamageType.Fire, 0.12f);
            modifiers.AddElementBuildup(DamageType.Fire, 0.25f);
            var fireball = new AbilitySpec { Id = "ability.feuer.feuerball", Element = DamageType.Fire, Buildup = 30f };

            Assert.That(modifiers.DamageFactor(DamageType.Fire), Is.EqualTo(1.17f).Within(1e-5f));
            Assert.That(modifiers.DamageFactor(DamageType.Ice), Is.EqualTo(1.05f).Within(1e-5f));
            Assert.That(modifiers.Apply(fireball).Buildup, Is.EqualTo(37.5f).Within(1e-4f));
            Assert.That(fireball.Buildup, Is.EqualTo(30f));
        }
    }
}
