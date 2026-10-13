using System;
using Aetherfall.Utilities;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// <see cref="Pcg32Random"/> (architecture 3.3: deterministic, seedable): reference values of the PCG reference
    /// implementation, determinism, state restore and value ranges.
    /// </summary>
    [TestFixture]
    public sealed class Pcg32RandomTests
    {
        [Test]
        public void NextUInt_MatchesThePcgReferenceImplementation()
        {
            // pcg32-demo of pcg-random.org: pcg32_srandom_r(&rng, 42u, 54u) prints these first six values.
            var random = new Pcg32Random(42UL, 54UL);
            uint[] expected = { 0xa15c02b7u, 0x7b47f409u, 0xba1d3330u, 0x83d2f293u, 0xbfa4784bu, 0xcbed606eu };

            for (int i = 0; i < expected.Length; i++)
            {
                Assert.That(random.NextUInt(), Is.EqualTo(expected[i]), "value " + i);
            }
        }

        [Test]
        public void SameSeed_GivesTheSameSequence_DifferentSeedsDiffer()
        {
            var a = new Pcg32Random(1234UL);
            var b = new Pcg32Random(1234UL);
            var c = new Pcg32Random(1235UL);
            bool anyDifference = false;
            for (int i = 0; i < 1000; i++)
            {
                uint value = a.NextUInt();
                Assert.That(b.NextUInt(), Is.EqualTo(value));
                anyDifference |= c.NextUInt() != value;
            }

            Assert.That(anyDifference, Is.True);
        }

        [Test]
        public void FromState_ContinuesTheSequence()
        {
            var original = new Pcg32Random(99UL, 7UL);
            original.NextUInt();
            original.NextUInt();
            Pcg32Random restored = Pcg32Random.FromState(original.State, original.Increment);

            for (int i = 0; i < 10; i++)
            {
                Assert.That(restored.NextUInt(), Is.EqualTo(original.NextUInt()));
            }
        }

        [Test]
        public void NextFloatAndNextDouble_StayInZeroToOne()
        {
            var random = new Pcg32Random(5UL);
            for (int i = 0; i < 10000; i++)
            {
                float f = random.NextFloat();
                double d = random.NextDouble();
                Assert.That(f, Is.GreaterThanOrEqualTo(0f).And.LessThan(1f));
                Assert.That(d, Is.GreaterThanOrEqualTo(0.0).And.LessThan(1.0));
            }
        }

        [Test]
        public void RangeInt_StaysInBoundsAndHitsEveryValue()
        {
            var random = new Pcg32Random(77UL);
            var counts = new int[6];
            for (int i = 0; i < 6000; i++)
            {
                int value = random.Range(-2, 4);
                Assert.That(value, Is.InRange(-2, 3));
                counts[value + 2]++;
            }

            for (int i = 0; i < counts.Length; i++)
            {
                Assert.That(counts[i], Is.InRange(800, 1200), "roughly uniform: value " + (i - 2));
            }
        }

        [Test]
        public void RangeInt_RejectsAnEmptyRange()
        {
            var random = new Pcg32Random(1UL);
            Assert.Throws<ArgumentOutOfRangeException>(() => random.Range(3, 3));
        }

        [Test]
        public void RangeFloat_StaysInBounds()
        {
            var random = new Pcg32Random(3UL);
            for (int i = 0; i < 1000; i++)
            {
                Assert.That(random.Range(2f, 5f), Is.GreaterThanOrEqualTo(2f).And.LessThan(5f));
            }
        }
    }
}
