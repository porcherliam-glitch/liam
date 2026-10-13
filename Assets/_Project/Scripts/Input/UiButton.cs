namespace Aetherfall.Input
{
    /// <summary>
    /// Button actions of the UI map (GDD 03 1.5) for package-free reading through <see cref="IUiInput"/>. The action name of
    /// each value is defined in <see cref="InputActionNames.ForUiButton"/>. Values are only used at run time; append new ones
    /// at the end.
    /// </summary>
    public enum UiButton
    {
        /// <summary>Confirm (A, Enter, Space).</summary>
        Submit = 0,

        /// <summary>Back (B, Esc, right mouse button).</summary>
        Cancel = 1,

        /// <summary>Main tab back (LB, Q).</summary>
        TabPrev = 2,

        /// <summary>Main tab forward (RB, E).</summary>
        TabNext = 3,

        /// <summary>Close the hub (Menu, Esc, or the direct key of the tab: Tab for the inventory).</summary>
        CloseHub = 4
    }
}
