namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Supplies the UI input of a frame (architecture 4.9: input map "UI" → focus navigator). Implemented in UI.Screens on top
    /// of the input service; a fake in tests. Keeps the framework free of Input System types.
    /// </summary>
    public interface IUiCommandSource
    {
        /// <summary>True while the UI action map is enabled (main menu, menus, pause).</summary>
        bool IsActive { get; }

        /// <summary>Fills the input of this frame (navigation, confirm, back, tabs, close). Leaves PointerHoldIndex alone.</summary>
        /// <param name="frame">Frame to fill.</param>
        void Read(ref UiInputFrame frame);
    }
}
