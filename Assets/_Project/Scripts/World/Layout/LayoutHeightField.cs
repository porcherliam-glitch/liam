using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>
    /// Terrain heights of a <see cref="RegionLayout"/> in metres (world y). Order of evaluation:
    /// <list type="number">
    /// <item><b>Raw:</b> base height + slopes + hills + noise + border hills.</item>
    /// <item><b>Flatten</b> areas in file order (target = explicit height or the raw height at the centre).</item>
    /// <item><b>Rift crater</b> (bowl and rim).</item>
    /// <item><b>River beds</b> in file order: the water level falls monotonically from upstream to downstream; the bed is
    /// carved with banks that widen where the river cuts through high ground.</item>
    /// </list>
    /// Pure logic in double precision; Tools/Preview/eichental_layout.py (class HeightField) is the same in Python.
    /// </summary>
    public sealed class LayoutHeightField
    {
        private readonly RegionLayout _layout;
        private readonly LayoutTerrain _terrain;
        private readonly List<TerrainFeature> _slopes = new List<TerrainFeature>();
        private readonly List<double> _slopeDirX = new List<double>();
        private readonly List<double> _slopeDirZ = new List<double>();
        private readonly List<TerrainFeature> _hills = new List<TerrainFeature>();
        private readonly List<TerrainFeature> _flattens = new List<TerrainFeature>();
        private readonly List<double> _flattenTargets = new List<double>();
        private readonly List<RiverProfile> _rivers = new List<RiverProfile>();

        /// <summary>Prepares the height field (flatten targets and river levels are computed once).</summary>
        /// <param name="layout">Layout read by <see cref="RegionLayoutReader"/>.</param>
        public LayoutHeightField(RegionLayout layout)
        {
            _layout = layout ?? throw new ArgumentNullException(nameof(layout));
            _terrain = layout.Terrain ?? throw new ArgumentException("Layout without terrain.", nameof(layout));
            IReadOnlyList<TerrainFeature> features = _terrain.Features;
            for (int i = 0; i < features.Count; i++)
            {
                TerrainFeature f = features[i];
                switch (f.Kind)
                {
                    case TerrainFeatureKind.Slope:
                        double length = LayoutGeometry.Hypot(f.Direction.X, f.Direction.Z);
                        _slopes.Add(f);
                        _slopeDirX.Add(length > 0.0 ? f.Direction.X / length : 0.0);
                        _slopeDirZ.Add(length > 0.0 ? f.Direction.Z / length : 1.0);
                        break;
                    case TerrainFeatureKind.Hill:
                        _hills.Add(f);
                        break;
                    default:
                        _flattens.Add(f);
                        break;
                }
            }

            for (int i = 0; i < _flattens.Count; i++)
            {
                TerrainFeature f = _flattens[i];
                _flattenTargets.Add(f.HasHeight ? f.Height : Raw(f.Center.X, f.Center.Z));
            }

            IReadOnlyList<LayoutRiver> rivers = layout.Rivers;
            for (int i = 0; i < rivers.Count; i++)
            {
                _rivers.Add(new RiverProfile(rivers[i], this));
            }
        }

        /// <summary>The layout.</summary>
        public RegionLayout Layout => _layout;

        /// <summary>Number of rivers.</summary>
        public int RiverCount => _rivers.Count;

        /// <summary>Final terrain height at a point.</summary>
        /// <param name="x">East in metres.</param>
        /// <param name="z">North in metres.</param>
        public double Height(double x, double z)
        {
            double h = BeforeRivers(x, z);
            for (int i = 0; i < _rivers.Count; i++)
            {
                h = _rivers[i].Carve(x, z, h);
            }

            return h;
        }

        /// <summary>Height before the river beds are carved (raw, flatten areas, rift crater).</summary>
        /// <param name="x">East in metres.</param>
        /// <param name="z">North in metres.</param>
        public double BeforeRivers(double x, double z)
        {
            double h = Raw(x, z);
            for (int i = 0; i < _flattens.Count; i++)
            {
                TerrainFeature f = _flattens[i];
                double d = LayoutGeometry.Hypot(x - f.Center.X, z - f.Center.Z);
                if (d >= f.OuterRadius)
                {
                    continue;
                }

                double w = 1.0 - LayoutGeometry.SmoothStep01((d - f.InnerRadius) / (f.OuterRadius - f.InnerRadius));
                h += (_flattenTargets[i] - h) * w;
            }

            LayoutRift rift = _layout.Rift;
            if (rift != null)
            {
                double d = LayoutGeometry.Hypot(x - rift.Center.X, z - rift.Center.Z);
                if (d < rift.Radius)
                {
                    h -= rift.Depth * (1.0 - LayoutGeometry.SmoothStep01(d / rift.Radius));
                }

                double ring = Math.Abs(d - rift.Radius);
                if (ring < rift.RimWidth)
                {
                    h += rift.Rim * (1.0 - LayoutGeometry.SmoothStep01(ring / rift.RimWidth));
                }
            }

            return h;
        }

        /// <summary>Base height + slopes + hills + noise + border hills (no flatten areas, crater or rivers).</summary>
        /// <param name="x">East in metres.</param>
        /// <param name="z">North in metres.</param>
        public double Raw(double x, double z)
        {
            double h = _terrain.BaseHeight;
            for (int i = 0; i < _slopes.Count; i++)
            {
                TerrainFeature f = _slopes[i];
                double dx = _slopeDirX[i];
                double dz = _slopeDirZ[i];
                double t = (x - f.Origin.X) * dx + (z - f.Origin.Z) * dz;
                double along = LayoutGeometry.SmoothStep01((t - f.Start) / (f.End - f.Start));
                double lateral = 1.0;
                if (f.HasHalfWidth)
                {
                    double s = Math.Abs((x - f.Origin.X) * dz - (z - f.Origin.Z) * dx);
                    lateral = f.Falloff > 0.0
                        ? 1.0 - LayoutGeometry.SmoothStep01((s - f.HalfWidth) / f.Falloff)
                        : (s <= f.HalfWidth ? 1.0 : 0.0);
                }

                h += f.Height * along * lateral;
            }

            for (int i = 0; i < _hills.Count; i++)
            {
                TerrainFeature f = _hills[i];
                double d = LayoutGeometry.Hypot(x - f.Center.X, z - f.Center.Z);
                if (d < f.Radius)
                {
                    h += f.Height * (1.0 - LayoutGeometry.SmoothStep01(d / f.Radius));
                }
            }

            IReadOnlyList<LayoutNoise> noise = _terrain.Noise;
            for (int i = 0; i < noise.Count; i++)
            {
                LayoutNoise n = noise[i];
                double a = LayoutGeometry.Radians(n.Angle);
                double u = x * Math.Cos(a) + z * Math.Sin(a);
                double v = -x * Math.Sin(a) + z * Math.Cos(a);
                h += n.Amplitude * Math.Sin(2.0 * Math.PI * u / n.Wavelength + n.Phase) *
                     Math.Cos(2.0 * Math.PI * v / (1.37 * n.Wavelength) + 1.3 * n.Phase);
            }

            LayoutBorder border = _terrain.Border;
            if (border != null)
            {
                LayoutBounds bounds = _terrain.PlayableBounds;
                double minX = bounds.Min.X + border.Inset;
                double minZ = bounds.Min.Z + border.Inset;
                double maxX = bounds.Max.X - border.Inset;
                double maxZ = bounds.Max.Z - border.Inset;
                double ex = Math.Max(Math.Max(minX - x, 0.0), x - maxX);
                double ez = Math.Max(Math.Max(minZ - z, 0.0), z - maxZ);
                double outside = LayoutGeometry.Hypot(ex, ez);
                if (outside > 0.0)
                {
                    h += border.Height * LayoutGeometry.SmoothStep01(outside / border.Width);
                }
            }

            return h;
        }

        /// <summary>Slope of the final terrain in degrees (central differences).</summary>
        /// <param name="x">East in metres.</param>
        /// <param name="z">North in metres.</param>
        /// <param name="step">Sample distance in metres.</param>
        public double SlopeDegrees(double x, double z, double step = 1.0)
        {
            double dx = (Height(x + step, z) - Height(x - step, z)) / (2.0 * step);
            double dz = (Height(x, z + step) - Height(x, z - step)) / (2.0 * step);
            return Math.Atan(LayoutGeometry.Hypot(dx, dz)) * 180.0 / Math.PI;
        }

        /// <summary>Water surface height of a river at the vertex <paramref name="index"/>.</summary>
        /// <param name="river">River index (file order).</param>
        /// <param name="index">Vertex index.</param>
        public double WaterLevelAtVertex(int river, int index)
        {
            return _rivers[river].Levels[index];
        }

        /// <summary>Water surface height of a river at a point on a segment.</summary>
        /// <param name="river">River index (file order).</param>
        /// <param name="segment">Segment index.</param>
        /// <param name="fraction">Fraction 0..1 along the segment.</param>
        public double WaterLevel(int river, int segment, double fraction)
        {
            double[] levels = _rivers[river].Levels;
            return LayoutGeometry.Lerp(levels[segment], levels[segment + 1], fraction);
        }

        /// <summary>
        /// Samples the final heights for a Unity heightmap: <c>[row = z index, column = x index]</c>, normalised by
        /// <see cref="LayoutTerrain.MaxHeight"/> and clamped to 0..1. Sample i lies at <c>−size/2 + i · size / (resolution − 1)</c>.
        /// </summary>
        public float[,] SampleNormalizedHeights()
        {
            int resolution = _terrain.HeightmapResolution;
            double size = _terrain.Size;
            double max = _terrain.MaxHeight;
            var heights = new float[resolution, resolution];
            double step = size / (resolution - 1);
            for (int iz = 0; iz < resolution; iz++)
            {
                double z = -size * 0.5 + iz * step;
                for (int ix = 0; ix < resolution; ix++)
                {
                    double x = -size * 0.5 + ix * step;
                    double v = Height(x, z) / max;
                    heights[iz, ix] = (float)(v < 0.0 ? 0.0 : (v > 1.0 ? 1.0 : v));
                }
            }

            return heights;
        }

        private sealed class RiverProfile
        {
            private readonly LayoutRiver _river;
            private readonly double[] _raw;
            private readonly double[] _beds;

            public RiverProfile(LayoutRiver river, LayoutHeightField field)
            {
                _river = river;
                IReadOnlyList<LayoutPoint> points = river.Points;
                _raw = new double[points.Count];
                Levels = new double[points.Count];
                _beds = new double[points.Count];
                for (int i = 0; i < points.Count; i++)
                {
                    _raw[i] = field.BeforeRivers(points[i].X, points[i].Z);
                    double level = _raw[i] - river.Depth + river.WaterDepth;
                    if (i > 0 && Levels[i - 1] < level)
                    {
                        level = Levels[i - 1];
                    }

                    Levels[i] = level;
                    _beds[i] = level - river.WaterDepth;
                }
            }

            public double[] Levels { get; }

            public double Carve(double x, double z, double h)
            {
                if (_raw.Length < 2)
                {
                    return h;
                }

                double half = _river.Width * 0.5;
                PolylineHit hit = LayoutGeometry.Nearest(x, z, _river.Points);
                double bed = LayoutGeometry.Lerp(_beds[hit.Segment], _beds[hit.Segment + 1], hit.Fraction);
                double centreRaw = LayoutGeometry.Lerp(_raw[hit.Segment], _raw[hit.Segment + 1], hit.Fraction);
                double excess = Math.Max(0.0, centreRaw - (bed + _river.Depth));
                double reach = half + _river.Bank + 1.2 * excess;
                if (hit.Distance >= reach)
                {
                    return h;
                }

                double s = 1.0 - LayoutGeometry.SmoothStep01((hit.Distance - half) / (reach - half));
                return h + (Math.Min(h, bed) - h) * s;
            }
        }
    }
}
