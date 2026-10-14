namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// The UI input of one frame, filled by an <see cref="IUiCommandSource"/> (UI action map: Navigate, Submit, Cancel,
    /// TabPrev/TabNext, CloseHub) and the pointer callbacks of the screens. Plain values, no Input System types.
    /// </summary>
    public struct UiInputFrame
    {
        /// <summary>Horizontal navigation value (-1 left .. 1 right).</summary>
        public float NavigateX;

        /// <summary>Vertical navigation value (-1 down .. 1 up).</summary>
        public float NavigateY;

        /// <summary>Confirm was pressed this frame (A / Cross / Enter / Space).</summary>
        public bool SubmitPressed;

        /// <summary>Confirm is held (hold-to-confirm).</summary>
        public bool SubmitHeld;

        /// <summary>Back was pressed this frame (B / Circle / Esc / right mouse button).</summary>
        public bool CancelPressed;

        /// <summary>Close-the-menu was pressed this frame (Start / Options / Esc / Tab).</summary>
        public bool CloseHubPressed;

        /// <summary>Tab change this frame: -1 (LB / L1 / Q), +1 (RB / R1 / E) or 0.</summary>
        public int TabDelta;

        /// <summary>Index of the item of the top screen the mouse button is held on (-1 if none).</summary>
        public int PointerHoldIndex;

        /// <summary>Clears all values (PointerHoldIndex -1).</summary>
        public void Clear()
        {
            NavigateX = 0f;
            NavigateY = 0f;
            SubmitPressed = false;
            SubmitHeld = false;
            CancelPressed = false;
            CloseHubPressed = false;
            TabDelta = 0;
            PointerHoldIndex = -1;
        }
    }
}
