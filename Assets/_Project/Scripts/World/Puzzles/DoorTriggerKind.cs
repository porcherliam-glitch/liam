namespace Aetherfall.World.Puzzles
{
    /// <summary>What opens a <see cref="WorldDoor"/> (layout field <c>opensOn.type</c>). Stored in scenes: never renumber.</summary>
    public enum DoorTriggerKind
    {
        /// <summary>Only quest actions or scripts (state of the door id itself).</summary>
        Manual = 0,

        /// <summary>A puzzle is solved (state of the puzzle id = 1).</summary>
        PuzzleSolved = 1,

        /// <summary>Another object has a given state (e.g. the cage is open).</summary>
        ObjectState = 2,

        /// <summary>A lever is on.</summary>
        Lever = 3,

        /// <summary>A pressure plate is pressed (only while someone stands on it).</summary>
        PressurePlate = 4,

        /// <summary>A boss is beaten.</summary>
        BossDefeated = 5,

        /// <summary>Arena gate: open, closed while the boss fight runs.</summary>
        BossArena = 6
    }
}
