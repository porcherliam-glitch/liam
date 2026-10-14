using System.Collections.Generic;
using Aetherfall.Tests.Shared;
using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>
    /// Unit tests for <see cref="UIManager"/> (architecture 4.9): focus stack, input routing to the top screen, pointer
    /// focus/click/hold, layers, messages.
    /// </summary>
    [TestFixture]
    public sealed class UIManagerTests
    {
        private LogCapture _log;
        private FakeCommandSource _input;
        private double _now;
        private UIManager _manager;
        private FakeScreen _menu;
        private FakeScreen _dialog;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _input = new FakeCommandSource();
            _now = 100d;
            _manager = new UIManager(_input, () => _now);
            _menu = new FakeScreen("screen.menu", 3);
            _dialog = new FakeScreen("screen.dialog", 2);
            _manager.RegisterScreen(_menu);
            _manager.RegisterScreen(_dialog);
        }

        [TearDown]
        public void TearDown()
        {
            _manager.Dispose();
            _log.Dispose();
        }

        [Test]
        public void Open_PutsTheScreenOnTop_AndFocusesTheFirstItem()
        {
            var opened = new List<string>();
            _manager.ScreenOpened += s => opened.Add(s.ScreenId);

            FakeScreen screen = _manager.Open<FakeScreen>();

            Assert.That(screen, Is.SameAs(_menu));
            Assert.That(_manager.Top, Is.SameAs(_menu));
            Assert.That(_menu.IsOpen, Is.True);
            Assert.That(_menu.Focus.Current, Is.EqualTo(0));
            Assert.That(opened, Is.EqualTo(new[] { "screen.menu" }));
        }

        [Test]
        public void InputGoesOnlyToTheTopScreen_AndClosingReturnsTheFocusBelow()
        {
            _manager.Open(_menu);
            _manager.Tick(0.016f);
            _menu.Focus.SetCurrent(2);
            _manager.Open(_dialog);
            _manager.Tick(0.016f);

            _input.Next.SubmitPressed = true;
            _manager.Tick(0.016f);
            Assert.That(_dialog.Submitted, Is.EqualTo(new[] { 0 }));
            Assert.That(_menu.Submitted, Is.Empty);

            _manager.Close(_dialog);
            Assert.That(_manager.Top, Is.SameAs(_menu));
            Assert.That(_menu.Focus.Current, Is.EqualTo(2), "the menu still knows its focused item");
            _manager.Tick(0.016f);
            _input.Next.SubmitPressed = true;
            _manager.Tick(0.016f);
            Assert.That(_menu.Submitted, Is.EqualTo(new[] { 2 }));
        }

        [Test]
        public void TheFrameAScreenOpens_IgnoresInput()
        {
            _manager.Open(_menu);
            _input.Next.SubmitPressed = true;
            _manager.Tick(0.016f);
            Assert.That(_menu.Submitted, Is.Empty, "the press that opened the menu must not confirm it");
        }

        [Test]
        public void ADirectionHeldWhileAScreenOpensOrCloses_MovesTheFocusOnlyAfterItWasReleased()
        {
            // Walking forward (W / stick up) and pressing Esc: UI/Navigate reports "up" from the first frame on.
            _input.Sticky = true;
            _input.Next.NavigateY = 1f;
            _manager.Open(_menu);
            for (int i = 0; i < 60; i++)
            {
                _manager.Tick(1f / 60f);
            }

            Assert.That(_menu.Focus.Current, Is.EqualTo(0), "the held direction must not move the focus (also not after 0.4 s)");

            _input.Next.NavigateY = 0f;
            _manager.Tick(0.016f);
            _input.Next.NavigateY = -1f;
            _manager.Tick(0.016f);
            Assert.That(_menu.Focus.Current, Is.EqualTo(1), "after releasing, a new press moves the focus");

            // Still holding "down" while a dialog opens and closes again: the menu below does not move either.
            _manager.Open(_dialog);
            _manager.Tick(0.016f);
            _manager.Tick(0.016f);
            Assert.That(_dialog.Focus.Current, Is.EqualTo(0));
            _manager.Close(_dialog);
            _manager.Tick(0.016f);
            _manager.Tick(0.5f);
            Assert.That(_menu.Focus.Current, Is.EqualTo(1));
        }

        [Test]
        public void BackWithCloseResult_ClosesTheTopScreen()
        {
            _manager.Open(_menu);
            _manager.Tick(0.016f);
            _input.Next.CancelPressed = true;
            _manager.Tick(0.016f);
            Assert.That(_menu.IsOpen, Is.False);
            Assert.That(_menu.CloseCount, Is.EqualTo(1));
            Assert.That(_manager.Top, Is.Null);
        }

        [Test]
        public void Back_UsesTheScreenAnswer()
        {
            _manager.Open(_menu);
            _menu.BackResult = BackOutcome.Ignored;
            Assert.That(_manager.Back(), Is.False);
            Assert.That(_menu.IsOpen, Is.True);
            _menu.BackResult = BackOutcome.Close;
            Assert.That(_manager.Back(), Is.True);
            Assert.That(_menu.IsOpen, Is.False);
            Assert.That(_manager.Back(), Is.False);
        }

        [Test]
        public void InactiveInputMapOrBlocked_NoInputIsRead()
        {
            _manager.Open(_menu);
            _manager.Tick(0.016f);
            int reads = _input.ReadCount;
            _input.IsActive = false;
            _manager.Tick(0.016f);
            _input.IsActive = true;
            _manager.InputBlocked = true;
            _manager.Tick(0.016f);
            Assert.That(_input.ReadCount, Is.EqualTo(reads));
        }

        [Test]
        public void OpenScreensAreTicked()
        {
            _manager.Open(_menu);
            _manager.Tick(0.016f);
            _manager.Tick(0.016f);
            Assert.That(_menu.TickCount, Is.EqualTo(2));
            Assert.That(_dialog.TickCount, Is.EqualTo(0));
        }

        [Test]
        public void Hover_SetsTheFocus_OnlyOnTheTopScreen()
        {
            _manager.Open(_menu);
            _menu.Hover(2);
            Assert.That(_menu.Focus.Current, Is.EqualTo(2));

            _manager.Open(_dialog);
            _menu.Hover(1);
            Assert.That(_menu.Focus.Current, Is.EqualTo(2), "a covered screen does not react to the mouse");
        }

        [Test]
        public void Click_ConfirmsNormalItems_ButNotHoldItems()
        {
            _manager.Open(_menu);
            _menu.MakeHold(1);
            _menu.Click(2);
            _menu.Click(1);
            Assert.That(_menu.Submitted, Is.EqualTo(new[] { 2 }));
            Assert.That(_menu.Focus.Current, Is.EqualTo(2));
        }

        [Test]
        public void MouseHold_ConfirmsAHoldItemAfterTheDuration()
        {
            _manager.Open(_menu);
            _manager.Tick(0.016f);
            _menu.MakeHold(1);

            _menu.Press(1, true);
            _manager.Tick(0.5f);
            _manager.Tick(0.5f);
            _manager.Tick(0.1f);

            Assert.That(_menu.Submitted, Is.EqualTo(new[] { 1 }));
        }

        [Test]
        public void MouseHold_ReleasedEarly_DoesNotConfirm()
        {
            _manager.Open(_menu);
            _manager.Tick(0.016f);
            _menu.MakeHold(1);

            _menu.Press(1, true);
            _manager.Tick(0.5f);
            _menu.Press(1, false);
            _manager.Tick(0.5f);
            _manager.Tick(0.5f);

            Assert.That(_menu.Submitted, Is.Empty);
        }

        [Test]
        public void Layers_AreRememberedAndAppliedToTheHost()
        {
            _manager.SetLayerVisible(UILayer.Hud, false);
            var host = new RecordingLayerHost();
            _manager.AttachLayerHost(host);

            Assert.That(host.Visible[UILayer.Hud], Is.False);
            Assert.That(host.Visible[UILayer.Screens], Is.True);
            _manager.SetLayerVisible(UILayer.Loading, false);
            Assert.That(host.Visible[UILayer.Loading], Is.False);
            Assert.That(_manager.IsLayerVisible(UILayer.Loading), Is.False);
        }

        [Test]
        public void ShowToast_GoesThroughTheQueue()
        {
            _manager.ShowToast(Notification.Message(NotificationPriority.Progress, "Hallo"));
            _manager.Tick(0.016f);
            Assert.That(_manager.Notifications.Visible(NotificationPriority.Progress).Count, Is.EqualTo(1));
        }

        [Test]
        public void CloseAll_ClosesEveryScreen()
        {
            _manager.Open(_menu);
            _manager.Open(_dialog);
            _manager.CloseAll();
            Assert.That(_manager.OpenCount, Is.EqualTo(0));
            Assert.That(_menu.IsOpen || _dialog.IsOpen, Is.False);
        }

        private sealed class RecordingLayerHost : IUiLayerHost
        {
            public Dictionary<UILayer, bool> Visible { get; } = new Dictionary<UILayer, bool>();

            public void SetLayerVisible(UILayer layer, bool visible)
            {
                Visible[layer] = visible;
            }
        }
    }
}
