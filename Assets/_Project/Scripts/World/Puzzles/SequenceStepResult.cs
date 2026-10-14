namespace Aetherfall.World.Puzzles
{
    /// <summary>What pressing an element of a <see cref="SequencePuzzle"/> did.</summary>
    public enum SequenceStepResult
    {
        /// <summary>Nothing happened (unknown element, already pressed in this attempt, puzzle solved).</summary>
        Ignored = 0,

        /// <summary>Right element, the sequence goes on.</summary>
        Progressed = 1,

        /// <summary>Last right element: the puzzle is solved.</summary>
        Solved = 2,

        /// <summary>Wrong element: the attempt failed, everything springs back (GDD 02 11.7 "Fehlversuch").</summary>
        Failed = 3
    }
}
