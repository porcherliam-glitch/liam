namespace Aetherfall.UI.Framework
{
    /// <summary>What <see cref="UiNavigationController.Process"/> did in one frame.</summary>
    public enum UiNavResult
    {
        /// <summary>Nothing.</summary>
        None = 0,

        /// <summary>The focus moved.</summary>
        Moved = 1,

        /// <summary>A value item was adjusted (left/right).</summary>
        Adjusted = 2,

        /// <summary>An item was confirmed.</summary>
        Submitted = 3,

        /// <summary>A hold-to-confirm progressed or was cancelled.</summary>
        Holding = 4,

        /// <summary>The tab changed.</summary>
        TabChanged = 5,

        /// <summary>The screen handled Back itself.</summary>
        BackHandled = 6,

        /// <summary>The screen asked to be closed.</summary>
        CloseRequested = 7
    }
}
