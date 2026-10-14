using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>
    /// Ground layers of a layout (grass, earth, rock, ash) for the terrain splat map. Rules:
    /// ash and earth from ground zones; earth under paths, fields, around buildings and on river banks; rock from rock zones and
    /// on slopes steeper than 30° (full at 42°). Rock covers earth, earth covers ash and grass. Pure logic; the Python twin is
    /// GroundMap in Tools/Preview/eichental_layout.py.
    /// </summary>
    public sealed class LayoutGroundMap
    {
        private readonly RegionLayout _layout;

        /// <summary>Creates the map.</summary>
        /// <param name="layout">Layout.</param>
        public LayoutGroundMap(RegionLayout layout)
        {
            _layout = layout ?? throw new ArgumentNullException(nameof(layout));
        }

        /// <summary>Layer weights at a point.</summary>
        /// <param name="x">East in metres.</param>
        /// <param name="z">North in metres.</param>
        /// <param name="slopeDegrees">Terrain slope at the point.</param>
        public GroundWeights Weights(double x, double z, double slopeDegrees)
        {
            double ash = 0.0;
            double dirt = 0.0;
            double rock = 0.0;
            IReadOnlyList<LayoutGroundZone> zones = _layout.GroundZones;
            for (int i = 0; i < zones.Count; i++)
            {
                LayoutGroundZone zone = zones[i];
                double d = LayoutGeometry.Hypot(x - zone.Center.X, z - zone.Center.Z);
                double v = zone.Strength * (1.0 - LayoutGeometry.SmoothStep01((d - zone.Radius) / Math.Max(zone.Falloff, 1e-6)));
                if (v <= 0.0)
                {
                    continue;
                }

                switch (zone.Ground)
                {
                    case GroundKind.Ash:
                        ash = Math.Max(ash, v);
                        break;
                    case GroundKind.Dirt:
                        dirt = Math.Max(dirt, v);
                        break;
                    case GroundKind.Rock:
                        rock = Math.Max(rock, v);
                        break;
                }
            }

            IReadOnlyList<LayoutPath> paths = _layout.Paths;
            for (int i = 0; i < paths.Count; i++)
            {
                double half = paths[i].Width * 0.5;
                double d = LayoutGeometry.Nearest(x, z, paths[i].Points).Distance;
                if (d < half + 1.0)
                {
                    dirt = Math.Max(dirt, 1.0 - LayoutGeometry.SmoothStep01((d - (half - 0.5)) / 1.5));
                }
            }

            IReadOnlyList<LayoutField> fields = _layout.Fields;
            for (int i = 0; i < fields.Count; i++)
            {
                LayoutField field = fields[i];
                double e = LayoutGeometry.RectExcess(x, z, field.Center, field.Width, field.Depth, field.Yaw);
                if (e < 1.0)
                {
                    dirt = Math.Max(dirt, 1.0 - LayoutGeometry.SmoothStep01((e + 0.5) / 1.5));
                }
            }

            IReadOnlyList<LayoutBuilding> buildings = _layout.Buildings;
            for (int i = 0; i < buildings.Count; i++)
            {
                LayoutBuilding b = buildings[i];
                double e = LayoutGeometry.RectExcess(x, z, b.Position, b.Width, b.Depth, b.Yaw);
                if (e < 2.5)
                {
                    dirt = Math.Max(dirt, 1.0 - LayoutGeometry.SmoothStep01((e - 1.0) / 1.5));
                }
            }

            IReadOnlyList<LayoutRiver> rivers = _layout.Rivers;
            for (int i = 0; i < rivers.Count; i++)
            {
                LayoutRiver river = rivers[i];
                double half = river.Width * 0.5;
                double d = LayoutGeometry.Nearest(x, z, river.Points).Distance;
                double reach = half + river.Bank + 1.0;
                if (d < reach)
                {
                    dirt = Math.Max(dirt, 0.8 * (1.0 - LayoutGeometry.SmoothStep01((d - half) / (reach - half))));
                }
            }

            rock = Math.Max(rock, LayoutGeometry.SmoothStep01((slopeDegrees - 30.0) / 12.0));
            double grass = (1.0 - ash) * (1.0 - dirt) * (1.0 - rock);
            return new GroundWeights(grass, dirt * (1.0 - rock), rock, ash * (1.0 - dirt) * (1.0 - rock));
        }

        /// <summary>
        /// Samples a Unity alphamap <c>[row = z, column = x, layer]</c> with the layer order of <see cref="GroundKind"/>. Cell i
        /// is sampled at its centre; the slope comes from <paramref name="heights"/>.
        /// </summary>
        /// <param name="heights">Height field of the same layout.</param>
        /// <param name="resolution">Cells per edge.</param>
        public float[,,] SampleAlphamap(LayoutHeightField heights, int resolution)
        {
            if (heights == null)
            {
                throw new ArgumentNullException(nameof(heights));
            }

            double size = _layout.Terrain.Size;
            double cell = size / resolution;
            var map = new float[resolution, resolution, 4];
            for (int iz = 0; iz < resolution; iz++)
            {
                double z = -size * 0.5 + (iz + 0.5) * cell;
                for (int ix = 0; ix < resolution; ix++)
                {
                    double x = -size * 0.5 + (ix + 0.5) * cell;
                    GroundWeights w = Weights(x, z, heights.SlopeDegrees(x, z));
                    map[iz, ix, (int)GroundKind.Grass] = (float)w.Grass;
                    map[iz, ix, (int)GroundKind.Dirt] = (float)w.Dirt;
                    map[iz, ix, (int)GroundKind.Rock] = (float)w.Rock;
                    map[iz, ix, (int)GroundKind.Ash] = (float)w.Ash;
                }
            }

            return map;
        }
    }
}
