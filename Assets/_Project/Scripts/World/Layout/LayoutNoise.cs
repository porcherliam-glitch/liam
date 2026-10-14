namespace Aetherfall.World
{
    /// <summary>One wave of the terrain noise: amplitude × sin(2π u / wavelength + phase) × cos(2π v / (1.37 wavelength) + 1.3 phase).</summary>
    public sealed class LayoutNoise
    {
        /// <summary>Amplitude in metres.</summary>
        public double Amplitude { get; internal set; }

        /// <summary>Wavelength in metres.</summary>
        public double Wavelength { get; internal set; }

        /// <summary>Direction of the wave in degrees (rotation of u/v against x/z).</summary>
        public double Angle { get; internal set; }

        /// <summary>Phase in radians.</summary>
        public double Phase { get; internal set; }
    }
}
