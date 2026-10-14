namespace Aetherfall.World
{
    /// <summary>One plant or boulder placed by <see cref="VegetationScatter"/> (or a landmark tree).</summary>
    public readonly struct VegetationInstance
    {
        /// <summary>Creates the instance.</summary>
        /// <param name="groupId">Id of the scatter group or of the landmark tree.</param>
        /// <param name="kind">Species.</param>
        /// <param name="x">East in metres.</param>
        /// <param name="z">North in metres.</param>
        /// <param name="scale">Scale.</param>
        /// <param name="yaw">Rotation in degrees.</param>
        public VegetationInstance(string groupId, VegetationKind kind, double x, double z, double scale, double yaw)
        {
            GroupId = groupId;
            Kind = kind;
            X = x;
            Z = z;
            Scale = scale;
            Yaw = yaw;
        }

        /// <summary>Id of the scatter group or landmark tree.</summary>
        public string GroupId { get; }

        /// <summary>Species.</summary>
        public VegetationKind Kind { get; }

        /// <summary>East in metres.</summary>
        public double X { get; }

        /// <summary>North in metres.</summary>
        public double Z { get; }

        /// <summary>Scale.</summary>
        public double Scale { get; }

        /// <summary>Rotation in degrees.</summary>
        public double Yaw { get; }
    }
}
