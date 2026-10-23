using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// The optional <c>dayCycle</c> block of the layout file (S35): read with sun, moon and keys, missing without complaint,
    /// checked for order, times and ranges; the real Eichental file passes and its 18:10 key is the static lighting block.
    /// </summary>
    [TestFixture]
    public sealed class DayCycleLayoutTests
    {
        [Test]
        public void TheBlockIsRead_TimesBecomeHours()
        {
            RegionLayout layout = TestLayouts.Load(TestLayouts.Build(extra: Block(Key("05:30", 0.6) + ", " + Key("18:10", 1.3))), out LayoutReport report);

            Assert.That(report.HasErrors, Is.False, LayoutTestFiles.Describe(report));
            Assert.That(layout.DayCycle, Is.Not.Null);
            Assert.That(layout.DayCycle.Sunrise, Is.EqualTo(5.5).Within(1e-9));
            Assert.That(layout.DayCycle.MoonIntensity, Is.EqualTo(0.22).Within(1e-9));
            Assert.That(layout.DayCycle.Keys.Count, Is.EqualTo(2));
            Assert.That(layout.DayCycle.Keys[0].Hour, Is.EqualTo(5.5).Within(1e-9));
            Assert.That(layout.DayCycle.Keys[1].Hour, Is.EqualTo(18 + 10 / 60.0).Within(1e-9));
            Assert.That(layout.DayCycle.Keys[1].SunIntensity, Is.EqualTo(1.3).Within(1e-9));
        }

        [Test]
        public void WithoutTheBlock_ThereIsNoDayCycle_AndNoComplaint()
        {
            RegionLayout layout = TestLayouts.Load(TestLayouts.Build(), out LayoutReport report);

            Assert.That(report.HasErrors, Is.False);
            Assert.That(layout.DayCycle, Is.Null);
        }

        [Test]
        public void AnUnknownEntry_IsAWarningNotAnError()
        {
            string block = Block(Key("05:30", 0.6) + ", " + Key("18:10", 1.3)).Replace("\"keys\":", "\"wetter\": 1, \"keys\":");
            TestLayouts.Load(TestLayouts.Build(extra: block), out LayoutReport report);

            Assert.That(report.HasErrors, Is.False);
            Assert.That(LayoutTestFiles.Describe(report), Does.Contain("wetter"));
        }

        [Test]
        public void KeysOutOfOrder_AreAnError()
        {
            TestLayouts.Load(TestLayouts.Build(extra: Block(Key("18:10", 1.3) + ", " + Key("05:30", 0.6))), out LayoutReport report);

            Assert.That(report.HasErrors, Is.True);
            Assert.That(LayoutTestFiles.Describe(report), Does.Contain("aufsteigend"));
        }

        [TestCase("24:00")]
        [TestCase("7:5x")]
        [TestCase("12-30")]
        public void ABrokenTime_IsAnError(string time)
        {
            TestLayouts.Load(TestLayouts.Build(extra: Block(Key("05:30", 0.6) + ", " + Key(time, 1.3))), out LayoutReport report);

            Assert.That(report.HasErrors, Is.True);
            Assert.That(LayoutTestFiles.Describe(report), Does.Contain("HH:mm"));
            Assert.That(LayoutTestFiles.Describe(report), Does.Contain("dayCycle.keys[1].time"), "the finding points at the real field");
        }

        [Test]
        public void ValuesOutOfRange_AreErrors()
        {
            string tooFoggy = Key("12:00", 1.0).Replace("\"fogDensity\": 0.002", "\"fogDensity\": 0.08");
            TestLayouts.Load(TestLayouts.Build(extra: Block(Key("05:30", 0.6) + ", " + tooFoggy)), out LayoutReport fog);
            Assert.That(LayoutTestFiles.Describe(fog), Does.Contain("Nebeldichte"));

            TestLayouts.Load(TestLayouts.Build(extra: Block(Key("05:30", -1.0) + ", " + Key("12:00", 1.0))), out LayoutReport sun);
            Assert.That(LayoutTestFiles.Describe(sun), Does.Contain("Sonnenstärke"));

            TestLayouts.Load(TestLayouts.Build(extra: Block(Key("05:30", 0.6)).Replace("\"sunset\": \"20:30\"", "\"sunset\": \"04:00\"")), out LayoutReport night);
            Assert.That(LayoutTestFiles.Describe(night), Does.Contain("Sonnenaufgang"));
            Assert.That(LayoutTestFiles.Describe(night), Does.Contain("mindestens 2"));
        }

        [Test]
        public void TheEichentalFile_HasElevenKeys_And1810IsTheLightingBlock()
        {
            RegionLayout layout = TestLayouts.Load(LayoutTestFiles.ReadEichental(), out LayoutReport report);

            Assert.That(report.HasErrors, Is.False, LayoutTestFiles.Describe(report));
            Assert.That(layout.DayCycle, Is.Not.Null);
            Assert.That(layout.DayCycle.Keys.Count, Is.EqualTo(11));
            LayoutDayKey golden = null;
            foreach (LayoutDayKey key in layout.DayCycle.Keys)
            {
                if (key.Time == "18:10")
                {
                    golden = key;
                }
            }

            Assert.That(golden, Is.Not.Null, "a key at 18:10");
            LayoutLighting lighting = layout.Lighting;
            Assert.That(golden.SunColor.ToHex(), Is.EqualTo(lighting.SunColor.ToHex()));
            Assert.That(golden.SunIntensity, Is.EqualTo(lighting.SunIntensity).Within(1e-9));
            Assert.That(golden.AmbientSky.ToHex(), Is.EqualTo(lighting.AmbientSky.ToHex()));
            Assert.That(golden.AmbientEquator.ToHex(), Is.EqualTo(lighting.AmbientEquator.ToHex()));
            Assert.That(golden.AmbientGround.ToHex(), Is.EqualTo(lighting.AmbientGround.ToHex()));
            Assert.That(golden.FogColor.ToHex(), Is.EqualTo(lighting.FogColor.ToHex()));
            Assert.That(golden.FogDensity, Is.EqualTo(lighting.FogDensity).Within(1e-9));
            Assert.That(golden.SkyTint.ToHex(), Is.EqualTo(lighting.SkyTop.ToHex()));
        }

        private static string Block(string keys)
        {
            return "\"dayCycle\": { \"sun\": { \"sunrise\": \"05:30\", \"sunset\": \"20:30\", \"noonElevation\": 52, \"nightDepth\": 40, " +
                   "\"riseAzimuth\": 90, \"setAzimuth\": 270 }, \"moon\": { \"color\": \"#9DB4E8\", \"intensity\": 0.22, \"newMoonFactor\": 0.25, " +
                   "\"shadowStrength\": 0.55, \"minElevation\": 12 }, \"keys\": [ " + keys + " ] }";
        }

        private static string Key(string time, double sun)
        {
            return "{ \"time\": \"" + time + "\", \"sunColor\": \"#FFFFFF\", \"sunIntensity\": " + sun.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                   ", \"ambientSky\": \"#808080\", \"ambientEquator\": \"#808080\", \"ambientGround\": \"#404040\", \"fogColor\": \"#808080\", " +
                   "\"fogDensity\": 0.002, \"skyTint\": \"#6080C0\", \"skyExposure\": 1, \"atmosphere\": 1, \"sunSize\": 0.04, \"reflection\": 1, " +
                   "\"localLights\": 1 }";
        }
    }
}
