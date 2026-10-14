namespace Aetherfall.World.Puzzles
{
    /// <summary>A mirror of a <see cref="MirrorPuzzle"/>: id, position and start direction.</summary>
    public readonly struct MirrorSetup
    {
        /// <summary>Creates the setup.</summary>
        /// <param name="id">Object id.</param>
        /// <param name="position">Position.</param>
        /// <param name="start">Start direction.</param>
        public MirrorSetup(string id, PlanarPoint position, GridDirection start)
        {
            Id = id ?? string.Empty;
            Position = position;
            Start = start;
        }

        /// <summary>Object id.</summary>
        public string Id { get; }

        /// <summary>Position.</summary>
        public PlanarPoint Position { get; }

        /// <summary>Start direction.</summary>
        public GridDirection Start { get; }
    }
}
