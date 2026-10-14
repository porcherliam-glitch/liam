namespace Aetherfall.World
{
    /// <summary>Light and atmosphere of a section (GDD 05 3.3: warm sun, long golden hour, light haze).</summary>
    public sealed class LayoutLighting
    {
        /// <summary>Compass direction of the sun in degrees (0 = north, 90 = east).</summary>
        public double SunAzimuth { get; internal set; }

        /// <summary>Height of the sun above the horizon in degrees.</summary>
        public double SunElevation { get; internal set; }

        /// <summary>Colour of the sun light.</summary>
        public LayoutColor SunColor { get; internal set; }

        /// <summary>Intensity of the sun light.</summary>
        public double SunIntensity { get; internal set; }

        /// <summary>Ambient light from above.</summary>
        public LayoutColor AmbientSky { get; internal set; }

        /// <summary>Ambient light from the horizon.</summary>
        public LayoutColor AmbientEquator { get; internal set; }

        /// <summary>Ambient light from below.</summary>
        public LayoutColor AmbientGround { get; internal set; }

        /// <summary>Fog colour.</summary>
        public LayoutColor FogColor { get; internal set; }

        /// <summary>Density of the exponential squared fog.</summary>
        public double FogDensity { get; internal set; }

        /// <summary>Sky colour at the zenith (preview and skybox tint).</summary>
        public LayoutColor SkyTop { get; internal set; }

        /// <summary>Sky colour at the horizon.</summary>
        public LayoutColor SkyHorizon { get; internal set; }
    }
}
