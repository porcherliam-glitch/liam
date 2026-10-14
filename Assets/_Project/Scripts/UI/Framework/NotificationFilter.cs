namespace Aetherfall.UI.Framework
{
    /// <summary>Option "Benachrichtigungen" (GDD 05 1.7): which classes are shown.</summary>
    public enum NotificationFilter
    {
        /// <summary>P0, P1 and P2.</summary>
        All = 0,

        /// <summary>P0 and P1 ("Wichtige").</summary>
        Important = 1,

        /// <summary>Only P0 ("Minimal").</summary>
        Minimal = 2
    }
}
