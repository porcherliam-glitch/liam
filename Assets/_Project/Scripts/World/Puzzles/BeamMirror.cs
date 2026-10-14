namespace Aetherfall.World.Puzzles
{
    /// <summary>A mirror for <see cref="MirrorBeamTracer"/>: id, position and the direction it sends the beam in.</summary>
    public readonly struct BeamMirror
    {
        /// <summary>Creates the mirror.</summary>
        /// <param name="id">Object id.</param>
        /// <param name="position">Position on the ground plane.</param>
        /// <param name="direction">Direction the beam leaves the mirror.</param>
        public BeamMirror(string id, PlanarPoint position, GridDirection direction)
        {
            Id = id ?? string.Empty;
            Position = position;
            Direction = direction;
        }

        /// <summary>Object id.</summary>
        public string Id { get; }

        /// <summary>Position.</summary>
        public PlanarPoint Position { get; }

        /// <summary>Direction the beam leaves the mirror.</summary>
        public GridDirection Direction { get; }
    }
}
