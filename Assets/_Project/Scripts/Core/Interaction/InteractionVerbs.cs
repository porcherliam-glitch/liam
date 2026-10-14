namespace Aetherfall.Core
{
    /// <summary>
    /// Stable verb ids of interactions (payload <c>Verb</c> of the event <c>Interacted</c>, architecture 4.3 and 14.5:
    /// "ChestOpened → Interacted (Verb open)"). Never rename a value: telemetry and quest data use them.
    /// </summary>
    public static class InteractionVerbs
    {
        /// <summary>Open a container (chest, sack, door).</summary>
        public const string Open = "open";

        /// <summary>Pick up loot lying in the world.</summary>
        public const string PickUp = "pickup";

        /// <summary>Talk to an NPC (dialogue step).</summary>
        public const string Talk = "talk";

        /// <summary>Use a lever, switch or similar mechanism (world objects step).</summary>
        public const string Use = "use";

        /// <summary>Read a notice, sign, letter or book (notice boards that offer quests, GDD 02 4.1 "Aushang lesen").</summary>
        public const string Read = "read";
    }
}
