using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Tests.Shared;
using Aetherfall.World.Dungeons;
using Aetherfall.World.Puzzles;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gruft
{
    /// <summary>
    /// World object states (architecture 9.7): the store, the service that records solved puzzles and beaten bosses
    /// ("besiegt bleibt besiegt"), the door rules of the crypt and the arrival anchors of scene changes.
    /// </summary>
    [TestFixture]
    public sealed class WorldObjectStateTests
    {
        [Test]
        public void StoreKeepsOnlyNonZeroStatesAndReportsChanges()
        {
            var store = new WorldObjectStateStore();
            var changed = new List<string>();
            store.StateChanged += changed.Add;

            Assert.That(store.SetState("obj.a", WorldObjectStates.Done), Is.True);
            Assert.That(store.SetState("obj.a", WorldObjectStates.Done), Is.False, "same value: no change");
            Assert.That(store.GetState("obj.a"), Is.EqualTo(1));
            Assert.That(store.SetState("obj.a", WorldObjectStates.Initial), Is.True);
            Assert.That(store.Count, Is.EqualTo(0), "0 is not stored");
            Assert.That(store.GetState("obj.unbekannt"), Is.EqualTo(0));
            Assert.That(changed, Is.EqualTo(new[] { "obj.a", "obj.a" }));
        }

        [Test]
        public void SnapshotAndRestoreRoundTrip()
        {
            var store = new WorldObjectStateStore();
            store.SetState("puzzle.x", 1);
            store.SetState("obj.spiegel", WorldObjectStates.FromDirection(GridDirection.West));
            Dictionary<string, int> snapshot = store.Snapshot();
            int replaced = 0;
            var other = new WorldObjectStateStore();
            other.StatesReplaced += () => replaced++;

            other.Restore(snapshot);

            Assert.That(replaced, Is.EqualTo(1));
            Assert.That(other.GetState("puzzle.x"), Is.EqualTo(1));
            Assert.That(other.GetState("obj.spiegel"), Is.EqualTo(4));
            other.Restore(null);
            Assert.That(other.Count, Is.EqualTo(0), "new game: everything back to the start");
        }

        [Test]
        public void ServiceRecordsSolvedPuzzlesAndBeatenBossesAndPublishesChanges()
        {
            using (var bus = new EventBus())
            using (var changes = new EventRecorder<WorldObjectStateChanged>(bus))
            {
                var service = new WorldObjectStateService(bus);
                service.PostInitialize();

                var solved = new PuzzleSolved("puzzle.eichental.gruft_grabplatten");
                bus.Publish(in solved);
                var defeated = new BossDefeated("boss.eichental.wachender_ritter");
                bus.Publish(in defeated);

                Assert.That(service.GetState("puzzle.eichental.gruft_grabplatten"), Is.EqualTo(WorldObjectStates.Done));
                Assert.That(service.GetState("boss.eichental.wachender_ritter"), Is.EqualTo(WorldObjectStates.Done));
                Assert.That(changes.Count, Is.EqualTo(2));
                Assert.That(changes.Last.ObjectId, Is.EqualTo("boss.eichental.wachender_ritter"));

                service.EndSession();
                Assert.That(service.Count, Is.EqualTo(0), "main menu: the states of the session are gone");
                service.Dispose();
                bus.Publish(in solved);
                Assert.That(service.Count, Is.EqualTo(0), "no longer subscribed after Dispose");
            }
        }

        [Test]
        public void DoorRulesFollowTheirTrigger()
        {
            const int done = WorldObjectStates.Done;
            Assert.That(WorldDoorRules.IsOpen(DoorTriggerKind.PuzzleSolved, 0, done, false, 0, false), Is.False);
            Assert.That(WorldDoorRules.IsOpen(DoorTriggerKind.PuzzleSolved, done, done, false, 0, false), Is.True, "gate of the crypt");
            Assert.That(WorldDoorRules.IsOpen(DoorTriggerKind.ObjectState, done, done, false, 0, false), Is.True, "hidden door after the cage");
            Assert.That(WorldDoorRules.IsOpen(DoorTriggerKind.ObjectState, 2, done, false, 0, false), Is.False);
            Assert.That(WorldDoorRules.IsOpen(DoorTriggerKind.Lever, done, done, false, 0, false), Is.True);
            Assert.That(WorldDoorRules.IsOpen(DoorTriggerKind.BossDefeated, 0, done, false, 0, false), Is.False, "escape route stays shut");
            Assert.That(WorldDoorRules.IsOpen(DoorTriggerKind.Manual, 0, done, true, 0, false), Is.True);
        }

        [Test]
        public void ArenaGateClosesOnlyWhileTheFightRuns()
        {
            Assert.That(WorldDoorRules.IsOpen(DoorTriggerKind.BossArena, 0, 1, true, 0, false), Is.True, "open before the fight");
            Assert.That(WorldDoorRules.IsOpen(DoorTriggerKind.BossArena, 0, 1, true, 0, true), Is.False, "GDD 03 9.6: arena closed");
            Assert.That(WorldDoorRules.IsOpen(DoorTriggerKind.BossArena, 1, 1, true, 0, true), Is.True, "boss beaten");
        }

        [Test]
        public void OwnDoorStateOverridesTheRule()
        {
            Assert.That(WorldDoorRules.IsOpen(DoorTriggerKind.PuzzleSolved, 0, 1, false, WorldObjectStates.Done, false), Is.True, "quest action: open");
            Assert.That(WorldDoorRules.IsOpen(DoorTriggerKind.PuzzleSolved, 1, 1, false, WorldObjectStates.Closed, false), Is.False, "quest action: closed");
        }

        [Test]
        public void TravelServiceHandsTheAnchorToTheRightSceneOnce()
        {
            var travel = new WorldTravelService();
            travel.SetPendingAnchor("anchor.eichental.gruft_eingang");

            Assert.That(travel.TryConsume("anchor.gruft.eingang"), Is.False, "another anchor");
            Assert.That(travel.TryConsume("anchor.eichental.gruft_eingang"), Is.True);
            Assert.That(travel.TryConsume("anchor.eichental.gruft_eingang"), Is.False, "only once");
            travel.SetPendingAnchor("anchor.gruft.eingang");
            travel.EndSession();
            Assert.That(travel.PendingAnchorId, Is.Empty);
        }
    }
}
