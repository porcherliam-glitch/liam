namespace Aetherfall.World
{
    /// <summary>One key of the <c>dayCycle</c> block (S35): the look of the region at one time of day.</summary>
    public sealed class LayoutDayKey
    {
        /// <summary>Hour of the day, from <c>time</c> ("HH:mm").</summary>
        public double Hour { get; internal set; }

        /// <summary>The time as written ("18:10").</summary>
        public string Time { get; internal set; } = string.Empty;

        /// <summary>Sun colour.</summary>
        public LayoutColor SunColor { get; internal set; }

        /// <summary>Sun strength.</summary>
        public double SunIntensity { get; internal set; }

        /// <summary>Ambient from above.</summary>
        public LayoutColor AmbientSky { get; internal set; }

        /// <summary>Ambient from the horizon.</summary>
        public LayoutColor AmbientEquator { get; internal set; }

        /// <summary>Ambient from below.</summary>
        public LayoutColor AmbientGround { get; internal set; }

        /// <summary>Fog colour.</summary>
        public LayoutColor FogColor { get; internal set; }

        /// <summary>Fog density.</summary>
        public double FogDensity { get; internal set; }

        /// <summary>Sky colour.</summary>
        public LayoutColor SkyTint { get; internal set; }

        /// <summary>Sky brightness.</summary>
        public double SkyExposure { get; internal set; }

        /// <summary>Atmosphere thickness.</summary>
        public double Atmosphere { get; internal set; }

        /// <summary>Sun or moon disc size.</summary>
        public double SunSize { get; internal set; }

        /// <summary>Reflection strength.</summary>
        public double Reflection { get; internal set; }

        /// <summary>Factor of fires and lamps.</summary>
        public double LocalLights { get; internal set; }
    }
}
