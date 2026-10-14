using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>Ground layers: weights add up to 1; paths are earth, the plaza is earth, the crater ash, steep slopes rock.</summary>
    [TestFixture]
    public sealed class LayoutGroundMapTests
    {
        private RegionLayout _layout;
        private LayoutGroundMap _ground;

        [OneTimeSetUp]
        public void LoadLayout()
        {
            _layout = LayoutTestFiles.LoadEichental();
            _ground = new LayoutGroundMap(_layout);
        }

        [TestCase(0.0, 0.0, 0.0)]
        [TestCase(-100.0, -37.5, 6.6)]
        [TestCase(120.0, 44.0, 5.6)]
        [TestCase(0.0, 200.0, 26.2)]
        [TestCase(-20.0, 90.0, 50.0)]
        public void WeightsAddUpToOne(double x, double z, double slope)
        {
            GroundWeights w = _ground.Weights(x, z, slope);

            Assert.That(w.Grass + w.Dirt + w.Rock + w.Ash, Is.EqualTo(1.0).Within(1e-12));
        }

        [Test]
        public void RoadIsEarth()
        {
            Assert.That(_ground.Weights(-100.0, -37.5, 0.0).Dirt, Is.EqualTo(1.0).Within(1e-12));
        }

        [Test]
        public void PlazaIsEarthAndCraterIsAsh()
        {
            Assert.That(_ground.Weights(40.0, -30.0, 0.0).Dirt, Is.EqualTo(1.0).Within(1e-12));
            Assert.That(_ground.Weights(120.0, 44.0, 5.6).Ash, Is.EqualTo(1.0).Within(1e-12));
        }

        [Test]
        public void SteepSlopeIsRock()
        {
            Assert.That(_ground.Weights(0.0, 100.0, 45.0).Rock, Is.EqualTo(1.0).Within(1e-12));
            Assert.That(_ground.Weights(0.0, 100.0, 25.0).Rock, Is.EqualTo(0.0).Within(1e-12));
        }

        [Test]
        public void OpenMeadowIsGrass()
        {
            Assert.That(_ground.Weights(-60.0, 60.0, 3.0).Grass, Is.EqualTo(1.0).Within(1e-12));
        }

        [Test]
        public void AlphamapHasFourNormalisedLayers()
        {
            float[,,] map = _ground.SampleAlphamap(new LayoutHeightField(_layout), 32);

            Assert.That(map.GetLength(2), Is.EqualTo(4));
            for (int z = 0; z < 32; z++)
            {
                for (int x = 0; x < 32; x++)
                {
                    float sum = map[z, x, 0] + map[z, x, 1] + map[z, x, 2] + map[z, x, 3];
                    Assert.That(sum, Is.EqualTo(1f).Within(1e-5f));
                }
            }
        }
    }
}
