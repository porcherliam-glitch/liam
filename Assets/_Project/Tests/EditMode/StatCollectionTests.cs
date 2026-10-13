using System;
using System.Collections.Generic;
using Aetherfall.Stats;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// <see cref="StatCollection"/> (architecture 11.5, GDD 03 10): base values, derived values from formulas, modifiers
    /// with sources, caps per kind of character, dirty flags and the bundled change event.
    /// </summary>
    [TestFixture]
    public sealed class StatCollectionTests
    {
        private readonly List<(StatId Stat, float Old, float New)> _changes = new List<(StatId, float, float)>();

        private void OnChanged(StatId stat, float oldValue, float newValue)
        {
            _changes.Add((stat, oldValue, newValue));
        }

        private static StatCollection CreateWarrior(float constitution = 18f, float level = 10f)
        {
            var stats = new StatCollection();
            stats.SetBase(StatId.Strength, 20f);
            stats.SetBase(StatId.Dexterity, 10f);
            stats.SetBase(StatId.Intelligence, 8f);
            stats.SetBase(StatId.Wisdom, 10f);
            stats.SetBase(StatId.Constitution, constitution);
            stats.SetBase(StatId.Charisma, 10f);
            stats.SetBase(StatId.Level, level);
            return stats;
        }

        [SetUp]
        public void SetUp()
        {
            _changes.Clear();
        }

        [Test]
        public void DerivedValues_FollowTheFormulasOfGdd03()
        {
            StatCollection stats = CreateWarrior();

            Assert.That(stats.Get(StatId.MaxHealth), Is.EqualTo(328f).Within(1e-3f));
            Assert.That(stats.Get(StatId.MaxStamina), Is.EqualTo(120.5f).Within(1e-3f));
            Assert.That(stats.Get(StatId.MaxMana), Is.EqualTo(58f).Within(1e-3f), "50 + 5 × (−2) + 2 × 9");
            Assert.That(stats.Get(StatId.CritChance), Is.EqualTo(0.05f).Within(1e-6f));
            Assert.That(stats.Get(StatId.CritDamage), Is.EqualTo(1.5f));
            Assert.That(stats.Get(StatId.StaminaRegen), Is.EqualTo(25f));
            Assert.That(stats.Get(StatId.CarryCapacity), Is.EqualTo(80f).Within(1e-3f));
            Assert.That(stats.Get(StatId.MoveSpeed), Is.EqualTo(1f));
            Assert.That(stats.IsDerived(StatId.MaxHealth), Is.True);
            Assert.That(stats.IsDerived(StatId.Strength), Is.False);
        }

        [Test]
        public void ChangingAnAttribute_RecalculatesItsDerivedValuesLazily()
        {
            StatCollection stats = CreateWarrior();
            Assert.That(stats.Get(StatId.MaxHealth), Is.EqualTo(328f).Within(1e-3f));

            stats.SetBase(StatId.Constitution, 20f);

            Assert.That(stats.Get(StatId.MaxHealth), Is.EqualTo(358f).Within(1e-3f), "+2 constitution = +30 health");
            Assert.That(stats.Get(StatId.MaxStamina), Is.EqualTo(124.5f).Within(1e-3f));
        }

        [Test]
        public void SetBase_OnADerivedStat_Throws()
        {
            var stats = new StatCollection();
            Assert.Throws<InvalidOperationException>(() => stats.SetBase(StatId.MaxHealth, 500f));
        }

        [Test]
        public void EquipmentModifiers_AddToDerivedValues_AndRemoveAllFromSourceTakesThemAway()
        {
            StatCollection stats = CreateWarrior();
            string sword = StatSourceIds.Item("inst_42");
            stats.AddModifier(StatModifier.Flat(StatId.MaxHealth, 50f, sword));
            stats.AddModifier(StatModifier.Flat(StatId.Constitution, 2f, sword));
            stats.AddModifier(StatModifier.PercentAdd(StatId.MaxHealth, 0.1f, StatSourceIds.Buff("trank")));

            // Constitution 20 → base 358, + 50 flat, × 1.1.
            Assert.That(stats.Get(StatId.MaxHealth), Is.EqualTo((358f + 50f) * 1.1f).Within(1e-3f));

            int removed = stats.RemoveAllFromSource(sword);

            Assert.That(removed, Is.EqualTo(2));
            Assert.That(stats.Get(StatId.MaxHealth), Is.EqualTo(328f * 1.1f).Within(1e-3f));
            Assert.That(stats.RemoveAllFromSource(sword), Is.EqualTo(0), "nothing left");
            Assert.That(stats.RemoveAllFromSource(string.Empty), Is.EqualTo(0));
        }

        [Test]
        public void SourceIds_UseTheArchitecturePrefixes()
        {
            Assert.That(StatSourceIds.Item("abc"), Is.EqualTo("item:abc"));
            Assert.That(StatSourceIds.Buff("x"), Is.EqualTo("buff:x"));
            Assert.That(StatSourceIds.Skill("n1"), Is.EqualTo("skill:n1"));
            Assert.That(StatSourceIds.Effect("effect.gift"), Is.EqualTo("effect:effect.gift"));
        }

        [Test]
        public void RemoveModifier_RemovesOnlyTheGivenOne()
        {
            var stats = new StatCollection();
            StatModifier a = StatModifier.Flat(StatId.Armor, 10f, "a");
            StatModifier b = StatModifier.Flat(StatId.Armor, 5f, "b");
            stats.AddModifier(a);
            stats.AddModifier(b);

            Assert.That(stats.RemoveModifier(a), Is.True);
            Assert.That(stats.RemoveModifier(a), Is.False);
            Assert.That(stats.Get(StatId.Armor), Is.EqualTo(5f));
            Assert.That(stats.GetModifiers(StatId.Armor).Count, Is.EqualTo(1));
        }

        [Test]
        public void Caps_DependOnTheKindOfCharacter()
        {
            var player = new StatCollection(null, StatRuleSet.Create(StatActorKind.Player));
            var enemy = new StatCollection(null, StatRuleSet.Create(StatActorKind.Enemy));
            player.SetBase(StatId.ResistFire, 0.95f);
            enemy.SetBase(StatId.ResistFire, 0.95f);
            player.SetBase(StatId.Strength, 75f);

            Assert.That(player.Get(StatId.ResistFire), Is.EqualTo(0.75f), "player: hard cap 75 %");
            Assert.That(enemy.Get(StatId.ResistFire), Is.EqualTo(0.9f), "enemy: 90 %");
            Assert.That(player.Get(StatId.Strength), Is.EqualTo(60f), "attribute hard cap 60");
            Assert.That(player.Get(StatId.Level), Is.EqualTo(1f), "level at least 1");

            player.SetBase(StatId.ResistShadow, -2f);
            Assert.That(player.Get(StatId.ResistShadow), Is.EqualTo(-1f), "weakness at most −100 %");
        }

        [Test]
        public void CritChance_UsesSoftAndHardCap()
        {
            var stats = new StatCollection();
            stats.SetBase(StatId.Dexterity, 10f);
            stats.AddModifier(StatModifier.Flat(StatId.CritChance, 0.55f, "item:x")); // 0.05 + 0.55 = 0.6

            Assert.That(stats.Get(StatId.CritChance), Is.EqualTo(0.55f).Within(1e-5f), "above 50 % only half counts");
        }

        [Test]
        public void Changed_IsBundledPerFlush_WithFirstOldAndLastNewValue()
        {
            StatCollection stats = CreateWarrior();
            stats.Changed += OnChanged;
            try
            {
                stats.SetBase(StatId.Constitution, 19f);
                stats.SetBase(StatId.Constitution, 20f);
                stats.AddModifier(StatModifier.Flat(StatId.Armor, 10f, "a"));
                Assert.That(_changes, Is.Empty, "nothing is raised before the flush");

                int raised = stats.FlushChanges();

                Assert.That(raised, Is.EqualTo(_changes.Count));
                Assert.That(_changes, Does.Contain((StatId.Constitution, 18f, 20f)));
                Assert.That(_changes, Does.Contain((StatId.Armor, 0f, 10f)));
                Assert.That(Find(StatId.MaxHealth).Old, Is.EqualTo(328f).Within(1e-3f), "derived values are reported too");
                Assert.That(Find(StatId.MaxHealth).New, Is.EqualTo(358f).Within(1e-3f));
                Assert.That(Count(StatId.Constitution), Is.EqualTo(1), "one event per stat and flush");
                Assert.That(stats.FlushChanges(), Is.EqualTo(0), "nothing pending afterwards");
            }
            finally
            {
                stats.Changed -= OnChanged;
            }
        }

        [Test]
        public void Changed_IsNotRaisedForChangesThatCancelOut()
        {
            StatCollection stats = CreateWarrior();
            stats.Changed += OnChanged;
            try
            {
                StatModifier buff = StatModifier.Flat(StatId.Armor, 10f, "buff:x");
                stats.AddModifier(buff);
                stats.RemoveModifier(buff);

                Assert.That(stats.FlushChanges(), Is.EqualTo(0));
                Assert.That(_changes, Is.Empty);
            }
            finally
            {
                stats.Changed -= OnChanged;
            }
        }

        [Test]
        public void ChangesMadeByAHandler_AreReportedByTheNextFlush()
        {
            StatCollection stats = CreateWarrior();
            bool reacted = false;
            Action<StatId, float, float> handler = null;
            handler = (stat, oldValue, newValue) =>
            {
                _changes.Add((stat, oldValue, newValue));
                if (stat == StatId.Armor && !reacted)
                {
                    reacted = true;
                    stats.AddModifier(StatModifier.Flat(StatId.Armor, 5f, "reaction"));
                }
            };
            stats.Changed += handler;
            try
            {
                stats.AddModifier(StatModifier.Flat(StatId.Armor, 10f, "a"));
                stats.FlushChanges();
                Assert.That(_changes, Is.EqualTo(new[] { (StatId.Armor, 0f, 10f) }));

                _changes.Clear();
                stats.FlushChanges();
                Assert.That(_changes, Is.EqualTo(new[] { (StatId.Armor, 10f, 15f) }));
            }
            finally
            {
                stats.Changed -= handler;
            }
        }

        [Test]
        public void WithoutSubscriber_NoChangesAreTracked()
        {
            StatCollection stats = CreateWarrior();
            stats.SetBase(StatId.Constitution, 25f);

            Assert.That(stats.PendingChangeCount, Is.EqualTo(0));
            Assert.That(stats.FlushChanges(), Is.EqualTo(0));
        }

        [Test]
        public void Get_OnCleanValues_DoesNotAllocate()
        {
            StatCollection stats = CreateWarrior();
            for (int i = 0; i < 10; i++)
            {
                stats.Get(StatId.MaxHealth);
                stats.Get(StatId.Strength);
            }

            long probeBefore = GC.GetAllocatedBytesForCurrentThread();
            var probe = new object[8];
            long probeAfter = GC.GetAllocatedBytesForCurrentThread();
            GC.KeepAlive(probe);
            if (probeAfter == probeBefore)
            {
                Assert.Inconclusive("GC.GetAllocatedBytesForCurrentThread does not count allocations on this runtime.");
            }

            long before = GC.GetAllocatedBytesForCurrentThread();
            float sum = 0f;
            for (int i = 0; i < 1000; i++)
            {
                sum += stats.Get(StatId.MaxHealth) + stats.Get(StatId.Strength) + stats.Get(StatId.CritChance);
            }

            long allocated = GC.GetAllocatedBytesForCurrentThread() - before;
            Assert.That(sum, Is.GreaterThan(0f));
            Assert.That(allocated, Is.EqualTo(0), "Get must not allocate");
        }

        [Test]
        public void FormulaSet_WithACycle_IsRejected()
        {
            var formulas = new StatFormulaSet()
                .Set(StatId.MaxHealth, new LinearStatFormula(0f, StatId.MaxStamina, 1f))
                .Set(StatId.MaxStamina, new LinearStatFormula(0f, StatId.MaxHealth, 1f));

            Assert.That(formulas.Validate(out string problem), Is.False);
            Assert.That(problem, Does.Contain("cycle"));
            Assert.Throws<ArgumentException>(() => new StatCollection(formulas));
            Assert.That(StatFormulaSet.CreateDefault().Validate(out _), Is.True);
        }

        [Test]
        public void AttributeSet_ReadsAllSixAttributes()
        {
            StatCollection stats = CreateWarrior();
            AttributeSet attributes = stats.GetAttributes();

            Assert.That(attributes.Strength, Is.EqualTo(20f));
            Assert.That(attributes.Constitution, Is.EqualTo(18f));
            Assert.That(attributes.Get(StatId.Intelligence), Is.EqualTo(8f));
            Assert.That(attributes.Get(StatId.Armor), Is.EqualTo(0f), "not an attribute");
        }

        [Test]
        public void StatIds_HaveStableValues()
        {
            // Values may be stored in assets: never renumber (architecture 11.5).
            Assert.That((int)StatId.Strength, Is.EqualTo(1));
            Assert.That((int)StatId.Charisma, Is.EqualTo(6));
            Assert.That((int)StatId.Level, Is.EqualTo(10));
            Assert.That((int)StatId.MaxHealth, Is.EqualTo(20));
            Assert.That((int)StatId.ResistSlash, Is.EqualTo(50));
            Assert.That((int)StatId.ResistAether, Is.EqualTo(58));
            foreach (StatId id in StatIds.All)
            {
                Assert.That((int)id, Is.LessThan(StatIds.Capacity), id.ToString());
            }
        }

        private (StatId Stat, float Old, float New) Find(StatId stat)
        {
            foreach ((StatId Stat, float Old, float New) change in _changes)
            {
                if (change.Stat == stat)
                {
                    return change;
                }
            }

            Assert.Fail("No change reported for " + stat);
            return default;
        }

        private int Count(StatId stat)
        {
            int count = 0;
            foreach ((StatId Stat, float Old, float New) change in _changes)
            {
                if (change.Stat == stat)
                {
                    count++;
                }
            }

            return count;
        }
    }
}
