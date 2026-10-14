using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>Unit tests for <see cref="UiNavigationController"/>: A = confirm, B = back, LB/RB = tabs, hold, adjust.</summary>
    [TestFixture]
    public sealed class UiNavigationControllerTests
    {
        private UiNavigationController _controller;
        private FakeScreen _screen;

        [SetUp]
        public void SetUp()
        {
            _controller = new UiNavigationController(new NavigationRepeater(), new HoldToConfirm(1f));
            _screen = new FakeScreen("test", 4);
        }

        [Test]
        public void Down_MovesTheFocus_AndReportsTheChange()
        {
            UiNavResult result = _controller.Process(_screen, Frame(y: -1f), 0.016f);

            Assert.That(result, Is.EqualTo(UiNavResult.Moved));
            Assert.That(_screen.Focus.Current, Is.EqualTo(1));
            Assert.That(_screen.FocusChanges.Count, Is.EqualTo(1));
            Assert.That(_screen.FocusChanges[0].Key, Is.EqualTo(0));
            Assert.That(_screen.FocusChanges[0].Value, Is.EqualTo(1));
        }

        [Test]
        public void Submit_ConfirmsTheFocusedItem()
        {
            _screen.Focus.SetCurrent(2);
            UiInputFrame frame = Frame();
            frame.SubmitPressed = true;

            Assert.That(_controller.Process(_screen, frame, 0.016f), Is.EqualTo(UiNavResult.Submitted));
            Assert.That(_screen.Submitted, Is.EqualTo(new[] { 2 }));
        }

        [Test]
        public void Cancel_AsksTheScreen_AndCloseWhenItWantsToClose()
        {
            UiInputFrame frame = Frame();
            frame.CancelPressed = true;
            Assert.That(_controller.Process(_screen, frame, 0.016f), Is.EqualTo(UiNavResult.CloseRequested));

            _screen.BackResult = BackOutcome.Handled;
            Assert.That(_controller.Process(_screen, frame, 0.016f), Is.EqualTo(UiNavResult.BackHandled));
            _screen.BackResult = BackOutcome.Ignored;
            Assert.That(_controller.Process(_screen, frame, 0.016f), Is.EqualTo(UiNavResult.None));
            Assert.That(_screen.Backs, Is.EqualTo(new[] { false, false, false }));
        }

        [Test]
        public void EscPressesBackAndClose_BackWins()
        {
            UiInputFrame frame = Frame();
            frame.CancelPressed = true;
            frame.CloseHubPressed = true;
            _controller.Process(_screen, frame, 0.016f);

            frame.CancelPressed = false;
            _controller.Process(_screen, frame, 0.016f);

            Assert.That(_screen.Backs, Is.EqualTo(new[] { false, true }), "Esc = one step back; Start = close");
        }

        [Test]
        public void Tabs_GoToTheScreen()
        {
            UiInputFrame frame = Frame();
            frame.TabDelta = 1;
            Assert.That(_controller.Process(_screen, frame, 0.016f), Is.EqualTo(UiNavResult.TabChanged));
            frame.TabDelta = -1;
            _controller.Process(_screen, frame, 0.016f);
            Assert.That(_screen.Tabs, Is.EqualTo(new[] { 1, -1 }));
        }

        [Test]
        public void SubTabs_GoToTheScreen_AsSteps()
        {
            UiInputFrame frame = Frame();
            frame.SubTabDelta = 1;
            Assert.That(_controller.Process(_screen, frame, 0.016f), Is.EqualTo(UiNavResult.SubTabChanged));
            frame.SubTabDelta = -3;
            _controller.Process(_screen, frame, 0.016f);

            Assert.That(_screen.SubTabs, Is.EqualTo(new[] { 1, -1 }), "LT/RT move one category per press");
            Assert.That(_screen.Tabs, Is.Empty);
        }

        [Test]
        public void Secondary_GoesToTheScreen_WithTheFocusedItem()
        {
            _screen.Focus.SetCurrent(3);
            UiInputFrame frame = Frame();
            frame.SecondaryPressed = true;

            Assert.That(_controller.Process(_screen, frame, 0.016f), Is.EqualTo(UiNavResult.Secondary));
            Assert.That(_screen.Secondaries, Is.EqualTo(new[] { 3 }));
            Assert.That(_screen.Submitted, Is.Empty, "X does not confirm");
        }

        [Test]
        public void Back_WinsOverTabsAndSecondary_InTheSameFrame()
        {
            UiInputFrame frame = Frame();
            frame.CancelPressed = true;
            frame.SubTabDelta = 1;
            frame.SecondaryPressed = true;

            _controller.Process(_screen, frame, 0.016f);

            Assert.That(_screen.Backs.Count, Is.EqualTo(1));
            Assert.That(_screen.SubTabs, Is.Empty);
            Assert.That(_screen.Secondaries, Is.Empty);
        }

        [Test]
        public void LeftRight_OnAValueItem_Adjusts_OtherwiseNothing()
        {
            _screen.AdjustsFirstItem = true;
            Assert.That(_controller.Process(_screen, Frame(x: 1f), 0.016f), Is.EqualTo(UiNavResult.Adjusted));
            Assert.That(_screen.Adjusts.Count, Is.EqualTo(1));
            Assert.That(_screen.Adjusts[0].Value, Is.EqualTo(1));

            _controller.Process(_screen, Frame(), 0.016f);
            _screen.Focus.SetCurrent(1);
            Assert.That(_controller.Process(_screen, Frame(x: -1f), 0.016f), Is.EqualTo(UiNavResult.None));
            Assert.That(_screen.Focus.Current, Is.EqualTo(1), "a vertical list does not move left/right");
        }

        [Test]
        public void HoldItem_ConfirmsOnlyAfterHoldingOneSecond()
        {
            _screen.MakeHold(0);
            UiInputFrame press = Frame();
            press.SubmitPressed = true;
            press.SubmitHeld = true;
            UiInputFrame held = Frame();
            held.SubmitHeld = true;

            Assert.That(_controller.Process(_screen, press, 0.125f), Is.EqualTo(UiNavResult.Holding));
            for (int i = 0; i < 6; i++)
            {
                _controller.Process(_screen, held, 0.125f);
            }

            Assert.That(_screen.Submitted, Is.Empty, "0.875 s are not enough");
            Assert.That(_controller.Process(_screen, held, 0.125f), Is.EqualTo(UiNavResult.Submitted));
            Assert.That(_screen.Submitted, Is.EqualTo(new[] { 0 }));
            Assert.That(_screen.HoldValues[_screen.HoldValues.Count - 1], Is.EqualTo(0f), "the bar is reset after confirming");
        }

        [Test]
        public void HoldItem_ReleasedEarly_DoesNotConfirm()
        {
            _screen.MakeHold(0);
            UiInputFrame press = Frame();
            press.SubmitPressed = true;
            press.SubmitHeld = true;
            _controller.Process(_screen, press, 0.5f);

            _controller.Process(_screen, Frame(), 0.5f);
            _controller.Process(_screen, Frame(), 0.5f);

            Assert.That(_screen.Submitted, Is.Empty);
            Assert.That(_screen.HoldValues[_screen.HoldValues.Count - 1], Is.EqualTo(0f));
        }

        [Test]
        public void HoldItem_MovingAwayCancelsTheHold()
        {
            _screen.MakeHold(0);
            UiInputFrame press = Frame();
            press.SubmitPressed = true;
            press.SubmitHeld = true;
            _controller.Process(_screen, press, 0.5f);
            UiInputFrame moveWhileHeld = Frame(y: -1f);
            moveWhileHeld.SubmitHeld = true;
            _controller.Process(_screen, moveWhileHeld, 0.6f);

            Assert.That(_screen.Submitted, Is.Empty);
            Assert.That(_controller.Hold.IsHolding, Is.False);
        }

        [Test]
        public void PointerHold_ConfirmsWithTheMouseButton()
        {
            _screen.MakeHold(1);
            _screen.Focus.SetCurrent(1);
            _controller.BeginPointerHold(_screen, 1);
            UiInputFrame frame = Frame();
            frame.PointerHoldIndex = 1;

            _controller.Process(_screen, frame, 0.6f);
            UiNavResult result = _controller.Process(_screen, frame, 0.6f);

            Assert.That(result, Is.EqualTo(UiNavResult.Submitted));
            Assert.That(_screen.Submitted, Is.EqualTo(new[] { 1 }));
        }

        [Test]
        public void NullScreen_DoesNothing()
        {
            Assert.That(_controller.Process(null, Frame(y: 1f), 0.016f), Is.EqualTo(UiNavResult.None));
        }

        private static UiInputFrame Frame(float x = 0f, float y = 0f)
        {
            var frame = new UiInputFrame();
            frame.Clear();
            frame.NavigateX = x;
            frame.NavigateY = y;
            return frame;
        }
    }
}
