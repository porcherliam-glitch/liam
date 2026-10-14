namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// What makes something happen in the layout (door "opensOn", trap "trigger", spawner "activation"): a type and the id it
    /// refers to. Types: <c>puzzle</c> (puzzle solved), <c>puzzleFailed</c> (wrong step), <c>objectState</c> (object id has
    /// <see cref="State"/>), <c>lever</c> (lever switched on), <c>pressurePlate</c> (plate pressed), <c>bossDefeated</c>,
    /// <c>arena</c> (closed while the boss fight runs), <c>always</c>, <c>none</c>.
    /// </summary>
    public sealed class DungeonTrigger
    {
        /// <summary>Type: puzzle solved.</summary>
        public const string Puzzle = "puzzle";

        /// <summary>Type: wrong step of a puzzle.</summary>
        public const string PuzzleFailed = "puzzleFailed";

        /// <summary>Type: an object reached a state.</summary>
        public const string ObjectState = "objectState";

        /// <summary>Type: a lever is switched on.</summary>
        public const string Lever = "lever";

        /// <summary>Type: a pressure plate is pressed.</summary>
        public const string PressurePlate = "pressurePlate";

        /// <summary>Type: the boss was beaten.</summary>
        public const string BossDefeated = "bossDefeated";

        /// <summary>Type: closed while the boss fight runs, open otherwise.</summary>
        public const string Arena = "arena";

        /// <summary>Type: always active (spawners).</summary>
        public const string Always = "always";

        /// <summary>Type: never by itself (quest action or script).</summary>
        public const string None = "none";

        /// <summary>Trigger type (see the constants).</summary>
        public string Type { get; set; } = None;

        /// <summary>Referenced id (puzzle, object, boss).</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>Required state for <see cref="ObjectState"/> (default 1).</summary>
        public int State { get; set; } = 1;

        /// <summary>True for the known types.</summary>
        public bool IsKnownType =>
            Type == Puzzle || Type == PuzzleFailed || Type == ObjectState || Type == Lever || Type == PressurePlate || Type == BossDefeated ||
            Type == Arena || Type == Always || Type == None;

        /// <summary>True if the type needs an id.</summary>
        public bool NeedsId => Type != Always && Type != None;

        /// <inheritdoc />
        public override string ToString()
        {
            return NeedsId ? Type + ":" + Id : Type;
        }
    }
}
