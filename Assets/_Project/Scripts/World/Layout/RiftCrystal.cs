namespace Aetherfall.World
{
    /// <summary>One Aether crystal shard in the rift crater (<see cref="LayoutPlacement.RiftCrystals"/>).</summary>
    public readonly struct RiftCrystal
    {
        /// <summary>Creates the shard.</summary>
        /// <param name="x">East in metres.</param>
        /// <param name="z">North in metres.</param>
        /// <param name="height">Height in metres.</param>
        /// <param name="tiltX">Tilt around x in degrees.</param>
        /// <param name="tiltZ">Tilt around z in degrees.</param>
        /// <param name="yaw">Rotation in degrees.</param>
        public RiftCrystal(double x, double z, double height, double tiltX, double tiltZ, double yaw)
        {
            X = x;
            Z = z;
            Height = height;
            TiltX = tiltX;
            TiltZ = tiltZ;
            Yaw = yaw;
        }

        /// <summary>East in metres.</summary>
        public double X { get; }

        /// <summary>North in metres.</summary>
        public double Z { get; }

        /// <summary>Height in metres.</summary>
        public double Height { get; }

        /// <summary>Tilt around x in degrees.</summary>
        public double TiltX { get; }

        /// <summary>Tilt around z in degrees.</summary>
        public double TiltZ { get; }

        /// <summary>Rotation in degrees.</summary>
        public double Yaw { get; }
    }
}
