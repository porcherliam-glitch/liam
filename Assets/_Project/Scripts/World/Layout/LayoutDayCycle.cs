using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>
    /// The optional <c>dayCycle</c> block of a layout file (S35): the path of sun and moon and the keys of the look over the day.
    /// The generator bakes it into the region's day cycle profile. Without the block the light of the region stays static.
    /// </summary>
    public sealed class LayoutDayCycle
    {
        /// <summary>Sunrise in hours.</summary>
        public double Sunrise { get; internal set; } = 5.5;

        /// <summary>Sunset in hours.</summary>
        public double Sunset { get; internal set; } = 20.5;

        /// <summary>Sun height at noon in degrees.</summary>
        public double NoonElevation { get; internal set; } = 52.0;

        /// <summary>Sun depth at midnight in degrees.</summary>
        public double NightDepth { get; internal set; } = 40.0;

        /// <summary>Direction of the sunrise in degrees.</summary>
        public double RiseAzimuth { get; internal set; } = 90.0;

        /// <summary>Direction of the sunset in degrees.</summary>
        public double SetAzimuth { get; internal set; } = 270.0;

        /// <summary>Moon light colour.</summary>
        public LayoutColor MoonColor { get; internal set; } = new LayoutColor(0.616, 0.706, 0.91);

        /// <summary>Moon light strength at full moon.</summary>
        public double MoonIntensity { get; internal set; } = 0.22;

        /// <summary>Share of the moon light at new moon.</summary>
        public double NewMoonFactor { get; internal set; } = 0.25;

        /// <summary>Moon shadow strength.</summary>
        public double MoonShadowStrength { get; internal set; } = 0.55;

        /// <summary>Lowest moon height in degrees.</summary>
        public double MoonMinElevation { get; internal set; } = 12.0;

        /// <summary>Keys in the order of the file.</summary>
        public IReadOnlyList<LayoutDayKey> Keys { get; internal set; } = new List<LayoutDayKey>();
    }
}
