namespace Aetherfall.World.Dungeons
{
    /// <summary>Severity of a <see cref="DungeonLayoutIssue"/>.</summary>
    public enum DungeonIssueSeverity
    {
        /// <summary>Works, but should be looked at.</summary>
        Warning = 0,

        /// <summary>The dungeon would not work as designed; the generator refuses to build.</summary>
        Error = 1
    }
}
