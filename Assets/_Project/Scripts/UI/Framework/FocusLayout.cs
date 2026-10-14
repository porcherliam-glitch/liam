namespace Aetherfall.UI.Framework
{
    /// <summary>How the items of a <see cref="FocusGroup"/> are arranged for directional navigation.</summary>
    public enum FocusLayout
    {
        /// <summary>A column: up/down move, left/right do not (they adjust values, see <see cref="IUiScreenNode.TryAdjust"/>).</summary>
        Vertical = 0,

        /// <summary>A row: left/right move, up/down do not.</summary>
        Horizontal = 1,

        /// <summary>A grid with a fixed number of columns: all four directions move.</summary>
        Grid = 2
    }
}
