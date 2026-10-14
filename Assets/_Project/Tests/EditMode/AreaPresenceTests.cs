using System.Collections.Generic;
using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// The visit logic of location zones (<see cref="AreaPresence{TKey}"/>): one AreaEntered per visit, even with several
    /// colliders; the same collider entering twice (CharacterController re-enabled in place) counts once; a collider whose exit
    /// never came (teleported away, disabled, destroyed) is pruned, so the next visit sends AreaEntered again.
    /// </summary>
    [TestFixture]
    public sealed class AreaPresenceTests
    {
        private sealed class FakeCollider
        {
            public bool Inside = true;

            // Like Unity objects: an overloaded Equals must never merge two colliders.
            public override bool Equals(object obj)
            {
                return obj is FakeCollider;
            }

            public override int GetHashCode()
            {
                return 1;
            }
        }

        private static bool StillInside(FakeCollider collider)
        {
            return collider.Inside;
        }

        [Test]
        public void FirstColliderStartsTheVisit()
        {
            var presence = new AreaPresence<FakeCollider>();
            var body = new FakeCollider();
            var feet = new FakeCollider();

            Assert.That(presence.Enter(body), Is.True);
            Assert.That(presence.IsInside, Is.True);
            Assert.That(presence.Enter(feet), Is.False, "a second collider of the same player");
            Assert.That(presence.Count, Is.EqualTo(2), "colliders are told apart by reference");
            Assert.That(presence.Exit(body), Is.False);
            Assert.That(presence.Exit(feet), Is.True, "the last collider left");
            Assert.That(presence.IsInside, Is.False);
            Assert.That(presence.Enter(body), Is.True, "a new visit");
        }

        [Test]
        public void ExitWithoutEnter_NullAndReset()
        {
            var presence = new AreaPresence<FakeCollider>();
            var body = new FakeCollider();

            Assert.That(presence.Exit(body), Is.False);
            Assert.That(presence.Enter(null), Is.False);
            Assert.That(presence.Exit(null), Is.False);
            Assert.That(presence.IsInside, Is.False);
            presence.Enter(body);
            presence.Reset();
            Assert.That(presence.IsInside, Is.False);
            Assert.That(presence.Enter(body), Is.True);
        }

        [Test]
        public void SameColliderEnteringTwice_CountsOnce()
        {
            // Quick load at the same spot: the CharacterController is disabled and enabled again, Unity sends a second
            // OnTriggerEnter without an exit in between.
            var presence = new AreaPresence<FakeCollider>();
            var body = new FakeCollider();

            Assert.That(presence.Enter(body), Is.True);
            Assert.That(presence.Enter(body), Is.False, "no second AreaEntered");
            Assert.That(presence.Count, Is.EqualTo(1));
            Assert.That(presence.Exit(body), Is.True, "one exit ends the visit");
            Assert.That(presence.Enter(body), Is.True);
        }

        [Test]
        public void TeleportOutWithoutExit_NextEnterSendsAgain()
        {
            var presence = new AreaPresence<FakeCollider>();
            var body = new FakeCollider();
            presence.Enter(body);

            // Teleport away (load, respawn): no OnTriggerExit; the next fixed update sees the collider outside.
            body.Inside = false;
            Assert.That(presence.Prune(StillInside), Is.True, "the visit ended");
            Assert.That(presence.IsInside, Is.False);

            // Back into the zone: OnTriggerEnter must start a new visit (with a pure counter it stayed at 2 forever).
            body.Inside = true;
            Assert.That(presence.Enter(body), Is.True);
        }

        [Test]
        public void Prune_KeepsCollidersThatAreStillInside()
        {
            var presence = new AreaPresence<FakeCollider>();
            var body = new FakeCollider();
            var gone = new FakeCollider();
            presence.Enter(body);
            presence.Enter(gone);

            Assert.That(presence.Prune(StillInside), Is.False, "nothing changed");
            gone.Inside = false;
            Assert.That(presence.Prune(StillInside), Is.False, "the body is still inside: the visit goes on");
            Assert.That(presence.Count, Is.EqualTo(1));
            Assert.That(presence.Exit(gone), Is.False, "already pruned");
            Assert.That(presence.Exit(body), Is.True);
            Assert.That(presence.Prune(StillInside), Is.False, "empty: nothing to prune");
            Assert.That(presence.Prune(null), Is.False);
        }

        [Test]
        public void Prune_CanBeCalledEveryFixedUpdate()
        {
            var presence = new AreaPresence<FakeCollider>();
            var colliders = new List<FakeCollider> { new FakeCollider(), new FakeCollider(), new FakeCollider() };
            for (int i = 0; i < colliders.Count; i++)
            {
                presence.Enter(colliders[i]);
            }

            for (int step = 0; step < 100; step++)
            {
                Assert.That(presence.Prune(StillInside), Is.False);
            }

            for (int i = 0; i < colliders.Count; i++)
            {
                colliders[i].Inside = false;
            }

            Assert.That(presence.Prune(StillInside), Is.True);
            Assert.That(presence.Count, Is.EqualTo(0));
        }
    }
}
