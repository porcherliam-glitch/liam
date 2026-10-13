using Aetherfall.Utilities;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary><see cref="WorldGrid"/>: world position ↔ 512 m cell + local position (architecture 9.7, 10).</summary>
    [TestFixture]
    public sealed class WorldGridTests
    {
        [TestCase(0.0, 0, 0.0)]
        [TestCase(12.5, 0, 12.5)]
        [TestCase(511.9, 0, 511.9)]
        [TestCase(512.0, 1, 0.0)]
        [TestCase(-0.5, -1, 511.5)]
        [TestCase(-12.0, -1, 500.0)]
        [TestCase(-512.0, -1, 0.0)]
        [TestCase(-513.0, -2, 511.0)]
        public void CellAndLocal_RoundTrip(double world, int expectedCell, double expectedLocal)
        {
            int cell = WorldGrid.CellIndex(world);
            double local = WorldGrid.LocalCoordinate(world, cell);

            Assert.That(cell, Is.EqualTo(expectedCell));
            Assert.That(local, Is.EqualTo(expectedLocal).Within(1e-9));
            Assert.That(local, Is.GreaterThanOrEqualTo(0.0).And.LessThan(WorldGrid.CellSize));
            Assert.That(WorldGrid.WorldCoordinate(cell, local), Is.EqualTo(world).Within(1e-9));
        }
    }
}
