using UnityEngine;

namespace Aetherfall.Input
{
    /// <summary>
    /// Unity adapter of <see cref="ICursorController"/>: writes <see cref="Cursor.lockState"/> and <see cref="Cursor.visible"/>.
    /// In the editor the Game view must have focus for the lock to take effect (click into it); Esc always frees the cursor
    /// in the editor.
    /// </summary>
    public sealed class UnityCursorController : ICursorController
    {
        /// <inheritdoc />
        public void SetLocked(bool locked)
        {
            Cursor.lockState = locked ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !locked;
        }
    }
}
