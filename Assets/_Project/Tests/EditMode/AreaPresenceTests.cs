using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>The visit logic of location zones (<see cref="AreaPresence"/>): one AreaEntered per visit, even with several colliders.</summary>
    [TestFixture]
    public sealed class AreaPresenceTests
    {
        [Test]
        public void FirstColliderStartsTheVisit()
        {
            var presence = new AreaPresence();

            Assert.That(presence.Enter(), Is.True);
            Assert.That(presence.IsInside, Is.True);
            Assert.That(presence.Enter(), Is.False, "a second collider of the same player");
            Assert.That(presence.Exit(), Is.False);
            Assert.That(presence.Exit(), Is.True, "the last collider left");
            Assert.That(presence.IsInside, Is.False);
            Assert.That(presence.Enter(), Is.True, "a new visit");
        }

        [Test]
        public void ExitWithoutEnter_AndReset()
        {
            var presence = new AreaPresence();

            Assert.That(presence.Exit(), Is.False);
            presence.Enter();
            presence.Reset();
            Assert.That(presence.IsInside, Is.False);
            Assert.That(presence.Enter(), Is.True);
        }
    }
}
