using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Progression;
using Aetherfall.Stats;
using Aetherfall.Tests.Shared;
using Aetherfall.UI.Screens;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// Unit tests for <see cref="CharacterSheetModel"/> with the real progression service: level and experience texts, free
    /// points, attribute rows with the points placed while the menu is open ("+1", can be taken back until locked), derived
    /// values in German number format, and "–" without a player.
    /// </summary>
    [TestFixture]
    public sealed class CharacterSheetModelTests
    {
        private LogCapture _log;
        private EventBus _bus;
        private ProgressionService _progression;
        private StatCollection _stats;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _progression = new ProgressionService(_bus);
            _stats = new StatCollection(StatFormulaSet.CreateDefault(), StatRuleSet.Create(StatActorKind.Player));
            for (int i = 0; i < StatIds.Attributes.Length; i++)
            {
                _stats.SetBase(StatIds.Attributes[i], 10f);
            }

            _stats.SetBase(StatId.Level, 1f);
            _progression.AttachPlayerStats(_stats);
        }

        [TearDown]
        public void TearDown()
        {
            _progression.Dispose();
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void Header_ShowsLevelExperienceAndPoints()
        {
            Assert.That(CharacterSheetModel.LevelText(_progression), Is.EqualTo("Stufe 1"));
            Assert.That(CharacterSheetModel.XpText(_progression), Is.EqualTo("0 / " + CharacterSheetModel.Number(_progression.XpForNextLevel) + " EP"));
            Assert.That(CharacterSheetModel.PointsText(_progression), Is.EqualTo("Freie Attributpunkte: 0 · Freie Skillpunkte: 0"));

            _progression.AddXp(_progression.XpForNextLevel + 10, "test");

            Assert.That(CharacterSheetModel.LevelText(_progression), Is.EqualTo("Stufe 2"));
            Assert.That(CharacterSheetModel.XpText(_progression), Does.StartWith("10 / "));
            Assert.That(CharacterSheetModel.PointsText(_progression), Is.EqualTo("Freie Attributpunkte: 1 · Freie Skillpunkte: 1"));
            Assert.That(CharacterSheetModel.XpFill(_progression), Is.GreaterThan(0f).And.LessThan(1f));
        }

        [Test]
        public void Attributes_ShowPlacedPoints_UntilTheMenuCloses()
        {
            var rows = new List<CharacterAttributeRow>();
            CharacterSheetModel.CollectAttributes(_progression, rows);
            Assert.That(rows.Count, Is.EqualTo(6));
            Assert.That(rows[0].Name, Is.EqualTo("Stärke"));
            Assert.That(rows[0].ColorClass, Is.EqualTo("af-attr--strength"));
            Assert.That(rows[0].Value, Is.EqualTo("10"));
            Assert.That(rows[0].CanSpend, Is.False, "no free points yet");
            Assert.That(rows[5].Name, Is.EqualTo("Charisma"));

            _progression.AddXp(_progression.XpForNextLevel, "test");
            CharacterSheetModel.CollectAttributes(_progression, rows);
            Assert.That(rows[0].CanSpend, Is.True);

            Assert.That(_progression.TrySpendAttributePoint(StatId.Strength), Is.True);
            CharacterSheetModel.CollectAttributes(_progression, rows);
            Assert.That(rows[0].Value, Is.EqualTo("11"));
            Assert.That(rows[0].Bonus, Is.EqualTo("+1"));
            Assert.That(rows[0].CanRefund, Is.True);
            Assert.That(rows[1].CanSpend, Is.False, "the only point is placed");

            _progression.LockAllocation();
            CharacterSheetModel.CollectAttributes(_progression, rows);
            Assert.That(rows[0].Value, Is.EqualTo("11"));
            Assert.That(rows[0].Bonus, Is.Empty);
            Assert.That(rows[0].CanRefund, Is.False);
        }

        [Test]
        public void Derived_UseGermanFormats()
        {
            var rows = new List<CharacterValueRow>();
            CharacterSheetModel.CollectDerived(_progression, rows);

            Assert.That(rows.Count, Is.EqualTo(7));
            Assert.That(rows[0].Label, Is.EqualTo("Max. Lebenspunkte"));
            Assert.That(rows[5].Label, Is.EqualTo("Krit-Chance"));
            Assert.That(rows[5].Value, Does.EndWith(" %"));
            Assert.That(rows[6].Value, Does.EndWith(" kg"));
            Assert.That(CharacterSheetModel.FormatDerived(StatId.CritChance, 0.055f), Is.EqualTo("5,5 %"));
            Assert.That(CharacterSheetModel.FormatDerived(StatId.CarryCapacity, 72.4f), Is.EqualTo("72 kg"));
            Assert.That(CharacterSheetModel.FormatDerived(StatId.MaxHealth, float.NaN), Is.EqualTo(CharacterSheetModel.Unknown));
            Assert.That(CharacterSheetModel.Number(12500), Is.EqualTo("12.500"));
        }

        [Test]
        public void Derived_AreRoundedDown_LikeGdd03_10_3()
        {
            // GDD 03 10.3: "intern ungerundet, abgerundet angezeigt" – Math.Round (banker's rounding) would show 118 and 12,6 %.
            Assert.That(CharacterSheetModel.FormatDerived(StatId.MaxStamina, 117.5f), Is.EqualTo("117"));
            Assert.That(CharacterSheetModel.FormatDerived(StatId.MaxStamina, 120.5f), Is.EqualTo("120"), "GDD example: warrior L10 stamina");
            Assert.That(CharacterSheetModel.FormatDerived(StatId.MaxHealth, 327.99f), Is.EqualTo("327"));
            Assert.That(CharacterSheetModel.FormatDerived(StatId.MaxHealth, 116.99998f), Is.EqualTo("117"), "float noise below a whole number");
            Assert.That(CharacterSheetModel.FormatDerived(StatId.CarryCapacity, 72.9f), Is.EqualTo("72 kg"));
            Assert.That(CharacterSheetModel.FormatDerived(StatId.CritChance, 0.1259f), Is.EqualTo("12,5 %"));
            Assert.That(CharacterSheetModel.FormatDerived(StatId.CritChance, 0.125f), Is.EqualTo("12,5 %"), "GDD example: Ges 40");
            Assert.That(CharacterSheetModel.FormatDerived(StatId.CritChance, 0.0999f), Is.EqualTo("9,9 %"));
            Assert.That(CharacterSheetModel.FormatDerived(StatId.CritChance, 0.07f), Is.EqualTo("7,0 %"));
            Assert.That(CharacterSheetModel.FloorForDisplay(57.5f), Is.EqualTo(57), "GDD example: attack value 57.5 shows 57");
        }

        [Test]
        public void Derived_StaminaAtLevel4WithConstitution18_Shows117()
        {
            // 100 + 2 × E(18) + 0.5 × (4 − 1) = 117.5 (GDD 03 10.3).
            _stats.SetBase(StatId.Constitution, 18f);
            _progression.AddXp(_progression.Curve.TotalXpAt(4), "test");
            Assert.That(_progression.Level, Is.EqualTo(4));
            Assert.That(_stats.Get(StatId.MaxStamina), Is.EqualTo(117.5f).Within(0.001f));

            var rows = new List<CharacterValueRow>();
            CharacterSheetModel.CollectDerived(_progression, rows);

            Assert.That(rows[1].Label, Is.EqualTo("Max. Ausdauer"));
            Assert.That(rows[1].Value, Is.EqualTo("117"));
        }

        [Test]
        public void Attributes_AreRoundedDown()
        {
            _stats.AddModifier(StatModifier.Flat(StatId.Strength, 0.6f, "test:item"));
            var rows = new List<CharacterAttributeRow>();

            CharacterSheetModel.CollectAttributes(_progression, rows);

            Assert.That(rows[0].Value, Is.EqualTo("10"), "10.6 shows 10, not 11");
        }

        [Test]
        public void WithoutProgression_EverythingIsUnknown()
        {
            var rows = new List<CharacterAttributeRow>();
            CharacterSheetModel.CollectAttributes(null, rows);
            Assert.That(rows.Count, Is.EqualTo(6));
            Assert.That(rows[0].Value, Is.EqualTo(CharacterSheetModel.Unknown));
            Assert.That(rows[0].CanSpend, Is.False);
            Assert.That(CharacterSheetModel.LevelText(null), Is.EqualTo("Stufe –"));
            Assert.That(CharacterSheetModel.XpFill(null), Is.EqualTo(0f));
        }
    }
}
