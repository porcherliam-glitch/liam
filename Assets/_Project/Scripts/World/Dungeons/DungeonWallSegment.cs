namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// A straight wall piece found on the cell boundary (<see cref="DungeonGeometry.Walls"/>). <see cref="AlongX"/>: the wall
    /// runs along x and lies on the line <c>z = Line</c>; otherwise it runs along z on <c>x = Line</c>. <see cref="Facing"/> is
    /// +1 or −1: the side of the line where the void (or the other piece) lies, i.e. where the wall body goes.
    /// </summary>
    public sealed class DungeonWallSegment
    {
        /// <summary>True: runs along x on the line z = <see cref="Line"/>.</summary>
        public bool AlongX { get; set; }

        /// <summary>Coordinate of the boundary line.</summary>
        public float Line { get; set; }

        /// <summary>Start along the wall.</summary>
        public float Start { get; set; }

        /// <summary>End along the wall.</summary>
        public float End { get; set; }

        /// <summary>Lower edge (world height).</summary>
        public float Bottom { get; set; }

        /// <summary>Upper edge (world height).</summary>
        public float Top { get; set; }

        /// <summary>+1 or −1: side of the line where the wall body goes.</summary>
        public int Facing { get; set; } = 1;

        /// <summary>Wall, lintel or riser.</summary>
        public DungeonWallKind Kind { get; set; }

        /// <summary>Length along the wall.</summary>
        public float Length => End - Start;

        /// <inheritdoc />
        public override string ToString()
        {
            return Kind + (AlongX ? " z=" : " x=") + Line + " [" + Start + ".." + End + "] y " + Bottom + ".." + Top + " facing " + Facing;
        }
    }
}
