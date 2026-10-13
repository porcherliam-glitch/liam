using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>
    /// Pure rules of the save system: save permission per game state (table 4.4), blockers (9.8), slot ids and rotation
    /// (GDD 05 5.1), quick load confirmation (GDD 05 5.4).
    /// </summary>
    [TestFixture]
    public sealed class SaveRulesTests
    {
        [TestCase(GameState.Playing, true)]
        [TestCase(GameState.Menu, true)]
        [TestCase(GameState.Paused, true)]
        [TestCase(GameState.Building, true)]
        [TestCase(GameState.Dialogue, false)]
        [TestCase(GameState.Cutscene, false)]
        [TestCase(GameState.Loading, false)]
        [TestCase(GameState.Boot, false)]
        [TestCase(GameState.MainMenu, false)]
        public void SaveAllowed_FollowsTable44(GameState state, bool allowed)
        {
            Assert.That(SavePermissionRules.IsSaveAllowedInState(state), Is.EqualTo(allowed));
        }

        [TestCase(GameState.Playing, true)]
        [TestCase(GameState.Paused, true)]
        [TestCase(GameState.MainMenu, true)]
        [TestCase(GameState.Loading, true)]
        [TestCase(GameState.Menu, false)]
        [TestCase(GameState.Dialogue, false)]
        public void CanStartLoad_FollowsTheTransitionTable(GameState state, bool allowed)
        {
            Assert.That(SavePermissionRules.CanStartLoad(state), Is.EqualTo(allowed));
        }

        [Test]
        public void ReasonKeys_NameTheState()
        {
            Assert.That(SaveReasonKeys.ForState(GameState.Dialogue), Is.EqualTo("save.blocked.state.dialogue"));
            Assert.That(SaveReasonKeys.ToGermanText(SaveReasonKeys.Combat), Does.Contain("Kampf"));
            Assert.That(SaveReasonKeys.ToGermanText("unknown.key"), Is.EqualTo("unknown.key"));
        }

        [Test]
        public void Blockers_KeepTheOldestReasonFirst()
        {
            var blockers = new SaveBlockerSet();
            Assert.That(blockers.TryGetFirstReason(out _), Is.False);

            blockers.Add("player.falling", "save.blocked.falling");
            blockers.Add("world.arena", "save.blocked.arena");
            blockers.Add("player.falling", "save.blocked.jumping");

            Assert.That(blockers.Count, Is.EqualTo(2));
            Assert.That(blockers.TryGetFirstReason(out string reason), Is.True);
            Assert.That(reason, Is.EqualTo("save.blocked.jumping"), "updated reason keeps its position");
            Assert.That(blockers.Remove("player.falling"), Is.True);
            blockers.TryGetFirstReason(out reason);
            Assert.That(reason, Is.EqualTo("save.blocked.arena"));
            Assert.That(blockers.Remove("player.falling"), Is.False);
        }

        [TestCase("char_01/quick_0", true)]
        [TestCase("char_01/manual_001", true)]
        [TestCase("char_01", false)]
        [TestCase("char_01/", false)]
        [TestCase("/quick_0", false)]
        [TestCase("char_01/../../etc", false)]
        [TestCase("Char_01/quick_0", false)]
        [TestCase("a/b/c", false)]
        [TestCase("", false)]
        public void SlotIds_AreValidatedForSafeFileNames(string slotId, bool valid)
        {
            Assert.That(SaveSlotId.TryParse(slotId, out _, out _), Is.EqualTo(valid));
        }

        private static SaveSlotInfo Slot(string name, string created, string kind = null, long sequence = 0)
        {
            var header = new SaveHeader { CreatedUtc = created, Kind = kind ?? name.Substring(0, name.IndexOf('_')), SaveSequence = sequence };
            return new SaveSlotInfo("char_01", name, header, false);
        }

        [Test]
        public void SavesOfTheSameSecond_AreOrderedByTheSaveSequence()
        {
            var slots = new List<SaveSlotInfo>
            {
                Slot("quick_0", "2026-10-13T10:00:00Z", sequence: 4),
                Slot("quick_1", "2026-10-13T10:00:00Z", sequence: 5),
                Slot("quick_2", "2026-10-13T10:00:00Z", sequence: 3)
            };

            Assert.That(SaveSlotRotation.FindLatest(slots, SaveKind.Quick).SlotName, Is.EqualTo("quick_1"));
            Assert.That(SaveSlotRotation.ChooseRotating(SaveKind.Quick, slots), Is.EqualTo("quick_2"), "oldest");
            Assert.That(SaveSlotRotation.CompareCreation(slots[0], slots[1]), Is.LessThan(0));
            Assert.That(SaveSlotRotation.CompareCreation(Slot("auto_0", "2026-10-13T10:00:01Z"), slots[1]), Is.GreaterThan(0), "the time comes first");
            Assert.That(SaveSlotRotation.NextSequence(slots), Is.EqualTo(6L));
            Assert.That(SaveSlotRotation.NextSequence(new List<SaveSlotInfo>()), Is.EqualTo(0L), "first save of a character");
            Assert.That(SaveSlotRotation.NextSequence(new List<SaveSlotInfo> { new SaveSlotInfo("char_01", "auto_0", null, false) }), Is.EqualTo(0L));
        }

        [Test]
        public void SlotWithoutMainFileAndBackup_IsDamaged_SkippedAndOverwrittenFirst()
        {
            var gone = new SaveSlotInfo("char_01", "quick_1", new SaveHeader { CreatedUtc = "2026-10-13T12:00:00Z", Kind = "quick" }, false, false);
            var backupOnly = new SaveSlotInfo("char_01", "quick_2", new SaveHeader { CreatedUtc = "2026-10-13T11:00:00Z", Kind = "quick" }, true, false);
            var slots = new List<SaveSlotInfo> { Slot("quick_0", "2026-10-13T10:00:00Z"), gone, backupOnly };

            Assert.That(gone.IsDamaged, Is.True, "main file moved to Beschaedigt/, no backup");
            Assert.That(backupOnly.IsDamaged, Is.False, "the backup can still be loaded");
            Assert.That(SaveSlotRotation.FindLatest(slots, SaveKind.Quick).SlotName, Is.EqualTo("quick_2"));
            Assert.That(SaveSlotRotation.ChooseRotating(SaveKind.Quick, slots), Is.EqualTo("quick_1"));
        }

        [Test]
        public void StateReasonKeys_ArePrefixPlusStateName_ForEveryState()
        {
            foreach (GameState state in Enum.GetValues(typeof(GameState)))
            {
                Assert.That(SaveReasonKeys.ForState(state), Is.EqualTo(SaveReasonKeys.StatePrefix + state.ToString().ToLowerInvariant()));
            }

            Assert.That(SaveReasonKeys.Falling, Is.EqualTo("save.blocked.falling"));
            Assert.That(SaveReasonKeys.ToGermanText(SaveReasonKeys.Falling), Is.EqualTo("Speichern beim Fallen oder Springen nicht möglich"));
        }

        [Test]
        public void Rotation_FillsFreeSlotsFirst_ThenOverwritesTheOldest()
        {
            var slots = new List<SaveSlotInfo>();
            Assert.That(SaveSlotRotation.ChooseRotating(SaveKind.Quick, slots), Is.EqualTo("quick_0"));

            slots.Add(Slot("quick_0", "2026-10-13T10:00:00Z"));
            slots.Add(Slot("quick_2", "2026-10-13T09:00:00Z"));
            Assert.That(SaveSlotRotation.ChooseRotating(SaveKind.Quick, slots), Is.EqualTo("quick_1"));

            slots.Add(Slot("quick_1", "2026-10-13T11:00:00Z"));
            Assert.That(SaveSlotRotation.ChooseRotating(SaveKind.Quick, slots), Is.EqualTo("quick_2"), "oldest");

            slots.Add(new SaveSlotInfo("char_01", "auto_0", null, false));
            Assert.That(SaveSlotRotation.ChooseRotating(SaveKind.Auto, slots), Is.EqualTo("auto_1"));
        }

        [Test]
        public void DamagedRotatingSlot_IsOverwrittenFirst()
        {
            var slots = new List<SaveSlotInfo>
            {
                Slot("auto_0", "2026-10-13T10:00:00Z"),
                new SaveSlotInfo("char_01", "auto_1", null, true),
                Slot("auto_2", "2026-10-13T09:00:00Z")
            };

            Assert.That(SaveSlotRotation.ChooseRotating(SaveKind.Auto, slots), Is.EqualTo("auto_1"));
            Assert.That(slots[1].IsDamaged, Is.True);
            Assert.That(slots[1].Kind, Is.EqualTo(SaveKind.Auto), "kind from the name prefix");
        }

        [Test]
        public void ManualAndMilestoneSlots_AreNumbered_AndManualIsLimitedTo99()
        {
            var slots = new List<SaveSlotInfo> { Slot("manual_001", "a"), Slot("manual_007", "b") };

            Assert.That(SaveSlotRotation.ChooseSlot(SaveRequest.Manual(), slots), Is.EqualTo("manual_008"));
            Assert.That(SaveSlotRotation.ChooseSlot(SaveRequest.Manual("vor_dem_boss"), slots), Is.EqualTo("vor_dem_boss"));
            Assert.That(SaveSlotRotation.ChooseSlot(SaveRequest.Manual("Vor dem Boss"), slots), Is.Null, "invalid name");
            Assert.That(SaveSlotRotation.ChooseSlot(SaveRequest.Milestone(), slots), Is.EqualTo("milestone_001"));

            var full = new List<SaveSlotInfo>();
            for (int i = 1; i <= SaveSlotRotation.MaxManualSlots; i++)
            {
                full.Add(Slot("manual_" + i.ToString("000"), "x"));
            }

            Assert.That(SaveSlotRotation.ChooseSlot(SaveRequest.Manual(), full), Is.Null);
        }

        [Test]
        public void FindLatest_ByKindAndOverall()
        {
            var slots = new List<SaveSlotInfo>
            {
                Slot("quick_0", "2026-10-13T10:00:00Z"),
                Slot("quick_1", "2026-10-13T12:00:00Z"),
                Slot("auto_0", "2026-10-13T13:00:00Z"),
                new SaveSlotInfo("char_01", "quick_2", null, false)
            };

            Assert.That(SaveSlotRotation.FindLatest(slots, SaveKind.Quick).SlotName, Is.EqualTo("quick_1"));
            Assert.That(SaveSlotRotation.FindLatest(slots, null).SlotName, Is.EqualTo("auto_0"));
            Assert.That(SaveSlotRotation.FindLatest(slots, SaveKind.Milestone), Is.Null);
        }

        [Test]
        public void QuickLoad_NeedsASecondPressWithinTheWindow()
        {
            var confirmation = new QuickLoadConfirmation(3f);

            Assert.That(confirmation.Press(10f), Is.False, "first press only asks");
            Assert.That(confirmation.IsPending(11f), Is.True);
            Assert.That(confirmation.Press(12.5f), Is.True, "second press within 3 s confirms");
            Assert.That(confirmation.IsPending(12.6f), Is.False);

            Assert.That(confirmation.Press(20f), Is.False);
            Assert.That(confirmation.Press(23.5f), Is.False, "too late: asks again");
            confirmation.Cancel();
            Assert.That(confirmation.IsPending(23.6f), Is.False);
        }

        [Test]
        public void SaveKindIds_RoundTrip()
        {
            foreach (SaveKind kind in new[] { SaveKind.Manual, SaveKind.Auto, SaveKind.Quick, SaveKind.Milestone })
            {
                Assert.That(SaveKindIds.TryParse(SaveKindIds.ToId(kind), out SaveKind parsed), Is.True);
                Assert.That(parsed, Is.EqualTo(kind));
            }

            Assert.That(SaveKindIds.TryParse("nope", out _), Is.False);
        }
    }
}
