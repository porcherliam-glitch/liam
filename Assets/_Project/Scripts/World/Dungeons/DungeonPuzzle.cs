using System.Collections.Generic;
using Aetherfall.World.Puzzles;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// A puzzle of the layout. <c>sequence</c>: elements must be used in the order of <see cref="Steps"/> (grave slabs, GDD
    /// 01 6.7 "Hebel und Sequenzen"); <c>mirror</c>: an Aether beam from <see cref="Source"/> must reach <see cref="Target"/>
    /// over the <see cref="Mirrors"/> ("Spiegel und Licht").
    /// </summary>
    public sealed class DungeonPuzzle
    {
        /// <summary>Type: ordered sequence.</summary>
        public const string Sequence = "sequence";

        /// <summary>Type: mirrors and light.</summary>
        public const string Mirror = "mirror";

        /// <summary>Id, e.g. <c>puzzle.eichental.gruft_grabplatten</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>Type (see the constants).</summary>
        public string Type { get; set; } = Sequence;

        /// <summary>German name.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>Quest stage the puzzle belongs to (documentation, e.g. <c>s20</c>).</summary>
        public string QuestStage { get; set; } = string.Empty;

        /// <summary>Puzzle type text of GDD 01 6.7 (documentation).</summary>
        public string PuzzleType { get; set; } = string.Empty;

        /// <summary>Door that opens when the puzzle is solved (may be empty).</summary>
        public string Door { get; set; } = string.Empty;

        /// <summary>Sequence: object ids in the order of the solution.</summary>
        public List<string> Steps { get; } = new List<string>();

        /// <summary>Sequence: trap that fires on a wrong step (may be empty).</summary>
        public string FailTrap { get; set; } = string.Empty;

        /// <summary>Seconds without progress until the hint objects light up (GDD 01 6.7: 120 s; 0 = never).</summary>
        public float HintAfterSeconds { get; set; }

        /// <summary>Objects that light up as hint (inscription, soot marks).</summary>
        public List<string> HintObjects { get; } = new List<string>();

        /// <summary>Mirror: id of the beam source object.</summary>
        public string Source { get; set; } = string.Empty;

        /// <summary>Mirror: direction the source shines in.</summary>
        public GridDirection SourceDirection { get; set; }

        /// <summary>Mirror: id of the target object (the seal).</summary>
        public string Target { get; set; } = string.Empty;

        /// <summary>Mirror: the mirrors with start and solution.</summary>
        public List<DungeonPuzzleMirror> Mirrors { get; } = new List<DungeonPuzzleMirror>();

        /// <summary>True for the type <c>sequence</c>.</summary>
        public bool IsSequence => Type == Sequence;

        /// <summary>True for the type <c>mirror</c>.</summary>
        public bool IsMirror => Type == Mirror;
    }
}
