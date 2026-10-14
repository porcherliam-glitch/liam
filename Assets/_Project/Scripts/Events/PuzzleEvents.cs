// Global events of environment puzzles (architecture 4.3, "Weitere verbindliche Event-Namen", area Welt: PuzzleSolved; GDD 02
// 5.1 objective type "Raetsel", GDD 01 6.7). Several event structs of one area may share a file (architecture 15.2, rule 18).
// Senders: the puzzle controllers of Aetherfall.World (sequence of grave slabs, mirrors and light, later all puzzle types).

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// A puzzle was solved (once per puzzle and save; a solved puzzle stays solved). Receivers: quests (objective "Raetsel",
    /// condition "Raetsel geloest"), doors, spawners, telemetry, audio (stinger).
    /// </summary>
    public readonly struct PuzzleSolved : IGameEvent
    {
        /// <summary>Puzzle id, e.g. <c>puzzle.eichental.gruft_grabplatten</c>.</summary>
        public readonly string PuzzleId;

        /// <summary>Creates the event.</summary>
        /// <param name="puzzleId">Puzzle id.</param>
        public PuzzleSolved(string puzzleId)
        {
            PuzzleId = puzzleId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "PuzzleSolved(" + PuzzleId + ")";
        }
    }

    /// <summary>
    /// A wrong step of a puzzle (wrong grave slab, GDD 02 11.7 "Fehlversuch"): the puzzle resets. Receivers: traps (arrow trap,
    /// 10 % health), the hint timer, telemetry (attempts per puzzle).
    /// </summary>
    public readonly struct PuzzleFailed : IGameEvent
    {
        /// <summary>Puzzle id.</summary>
        public readonly string PuzzleId;

        /// <summary>Id of the element that was used in the wrong order (e.g. the grave slab).</summary>
        public readonly string ElementId;

        /// <summary>Creates the event.</summary>
        /// <param name="puzzleId">Puzzle id.</param>
        /// <param name="elementId">Id of the wrong element.</param>
        public PuzzleFailed(string puzzleId, string elementId)
        {
            PuzzleId = puzzleId ?? string.Empty;
            ElementId = elementId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "PuzzleFailed(" + PuzzleId + ", " + ElementId + ")";
        }
    }
}
