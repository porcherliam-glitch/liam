using Aetherfall.World.Puzzles;

namespace Aetherfall.World.Dungeons
{
    /// <summary>A mirror of a light puzzle: the mirror object, its start position and the position of the solution.</summary>
    public sealed class DungeonPuzzleMirror
    {
        /// <summary>Id of the mirror object (kind <c>mirror</c>).</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>Direction the mirror sends the beam in a new game ("stehen schief").</summary>
        public GridDirection Start { get; set; }

        /// <summary>Direction of the solution (GDD 02 11.7: Spiegel 1 Ost, Spiegel 2 Nord, Spiegel 3 West).</summary>
        public GridDirection Solution { get; set; }
    }
}
