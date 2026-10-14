namespace Aetherfall.Conditions
{
    /// <summary>Reserved subject ids of condition and action contexts (architecture 6.1: <c>player</c>, <c>none</c>).</summary>
    public static class SubjectIds
    {
        /// <summary>The player character (default subject; same value as the inventory owner id of the player).</summary>
        public const string Player = "player";

        /// <summary>No subject.</summary>
        public const string None = "none";
    }
}
