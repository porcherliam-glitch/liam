using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// Generated roofs: closed slabs facing outwards (positive volume, Unity winding), the expected volume and height, gable walls
    /// facing out, and partial roofs for burned houses.
    /// </summary>
    [TestFixture]
    public sealed class RoofGeometryTests
    {
        [Test]
        public void GableRiseFollowsThePitch()
        {
            Assert.That(RoofGeometry.Rise(RoofKind.Gable, 8.0, 45.0), Is.EqualTo(4.0).Within(1e-12));
            Assert.That(RoofGeometry.Rise(RoofKind.LeanTo, 8.0, 45.0), Is.EqualTo(8.0).Within(1e-12));
            Assert.That(RoofGeometry.Rise(RoofKind.None, 8.0, 45.0), Is.EqualTo(0.0));
        }

        [Test]
        public void GableSlabsAreClosedAndFaceOutwards()
        {
            MeshBuffers roof = RoofGeometry.Gable(8.0, 10.0, 45.0, 0.5, 0.2, 1.0, 1.0, false);

            // Two slabs, 6 quads each.
            Assert.That(roof.TriangleCount, Is.EqualTo(24));
            Assert.That(roof.Positions.Count, Is.EqualTo(48));
            // Parallelogram cross-section: horizontal extent (half width + overhang) times vertical thickness, times the length.
            double expected = 2.0 * (4.0 + 0.5) * 0.2 * (10.0 + 2.0 * 0.5);
            Assert.That(roof.SignedVolume(RoofGeometry.RoofSubmesh), Is.EqualTo(expected).Within(1e-9));
        }

        [Test]
        public void RidgeIsTheHighestPoint()
        {
            MeshBuffers roof = RoofGeometry.Gable(8.0, 10.0, 45.0, 0.5, 0.2);
            double top = double.MinValue;
            double ridgeX = 0.0;
            foreach (GeometryVector p in roof.Positions)
            {
                if (p.Y > top)
                {
                    top = p.Y;
                    ridgeX = p.X;
                }
            }

            Assert.That(top, Is.EqualTo(4.0).Within(1e-12));
            Assert.That(ridgeX, Is.EqualTo(0.0).Within(1e-12));
        }

        [Test]
        public void GableWallsFaceAwayFromTheHouse()
        {
            MeshBuffers roof = RoofGeometry.Gable(8.0, 10.0, 45.0, 0.5, 0.2);
            var triangles = roof.Triangles(RoofGeometry.GableSubmesh);

            Assert.That(triangles.Count, Is.EqualTo(6));
            for (int i = 0; i < triangles.Count; i += 3)
            {
                GeometryVector a = roof.Positions[triangles[i]];
                GeometryVector b = roof.Positions[triangles[i + 1]];
                GeometryVector c = roof.Positions[triangles[i + 2]];
                GeometryVector normal = GeometryVector.Cross(b - a, c - a);
                Assert.That(normal.Z * a.Z, Is.GreaterThan(0.0), "gable at z = " + a.Z);
            }
        }

        [Test]
        public void BurnedRoofKeepsOnlyParts()
        {
            MeshBuffers full = RoofGeometry.Gable(8.0, 10.0, 45.0, 0.5, 0.2, 1.0, 1.0, false);
            MeshBuffers burned = RoofGeometry.Gable(8.0, 10.0, 45.0, 0.5, 0.2, 0.5, 0.0, false);

            Assert.That(burned.TriangleCount, Is.EqualTo(12));
            Assert.That(burned.SignedVolume(), Is.EqualTo(full.SignedVolume() * 0.25).Within(1e-9));
        }

        [Test]
        public void LeanToSlopesFromLeftToRight()
        {
            MeshBuffers roof = RoofGeometry.LeanTo(6.0, 8.0, 20.0, 0.4, 0.15);
            double left = double.MinValue;
            double right = double.MinValue;
            foreach (GeometryVector p in roof.Positions)
            {
                if (p.X < -2.9)
                {
                    left = System.Math.Max(left, p.Y);
                }

                if (p.X > 2.9)
                {
                    right = System.Math.Max(right, p.Y);
                }
            }

            Assert.That(left, Is.GreaterThan(right + 1.5));
            Assert.That(roof.SignedVolume(RoofGeometry.RoofSubmesh), Is.GreaterThan(0.0));
        }

        [Test]
        public void InvalidSizeThrows()
        {
            Assert.Throws<System.ArgumentOutOfRangeException>(() => RoofGeometry.Gable(0.0, 10.0, 45.0, 0.5, 0.2));
            Assert.Throws<System.ArgumentOutOfRangeException>(() => RoofGeometry.Gable(8.0, 10.0, 85.0, 0.5, 0.2));
        }
    }
}
