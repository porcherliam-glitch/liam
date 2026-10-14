namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// What <see cref="UiNavigationController"/> needs from a screen: its focus group and reactions to confirm, back, tabs,
    /// value changes and hold progress. Implemented by <see cref="UIScreen"/>; a fake in tests.
    /// </summary>
    public interface IUiScreenNode
    {
        /// <summary>Focus group of the current page (null = nothing focusable).</summary>
        FocusGroup Focus { get; }

        /// <summary>Reaction to Back (<paramref name="closeHub"/> false) or Close (true).</summary>
        /// <param name="closeHub">True for the Close button (Start / Options / Tab), false for Back (B / Esc / right mouse).</param>
        BackOutcome Back(bool closeHub);

        /// <summary>True if the item needs hold-to-confirm.</summary>
        /// <param name="index">Item index.</param>
        bool RequiresHold(int index);

        /// <summary>Left/right on a value item (option rows). Return true if the item consumed it.</summary>
        /// <param name="index">Focused item.</param>
        /// <param name="delta">-1 (left) or +1 (right).</param>
        bool TryAdjust(int index, int delta);

        /// <summary>Confirm on an item (after the hold for hold items).</summary>
        /// <param name="index">Item index.</param>
        void Submit(int index);

        /// <summary>Tab change with LB/RB (Q/E).</summary>
        /// <param name="delta">-1 or +1.</param>
        void Tab(int delta);

        /// <summary>The focus moved (update the focus frame).</summary>
        /// <param name="previous">Previous index (-1 = none).</param>
        /// <param name="current">New index (-1 = none).</param>
        void FocusChanged(int previous, int current);

        /// <summary>Hold progress of an item for the progress bar on the button (0 = reset).</summary>
        /// <param name="index">Item index.</param>
        /// <param name="progress01">Progress from 0 to 1.</param>
        void HoldProgress(int index, float progress01);
    }
}
