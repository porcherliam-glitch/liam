using System.Collections.Generic;
using Aetherfall.Events;
using Aetherfall.World;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// The arithmetic of day and night (S35): the path of sun and moon, the moon cycle, the twilight gaps without a main light, the
    /// sky dip at the swap, the blend of the keys over midnight, the daylight share and the stepped light factor of the stealth AI.
    /// </summary>
    [TestFixture]
    public sealed class DayNightMathTests
    {
        private static readonly DayNightSunPath Path = new DayNightSunPath();

        [Test]
        public void Sun_RisesAtHalfPastFive_StandsHighestAtOne_SetsAtHalfPastEight()
        {
            Assert.That(DayNightMath.SunElevation(13.0, Path), Is.EqualTo(52f).Within(0.01f));
            Assert.That(DayNightMath.SunElevation(5.5, Path), Is.EqualTo(0f).Within(0.01f));
            Assert.That(DayNightMath.SunElevation(20.5, Path), Is.EqualTo(0f).Within(0.01f));
            Assert.That(DayNightMath.SunElevation(1.0, Path), Is.EqualTo(-40f).Within(0.01f), "deepest at 01:00, half the night");
            Assert.That(DayNightMath.SunElevation(22.0, Path), Is.EqualTo(-20f).Within(0.05f));
        }

        [Test]
        public void Sun_At1810_IsTheSunOfTheGeneratedScene()
        {
            // The layout's lighting block (242°, 24°) is the look at 18:10.
            Assert.That(DayNightMath.SunAzimuth(18 + 10 / 60.0, Path), Is.EqualTo(242f).Within(0.2f));
            Assert.That(DayNightMath.SunElevation(18 + 10 / 60.0, Path), Is.EqualTo(24.4f).Within(0.2f));
            Assert.That(DayNightMath.SunAzimuth(10.0, Path), Is.EqualTo(144f).Within(0.2f));
            Assert.That(DayNightMath.SunElevation(10.0, Path), Is.EqualTo(42.1f).Within(0.2f));
        }

        [Test]
        public void SunDirection_MovesOnWithoutJumps_RoundTheClock()
        {
            float previous = DayNightMath.SunAzimuth(0.0, Path);
            for (double h = 0.01; h < 24.0; h += 0.01)
            {
                float now = DayNightMath.SunAzimuth(h, Path);
                float step = Mathf.Abs(Mathf.DeltaAngle(previous, now));
                Assert.That(step, Is.LessThan(1f), "at " + h.ToString("0.00"));
                previous = now;
            }
        }

        [Test]
        public void Moon_FullOnDayOne_FaintAtNewMoon()
        {
            Assert.That(DayNightMath.MoonFactor(0, 0.25f), Is.EqualTo(1f).Within(0.001f));
            Assert.That(DayNightMath.MoonFactor(4, 0.25f), Is.EqualTo(0.25f).Within(0.001f));
            Assert.That(DayNightMath.MoonFactor(2, 0.25f), Is.EqualTo(0.625f).Within(0.001f));
        }

        [Test]
        public void AtTenAtNight_TheMoonIsTheMainLight()
        {
            DayNightSample full = DayNightMath.Evaluate(Path, Keys(), 22.0, 0);
            Assert.That(full.MainLightIsMoon, Is.True);
            Assert.That(full.MainLightIntensity, Is.EqualTo(0.22f).Within(0.001f));
            Assert.That(full.MainLightElevation, Is.EqualTo(20f).Within(0.05f));
            Assert.That(full.MainLightAzimuth, Is.EqualTo(120f).Within(0.2f));
            Assert.That(full.MainLightColor.b, Is.GreaterThan(full.MainLightColor.r), "bluish, never a sun colour");

            DayNightSample newMoon = DayNightMath.Evaluate(Path, Keys(), 22.0, 4);
            Assert.That(newMoon.MainLightIntensity, Is.EqualTo(0.055f).Within(0.001f));
        }

        [Test]
        public void InTheTwilightGaps_ThereIsNoMainLight_AtNoonTheFullSun()
        {
            Assert.That(DayNightMath.Evaluate(Path, Keys(), 20.6, 0).MainLightIntensity, Is.LessThan(0.02f));
            Assert.That(DayNightMath.Evaluate(Path, Keys(), 5.4, 0).MainLightIntensity, Is.LessThan(0.02f));
            DayNightSample noon = DayNightMath.Evaluate(Path, Keys(), 13.0, 0);
            Assert.That(noon.MainLightIsMoon, Is.False);
            Assert.That(noon.MainLightIntensity, Is.EqualTo(1.45f).Within(0.001f));
        }

        [Test]
        public void SkyDip_HidesTheSwapAtMinusThreeDegrees()
        {
            Assert.That(DayNightMath.SkyHandoverDip(-3f), Is.EqualTo(0.3f).Within(0.001f));
            Assert.That(DayNightMath.SkyHandoverDip(0f), Is.EqualTo(1f).Within(0.001f));
            Assert.That(DayNightMath.SkyHandoverDip(-6f), Is.EqualTo(1f).Within(0.001f));
            Assert.That(DayNightMath.SkyHandoverDip(20f), Is.EqualTo(1f).Within(0.001f));
        }

        [Test]
        public void Keys_BlendLinearly_AndOverMidnight()
        {
            List<DayNightKey> keys = Keys();
            DayNightSample golden = DayNightMath.Evaluate(Path, keys, keys[3].Hour, 0);
            Assert.That(golden.AmbientSky, Is.EqualTo(keys[3].AmbientSky), "18:10 is exactly its key");

            DayNightSample late = DayNightMath.Evaluate(Path, keys, 23.0, 0);
            Assert.That(late.AmbientSky, Is.EqualTo(keys[0].AmbientSky), "21:30 to 00:00 are both night keys");

            DayNightMath.Blend(keys, 10.5, out DayNightKey from, out DayNightKey to, out float t);
            Assert.That(from, Is.SameAs(keys[1]));
            Assert.That(to, Is.SameAs(keys[2]));
            Assert.That(t, Is.GreaterThan(0f).And.LessThan(1f));

            var two = new List<DayNightKey> { Key(6f, Color.black, 0f), Key(18f, Color.white, 1f) };
            DayNightMath.Blend(two, 12.0, out _, out _, out float half);
            Assert.That(half, Is.EqualTo(0.5f).Within(0.001f));
            DayNightMath.Blend(two, 0.0, out DayNightKey night, out _, out float midnight);
            Assert.That(night, Is.SameAs(two[1]), "after the last key of the day comes the first of the next");
            Assert.That(midnight, Is.EqualTo(0.5f).Within(0.001f));
        }

        [Test]
        public void LightFactor_StepsWithThePhase()
        {
            Assert.That(DayNightMath.LightFactor(DayPhase.Day), Is.EqualTo(1f));
            Assert.That(DayNightMath.LightFactor(DayPhase.Morning), Is.EqualTo(0.7f));
            Assert.That(DayNightMath.LightFactor(DayPhase.Evening), Is.EqualTo(0.7f));
            Assert.That(DayNightMath.LightFactor(DayPhase.Night), Is.EqualTo(0.4f));
        }

        [Test]
        public void Daylight_FullAtNoon_NoneAtNight()
        {
            Assert.That(DayNightMath.Daylight(DayNightMath.SunElevation(12.0, Path)), Is.EqualTo(1f));
            Assert.That(DayNightMath.Daylight(DayNightMath.SunElevation(23.0, Path)), Is.EqualTo(0f));
        }

        [Test]
        public void HourAndMoonDay_FromTheGameMinutes()
        {
            Assert.That(DayNightMath.HourOfDay(600.0), Is.EqualTo(10.0).Within(1e-9));
            Assert.That(DayNightMath.MoonDay(600.0), Is.EqualTo(0));
            Assert.That(DayNightMath.HourOfDay(4 * 1440 + 22 * 60), Is.EqualTo(22.0).Within(1e-9));
            Assert.That(DayNightMath.MoonDay(4 * 1440 + 22 * 60), Is.EqualTo(4), "day 5: new moon");
        }

        private static List<DayNightKey> Keys()
        {
            // Night, morning, noon, golden hour, night again – in the order of the hours, like the generated profile.
            return new List<DayNightKey>
            {
                Key(0f, new Color(0.17f, 0.24f, 0.4f), 0f),
                Key(8f, new Color(0.63f, 0.73f, 0.84f), 1.2f),
                Key(13f, new Color(0.66f, 0.76f, 0.88f), 1.45f),
                Key(18f + 10f / 60f, new Color(0.62f, 0.72f, 0.83f), 1.3f),
                Key(21.5f, new Color(0.17f, 0.24f, 0.4f), 0f)
            };
        }

        private static DayNightKey Key(float hour, Color ambient, float sun)
        {
            return new DayNightKey(hour, Color.white, sun, ambient, ambient, ambient, ambient, 0.002f, ambient, 1f, 1f, 0.04f, 1f, 1f);
        }
    }
}
