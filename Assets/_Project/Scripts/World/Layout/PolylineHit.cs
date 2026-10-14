namespace Aetherfall.World
{
    /// <summary>Closest point on a polyline: distance, segment index and fraction along that segment.</summary>
    public readonly struct PolylineHit
    {
        /// <summary>Creates the result.</summary>
        /// <param name="distance">Distance in metres.</param>
        /// <param name="segment">Index of the segment (point i to i + 1).</param>
        /// <param name="fraction">Fraction 0..1 along the segment.</param>
        public PolylineHit(double distance, int segment, double fraction)
        {
            Distance = distance;
            Segment = segment;
            Fraction = fraction;
        }

        /// <summary>Distance in metres (infinity for an empty polyline).</summary>
        public double Distance { get; }

        /// <summary>Index of the segment.</summary>
        public int Segment { get; }

        /// <summary>Fraction 0..1 along the segment.</summary>
        public double Fraction { get; }
    }
}
