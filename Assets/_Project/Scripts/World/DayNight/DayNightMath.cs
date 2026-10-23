using System;
using System.Collections.Generic;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// The arithmetic of day and night (S35, GDD 01 6.1, GDD 03 9.2), pure logic: hour and moon day from the game minutes, the
    /// arc of the sun by day and below the horizon at night, the moon as main light at night (its strength follows the 8-day moon
    /// cycle), the gaps around the sun–moon swap, the dip of the sky brightness that hides it, the blend of the region's keys
    /// over midnight, the daylight share and the light factor of the stealth AI.
    /// </summary>
    public static class DayNightMath
    {
        /// <summary>Light factor by day (GDD 03 9.2).</summary>
        public const float DayFactor = 1f;

        /// <summary>Light factor at dusk: phases Morgen and Abend.</summary>
        public const float DuskFactor = 0.7f;

        /// <summary>Light factor at night.</summary>
        public const float NightFactor = 0.4f;

        /// <summary>Light factor at night within <see cref="NearLightRadius"/> of a lit fire or lamp.</summary>
        public const float NearLightFactor = 0.9f;

        /// <summary>Radius of a light source for the stealth AI (metres).</summary>
        public const float NearLightRadius = 5f;

        /// <summary>The light is applied again after this many game minutes (about 1 s of real time).</summary>
        public const double ApplyStepMinutes = 0.5;

        private const int MinutesPerDay = 1440;
        private const int MoonCycleDays = 8;

        /// <summary>Hour of the day (0 to below 24) at a total of game minutes.</summary>
        /// <param name="totalMinutes">Game minutes since day 1, 0:00.</param>
        public static double HourOfDay(double totalMinutes)
        {
            double minutes = totalMinutes % MinutesPerDay;
            if (minutes < 0d)
            {
                minutes += MinutesPerDay;
            }

            return minutes / 60d;
        }

        /// <summary>Day of the moon cycle (0 = full moon on day 1, 4 = new moon on day 5), like the calendar.</summary>
        /// <param name="totalMinutes">Game minutes since day 1, 0:00.</param>
        public static int MoonDay(double totalMinutes)
        {
            long day = (long)Math.Floor(totalMinutes / MinutesPerDay);
            return (int)(((day % MoonCycleDays) + MoonCycleDays) % MoonCycleDays);
        }

        /// <summary>Height of the sun in degrees: an arc from sunrise to sunset, below the horizon down to −depth at night.</summary>
        /// <param name="hour">Hour of the day.</param>
        /// <param name="path">Sun path.</param>
        public static float SunElevation(double hour, DayNightSunPath path)
        {
            double rise = path.SunriseHour;
            double set = path.SunsetHour;
            if (hour >= rise && hour <= set)
            {
                return (float)(path.NoonElevation * Math.Sin(Math.PI * (hour - rise) / (set - rise)));
            }

            double night = 24d - (set - rise);
            double t = NightTime(hour, set);
            return (float)(-path.NightDepth * Math.Sin(Math.PI * t / night));
        }

        /// <summary>Compass direction of the sun in degrees (east at sunrise, south at noon, west at sunset; on round at night).</summary>
        /// <param name="hour">Hour of the day.</param>
        /// <param name="path">Sun path.</param>
        public static float SunAzimuth(double hour, DayNightSunPath path)
        {
            double rise = path.SunriseHour;
            double set = path.SunsetHour;
            double azimuth;
            if (hour >= rise && hour <= set)
            {
                azimuth = path.RiseAzimuth + (path.SetAzimuth - path.RiseAzimuth) * (hour - rise) / (set - rise);
            }
            else
            {
                double night = 24d - (set - rise);
                double t = NightTime(hour, set);
                azimuth = path.SetAzimuth + (360d + path.RiseAzimuth - path.SetAzimuth) * t / night;
            }

            return (float)(((azimuth % 360d) + 360d) % 360d);
        }

        /// <summary>Share of the moon light: 1 at full moon (day 0), <see cref="DayNightSunPath.NewMoonFactor"/> at new moon (day 4).</summary>
        /// <param name="moonDay">Day of the moon cycle.</param>
        /// <param name="newMoonFactor">Share at new moon.</param>
        public static float MoonFactor(int moonDay, float newMoonFactor)
        {
            double full = (1d + Math.Cos(2d * Math.PI * moonDay / MoonCycleDays)) / 2d;
            return (float)(newMoonFactor + (1d - newMoonFactor) * full);
        }

        /// <summary>Daylight 0–1 from the sun height (0 below −3°, 1 above 10°).</summary>
        /// <param name="sunElevation">Sun height in degrees.</param>
        public static float Daylight(float sunElevation)
        {
            return SmoothStep(-3f, 10f, sunElevation);
        }

        /// <summary>
        /// Factor of the sky brightness around the sun–moon swap at −3°: 0.3 there, 1 again at 0° and −6°, so the jump of the sky's
        /// light direction is not seen.
        /// </summary>
        /// <param name="sunElevation">Sun height in degrees.</param>
        public static float SkyHandoverDip(float sunElevation)
        {
            return 1f - 0.7f * (1f - SmoothStep(0f, 3f, Math.Abs(sunElevation + 3f)));
        }

        /// <summary>Light factor of the stealth AI for a phase of the day (a step: Tag 1.0, Morgen and Abend 0.7, Nacht 0.4).</summary>
        /// <param name="phase">Phase of the day.</param>
        public static float LightFactor(DayPhase phase)
        {
            switch (phase)
            {
                case DayPhase.Day:
                    return DayFactor;
                case DayPhase.Morning:
                case DayPhase.Evening:
                    return DuskFactor;
                default:
                    return NightFactor;
            }
        }

        /// <summary>Smooth 0–1 step between two edges (edges may be given in falling order).</summary>
        /// <param name="edge0">Value giving 0.</param>
        /// <param name="edge1">Value giving 1.</param>
        /// <param name="x">Value.</param>
        public static float SmoothStep(float edge0, float edge1, float x)
        {
            if (edge0 == edge1)
            {
                return x < edge0 ? 0f : 1f;
            }

            float t = Mathf.Clamp01((x - edge0) / (edge1 - edge0));
            return t * t * (3f - 2f * t);
        }

        /// <summary>Evaluates a profile at an hour: sun, moon, keys blended over midnight, sky dip, daylight.</summary>
        /// <param name="path">Sun and moon path.</param>
        /// <param name="keys">Keys sorted by hour (at least one).</param>
        /// <param name="hour">Hour of the day.</param>
        /// <param name="moonDay">Day of the moon cycle.</param>
        public static DayNightSample Evaluate(DayNightSunPath path, IReadOnlyList<DayNightKey> keys, double hour, int moonDay)
        {
            if (path == null)
            {
                path = new DayNightSunPath();
            }

            float sunElevation = SunElevation(hour, path);
            float sunAzimuth = SunAzimuth(hour, path);
            Blend(keys, hour, out DayNightKey a, out DayNightKey b, out float t);

            float keySun = Lerp(a?.SunIntensity ?? 1f, b?.SunIntensity ?? 1f, t);
            Color keySunColor = Color.Lerp(a?.SunColor ?? Color.white, b?.SunColor ?? Color.white, t);

            // Sun by day (faded in over the first 6°), the moon below −3°, nothing in between: the swap of direction is not seen.
            bool moon = sunElevation < -3f;
            float elevation;
            float azimuth;
            Color color;
            float intensity;
            float shadow;
            if (moon)
            {
                elevation = Math.Max(-sunElevation, path.MoonMinElevation);
                azimuth = (sunAzimuth + 180f) % 360f;
                color = path.MoonColor;
                intensity = path.MoonIntensity * SmoothStep(-3f, -9f, sunElevation) * MoonFactor(moonDay, path.NewMoonFactor);
                shadow = path.MoonShadowStrength;
            }
            else
            {
                elevation = sunElevation;
                azimuth = sunAzimuth;
                color = keySunColor;
                intensity = keySun * SmoothStep(0f, 6f, sunElevation);
                shadow = 1f;
            }

            Color ambientGround = Color.Lerp(a?.AmbientGround ?? Color.gray, b?.AmbientGround ?? Color.gray, t);
            return new DayNightSample(
                (float)hour,
                DayPhaseRules.Of((int)Math.Floor(hour)),
                sunElevation,
                sunAzimuth,
                moon,
                elevation,
                azimuth,
                color,
                intensity,
                shadow,
                Color.Lerp(a?.AmbientSky ?? Color.gray, b?.AmbientSky ?? Color.gray, t),
                Color.Lerp(a?.AmbientEquator ?? Color.gray, b?.AmbientEquator ?? Color.gray, t),
                ambientGround,
                Color.Lerp(a?.FogColor ?? Color.gray, b?.FogColor ?? Color.gray, t),
                Lerp(a?.FogDensity ?? 0f, b?.FogDensity ?? 0f, t),
                Color.Lerp(a?.SkyTint ?? Color.gray, b?.SkyTint ?? Color.gray, t),
                ambientGround,
                Lerp(a?.SkyExposure ?? 1f, b?.SkyExposure ?? 1f, t) * SkyHandoverDip(sunElevation),
                Lerp(a?.Atmosphere ?? 1f, b?.Atmosphere ?? 1f, t),
                Lerp(a?.SunSize ?? 0.04f, b?.SunSize ?? 0.04f, t),
                Lerp(a?.Reflection ?? 1f, b?.Reflection ?? 1f, t),
                Lerp(a?.LocalLights ?? 1f, b?.LocalLights ?? 1f, t),
                Daylight(sunElevation));
        }

        /// <summary>
        /// The two keys around an hour and the blend between them (keys sorted by hour; over midnight the last key blends into the
        /// first). With one key both are that key.
        /// </summary>
        /// <param name="keys">Keys sorted by hour.</param>
        /// <param name="hour">Hour of the day.</param>
        /// <param name="from">Key before (or at) the hour.</param>
        /// <param name="to">Key after the hour.</param>
        /// <param name="t">Blend 0–1 from <paramref name="from"/> to <paramref name="to"/>.</param>
        public static void Blend(IReadOnlyList<DayNightKey> keys, double hour, out DayNightKey from, out DayNightKey to, out float t)
        {
            from = null;
            to = null;
            t = 0f;
            if (keys == null || keys.Count == 0)
            {
                return;
            }

            if (keys.Count == 1)
            {
                from = keys[0];
                to = keys[0];
                return;
            }

            DayNightKey first = keys[0];
            DayNightKey last = keys[keys.Count - 1];
            if (hour < first.Hour || hour >= last.Hour)
            {
                // Over midnight: from the last key of the day to the first one of the next.
                double span = first.Hour + 24d - last.Hour;
                double passed = hour >= last.Hour ? hour - last.Hour : hour + 24d - last.Hour;
                from = last;
                to = first;
                t = span > 0d ? (float)(passed / span) : 0f;
                return;
            }

            for (int i = 0; i < keys.Count - 1; i++)
            {
                if (hour >= keys[i].Hour && hour < keys[i + 1].Hour)
                {
                    from = keys[i];
                    to = keys[i + 1];
                    double span = keys[i + 1].Hour - keys[i].Hour;
                    t = span > 0d ? (float)((hour - keys[i].Hour) / span) : 0f;
                    return;
                }
            }

            from = last;
            to = last;
        }

        private static double NightTime(double hour, double set)
        {
            // Hours since sunset, across midnight.
            return hour > set ? hour - set : hour + 24d - set;
        }

        private static float Lerp(float a, float b, float t)
        {
            return a + (b - a) * t;
        }
    }
}
