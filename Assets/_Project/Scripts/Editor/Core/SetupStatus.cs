namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Result of one setup check in the project setup window (architecture section 2).
    /// Shown as "✓" (done), "✗" (open) or "–" (unknown, manual or only a hint).
    /// </summary>
    public enum SetupStatus
    {
        /// <summary>Cannot be determined automatically (yet), or the item is only a hint. Shown as "–".</summary>
        Unknown = 0,

        /// <summary>The requirement is met. Shown as "✓".</summary>
        Done = 1,

        /// <summary>The requirement is not met yet. Shown as "✗".</summary>
        Open = 2
    }
}
