namespace Aetherfall.World
{
    /// <summary>Axis-aligned rectangle on the ground plane (e.g. the playable bounds).</summary>
    public readonly struct LayoutBounds
    {
        /// <summary>Creates the rectangle.</summary>
        /// <param name="min">South-west corner.</param>
        /// <param name="max">North-east corner.</param>
        public LayoutBounds(LayoutPoint min, LayoutPoint max)
        {
            Min = min;
            Max = max;
        }

        /// <summary>South-west corner.</summary>
        public LayoutPoint Min { get; }

        /// <summary>North-east corner.</summary>
        public LayoutPoint Max { get; }

        /// <summary>Extent along x.</summary>
        public double Width => Max.X - Min.X;

        /// <summary>Extent along z.</summary>
        public double Depth => Max.Z - Min.Z;

        /// <summary>True if the point lies inside or on the edge.</summary>
        /// <param name="point">Point.</param>
        public bool Contains(LayoutPoint point)
        {
            return point.X >= Min.X && point.X <= Max.X && point.Z >= Min.Z && point.Z <= Max.Z;
        }

        /// <summary>True if the circle lies completely inside.</summary>
        /// <param name="center">Centre.</param>
        /// <param name="radius">Radius.</param>
        public bool ContainsCircle(LayoutPoint center, double radius)
        {
            return center.X - radius >= Min.X && center.X + radius <= Max.X && center.Z - radius >= Min.Z && center.Z + radius <= Max.Z;
        }
    }
}
