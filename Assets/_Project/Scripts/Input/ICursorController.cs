namespace Aetherfall.Input
{
    /// <summary>Applies the cursor state decided by <see cref="CursorPolicy"/> (thin seam for tests and platforms).</summary>
    public interface ICursorController
    {
        /// <summary>Locks the cursor to the window and hides it (true) or frees and shows it (false).</summary>
        /// <param name="locked">True for gameplay, false for menus.</param>
        void SetLocked(bool locked);
    }
}
