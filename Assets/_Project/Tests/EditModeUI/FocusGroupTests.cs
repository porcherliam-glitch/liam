using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>Unit tests for <see cref="FocusGroup"/> and <see cref="FocusMemory"/> (architecture 4.9, GDD 05 1.4).</summary>
    [TestFixture]
    public sealed class FocusGroupTests
    {
        [Test]
        public void NewGroup_FocusesTheFirstItem()
        {
            var group = new FocusGroup(3);
            Assert.That(group.Current, Is.EqualTo(0));
            Assert.That(group.HasFocus, Is.True);
        }

        [Test]
        public void EmptyGroup_HasNoFocus_AndMoveDoesNothing()
        {
            var group = new FocusGroup(0);
            Assert.That(group.Current, Is.EqualTo(-1));
            Assert.That(group.Move(NavDirection.Down), Is.False);
            Assert.That(group.FocusFirst(), Is.False);
        }

        [Test]
        public void Vertical_DownAndUp_WrapAround()
        {
            var group = new FocusGroup(3);
            Assert.That(group.Move(NavDirection.Down), Is.True);
            Assert.That(group.Move(NavDirection.Down), Is.True);
            Assert.That(group.Current, Is.EqualTo(2));
            Assert.That(group.Move(NavDirection.Down), Is.True);
            Assert.That(group.Current, Is.EqualTo(0));
            Assert.That(group.Move(NavDirection.Up), Is.True);
            Assert.That(group.Current, Is.EqualTo(2));
        }

        [Test]
        public void Vertical_LeftRight_DoNotMove()
        {
            var group = new FocusGroup(3);
            Assert.That(group.Move(NavDirection.Right), Is.False);
            Assert.That(group.Move(NavDirection.Left), Is.False);
            Assert.That(group.Current, Is.EqualTo(0));
        }

        [Test]
        public void WithoutWrap_StopsAtTheEnds()
        {
            var group = new FocusGroup(2, FocusLayout.Vertical, 1, false);
            Assert.That(group.Move(NavDirection.Up), Is.False);
            Assert.That(group.Move(NavDirection.Down), Is.True);
            Assert.That(group.Move(NavDirection.Down), Is.False);
            Assert.That(group.Current, Is.EqualTo(1));
        }

        [Test]
        public void DisabledItems_AreSkipped()
        {
            var group = new FocusGroup(4);
            group.SetEnabled(1, false);
            group.SetEnabled(2, false);
            Assert.That(group.Move(NavDirection.Down), Is.True);
            Assert.That(group.Current, Is.EqualTo(3));
            Assert.That(group.SetCurrent(1), Is.False);
        }

        [Test]
        public void DisablingTheFocusedItem_MovesTheFocusToTheSamePosition()
        {
            var group = new FocusGroup(3);
            group.SetCurrent(1);
            group.SetEnabled(1, false);
            Assert.That(group.Current, Is.EqualTo(2), "the next item at the same position, never into nothing");
            group.SetEnabled(2, false);
            Assert.That(group.Current, Is.EqualTo(0));
        }

        [Test]
        public void FirstItemDisabled_FocusFirstSkipsIt()
        {
            var group = new FocusGroup(3);
            group.SetEnabled(0, false);
            Assert.That(group.FocusFirst(), Is.True);
            Assert.That(group.Current, Is.EqualTo(1));
        }

        [Test]
        public void AllDisabled_NoFocus_EnableGivesFocusBack()
        {
            var group = new FocusGroup(2);
            group.SetEnabled(0, false);
            group.SetEnabled(1, false);
            Assert.That(group.HasFocus, Is.False);
            group.SetEnabled(1, true);
            Assert.That(group.Current, Is.EqualTo(1));
        }

        [Test]
        public void SetCount_ShrinkingList_KeepsTheFocusAtTheSamePosition()
        {
            var group = new FocusGroup(5);
            group.SetCurrent(4);
            group.SetCount(3);
            Assert.That(group.Current, Is.EqualTo(2));
            group.SetCount(0);
            Assert.That(group.Current, Is.EqualTo(-1));
            group.SetCount(2);
            Assert.That(group.IsEnabled(1), Is.True);
        }

        [Test]
        public void Restore_RemembersOrFallsBackToTheNearestItem()
        {
            var group = new FocusGroup(3);
            Assert.That(group.Restore(2), Is.True);
            Assert.That(group.Current, Is.EqualTo(2));
            group.SetEnabled(2, false);
            Assert.That(group.Restore(2), Is.True);
            Assert.That(group.Current, Is.EqualTo(1));
            Assert.That(group.Restore(99), Is.True);
            Assert.That(group.Current, Is.EqualTo(1));
        }

        [Test]
        public void Horizontal_RowMovesLeftRightOnly()
        {
            var group = new FocusGroup(3, FocusLayout.Horizontal);
            Assert.That(group.Move(NavDirection.Down), Is.False);
            Assert.That(group.Move(NavDirection.Right), Is.True);
            Assert.That(group.Current, Is.EqualTo(1));
        }

        [Test]
        public void Grid_MovesInRowsAndColumns_AndWrapsWithinThem()
        {
            // 3 columns, 7 items: rows 0-2, 3-5, 6.
            var group = new FocusGroup(7, FocusLayout.Grid, 3);
            Assert.That(group.Move(NavDirection.Down), Is.True);
            Assert.That(group.Current, Is.EqualTo(3));
            Assert.That(group.Move(NavDirection.Right), Is.True);
            Assert.That(group.Current, Is.EqualTo(4));
            Assert.That(group.Move(NavDirection.Right), Is.True);
            Assert.That(group.Move(NavDirection.Right), Is.True);
            Assert.That(group.Current, Is.EqualTo(3), "left/right wrap inside the row");
            group.SetCurrent(1);
            Assert.That(group.Move(NavDirection.Up), Is.True);
            Assert.That(group.Current, Is.EqualTo(4), "column 1 has no item in the last row, so up wraps to the row above");
            group.SetCurrent(0);
            Assert.That(group.Move(NavDirection.Up), Is.True);
            Assert.That(group.Current, Is.EqualTo(6));
        }

        [Test]
        public void FocusMemory_RemembersPerPage()
        {
            var memory = new FocusMemory();
            memory.Remember("system", 3);
            memory.Remember("load", 1);
            memory.Remember("x", -1);
            Assert.That(memory.Recall("system"), Is.EqualTo(3));
            Assert.That(memory.Recall("load"), Is.EqualTo(1));
            Assert.That(memory.Recall("x", 7), Is.EqualTo(7));
            memory.Clear();
            Assert.That(memory.Recall("system"), Is.EqualTo(0));
        }
    }
}
