using System.Collections.Generic;
using Aetherfall.Inventory;
using Aetherfall.Stats;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary>
    /// Carry load (GDD 04 2.2, GDD 03 10): capacity 60 + 2 × E(strength), levels normal (≤ 90 %), almost full (≤ 100 %),
    /// overloaded (≤ 125 %: −40 % movement, −25 % stamina regeneration, max. 3 m/s, no sprint, dodge step only) and heavily
    /// overloaded (−60 % / −50 %, max. 1.5 m/s, no jump), applied as stat modifiers with the source <c>encumbrance</c>.
    /// </summary>
    [TestFixture]
    public sealed class EncumbranceTests
    {
        private InventoryTestEnvironment _env;

        [SetUp]
        public void SetUp()
        {
            _env = new InventoryTestEnvironment();
        }

        [TearDown]
        public void TearDown()
        {
            _env.Dispose();
        }

        private static float FromEncumbrance(StatCollection stats, StatId stat)
        {
            float total = 0f;
            IReadOnlyList<StatModifier> modifiers = stats.GetModifiers(stat);
            for (int i = 0; i < modifiers.Count; i++)
            {
                if (modifiers[i].SourceId == EncumbranceRules.SourceId)
                {
                    Assert.That(modifiers[i].Kind, Is.EqualTo(StatModifierKind.PercentAdd));
                    total += modifiers[i].Value;
                }
            }

            return total;
        }

        [TestCase(0f, EncumbranceLevel.Normal)]
        [TestCase(72f, EncumbranceLevel.Normal)]
        [TestCase(72.1f, EncumbranceLevel.AlmostFull)]
        [TestCase(80f, EncumbranceLevel.AlmostFull)]
        [TestCase(80.1f, EncumbranceLevel.Overloaded)]
        [TestCase(100f, EncumbranceLevel.Overloaded)]
        [TestCase(100.1f, EncumbranceLevel.HeavilyOverloaded)]
        public void Levels_At90_100_125Percent(float load, EncumbranceLevel expected)
        {
            Assert.That(EncumbranceRules.LevelFor(load, 80f), Is.EqualTo(expected));
        }

        [Test]
        public void Rules_PerLevel()
        {
            Assert.That(EncumbranceRules.MoveSpeedPenalty(EncumbranceLevel.AlmostFull), Is.EqualTo(0f));
            Assert.That(EncumbranceRules.MoveSpeedPenalty(EncumbranceLevel.Overloaded), Is.EqualTo(-0.4f));
            Assert.That(EncumbranceRules.MoveSpeedPenalty(EncumbranceLevel.HeavilyOverloaded), Is.EqualTo(-0.6f));
            Assert.That(EncumbranceRules.StaminaRegenPenalty(EncumbranceLevel.Overloaded), Is.EqualTo(-0.25f));
            Assert.That(EncumbranceRules.StaminaRegenPenalty(EncumbranceLevel.HeavilyOverloaded), Is.EqualTo(-0.5f));
            Assert.That(EncumbranceRules.MaxSpeed(EncumbranceLevel.Overloaded), Is.EqualTo(3f));
            Assert.That(EncumbranceRules.MaxSpeed(EncumbranceLevel.HeavilyOverloaded), Is.EqualTo(1.5f));
            Assert.That(EncumbranceRules.AllowsSprint(EncumbranceLevel.AlmostFull), Is.True);
            Assert.That(EncumbranceRules.AllowsSprint(EncumbranceLevel.Overloaded), Is.False);
            Assert.That(EncumbranceRules.AllowsRoll(EncumbranceLevel.Overloaded), Is.False);
            Assert.That(EncumbranceRules.AllowsJump(EncumbranceLevel.Overloaded), Is.True);
            Assert.That(EncumbranceRules.AllowsJump(EncumbranceLevel.HeavilyOverloaded), Is.False);
            Assert.That(EncumbranceRules.AllowsFastTravel(EncumbranceLevel.Overloaded), Is.False);
        }

        [Test]
        public void Capacity_ComesFromStrength()
        {
            StatCollection stats = _env.AttachWarriorStats();

            Assert.That(stats.Get(StatId.CarryCapacity), Is.EqualTo(80f), "60 + 2 × (20 − 10)");
            Assert.That(_env.Inventory.PlayerEncumbrance.Capacity, Is.EqualTo(80f));
            Assert.That(_env.Inventory.PlayerEncumbrance.Level, Is.EqualTo(EncumbranceLevel.Normal));
        }

        [Test]
        public void Ballast_OverloadsThePlayer_AndSlowsHimDown()
        {
            StatCollection stats = _env.AttachWarriorStats();
            float speed = stats.Get(StatId.MoveSpeed);

            // Start kit 18.9 kg + 3 × 25 kg = 93.9 kg of 80 kg → overloaded.
            Assert.That(_env.Inventory.TryAddNew(InventoryOwners.Player, InventoryTestItems.Ballast, 3, "test"), Is.True);
            Assert.That(_env.Inventory.PlayerEncumbrance.Level, Is.EqualTo(EncumbranceLevel.Overloaded));
            Assert.That(FromEncumbrance(stats, StatId.MoveSpeed), Is.EqualTo(-0.4f).Within(1e-5f));
            Assert.That(FromEncumbrance(stats, StatId.StaminaRegen), Is.EqualTo(-0.25f).Within(1e-5f));
            Assert.That(stats.Get(StatId.MoveSpeed), Is.LessThan(speed));

            // + 25 kg = 118.9 kg → heavily overloaded.
            _env.Inventory.TryAddNew(InventoryOwners.Player, InventoryTestItems.Ballast, 1, "test");
            Assert.That(_env.Inventory.PlayerEncumbrance.Level, Is.EqualTo(EncumbranceLevel.HeavilyOverloaded));
            Assert.That(FromEncumbrance(stats, StatId.MoveSpeed), Is.EqualTo(-0.6f).Within(1e-5f));
            Assert.That(FromEncumbrance(stats, StatId.StaminaRegen), Is.EqualTo(-0.5f).Within(1e-5f));

            Assert.That(_env.Inventory.TryRemove(InventoryOwners.Player, InventoryTestItems.Ballast, 4, "test"), Is.True);
            Assert.That(_env.Inventory.PlayerEncumbrance.Level, Is.EqualTo(EncumbranceLevel.Normal));
            Assert.That(FromEncumbrance(stats, StatId.MoveSpeed), Is.EqualTo(0f));
            Assert.That(stats.Get(StatId.MoveSpeed), Is.EqualTo(speed).Within(1e-5f));
        }

        [Test]
        public void MoreStrength_LiftsTheOverload()
        {
            StatCollection stats = _env.AttachWarriorStats();
            _env.Inventory.TryAddNew(InventoryOwners.Player, InventoryTestItems.Ballast, 3, "test");
            Assert.That(_env.Inventory.PlayerEncumbrance.Level, Is.EqualTo(EncumbranceLevel.Overloaded));

            // Strength 30: 100 kg capacity, 93.9 kg is "almost full".
            stats.SetBase(StatId.Strength, 30f);
            stats.FlushChanges();

            Assert.That(_env.Inventory.PlayerEncumbrance.Capacity, Is.EqualTo(100f));
            Assert.That(_env.Inventory.PlayerEncumbrance.Level, Is.EqualTo(EncumbranceLevel.AlmostFull));
            Assert.That(FromEncumbrance(stats, StatId.MoveSpeed), Is.EqualTo(0f));
        }

        [Test]
        public void Detach_RemovesAllModifiersOfTheInventory()
        {
            StatCollection stats = _env.AttachWarriorStats();
            _env.Inventory.TryAddNew(InventoryOwners.Player, InventoryTestItems.Ballast, 4, "test");

            _env.Inventory.DetachPlayerStats(stats);

            Assert.That(FromEncumbrance(stats, StatId.MoveSpeed), Is.EqualTo(0f));
            Assert.That(stats.GetModifiers(StatId.Armor).Count, Is.EqualTo(0));
            Assert.That(_env.Inventory.PlayerStats, Is.Null);
        }
    }
}
