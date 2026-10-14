using System;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// The own focus and navigation layer of architecture 4.9 / 12 (pure logic): applies one frame of UI input to the top
    /// screen. Order per frame: Back/Close, tabs, sub categories, secondary action, focus movement (with auto-repeat) or value
    /// change, confirm (directly or by holding for hold items). A = confirm and B = back without exception (§24.3, GDD 05 1.4).
    /// </summary>
    /// <remarks>
    /// Unity's own UI Toolkit navigation is not used: menu items are not focusable for UI Toolkit, so its navigation events
    /// find nothing to move to, and this controller is the only owner of the focus. The mouse works in parallel: hovering
    /// sets the focus and clicking confirms (wired by <see cref="UIScreen"/>).
    /// </remarks>
    public sealed class UiNavigationController
    {
        private readonly NavigationRepeater _repeater;
        private readonly HoldToConfirm _hold;
        private IUiScreenNode _holdScreen;

        /// <summary>Creates the controller.</summary>
        /// <param name="repeater">Auto-repeat of the navigation input.</param>
        /// <param name="hold">Hold-to-confirm timer.</param>
        public UiNavigationController(NavigationRepeater repeater, HoldToConfirm hold)
        {
            _repeater = repeater ?? throw new ArgumentNullException(nameof(repeater));
            _hold = hold ?? throw new ArgumentNullException(nameof(hold));
        }

        /// <summary>The hold timer (its duration is an option, GDD 05 1.4).</summary>
        public HoldToConfirm Hold => _hold;

        /// <summary>Forgets held directions and running holds.</summary>
        public void Reset()
        {
            _repeater.Reset();
            CancelHold();
        }

        /// <summary>
        /// Like <see cref="Reset"/>, and a direction that is still held (e.g. W or the stick from walking) moves the focus only
        /// after it was released once. Called when a screen opens or closes.
        /// </summary>
        public void ResetUntilNeutral()
        {
            _repeater.BlockUntilNeutral();
            CancelHold();
        }

        /// <summary>Starts a hold on an item of a screen (mouse button pressed on a hold item).</summary>
        /// <param name="screen">Screen of the item.</param>
        /// <param name="index">Item index.</param>
        public void BeginPointerHold(IUiScreenNode screen, int index)
        {
            if (screen == null || !screen.RequiresHold(index))
            {
                return;
            }

            CancelHold();
            _holdScreen = screen;
            _hold.Begin(index);
        }

        /// <summary>Applies one frame of input to the top screen.</summary>
        /// <param name="screen">The top screen (owner of the focus).</param>
        /// <param name="frame">Input of this frame.</param>
        /// <param name="deltaTime">Unscaled frame time in seconds.</param>
        /// <returns>What happened.</returns>
        public UiNavResult Process(IUiScreenNode screen, in UiInputFrame frame, float deltaTime)
        {
            if (screen == null)
            {
                Reset();
                return UiNavResult.None;
            }

            if (_holdScreen != null && !ReferenceEquals(_holdScreen, screen))
            {
                CancelHold();
            }

            if (frame.CancelPressed || frame.CloseHubPressed)
            {
                CancelHold();
                _repeater.Reset();
                // Esc is bound to both Back and Close: Back wins (one step back, e.g. from a tab page to the main page).
                BackOutcome outcome = screen.Back(!frame.CancelPressed);
                return outcome == BackOutcome.Close ? UiNavResult.CloseRequested
                    : outcome == BackOutcome.Handled ? UiNavResult.BackHandled
                    : UiNavResult.None;
            }

            if (frame.TabDelta != 0)
            {
                CancelHold();
                screen.Tab(frame.TabDelta > 0 ? 1 : -1);
                return UiNavResult.TabChanged;
            }

            if (frame.SubTabDelta != 0)
            {
                CancelHold();
                screen.SubTab(frame.SubTabDelta > 0 ? 1 : -1);
                return UiNavResult.SubTabChanged;
            }

            if (frame.SecondaryPressed)
            {
                CancelHold();
                FocusGroup focused = screen.Focus;
                screen.Secondary(focused != null ? focused.Current : -1);
                return UiNavResult.Secondary;
            }

            FocusGroup focus = screen.Focus;
            UiNavResult result = UiNavResult.None;
            NavDirection step = _repeater.Update(frame.NavigateX, frame.NavigateY, deltaTime);
            if (focus == null)
            {
                return result;
            }

            if (step != NavDirection.None)
            {
                int previous = focus.Current;
                bool horizontal = step == NavDirection.Left || step == NavDirection.Right;
                if (horizontal && focus.Layout == FocusLayout.Vertical && previous >= 0 &&
                    screen.TryAdjust(previous, step == NavDirection.Right ? 1 : -1))
                {
                    CancelHold();
                    result = UiNavResult.Adjusted;
                }
                else if (focus.Move(step))
                {
                    CancelHold();
                    if (previous >= 0)
                    {
                        screen.HoldProgress(previous, 0f);
                    }

                    screen.FocusChanged(previous, focus.Current);
                    result = UiNavResult.Moved;
                }
            }

            int index = focus.Current;
            if (index < 0)
            {
                return result;
            }

            if (screen.RequiresHold(index))
            {
                if (frame.SubmitPressed && !(_hold.IsHolding && _hold.Target == index))
                {
                    _holdScreen = screen;
                    _hold.Begin(index);
                }

                if (_hold.IsHolding && _hold.Target == index && ReferenceEquals(_holdScreen, screen))
                {
                    bool held = frame.SubmitHeld || frame.PointerHoldIndex == index;
                    HoldStep holdStep = _hold.Update(held, deltaTime);
                    switch (holdStep)
                    {
                        case HoldStep.Progressed:
                            screen.HoldProgress(index, _hold.Progress);
                            return result == UiNavResult.None ? UiNavResult.Holding : result;
                        case HoldStep.Cancelled:
                            _holdScreen = null;
                            screen.HoldProgress(index, 0f);
                            return result == UiNavResult.None ? UiNavResult.Holding : result;
                        case HoldStep.Completed:
                            _holdScreen = null;
                            screen.HoldProgress(index, 0f);
                            screen.Submit(index);
                            return UiNavResult.Submitted;
                    }
                }

                return result;
            }

            if (frame.SubmitPressed)
            {
                screen.Submit(index);
                return UiNavResult.Submitted;
            }

            return result;
        }

        private void CancelHold()
        {
            if (_hold.IsHolding && _holdScreen != null)
            {
                _holdScreen.HoldProgress(_hold.Target, 0f);
            }

            _hold.Cancel();
            _holdScreen = null;
        }
    }
}
