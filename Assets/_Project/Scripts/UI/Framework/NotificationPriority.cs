namespace Aetherfall.UI.Framework
{
    /// <summary>Classes of on-screen messages (GDD 05 1.7). Lower value = more important.</summary>
    public enum NotificationPriority
    {
        /// <summary>P0 milestone: quest completed, level-up, region discovered, critical warning. Top centre, 1 at a time, 4 s.</summary>
        Milestone = 0,

        /// <summary>P1 progress: quest progress, recipe learned, reputation, saved game. Right, 2 at a time, 3 s.</summary>
        Progress = 1,

        /// <summary>P2 loot and values: item, gold, experience. Right centre, stacked, 5 at a time, 2.5 s.</summary>
        Loot = 2
    }
}
