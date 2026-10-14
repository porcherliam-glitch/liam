namespace Aetherfall.UI.Framework
{
    /// <summary>Result of <see cref="HoldToConfirm.Update"/> for one frame.</summary>
    public enum HoldStep
    {
        /// <summary>No hold is running.</summary>
        Idle = 0,

        /// <summary>The hold continues; <see cref="HoldToConfirm.Progress"/> grew.</summary>
        Progressed = 1,

        /// <summary>The hold reached the full duration in this frame: confirm the action.</summary>
        Completed = 2,

        /// <summary>The button was released early: the action is not confirmed.</summary>
        Cancelled = 3
    }
}
