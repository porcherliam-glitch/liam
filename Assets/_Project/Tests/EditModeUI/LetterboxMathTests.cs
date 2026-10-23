using Aetherfall.UI.Framework;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>Height of the cinema bars of a cutscene (S58).</summary>
    [TestFixture]
    public sealed class LetterboxMathTests
    {
        [Test]
        public void SixteenByNine_CutsTo235()
        {
            Assert.That(LetterboxMath.BarFraction(16f / 9f), Is.EqualTo(0.1217f).Within(0.001f));
        }

        [Test]
        public void SixteenByTen_IsCapped()
        {
            Assert.That(LetterboxMath.BarFraction(16f / 10f), Is.EqualTo(LetterboxMath.MaxBarFraction));
        }

        [TestCase(21f / 9f)]
        [TestCase(32f / 9f)]
        [TestCase(2.35f)]
        public void WideScreens_GetNoBars(float aspect)
        {
            Assert.That(LetterboxMath.BarFraction(aspect), Is.Zero);
        }

        [TestCase(0f)]
        [TestCase(-1f)]
        [TestCase(float.NaN)]
        [TestCase(float.PositiveInfinity)]
        public void InvalidAspect_GetsNoBars(float aspect)
        {
            Assert.That(LetterboxMath.BarFraction(aspect), Is.Zero);
        }
    }
}
