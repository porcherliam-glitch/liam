using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// The look of one moment of the day (S35), evaluated from a <see cref="DayNightProfile"/>: where sun and moon stand, the main
    /// light (sun by day, moon by night), ambient, fog, sky, reflections, the factor for fires and lamps and how much daylight
    /// there is (0 at night, 1 by day).
    /// </summary>
    public readonly struct DayNightSample
    {
        /// <summary>Hour of the day (fractional).</summary>
        public readonly float Hour;

        /// <summary>Phase of the day.</summary>
        public readonly DayPhase Phase;

        /// <summary>Height of the sun in degrees (negative below the horizon).</summary>
        public readonly float SunElevation;

        /// <summary>Compass direction of the sun in degrees.</summary>
        public readonly float SunAzimuth;

        /// <summary>True while the moon is the main light.</summary>
        public readonly bool MainLightIsMoon;

        /// <summary>Height of the main light in degrees.</summary>
        public readonly float MainLightElevation;

        /// <summary>Compass direction of the main light in degrees.</summary>
        public readonly float MainLightAzimuth;

        /// <summary>Colour of the main light.</summary>
        public readonly Color MainLightColor;

        /// <summary>Strength of the main light (0 in the twilight gaps).</summary>
        public readonly float MainLightIntensity;

        /// <summary>Shadow strength of the main light.</summary>
        public readonly float ShadowStrength;

        /// <summary>Ambient from above.</summary>
        public readonly Color AmbientSky;

        /// <summary>Ambient from the horizon.</summary>
        public readonly Color AmbientEquator;

        /// <summary>Ambient from below.</summary>
        public readonly Color AmbientGround;

        /// <summary>Fog colour.</summary>
        public readonly Color FogColor;

        /// <summary>Fog density.</summary>
        public readonly float FogDensity;

        /// <summary>Sky colour.</summary>
        public readonly Color SkyTint;

        /// <summary>Ground colour of the sky.</summary>
        public readonly Color SkyGround;

        /// <summary>Sky brightness (the dip around the sun–moon swap is applied).</summary>
        public readonly float SkyExposure;

        /// <summary>Atmosphere thickness.</summary>
        public readonly float Atmosphere;

        /// <summary>Sun or moon disc size.</summary>
        public readonly float SunSize;

        /// <summary>Reflection strength.</summary>
        public readonly float Reflection;

        /// <summary>Factor for fires and lamps.</summary>
        public readonly float LocalLightScale;

        /// <summary>Daylight 0 (night) … 1 (day).</summary>
        public readonly float Daylight;

        /// <summary>Creates a sample (see <see cref="DayNightMath.Evaluate"/>).</summary>
        /// <param name="hour">Hour of the day.</param>
        /// <param name="phase">Phase.</param>
        /// <param name="sunElevation">Sun height.</param>
        /// <param name="sunAzimuth">Sun direction.</param>
        /// <param name="mainLightIsMoon">Moon is the main light.</param>
        /// <param name="mainLightElevation">Main light height.</param>
        /// <param name="mainLightAzimuth">Main light direction.</param>
        /// <param name="mainLightColor">Main light colour.</param>
        /// <param name="mainLightIntensity">Main light strength.</param>
        /// <param name="shadowStrength">Shadow strength.</param>
        /// <param name="ambientSky">Ambient from above.</param>
        /// <param name="ambientEquator">Ambient from the horizon.</param>
        /// <param name="ambientGround">Ambient from below.</param>
        /// <param name="fogColor">Fog colour.</param>
        /// <param name="fogDensity">Fog density.</param>
        /// <param name="skyTint">Sky colour.</param>
        /// <param name="skyGround">Sky ground colour.</param>
        /// <param name="skyExposure">Sky brightness.</param>
        /// <param name="atmosphere">Atmosphere thickness.</param>
        /// <param name="sunSize">Disc size.</param>
        /// <param name="reflection">Reflection strength.</param>
        /// <param name="localLightScale">Factor for fires and lamps.</param>
        /// <param name="daylight">Daylight 0–1.</param>
        public DayNightSample(float hour, DayPhase phase, float sunElevation, float sunAzimuth, bool mainLightIsMoon, float mainLightElevation,
            float mainLightAzimuth, Color mainLightColor, float mainLightIntensity, float shadowStrength, Color ambientSky, Color ambientEquator,
            Color ambientGround, Color fogColor, float fogDensity, Color skyTint, Color skyGround, float skyExposure, float atmosphere, float sunSize,
            float reflection, float localLightScale, float daylight)
        {
            Hour = hour;
            Phase = phase;
            SunElevation = sunElevation;
            SunAzimuth = sunAzimuth;
            MainLightIsMoon = mainLightIsMoon;
            MainLightElevation = mainLightElevation;
            MainLightAzimuth = mainLightAzimuth;
            MainLightColor = mainLightColor;
            MainLightIntensity = mainLightIntensity;
            ShadowStrength = shadowStrength;
            AmbientSky = ambientSky;
            AmbientEquator = ambientEquator;
            AmbientGround = ambientGround;
            FogColor = fogColor;
            FogDensity = fogDensity;
            SkyTint = skyTint;
            SkyGround = skyGround;
            SkyExposure = skyExposure;
            Atmosphere = atmosphere;
            SunSize = sunSize;
            Reflection = reflection;
            LocalLightScale = localLightScale;
            Daylight = daylight;
        }
    }
}
