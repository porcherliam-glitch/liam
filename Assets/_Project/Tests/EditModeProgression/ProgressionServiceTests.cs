using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Progression;
using Aetherfall.Stats;
using Aetherfall.Tests.Shared;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.Progression
{
    /// <summary>
    /// The progression service (GDD 03 12, §11.3): experience into levels, events XpGained and LevelUp, points per level, the
    /// max level, experience from kills, distributing and taking back attribute points (hard cap 60) and the stat binding with
    /// the source <c>progression:attributes</c>.
    /// </summary>
    [TestFixture]
    public sealed class ProgressionServiceTests
    {
        private LogCapture _log;
        private EventBus _bus;
        private ProgressionService _service;
        private EventRecorder<XpGained> _xp;
        private EventRecorder<LevelUp> _levels;
        private int _changed;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _service = new ProgressionService(_bus);
            _service.PostInitialize();
            _xp = new EventRecorder<XpGained>(_bus);
            _levels = new EventRecorder<LevelUp>(_bus);
            _changed = 0;
            _service.Changed += OnChanged;
        }

        [TearDown]
        public void TearDown()
        {
            _service.Changed -= OnChanged;
            _xp.Dispose();
            _levels.Dispose();
            _service.Dispose();
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void NewService_StartsAtLevelOneWithoutPoints()
        {
            Assert.That(_service.Level, Is.EqualTo(1));
            Assert.That(_service.XpIntoLevel, Is.EqualTo(0));
            Assert.That(_service.XpForNextLevel, Is.EqualTo(200));
            Assert.That(_service.UnspentAttributePoints, Is.EqualTo(0));
            Assert.That(_service.UnspentSkillPoints, Is.EqualTo(0));
            Assert.That(_service.LevelProgress01, Is.EqualTo(0f));
        }

        [Test]
        public void ExperienceBelowTheThreshold_StaysInTheLevel()
        {
            int counted = _service.AddXp(150, "quest.side.test.x");

            Assert.That(counted, Is.EqualTo(150));
            Assert.That(_service.Level, Is.EqualTo(1));
            Assert.That(_service.XpIntoLevel, Is.EqualTo(150));
            Assert.That(_service.LevelProgress01, Is.EqualTo(0.75f).Within(0.0001f));
            Assert.That(_xp.Count, Is.EqualTo(1));
            Assert.That(_xp.Last.Amount, Is.EqualTo(150));
            Assert.That(_xp.Last.SourceId, Is.EqualTo("quest.side.test.x"));
            Assert.That(_levels.Count, Is.EqualTo(0));
            Assert.That(_changed, Is.EqualTo(1));
        }

        [Test]
        public void ReachingTheThreshold_GivesOneAttributeAndOneSkillPoint()
        {
            _service.AddXp(250, "test");

            Assert.That(_service.Level, Is.EqualTo(2));
            Assert.That(_service.XpIntoLevel, Is.EqualTo(50));
            Assert.That(_service.XpForNextLevel, Is.EqualTo(400));
            Assert.That(_service.UnspentAttributePoints, Is.EqualTo(1));
            Assert.That(_service.UnspentSkillPoints, Is.EqualTo(1));
            Assert.That(_levels.Count, Is.EqualTo(1));
            Assert.That(_levels.Last.NewLevel, Is.EqualTo(2));
        }

        [Test]
        public void LargeGain_RaisesSeveralLevelsWithOneEventEach()
        {
            // 200 (1 -> 2) + 400 (2 -> 3) = 600; 1000 - 600 = 400 of 610 in level 3.
            _service.AddXp(1000, "test");

            Assert.That(_service.Level, Is.EqualTo(3));
            Assert.That(_service.XpIntoLevel, Is.EqualTo(400));
            Assert.That(_service.TotalXp, Is.EqualTo(1000));
            Assert.That(_service.UnspentAttributePoints, Is.EqualTo(2));
            Assert.That(_levels.Count, Is.EqualTo(2));
            Assert.That(_levels.Events[0].NewLevel, Is.EqualTo(2));
            Assert.That(_levels.Events[1].NewLevel, Is.EqualTo(3));
            Assert.That(_xp.Count, Is.EqualTo(1), "one XpGained per gain, before the level-ups");
        }

        [Test]
        public void EventsSeeTheNewState()
        {
            int levelSeen = 0;
            void OnLevelUp(LevelUp evt)
            {
                levelSeen = _service.Level;
            }

            _bus.Subscribe<LevelUp>(OnLevelUp);
            _service.AddXp(200, "test");
            _bus.Unsubscribe<LevelUp>(OnLevelUp);

            Assert.That(levelSeen, Is.EqualTo(2));
        }

        [Test]
        public void MaxLevel_DropsTheRestAndStopsCounting()
        {
            int counted = _service.AddXp(int.MaxValue, "test");

            Assert.That(_service.Level, Is.EqualTo(80));
            Assert.That(_service.IsMaxLevel, Is.True);
            Assert.That(counted, Is.EqualTo(2851020));
            Assert.That(_service.XpIntoLevel, Is.EqualTo(0));
            Assert.That(_service.LevelProgress01, Is.EqualTo(1f));
            Assert.That(_service.UnspentAttributePoints, Is.EqualTo(79));
            Assert.That(_service.UnspentSkillPoints, Is.EqualTo(79));
            Assert.That(_levels.Count, Is.EqualTo(79));
            Assert.That(_service.AddXp(500, "test"), Is.EqualTo(0));
        }

        [Test]
        public void ZeroOrNegativeExperience_ChangesNothing()
        {
            Assert.That(_service.AddXp(0, "test"), Is.EqualTo(0));
            Assert.That(_service.AddXp(-10, "test"), Is.EqualTo(0));
            Assert.That(_xp.Count, Is.EqualTo(0));
            Assert.That(_changed, Is.EqualTo(0));
        }

        [Test]
        public void LevelShare_UsesTheReferenceLevelOrTheCurrentLevel()
        {
            Assert.That(_service.AddXpLevelShare(0.5f, 3, "quest.a"), Is.EqualTo(305));

            var other = new ProgressionService(_bus);
            other.AddXp(250, "test");
            Assert.That(other.AddXpLevelShare(0.5f, 0, "quest.b"), Is.EqualTo(200), "level 2: 0.5 × 400");
            other.Dispose();
        }

        [Test]
        public void KillOfThePlayer_GivesKillExperience()
        {
            Publish(new EnemyKilled("enemy.wolf.grauwolf", "normal", "wolf_1", "player", string.Empty, string.Empty, 8, default(Vector3)));

            // Level 8 wolf against a level 1 player: 16 × 1.25.
            Assert.That(_service.TotalXp, Is.EqualTo(20));
            Assert.That(_xp.Last.SourceId, Is.EqualTo("enemy.wolf.grauwolf"));
        }

        [Test]
        public void KillOfSomeoneElse_GivesNothing()
        {
            Publish(new EnemyKilled("enemy.wolf.grauwolf", "normal", "wolf_1", "trainingspuppe", string.Empty, string.Empty, 8, default(Vector3)));
            Publish(new EnemyKilled("enemy.wolf.grauwolf", "normal", "wolf_2", string.Empty, string.Empty, string.Empty, 8, default(Vector3)));

            Assert.That(_service.TotalXp, Is.EqualTo(0));
        }

        [Test]
        public void AfterDispose_KillsAreIgnored()
        {
            _service.Dispose();
            Publish(new EnemyKilled("enemy.wolf.grauwolf", "normal", "wolf_1", "player", string.Empty, string.Empty, 8, default(Vector3)));

            Assert.That(_service.TotalXp, Is.EqualTo(0));
        }

        [Test]
        public void SkillPoints_FromQuestsAreCountedSeparately()
        {
            _service.AddSkillPoints(2, "quest.puzzle.x");
            _service.AddSkillPoints(0, "quest.puzzle.y");

            Assert.That(_service.UnspentSkillPoints, Is.EqualTo(2));
            Assert.That(_service.BonusSkillPoints, Is.EqualTo(2));
        }

        [Test]
        public void SpendingNeedsAFreePoint()
        {
            Assert.That(_service.CanSpendAttributePoint(StatId.Strength, out string reason), Is.False);
            Assert.That(reason, Does.Contain("Keine freien"));
            Assert.That(_service.TrySpendAttributePoint(StatId.Strength), Is.False);
            Assert.That(_service.TrySpendAttributePoint(StatId.MaxHealth), Is.False, "only the six attributes");
        }

        [Test]
        public void SpendAndRefund_UntilTheAllocationIsLocked()
        {
            StatCollection stats = CreateStats(11f);
            _service.AttachPlayerStats(stats);
            _service.AddXp(600, "test");

            Assert.That(_service.TrySpendAttributePoint(StatId.Strength), Is.True);
            Assert.That(_service.TrySpendAttributePoint(StatId.Strength), Is.True);
            Assert.That(_service.UnspentAttributePoints, Is.EqualTo(0));
            Assert.That(_service.GetSpentPoints(StatId.Strength), Is.EqualTo(2));
            Assert.That(stats.Get(StatId.Strength), Is.EqualTo(13f));
            Assert.That(stats.GetBase(StatId.Strength), Is.EqualTo(11f), "points are a modifier, not the base value");

            Assert.That(_service.TryRefundAttributePoint(StatId.Strength), Is.True);
            Assert.That(stats.Get(StatId.Strength), Is.EqualTo(12f));
            Assert.That(_service.UnspentAttributePoints, Is.EqualTo(1));

            _service.LockAllocation();
            Assert.That(_service.GetRefundablePoints(StatId.Strength), Is.EqualTo(0));
            Assert.That(_service.TryRefundAttributePoint(StatId.Strength), Is.False);
            Assert.That(_service.GetSpentPoints(StatId.Strength), Is.EqualTo(1));
        }

        [Test]
        public void HardCap_StopsAtSixty()
        {
            StatCollection stats = CreateStats(59f);
            _service.AttachPlayerStats(stats);
            _service.AddXp(600, "test");

            Assert.That(_service.TrySpendAttributePoint(StatId.Constitution), Is.True);
            Assert.That(_service.CanSpendAttributePoint(StatId.Constitution, out string reason), Is.False);
            Assert.That(reason, Does.Contain("60"));
            Assert.That(_service.TrySpendAttributePoint(StatId.Charisma), Is.True, "other attributes still work");
        }

        [Test]
        public void AttachedStats_GetLevelAndPoints()
        {
            _service.AddXp(600, "test");
            _service.TrySpendAttributePoint(StatId.Constitution);
            StatCollection stats = CreateStats(11f);

            _service.AttachPlayerStats(stats);

            Assert.That(stats.Get(StatId.Level), Is.EqualTo(3f));
            Assert.That(stats.Get(StatId.Constitution), Is.EqualTo(12f));
            Assert.That(stats.GetModifiers(StatId.Constitution)[0].SourceId, Is.EqualTo("progression:attributes"));
            Assert.That(stats.Get(StatId.MaxHealth), Is.EqualTo(100f + 15f * 2f + 12f * 2f), "100 + 15 × E(12) + 12 × (3 − 1)");

            _service.AddXp(610, "test");
            Assert.That(stats.Get(StatId.Level), Is.EqualTo(4f), "level-ups reach the bound stats");

            _service.DetachPlayerStats(stats);
            Assert.That(stats.Get(StatId.Constitution), Is.EqualTo(11f));
            Assert.That(_service.PlayerStats, Is.Null);
        }

        [Test]
        public void LoadState_ClampsAndSendsNoEvents()
        {
            StatCollection stats = CreateStats(11f);
            _service.AttachPlayerStats(stats);
            _xp.Clear();
            _levels.Clear();

            _service.LoadState(5, 999999, 2, -3, 1, new[]
            {
                new System.Collections.Generic.KeyValuePair<StatId, int>(StatId.Dexterity, 3),
                new System.Collections.Generic.KeyValuePair<StatId, int>(StatId.Armor, 5)
            });

            Assert.That(_service.Level, Is.EqualTo(5));
            Assert.That(_service.XpIntoLevel, Is.EqualTo(1029), "below the next level");
            Assert.That(_service.UnspentSkillPoints, Is.EqualTo(0));
            Assert.That(_service.GetSpentPoints(StatId.Dexterity), Is.EqualTo(3));
            Assert.That(_service.GetSpentPoints(StatId.Armor), Is.EqualTo(0));
            Assert.That(stats.Get(StatId.Dexterity), Is.EqualTo(14f));
            Assert.That(stats.Get(StatId.Level), Is.EqualTo(5f));
            Assert.That(_xp.Count + _levels.Count, Is.EqualTo(0));

            _service.LoadState(500, 0, 0, 0, 0, null);
            Assert.That(_service.Level, Is.EqualTo(80));
        }

        [Test]
        public void ResetToNewGame_ForgetsEverything()
        {
            _service.AddXp(5000, "test");
            _service.TrySpendAttributePoint(StatId.Wisdom);

            _service.ResetToNewGame();

            Assert.That(_service.Level, Is.EqualTo(1));
            Assert.That(_service.TotalXp, Is.EqualTo(0));
            Assert.That(_service.GetSpentPoints(StatId.Wisdom), Is.EqualTo(0));
            Assert.That(_service.UnspentAttributePoints, Is.EqualTo(0));
        }

        private void Publish<T>(T evt) where T : struct, IGameEvent
        {
            _bus.Publish(in evt);
        }

        private void OnChanged()
        {
            _changed++;
        }

        private static StatCollection CreateStats(float attributeValue)
        {
            var stats = new StatCollection(StatFormulaSet.CreateDefault(), StatRuleSet.Create(StatActorKind.Player));
            for (int i = 0; i < StatIds.Attributes.Length; i++)
            {
                stats.SetBase(StatIds.Attributes[i], attributeValue);
            }

            stats.SetBase(StatId.Level, 1f);
            return stats;
        }
    }
}
