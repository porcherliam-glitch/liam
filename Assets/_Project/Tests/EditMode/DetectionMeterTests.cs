using Aetherfall.AI;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Detection value 0–100 (GDD 03 9.2): rises with the sight rate, falls by 20 per second after 2 s without sight.</summary>
    [TestFixture]
    public sealed class DetectionMeterTests
    {
        [Test]
        public void SightRate_AddsPerSecondAndCapsAtHundred()
        {
            var meter = new DetectionMeter();

            meter.Update(1f, 38f, false, 0f);
            Assert.That(meter.Value, Is.EqualTo(38f).Within(1e-4f));

            meter.Update(3f, 38f, false, 0f);
            Assert.That(meter.Value, Is.EqualTo(100f));
        }

        [Test]
        public void WithoutSight_DecaysAfterTwoSeconds()
        {
            var meter = new DetectionMeter();
            meter.Set(60f);
            meter.Update(0.1f, 10f, false, 0f);

            meter.Update(2f, 0f, false, 0f);
            Assert.That(meter.Value, Is.EqualTo(61f).Within(1e-3f), "No decay within the first 2 s.");

            meter.Update(1f, 0f, false, 0f);
            Assert.That(meter.Value, Is.EqualTo(41f).Within(1e-3f));
        }

        [Test]
        public void DecayFactor_SlowsTheDecay()
        {
            var meter = new DetectionMeter();
            meter.Set(90f);
            meter.Update(0.1f, 1f, false, 0f);
            meter.Update(2f, 0f, false, 0f);
            float before = meter.Value;

            meter.Update(1f, 0f, false, 0f, 0.5f);

            Assert.That(before - meter.Value, Is.EqualTo(10f).Within(1e-3f));
        }

        [Test]
        public void Instant_SetsHundred()
        {
            var meter = new DetectionMeter();

            meter.Update(0.016f, 0f, true, 0f);

            Assert.That(meter.Value, Is.EqualTo(100f));
            Assert.That(meter.TimeWithoutSight, Is.EqualTo(0f));
        }

        [Test]
        public void Noise_RaisesToItsValueButNeverLowers()
        {
            var meter = new DetectionMeter();

            meter.Update(0.1f, 0f, false, 40f);
            Assert.That(meter.Value, Is.EqualTo(40f));

            meter.Set(80f);
            meter.Update(0.1f, 0f, false, 40f);
            Assert.That(meter.Value, Is.EqualTo(80f));
        }

        [Test]
        public void SetAndReset_Clamp()
        {
            var meter = new DetectionMeter();

            meter.Set(150f);
            Assert.That(meter.Value, Is.EqualTo(100f));

            meter.Set(-5f);
            Assert.That(meter.Value, Is.EqualTo(0f));

            meter.Set(50f);
            meter.Reset();
            Assert.That(meter.Value, Is.EqualTo(0f));
            Assert.That(float.IsPositiveInfinity(meter.TimeWithoutSight), Is.True);
        }
    }
}
