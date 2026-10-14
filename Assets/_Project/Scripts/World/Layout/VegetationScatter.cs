using System;
using System.Collections.Generic;
using Aetherfall.Utilities;

namespace Aetherfall.World
{
    /// <summary>
    /// Deterministic placement of the vegetation groups of a layout. Per group: a <see cref="Pcg32Random"/> with the group
    /// seed; a grid of <c>spacing</c> over the bounding box of the polygon, row by row from south-west; every cell draws exactly
    /// six floats (presence, offset x, offset z, species, scale, yaw), so rejected cells never shift later ones. A candidate
    /// is kept if presence ≤ density, it lies inside the polygon and is not excluded (terrain edge, clearings, paths, rivers
    /// with banks, buildings, fields, rift, fences and fenced areas, landmark trees, rocks, props, chests, bridges). Landmark
    /// trees are appended at the end. The Python twin is scatter_vegetation in Tools/Preview/eichental_layout.py.
    /// </summary>
    public static class VegetationScatter
    {
        /// <summary>Places all vegetation of the layout.</summary>
        /// <param name="layout">Layout.</param>
        public static List<VegetationInstance> Scatter(RegionLayout layout)
        {
            if (layout == null)
            {
                throw new ArgumentNullException(nameof(layout));
            }

            var result = new List<VegetationInstance>();
            LayoutVegetation vegetation = layout.Vegetation;
            if (vegetation == null)
            {
                return result;
            }

            IReadOnlyList<VegetationGroup> groups = vegetation.Groups;
            for (int g = 0; g < groups.Count; g++)
            {
                ScatterGroup(layout, groups[g], result);
            }

            IReadOnlyList<LayoutTree> trees = vegetation.Trees;
            for (int i = 0; i < trees.Count; i++)
            {
                LayoutTree tree = trees[i];
                result.Add(new VegetationInstance(tree.Id, tree.Kind, tree.Position.X, tree.Position.Z, tree.Scale, tree.Yaw));
            }

            return result;
        }

        /// <summary>True if no scattered plant may stand at the point.</summary>
        /// <param name="layout">Layout.</param>
        /// <param name="x">East in metres.</param>
        /// <param name="z">North in metres.</param>
        public static bool IsExcluded(RegionLayout layout, double x, double z)
        {
            double halfSize = layout.Terrain.Size * 0.5 - 1.0;
            if (Math.Abs(x) > halfSize || Math.Abs(z) > halfSize)
            {
                return true;
            }

            LayoutVegetation vegetation = layout.Vegetation;
            VegetationClearance clearance = vegetation?.Clearance ?? new VegetationClearance();
            IReadOnlyList<LayoutCircle> clearings = vegetation != null ? vegetation.Clearings : Array.Empty<LayoutCircle>();
            for (int i = 0; i < clearings.Count; i++)
            {
                if (LayoutGeometry.Hypot(x - clearings[i].Center.X, z - clearings[i].Center.Z) < clearings[i].Radius)
                {
                    return true;
                }
            }

            for (int i = 0; i < layout.Paths.Count; i++)
            {
                LayoutPath path = layout.Paths[i];
                if (LayoutGeometry.Nearest(x, z, path.Points).Distance < path.Width * 0.5 + clearance.Paths)
                {
                    return true;
                }
            }

            for (int i = 0; i < layout.Rivers.Count; i++)
            {
                LayoutRiver river = layout.Rivers[i];
                if (LayoutGeometry.Nearest(x, z, river.Points).Distance < river.Width * 0.5 + river.Bank + clearance.Rivers)
                {
                    return true;
                }
            }

            for (int i = 0; i < layout.Buildings.Count; i++)
            {
                LayoutBuilding b = layout.Buildings[i];
                if (LayoutGeometry.RectExcess(x, z, b.Position, b.Width, b.Depth, b.Yaw) < clearance.Buildings)
                {
                    return true;
                }
            }

            for (int i = 0; i < layout.Fields.Count; i++)
            {
                LayoutField f = layout.Fields[i];
                if (LayoutGeometry.RectExcess(x, z, f.Center, f.Width, f.Depth, f.Yaw) < clearance.Fields)
                {
                    return true;
                }
            }

            LayoutRift rift = layout.Rift;
            if (rift != null && LayoutGeometry.Hypot(x - rift.Center.X, z - rift.Center.Z) < rift.Radius + rift.RimWidth + clearance.Rift)
            {
                return true;
            }

            for (int i = 0; i < layout.Fences.Count; i++)
            {
                LayoutFence fence = layout.Fences[i];
                double d = fence.Closed
                    ? LayoutGeometry.ClosedOutlineDistance(x, z, fence.Points)
                    : LayoutGeometry.Nearest(x, z, fence.Points).Distance;
                if (d < clearance.Fences || (fence.Closed && LayoutGeometry.InPolygon(x, z, fence.Points)))
                {
                    return true;
                }
            }

            if (vegetation != null)
            {
                for (int i = 0; i < vegetation.Trees.Count; i++)
                {
                    LayoutPoint p = vegetation.Trees[i].Position;
                    if (LayoutGeometry.Hypot(x - p.X, z - p.Z) < 4.0)
                    {
                        return true;
                    }
                }
            }

            for (int i = 0; i < layout.Rocks.Count; i++)
            {
                LayoutRock rock = layout.Rocks[i];
                if (LayoutGeometry.Hypot(x - rock.Position.X, z - rock.Position.Z) < Math.Max(rock.SizeX, rock.SizeZ) * 0.5 + 2.0)
                {
                    return true;
                }
            }

            for (int i = 0; i < layout.Props.Count; i++)
            {
                if (LayoutGeometry.Hypot(x - layout.Props[i].Position.X, z - layout.Props[i].Position.Z) < 3.0)
                {
                    return true;
                }
            }

            for (int i = 0; i < layout.Chests.Count; i++)
            {
                if (LayoutGeometry.Hypot(x - layout.Chests[i].Position.X, z - layout.Chests[i].Position.Z) < 2.5)
                {
                    return true;
                }
            }

            for (int i = 0; i < layout.Bridges.Count; i++)
            {
                LayoutBridge bridge = layout.Bridges[i];
                if (LayoutGeometry.Hypot(x - bridge.Position.X, z - bridge.Position.Z) < bridge.Length * 0.5 + 2.0)
                {
                    return true;
                }
            }

            return false;
        }

