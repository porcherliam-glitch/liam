using System.Collections.Generic;
using Aetherfall.Items;
using Aetherfall.Stats;
using Aetherfall.Utilities;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Exclusion rules of the affix pool (GDD 04 4.3): no affix twice, one affix per family (two different resistances),
    /// only allowed slots, "des Blutegels" never with "der Dornen", at most 2 prefixes and 2 suffixes.
    /// </summary>
    [TestFixture]
    public sealed class AffixPoolTests
    {
        private ItemCatalog _catalog;

        [SetUp]
        public void SetUp()
        {
            _catalog = ItemTestCatalog.Create();
        }

        private AffixSpec Get(string id)
        {
            Assert.That(_catalog.Affixes.TryGet(id, out AffixSpec affix), Is.True, id);
            return affix;
        }

        private static List<AffixRoll> Chosen(params string[] ids)
        {
            var list = new List<AffixRoll>();
            for (int i = 0; i < ids.Length; i++)
            {
                list.Add(new AffixRoll(ids[i], 1, 1f));
            }

            return list;
        }

        [Test]
        public void SameAffix_IsNeverRolledTwice()
        {
            Assert.That(_catalog.Affixes.IsCompatible(Get(ItemTestCatalog.Armored), Chosen(ItemTestCatalog.Armored)), Is.False);
        }

        [Test]
        public void Family_AllowsOneAffix_ResistancesTwoDifferent()
        {
            Assert.That(_catalog.Affixes.IsCompatible(Get(ItemTestCatalog.IceWard), Chosen(ItemTestCatalog.FireWard)), Is.True);
            Assert.That(_catalog.Affixes.IsCompatible(Get(ItemTestCatalog.LightningWard), Chosen(ItemTestCatalog.FireWard, ItemTestCatalog.IceWard)),
                Is.False);
        }

        [Test]
        public void LeechAndThorns_ExcludeEachOther_InBothDirections()
        {
            Assert.That(_catalog.Affixes.IsCompatible(Get(ItemTestCatalog.Thorns), Chosen(ItemTestCatalog.Leech)), Is.False);
            Assert.That(_catalog.Affixes.IsCompatible(Get(ItemTestCatalog.Leech), Chosen(ItemTestCatalog.Thorns)), Is.False);
        }

        [Test]
        public void AtMostTwoPrefixesAndTwoSuffixes()
        {
            List<AffixRoll> twoPrefixes = Chosen(ItemTestCatalog.Armored, ItemTestCatalog.Vital);

            Assert.That(_catalog.Affixes.IsCompatible(Get(ItemTestCatalog.Cruel), twoPrefixes), Is.False);
            Assert.That(_catalog.Affixes.IsCompatible(Get(ItemTestCatalog.Endurance), twoPrefixes), Is.True);
            Assert.That(_catalog.Affixes.IsCompatible(Get(ItemTestCatalog.Strength), Chosen(ItemTestCatalog.Endurance, ItemTestCatalog.Steadfast)),
                Is.False);
        }

        [Test]
        public void Roll_OnlyUsesAllowedSlots_AndRespectsAllRules()
        {
            _catalog.TryGetItem(ItemTestCatalog.PlateChest, out ItemSpec chest);
            _catalog.TryGetItem(ItemTestCatalog.Sword, out ItemSpec sword);
            var random = new Pcg32Random(77UL);
            var rolls = new List<AffixRoll>();
            for (int n = 0; n < 2000; n++)
            {
                ItemSpec item = n % 2 == 0 ? chest : sword;
                rolls.Clear();
                _catalog.Affixes.Roll(item, 40, 4, random, 0, false, rolls);
                var ids = new HashSet<string>();
                int prefixes = 0;
                int suffixes = 0;
                int resistances = 0;
                for (int i = 0; i < rolls.Count; i++)
                {
                    AffixSpec affix = Get(rolls[i].AffixId);
                    Assert.That((affix.AllowedSlots & item.AffixSlot) != 0, Is.True, affix.Id + " on " + item.Id);
                    Assert.That(ids.Add(affix.Id), Is.True, "duplicate " + affix.Id);
                    Assert.That(rolls[i].Tier, Is.InRange(2, 4), "item level 40 allows tiers II–IV");
                    if (affix.Kind == AffixKind.Prefix)
                    {
                        prefixes++;
                    }
                    else
                    {
                        suffixes++;
                    }

                    if (affix.FamilyId == "resistenz")
                    {
                        resistances++;
                    }
                }

                Assert.That(prefixes, Is.LessThanOrEqualTo(2));
                Assert.That(suffixes, Is.LessThanOrEqualTo(2));
                Assert.That(resistances, Is.LessThanOrEqualTo(2));
                Assert.That(ids.Contains(ItemTestCatalog.Leech) && ids.Contains(ItemTestCatalog.Thorns), Is.False);
            }
        }

        [Test]
        public void Roll_StopsWhenNoCandidateIsLeft()
        {
            // A sword allows the prefixes Scharf, Lodernd, Grausam and the suffix Blutegel: at most 2 + 1 affixes.
            _catalog.TryGetItem(ItemTestCatalog.Sword, out ItemSpec sword);
            var rolls = new List<AffixRoll>();

            _catalog.Affixes.Roll(sword, 10, 4, new Pcg32Random(3UL), 0, false, rolls);

            Assert.That(rolls.Count, Is.EqualTo(3));
        }

        [Test]
        public void InvalidAffix_IsRejected()
        {
            var pool = new AffixPool();
            AffixSpec noSlot = ItemTestCatalog.Affix("affix.ohne_slot", AffixKind.Prefix, "x", StatId.Armor, 1, 2, 3, 4, AffixSlots.None);

            Assert.That(pool.Add(noSlot), Is.False);
            Assert.That(pool.Add(null), Is.False);
            Assert.That(pool.All.Count, Is.EqualTo(0));
        }
    }
}
