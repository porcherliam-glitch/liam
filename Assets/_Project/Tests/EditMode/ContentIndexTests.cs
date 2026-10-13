using Aetherfall.Data;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// The content lookup of Aetherfall.Data: <see cref="ContentIndex{T}"/> (stable string ids, first entry wins, order kept)
    /// and the id rules of architecture 6.1 (<see cref="ContentIdRules"/>: lower case, digits, underscore, 2–7 segments).
    /// </summary>
    [TestFixture]
    public sealed class ContentIndexTests
    {
        [Test]
        public void TryAdd_RejectsDuplicatesEmptyIdsAndNull()
        {
            var index = new ContentIndex<string>();

            Assert.That(index.TryAdd("item.weapon.schwert", "a"), Is.True);
            Assert.That(index.TryAdd("item.weapon.schwert", "b"), Is.False);
            Assert.That(index.TryAdd(string.Empty, "c"), Is.False);
            Assert.That(index.TryAdd("item.weapon.axt", null), Is.False);
            Assert.That(index.Count, Is.EqualTo(1));
            Assert.That(index.TryGet("item.weapon.schwert", out string value), Is.True);
            Assert.That(value, Is.EqualTo("a"), "the first entry wins");
        }

        [Test]
        public void Lookup_IsCaseSensitive_AndKeepsTheOrder()
        {
            var index = new ContentIndex<string>();
            index.TryAdd("loot.chest.holz", "holz");
            index.TryAdd("loot.chest.eisen", "eisen");

            Assert.That(index.Contains("loot.chest.eisen"), Is.True);
            Assert.That(index.Contains("Loot.Chest.Eisen"), Is.False);
            Assert.That(index.TryGet(null, out string missing), Is.False);
            Assert.That(missing, Is.Null);
            Assert.That(index.Entries[0], Is.EqualTo("holz"));
            Assert.That(index.Entries[1], Is.EqualTo("eisen"));

            index.Clear();
            Assert.That(index.Count, Is.EqualTo(0));
            Assert.That(index.Contains("loot.chest.holz"), Is.False);
        }

        [TestCase("item.weapon.einhandschwert_eisen", true)]
        [TestCase("loot.enemy.wolf.grauwolf", true)]
        [TestCase("affix.scharf", true)]
        [TestCase("obj.test.truhe_holz", true)]
        [TestCase("item", false)]
        [TestCase("Item.weapon.x", false)]
        [TestCase("item..x", false)]
        [TestCase("item.x.", false)]
        [TestCase("item.wolfsfell-grau", false)]
        [TestCase("item.wölfe", false)]
        [TestCase("1item.x", false)]
        [TestCase("a.b.c.d.e.f.g.h", false)]
        [TestCase("", false)]
        [TestCase(null, false)]
        public void IdRules(string id, bool valid)
        {
            Assert.That(ContentIdRules.IsValid(id), Is.EqualTo(valid));
        }
    }
}
