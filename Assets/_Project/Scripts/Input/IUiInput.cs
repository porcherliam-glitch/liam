using UnityEngine;

namespace Aetherfall.Input
{
    /// <summary>
    /// Read access to the actions of the UI map without Input System types (like <see cref="IGameplayInput"/> for the
    /// Gameplay map): the focus layer of the UI (Aetherfall.UI) and menus such as the developer inventory read it. Values are
    /// false (or zero) while the UI map is disabled.
    /// </summary>
    public interface IUiInput
    {
        /// <summary>True while the UI map is enabled (menus, pause).</summary>
        bool IsActive { get; }

        /// <summary>True in the frame the button action was pressed.</summary>
        /// <param name="button">UI button action.</param>
        bool WasPressedThisFrame(UiButton button);

        /// <summary>True while the button action is held (hold-to-confirm, GDD 05 1.4).</summary>
        /// <param name="button">UI button action.</param>
        bool IsPressed(UiButton button);

        /// <summary>Focus movement of the action <c>Navigate</c> (stick, D-pad, WASD, arrow keys), each axis -1..1.</summary>
        Vector2 Navigate { get; }
    }
}
