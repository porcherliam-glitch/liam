using Aetherfall.World;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// The generated day cycle of Eichental (S35) matches its layout file: same number of keys, same sun path, the 18:10 key is the
    /// static lighting. Fails when the layout changed but "Aetherfall > Eichental erstellen" was not run again.
    /// </summary>
    [TestFixture]
    public sealed class DayNightProfileAssetTests
    {
        private const string ProfilePath = "Assets/_Project/Data/Regions/Eichental/DN_Eichental.asset";

        [Test]
        public void TheProfileEqualsTheLayout()
        {
            var profile = AssetDatabase.LoadAssetAtPath<DayNightProfile>(ProfilePath);
            Assert.That(profile, Is.Not.Null, "DN_Eichental.asset fehlt – Menü „Aetherfall > Eichental erstellen“ ausführen.");

            RegionLayout layout = LayoutTestFiles.LoadEichental();
            LayoutDayCycle cycle = layout.DayCycle;
            Assert.That(profile.Keys.Count, Is.EqualTo(cycle.Keys.Count));
            Assert.That(profile.SunPath.SunriseHour, Is.EqualTo((float)cycle.Sunrise).Within(1e-4f));
            Assert.That(profile.SunPath.SunsetHour, Is.EqualTo((float)cycle.Sunset).Within(1e-4f));
            Assert.That(profile.SunPath.NoonElevation, Is.EqualTo((float)cycle.NoonElevation).Within(1e-4f));
            Assert.That(profile.SunPath.MoonIntensity, Is.EqualTo((float)cycle.MoonIntensity).Within(1e-4f));
            for (int i = 0; i < cycle.Keys.Count; i++)
            {
                LayoutDayKey key = cycle.Keys[i];
                DayNightKey baked = profile.Keys[i];
                Assert.That(baked.Hour, Is.EqualTo((float)key.Hour).Within(1e-4f), key.Time);
                Assert.That(baked.SunIntensity, Is.EqualTo((float)key.SunIntensity).Within(1e-4f), key.Time);
                Assert.That(ColorUtility.ToHtmlStringRGB(baked.AmbientSky), Is.EqualTo(key.AmbientSky.ToHex().TrimStart('#')), key.Time);
                Assert.That(baked.FogDensity, Is.EqualTo((float)key.FogDensity).Within(1e-6f), key.Time);
            }
        }
    }
}
