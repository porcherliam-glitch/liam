using System;
using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// Rocks and the stone bridge arch (review of the Eichental blockout): landmark rocks rest on their pivot (flat underside at
    /// y = 0, so they cannot float), have a convex collider within the PhysX limit and the same vertices as the Blender preview;
    /// scattered boulders reach below their pivot; the arch of the stone bridge stays under the deck.
    /// </summary>
    [TestFixture]
    public sealed class RockAndBridgeGeometryTests
    {
        private const double Tolerance = 1e-9;

        /// <summary>PhysX limit of a convex MeshCollider (Unity: "convex mesh … 255 triangles").</summary>
        private const int ConvexTriangleLimit = 255;

        [Test]
        public void IcosphereCountsFollowTheSubdivisions()
        {
            for (int s = 0; s <= BlobGeometry.MaxSubdivisions; s++)
            {
                MeshBuffers blob = BlobGeometry.Build(new GeometryVector(0, 0, 0), new GeometryVector(1, 1, 1), s, 1UL, 0.0);
                Assert.That(blob.Positions.Count, Is.EqualTo(BlobGeometry.VertexCount(s)));
                Assert.That(blob.TriangleCount, Is.EqualTo(BlobGeometry.TriangleCount(s)));
                Assert.That(blob.SignedVolume(), Is.GreaterThan(0.0), "faces point outwards");
            }

            Assert.That(BlobGeometry.VertexCount(2), Is.EqualTo(162));
            Assert.That(BlobGeometry.TriangleCount(2), Is.EqualTo(320));
        }

        [Test]
        public void LandmarkRockRestsOnItsPivot([Values(0, 1, 2)] int variant)
        {
            foreach (int subdivisions in new[] { RockGeometry.LandmarkRenderSubdivisions, RockGeometry.LandmarkColliderSubdivisions })
            {
                MeshBuffers rock = RockGeometry.Landmark(variant, subdivisions);
                double minY = double.MaxValue;
                double maxY = double.MinValue;
                double maxX = 0.0;
                foreach (GeometryVector p in rock.Positions)
                {
                    minY = Math.Min(minY, p.Y);
                    maxY = Math.Max(maxY, p.Y);
                    maxX = Math.Max(maxX, Math.Abs(p.X));
                }

                if (subdivisions == RockGeometry.LandmarkRenderSubdivisions)
                {
                    Assert.That(minY, Is.EqualTo(0.0), "flat underside exactly at the pivot (the old mesh ended at y = 0.4 and floated)");
                }
                else
                {
                    // The coarse collider has fewer vertices near the bottom; it may end a little higher, never below the pivot.
                    Assert.That(minY, Is.InRange(0.0, 0.05));
                }

                Assert.That(maxX, Is.LessThanOrEqualTo(RockGeometry.LandmarkSideClamp), "cut, cliff-like sides like the Blender preview");
                Assert.That(maxY, Is.InRange(0.9, 0.5 + 0.5 * (1.0 + RockGeometry.LandmarkRoughness * 0.5) + Tolerance));
                Assert.That(rock.SignedVolume(), Is.GreaterThan(0.0), "closed and facing outwards");
            }
        }

        [Test]
        public void LandmarkColliderStaysWithinThePhysXLimit()
        {
            MeshBuffers render = RockGeometry.Landmark(0, RockGeometry.LandmarkRenderSubdivisions);
            MeshBuffers collider = RockGeometry.Landmark(0, RockGeometry.LandmarkColliderSubdivisions);

            Assert.That(render.TriangleCount, Is.GreaterThan(ConvexTriangleLimit), "why the collider needs its own mesh");
            Assert.That(collider.TriangleCount, Is.LessThanOrEqualTo(ConvexTriangleLimit));
        }

        [Test]
        public void ColliderUsesTheFirstVerticesOfTheVisibleRock([Values(0, 1, 2)] int variant)
        {
            MeshBuffers render = RockGeometry.Landmark(variant, RockGeometry.LandmarkRenderSubdivisions);
            MeshBuffers collider = RockGeometry.Landmark(variant, RockGeometry.LandmarkColliderSubdivisions);

            for (int i = 0; i < collider.Positions.Count; i++)
            {
                AssertVector(collider.Positions[i], render.Positions[i], "vertex " + i);
            }
        }

        [Test]
        public void LandmarkRocksMatchThePreview()
        {
            foreach (object[] row in EichentalPreviewReference.LandmarkRocks)
            {
                int variant = (int)row[0];
                MeshBuffers rock = RockGeometry.Landmark(variant, RockGeometry.LandmarkRenderSubdivisions);
                Assert.That(rock.Positions.Count, Is.EqualTo((int)row[1]));
                Assert.That(rock.TriangleCount, Is.EqualTo((int)row[2]));
                double sx = 0.0;
                double sy = 0.0;
                double sz = 0.0;
                foreach (GeometryVector p in rock.Positions)
                {
                    sx += p.X;
                    sy += p.Y;
                    sz += p.Z;
                }

                Assert.That(sx, Is.EqualTo((double)row[3]).Within(1e-7), "variant " + variant + " sum x");
                Assert.That(sy, Is.EqualTo((double)row[4]).Within(1e-7), "variant " + variant + " sum y");
                Assert.That(sz, Is.EqualTo((double)row[5]).Within(1e-7), "variant " + variant + " sum z");
            }

            foreach (object[] row in EichentalPreviewReference.LandmarkRockVertices)
            {
                MeshBuffers rock = RockGeometry.Landmark((int)row[0], RockGeometry.LandmarkRenderSubdivisions);
                AssertVector(rock.Positions[(int)row[1]], new GeometryVector((double)row[2], (double)row[3], (double)row[4]),
                    "variant " + row[0] + " vertex " + row[1]);
            }
        }

        [Test]
        public void BouldersMatchThePreviewAndReachBelowTheirPivot()
        {
            foreach (object[] row in EichentalPreviewReference.BoulderVertices)
            {
                MeshBuffers boulder = RockGeometry.Boulder((ulong)row[0]);
                AssertVector(boulder.Positions[(int)row[1]], new GeometryVector((double)row[2], (double)row[3], (double)row[4]),
                    "seed " + row[0] + " vertex " + row[1]);
                double minY = double.MaxValue;
                foreach (GeometryVector p in boulder.Positions)
                {
                    minY = Math.Min(minY, p.Y);
                }

                Assert.That(minY, Is.LessThan(-0.3), "no flat bottom: half buried on slopes like in the preview");
                Assert.That(boulder.TriangleCount, Is.LessThanOrEqualTo(ConvexTriangleLimit), "the boulder mesh is also its convex collider");
            }
        }

        [Test]
        public void LandmarkBaseHeightSinksTheRockIntoTheGround()
        {
            Assert.That(RockGeometry.LandmarkBaseHeight(20.0, 10.0, 0.0), Is.EqualTo(18.5).Within(Tolerance));
            Assert.That(RockGeometry.LandmarkBaseHeight(20.0, 10.0, 2.0), Is.EqualTo(20.5).Within(Tolerance), "lift raises the pivot");
        }

        [Test]
        public void StoneArchStaysUnderTheDeck([Values(6.0, 12.0, 20.0)] double length)
        {
            MeshBuffers arch = BridgeGeometry.StoneArch(3.6, length);
            double maxY = double.MinValue;
            double maxZ = 0.0;
            double maxX = 0.0;
            foreach (GeometryVector p in arch.Positions)
            {
                maxY = Math.Max(maxY, p.Y);
                maxZ = Math.Max(maxZ, Math.Abs(p.Z));
                maxX = Math.Max(maxX, Math.Abs(p.X));
            }

            Assert.That(maxY, Is.LessThanOrEqualTo(-BridgeGeometry.DeckThickness + Tolerance), "nothing of the arch on the roadway");
            Assert.That(maxY, Is.EqualTo(-BridgeGeometry.DeckThickness).Within(1e-6), "the arch touches the deck");
            Assert.That(maxZ, Is.LessThanOrEqualTo(length * 0.5 + Tolerance), "within the bridge length");
            Assert.That(maxX, Is.EqualTo(1.8).Within(Tolerance), "across the full width");
            Assert.That(arch.SignedVolume(), Is.GreaterThan(0.0), "closed ring segment, faces outwards");
        }

        [Test]
        public void StoneArchLeavesAnOpeningForTheWater()
        {
            const double length = 12.0;
            MeshBuffers arch = BridgeGeometry.StoneArch(3.6, length);
            double inner = BridgeGeometry.ArchRadius(length) - BridgeGeometry.ArchRing;
            double cy = BridgeGeometry.ArchCenterY(length);
            foreach (GeometryVector p in arch.Positions)
            {
                double dy = p.Y - cy;
                double distance = Math.Sqrt(dy * dy + p.Z * p.Z);
                Assert.That(distance, Is.GreaterThanOrEqualTo(inner - 1e-6), "no stone inside the opening");
            }
        }

        [Test]
        public void RealStoneBridgeHasAnArch()
        {
            RegionLayout layout = LayoutTestFiles.LoadEichental();
            int stone = 0;
            foreach (LayoutBridge bridge in layout.Bridges)
            {
                if (bridge.Kind != BridgeKind.Stone)
                {
                    continue;
                }

                stone++;
                MeshBuffers arch = BridgeGeometry.StoneArch(bridge.Width, bridge.Length);
                Assert.That(arch.TriangleCount, Is.EqualTo((BridgeGeometry.ArchSegments * 4 + 2) * 2));
            }

            Assert.That(stone, Is.GreaterThanOrEqualTo(1), "the stone bridge on the way to the Hollmann farm (quest 2)");
        }

        private static void AssertVector(GeometryVector actual, GeometryVector expected, string message)
        {
            Assert.That(actual.X, Is.EqualTo(expected.X).Within(Tolerance), message + " x");
            Assert.That(actual.Y, Is.EqualTo(expected.Y).Within(Tolerance), message + " y");
            Assert.That(actual.Z, Is.EqualTo(expected.Z).Within(Tolerance), message + " z");
        }
    }
}
