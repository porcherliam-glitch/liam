namespace Aetherfall.Input
{
    /// <summary>
    /// Read access to the button actions of the UI map without Input System types (like <see cref="IGameplayInput"/> for the
    /// Gameplay map), for menus outside of Aetherfall.UI such as the developer inventory. Values are false while the UI map is
    /// disabled.
    /// </summary>
    public interface IUiInput
    {
        /// <summary>True while the UI map is enabled (menus, pause).</summary>
        bool IsActive { get; }

        /// <summary>True in the frame the button action was pressed.</summary>
        /// <param name="button">UI button action.</param>
        bool WasPressedThisFrame(UiButton button);
    }
}
