using System;
using System.Collections.Generic;
using System.Linq;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.World;
using NUnit.Framework;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// The day-and-night service (S35): which scene shows the light, how often it is applied (every half game minute, at once
    /// after a jump or a scene change), the light factor of the stealth AI (phase step, fires within 5 m, indoors, no scene) and
    /// the registry of light sources; window times and the installer.
    /// </summary>
    [TestFixture]
    public sealed class DayNightServiceTests
    {
        private FakeTime _time;
        private LightSourceRegistry _sources;
        private DayNightService _service;
        private DayNightProfile _profile;

        [SetUp]
        public void SetUp()
        {
            _time = new FakeTime { TotalGameMinutes = 22 * 60 };
            _sources = new LightSourceRegistry();
            _service = new DayNightService(_time, _sources);
            _profile = ScriptableObject.CreateInstance<DayNightProfile>();
            _profile.Configure(new DayNightSunPath(), new[]
            {
                new DayNightKey(0f, Color.white, 0f, Color.black, Color.black, Color.black, Color.black, 0.003f, Color.black, 0.2f, 0.7f, 0.025f, 0.2f, 1f),
                new DayNightKey(12f, Color.white, 1.4f, Color.white, Color.white, Color.white, Color.white, 0.002f, Color.white, 1.2f, 1f, 0.04f, 1f, 0.6f)
            });
        }

        [TearDown]
        public void TearDown()
        {
            UnityEngine.Object.DestroyImmediate(_profile);
        }

        [Test]
        public void WithoutAScene_TheLightFactorIsDaylight_AndNothingIsApplied()
        {
            Assert.That(_service.LightFactorAt(Vector3.zero), Is.EqualTo(1f));
            _service.Tick(0.016f);
            Assert.That(_service.LastAppliedMinutes, Is.NaN);
        }

        [Test]
        public void Outdoors_TheFactorFollowsThePhase_AndAFireLiftsTheNight()
        {
            var scene = new FakeEnvironment(_profile, DayNightMode.Outdoor);
            _service.RegisterEnvironment(scene);
            var fire = new FakeSource(new Vector3(10f, 1f, 0f), true);
            _sources.Register(fire);

            Assert.That(_service.LightFactorAt(Vector3.zero), Is.EqualTo(0.4f), "22:00, away from the fire");
            Assert.That(_service.LightFactorAt(new Vector3(7f, 1f, 0f)), Is.EqualTo(0.9f), "3 m from a burning fire");
            fire.Lit = false;
            Assert.That(_service.LightFactorAt(new Vector3(7f, 1f, 0f)), Is.EqualTo(0.4f), "a cold fire gives no light");

            fire.Lit = true;
            _time.TotalGameMinutes = 12 * 60;
            Assert.That(_service.LightFactorAt(new Vector3(7f, 1f, 0f)), Is.EqualTo(1f), "by day a fire changes nothing");
            _time.TotalGameMinutes = 19 * 60;
            Assert.That(_service.LightFactorAt(new Vector3(7f, 1f, 0f)), Is.EqualTo(0.9f), "at dusk a fire lifts 0.7 to 0.9");
        }

        [TestCase(4, 59, 0.4f)]
        [TestCase(5, 0, 0.7f)]
        [TestCase(7, 59, 0.7f)]
        [TestCase(8, 0, 1f)]
        [TestCase(17, 59, 1f)]
        [TestCase(18, 0, 0.7f)]
        [TestCase(20, 59, 0.7f)]
        [TestCase(21, 0, 0.4f)]
        public void TheFactorStepsAtThePhaseBoundaries(int hour, int minute, float expected)
        {
            _service.RegisterEnvironment(new FakeEnvironment(_profile, DayNightMode.Outdoor));
            _time.TotalGameMinutes = hour * 60 + minute;

            Assert.That(_service.LightFactorAt(Vector3.zero), Is.EqualTo(expected));
        }

        [Test]
        public void Indoors_TheFactorIsTheScenesConstant_AndAfterLeavingDaylightAgain()
        {
            var crypt = new FakeEnvironment(_profile, DayNightMode.Indoor) { IndoorLightFactor = 0.7f };
            _service.RegisterEnvironment(crypt);
            Assert.That(_service.LightFactorAt(Vector3.zero), Is.EqualTo(0.7f));

            _service.UnregisterEnvironment(crypt);
            Assert.That(_service.LightFactorAt(Vector3.zero), Is.EqualTo(1f));
        }

        [Test]
        public void TheLightIsAppliedEveryHalfGameMinute_AndAtOnceAfterAJump()
        {
            var scene = new FakeEnvironment(_profile, DayNightMode.Outdoor);
            _service.RegisterEnvironment(scene);
            _service.Tick(0.016f);
            Assert.That(scene.Applied.Count, Is.EqualTo(1));

            _time.TotalGameMinutes += 0.4;
            _service.Tick(0.016f);
            Assert.That(scene.Applied.Count, Is.EqualTo(1), "+0.4 game minutes: not yet");

            _time.TotalGameMinutes += 0.1;
            _service.Tick(0.016f);
            Assert.That(scene.Applied.Count, Is.EqualTo(2), "+0.5 game minutes");

            _time.TotalGameMinutes += 600;
            _service.Tick(0.016f);
            Assert.That(scene.Applied.Count, Is.EqualTo(3));
            Assert.That(scene.Applied.Last().Hour, Is.EqualTo((float)DayNightMath.HourOfDay(_time.TotalGameMinutes)).Within(0.001f),
                "a rest or fast travel snaps to the new hour");
        }

        [Test]
        public void TheSceneThatBecomesActive_WinsAndIsShownAtOnce()
        {
            var valley = new FakeEnvironment(_profile, DayNightMode.Outdoor);
            var crypt = new FakeEnvironment(_profile, DayNightMode.Indoor) { IsInActiveScene = false };
            _service.RegisterEnvironment(valley);
            _service.RegisterEnvironment(crypt);
            _service.Tick(0.016f);
            Assert.That(_service.Current, Is.SameAs(valley));
            int shown = crypt.Applied.Count;

            valley.IsInActiveScene = false;
            crypt.IsInActiveScene = true;
            _service.Tick(0.016f);

            Assert.That(_service.Current, Is.SameAs(crypt));
            Assert.That(crypt.Applied.Count, Is.EqualTo(shown + 1), "the scene change applies without waiting for the clock");
            Assert.That(_service.LightFactorAt(Vector3.zero), Is.EqualTo(1f), "indoors");
        }

        [Test]
        public void Registry_CountsLitSourcesWithinTheirRadius()
        {
            var source = new FakeSource(Vector3.zero, true);
            _sources.Register(source);
            _sources.Register(source);
            Assert.That(_sources.Count, Is.EqualTo(1), "twice counts once");
            Assert.That(_sources.AnyLitWithin(new Vector3(4.9f, 0f, 0f)), Is.True);
            Assert.That(_sources.AnyLitWithin(new Vector3(5.1f, 0f, 0f)), Is.False);

            source.Position = new Vector3(20f, 0f, 0f);
            Assert.That(_sources.AnyLitWithin(new Vector3(19f, 0f, 0f)), Is.True, "a moved source counts where it is");

            _sources.Unregister(source);
            Assert.That(_sources.AnyLitWithin(new Vector3(19f, 0f, 0f)), Is.False);
        }

        [Test]
        public void Windows_GlowInTheEveningAndEarlyMorning()
        {
            // A house: 19:45 to 21:30 and 05:00 to 06:30.
            Assert.That(WindowLightRules.IsLit(20.0, 19.75, 21.5, 5.0, 6.5), Is.True);
            Assert.That(WindowLightRules.IsLit(22.0, 19.75, 21.5, 5.0, 6.5), Is.False);
            Assert.That(WindowLightRules.IsLit(3.0, 19.75, 21.5, 5.0, 6.5), Is.False);
            Assert.That(WindowLightRules.IsLit(12.0, 19.75, 21.5, 5.0, 6.5), Is.False);
            Assert.That(WindowLightRules.IsLit(5.5, 19.75, 21.5, 5.0, 6.5), Is.True);

            // The tavern closes at midnight.
            Assert.That(WindowLightRules.IsLit(23.5, 19.75, 24.0, 5.0, 6.5), Is.True);
            Assert.That(WindowLightRules.IsLit(0.5, 19.75, 24.0, 5.0, 6.5), Is.False);
        }

        [Test]
        public void Installer_ProvidesServiceAndRegistry_FromTheGameTime()
        {
            var installer = ScriptableObject.CreateInstance<DayNightInstaller>();
            try
            {
                Assert.That(installer.Provides, Is.EquivalentTo(new[] { typeof(IDayNightService), typeof(ILightSourceRegistry) }));
                Assert.That(installer.Requires, Is.EquivalentTo(new[] { typeof(IGameTimeSource) }));

                var locator = new ServiceLocator();
                locator.Register<IGameTimeSource>(_time);
                installer.Install(locator, locator);

                Assert.That(locator.TryGet(out IDayNightService service), Is.True);
                Assert.That(locator.TryGet(out ILightSourceRegistry registry), Is.True);
                Assert.That(service.Phase, Is.EqualTo(DayPhase.Night));
                Assert.That(registry.Count, Is.EqualTo(0));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(installer);
            }
        }

        private sealed class FakeTime : IGameTimeSource
        {
            public double TotalGameMinutes { get; set; }

            public bool IsClockRunning { get; set; } = true;
        }

        private sealed class FakeEnvironment : IDayNightEnvironment
        {
            public FakeEnvironment(DayNightProfile profile, DayNightMode mode)
            {
                Profile = profile;
                Mode = mode;
            }

            public List<DayNightSample> Applied { get; } = new List<DayNightSample>();

            public DayNightProfile Profile { get; }

            public DayNightMode Mode { get; }

            public float IndoorLightFactor { get; set; } = 1f;

            public bool IsInActiveScene { get; set; } = true;

            public void Apply(in DayNightSample sample)
            {
                Applied.Add(sample);
            }
        }

        private sealed class FakeSource : IWorldLightSource
        {
            public FakeSource(Vector3 position, bool lit)
            {
                Position = position;
                Lit = lit;
            }

            public Vector3 Position { get; set; }

            public float Radius => DayNightMath.NearLightRadius;

            public bool Lit { get; set; }

            public bool IsLit => Lit;
        }
    }
}
