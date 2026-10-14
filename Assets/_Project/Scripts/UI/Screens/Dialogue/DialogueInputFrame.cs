namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// The dialogue input of one frame (action map "Dialog", GDD 03 1.5: DialogNavigate, DialogSubmit, DialogBack,
    /// DialogDirect1-9, DialogAuto), filled by an <see cref="IDialogueScreenInput"/>. Plain values, no Input System types.
    /// </summary>
    public struct DialogueInputFrame
    {
        /// <summary>Horizontal navigation value (-1 left .. 1 right).</summary>
        public float NavigateX;

        /// <summary>Vertical navigation value (-1 down .. 1 up).</summary>
        public float NavigateY;

        /// <summary>Confirm was pressed this frame with a key or button (A / Cross / E / Space / Enter): confirms the focused answer.</summary>
        public bool SubmitPressed;

        /// <summary>
        /// Confirm was pressed this frame with the left mouse button (also part of DialogSubmit): chooses the answer under the
        /// pointer, never the focused one (a click on a greyed answer or beside the answers chooses nothing).
        /// </summary>
        public bool PointerSubmitPressed;

        /// <summary>Confirm is held, with any of its buttons (hold to confirm for "[Toeten]").</summary>
        public bool SubmitHeld;

        /// <summary>Back was pressed this frame (B / Circle / right mouse button).</summary>
        public bool BackPressed;

        /// <summary>Key of the answer chosen directly this frame (1-9 = first to ninth answer); 0 = none, so a default frame chooses nothing.</summary>
        public int DirectNumber;

        /// <summary>Automatic continue was switched this frame (X / F).</summary>
        public bool AutoTogglePressed;

        /// <summary>Clears all values.</summary>
        public void Clear()
        {
            NavigateX = 0f;
            NavigateY = 0f;
            SubmitPressed = false;
            PointerSubmitPressed = false;
            SubmitHeld = false;
            BackPressed = false;
            DirectNumber = 0;
            AutoTogglePressed = false;
        }
    }
}