        private static void ScatterGroup(RegionLayout layout, VegetationGroup group, List<VegetationInstance> result)
        {
            IReadOnlyList<LayoutPoint> polygon = group.Polygon;
            if (polygon.Count < 3 || group.Spacing <= 0.0 || group.Species.Count == 0)
            {
                return;
            }

            double minX = double.PositiveInfinity;
            double maxX = double.NegativeInfinity;
            double minZ = double.PositiveInfinity;
            double maxZ = double.NegativeInfinity;
            for (int i = 0; i < polygon.Count; i++)
            {
                minX = Math.Min(minX, polygon[i].X);
                maxX = Math.Max(maxX, polygon[i].X);
                minZ = Math.Min(minZ, polygon[i].Z);
                maxZ = Math.Max(maxZ, polygon[i].Z);
            }

            double cell = group.Spacing;
            int nx = (int)Math.Ceiling((maxX - minX) / cell);
            int nz = (int)Math.Ceiling((maxZ - minZ) / cell);
            double total = 0.0;
            for (int i = 0; i < group.Species.Count; i++)
            {
                total += group.Species[i].Weight;
            }

            var random = new Pcg32Random(group.Seed);
            var r = new double[6];
            for (int iz = 0; iz < nz; iz++)
            {
                for (int ix = 0; ix < nx; ix++)
                {
                    for (int k = 0; k < r.Length; k++)
                    {
                        r[k] = random.NextFloat();
                    }

                    if (r[0] > group.Density)
                    {
                        continue;
                    }

                    double x = minX + (ix + 0.5) * cell + (r[1] - 0.5) * group.Jitter * cell;
                    double z = minZ + (iz + 0.5) * cell + (r[2] - 0.5) * group.Jitter * cell;
                    if (!LayoutGeometry.InPolygon(x, z, polygon) || IsExcluded(layout, x, z))
                    {
                        continue;
                    }

                    result.Add(new VegetationInstance(group.Id, PickSpecies(group, r[3] * total), x, z,
                        group.ScaleMin + (group.ScaleMax - group.ScaleMin) * r[4], r[5] * 360.0));
                }
            }
        }

        private static VegetationKind PickSpecies(VegetationGroup group, double target)
        {
            double sum = 0.0;
            for (int i = 0; i < group.Species.Count; i++)
            {
                sum += group.Species[i].Weight;
                if (target < sum)
                {
                    return group.Species[i].Kind;
                }
            }

            return group.Species[group.Species.Count - 1].Kind;
        }
    }
}
