using Aetherfall.Events;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Payload of the events #6, #7 and #11 (architecture 4.3) and the stable values of <see cref="SaveKind"/>.</summary>
    [TestFixture]
    public sealed class SaveAndCombatEventTests
    {
        [Test]
        public void GameSaved_KeepsPayload()
        {
            var evt = new GameSaved("char_01/quick_0", SaveKind.Quick, true);

            Assert.That(evt.SlotId, Is.EqualTo("char_01/quick_0"));
            Assert.That(evt.Kind, Is.EqualTo(SaveKind.Quick));
            Assert.That(evt.Success, Is.True);
            Assert.That(evt.ToString(), Does.Contain("quick_0"));
        }

        [Test]
        public void GameLoaded_KeepsPayload()
        {
            var evt = new GameLoaded("char_01/auto_2", 1);

            Assert.That(evt.SlotId, Is.EqualTo("char_01/auto_2"));
            Assert.That(evt.SaveVersion, Is.EqualTo(1));
        }

        [Test]
        public void CombatStateChanged_KeepsPayload()
        {
            Assert.That(new CombatStateChanged(true).InCombat, Is.True);
            Assert.That(new CombatStateChanged(false).InCombat, Is.False);
        }

        [Test]
        public void SaveKind_HasStableValues()
        {
            Assert.That((int)SaveKind.Manual, Is.EqualTo(0));
            Assert.That((int)SaveKind.Auto, Is.EqualTo(1));
            Assert.That((int)SaveKind.Quick, Is.EqualTo(2));
            Assert.That((int)SaveKind.Milestone, Is.EqualTo(3));
        }
    }
}
