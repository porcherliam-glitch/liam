using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>Plane geometry with the Unity rotation convention (yaw clockwise from north, local +z = front).</summary>
    [TestFixture]
    public sealed class LayoutGeometryTests
    {
        [Test]
        public void YawNinetyTurnsTheFrontToTheEast()
        {
            LayoutPoint front = LayoutGeometry.RotateLocal(0.0, 1.0, 90.0);
            LayoutPoint right = LayoutGeometry.RotateLocal(1.0, 0.0, 90.0);

            Assert.That(front.X, Is.EqualTo(1.0).Within(1e-12));
            Assert.That(front.Z, Is.EqualTo(0.0).Within(1e-12));
            Assert.That(right.X, Is.EqualTo(0.0).Within(1e-12));
            Assert.That(right.Z, Is.EqualTo(-1.0).Within(1e-12));
        }

        [Test]
        public void ToLocalUndoesRotateLocal()
        {
            LayoutPoint world = LayoutGeometry.RotateLocal(2.5, -1.25, 37.0);
            LayoutPoint local = LayoutGeometry.ToLocal(world.X, world.Z, 37.0);

            Assert.That(local.X, Is.EqualTo(2.5).Within(1e-12));
            Assert.That(local.Z, Is.EqualTo(-1.25).Within(1e-12));
        }

        [Test]
        public void NearestFindsSegmentAndFraction()
        {
            var line = new[] { new LayoutPoint(0, 0), new LayoutPoint(10, 0), new LayoutPoint(10, 10) };

            PolylineHit hit = LayoutGeometry.Nearest(12.0, 5.0, line);

            Assert.That(hit.Segment, Is.EqualTo(1));
            Assert.That(hit.Fraction, Is.EqualTo(0.5).Within(1e-12));
            Assert.That(hit.Distance, Is.EqualTo(2.0).Within(1e-12));
        }

        [Test]
        public void PolygonContainsItsInside()
        {
            var square = new[] { new LayoutPoint(0, 0), new LayoutPoint(10, 0), new LayoutPoint(10, 10), new LayoutPoint(0, 10) };

            Assert.That(LayoutGeometry.InPolygon(5.0, 5.0, square), Is.True);
            Assert.That(LayoutGeometry.InPolygon(11.0, 5.0, square), Is.False);
        }

        [Test]
        public void RectExcessIsNegativeInside()
        {
            var centre = new LayoutPoint(5, 5);

            Assert.That(LayoutGeometry.RectExcess(5.0, 5.0, centre, 4.0, 2.0, 0.0), Is.EqualTo(-1.0).Within(1e-12));
            Assert.That(LayoutGeometry.RectExcess(9.0, 5.0, centre, 4.0, 2.0, 0.0), Is.EqualTo(2.0).Within(1e-12));
            // Turned by 90 degrees the width lies along z.
            Assert.That(LayoutGeometry.RectExcess(5.0, 7.5, centre, 4.0, 2.0, 90.0), Is.EqualTo(0.5).Within(1e-12));
        }

        [Test]
        public void SeparatedRectanglesDoNotOverlap()
        {
            LayoutPoint[] a = LayoutGeometry.RectCorners(new LayoutPoint(0, 0), 4.0, 4.0, 0.0);
            LayoutPoint[] b = LayoutGeometry.RectCorners(new LayoutPoint(4.5, 0), 4.0, 4.0, 45.0);
            LayoutPoint[] c = LayoutGeometry.RectCorners(new LayoutPoint(6, 0), 4.0, 4.0, 0.0);

            Assert.That(LayoutGeometry.ConvexOverlap(a, b), Is.True);
            Assert.That(LayoutGeometry.ConvexOverlap(a, c), Is.False);
        }

        [Test]
        public void SmoothStepIsClampedHermite()
        {
            Assert.That(LayoutGeometry.SmoothStep01(-1.0), Is.EqualTo(0.0));
            Assert.That(LayoutGeometry.SmoothStep01(0.5), Is.EqualTo(0.5));
            Assert.That(LayoutGeometry.SmoothStep01(0.25), Is.EqualTo(0.15625).Within(1e-12));
            Assert.That(LayoutGeometry.SmoothStep01(2.0), Is.EqualTo(1.0));
        }
    }
}
