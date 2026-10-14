using Aetherfall.Events;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Payloads of the events added with the UI step (architecture 4.3: #26 XpGained, #27 LevelUp, ScreenOpened).</summary>
    [TestFixture]
    public sealed class ProgressionAndUiEventTests
    {
        [Test]
        public void XpGained_KeepsAmountAndSource_NullSourceBecomesEmpty()
        {
            var gained = new XpGained(50, null);
            Assert.That(gained.Amount, Is.EqualTo(50));
            Assert.That(gained.SourceId, Is.Empty);
            Assert.That(gained.ToString(), Does.Contain("50"));
        }

        [Test]
        public void LevelUp_KeepsTheNewLevel()
        {
            Assert.That(new LevelUp(7).NewLevel, Is.EqualTo(7));
        }

        [Test]
        public void ScreenOpened_KeepsTheScreenId()
        {
            Assert.That(new ScreenOpened("screen.pause").ScreenId, Is.EqualTo("screen.pause"));
            Assert.That(new ScreenOpened(null).ScreenId, Is.Empty);
        }
    }
}
