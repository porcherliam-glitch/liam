namespace Aetherfall.World
{
    /// <summary>Position with facing on the ground plane (e.g. an enemy of a spawner).</summary>
    public readonly struct PlacedPoint
    {
        /// <summary>Creates the point.</summary>
        /// <param name="x">East in metres.</param>
        /// <param name="z">North in metres.</param>
        /// <param name="yaw">Facing in degrees.</param>
        public PlacedPoint(double x, double z, double yaw)
        {
            X = x;
            Z = z;
            Yaw = yaw;
        }

        /// <summary>East in metres.</summary>
        public double X { get; }

        /// <summary>North in metres.</summary>
        public double Z { get; }

        /// <summary>Facing in degrees.</summary>
        public double Yaw { get; }
    }
}
