using System;
using System.Collections.Generic;
using Aetherfall.World;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Paints the world map of a region from its layout file (S63, GDD 05 map: parchment, north up): ground colours from the
    /// ground weights, hill shading and 5 m contour lines from the heights, brooks, paths, bridges, fields, buildings, forest as
    /// dots of the scattered trees, rocks, the rift, and a darkened rim outside the playable area. Pure CPU drawing, so it also
    /// works in "-batchmode -nographics" (the generators run that way); the same input always gives the same pixels.
    /// </summary>
    public sealed class RegionMapPainter
    {
        private static readonly Color Parchment = new Color(0.86f, 0.80f, 0.66f);
        private static readonly Color Grass = new Color(0.62f, 0.68f, 0.42f);
        private static readonly Color Dirt = new Color(0.72f, 0.60f, 0.42f);
        private static readonly Color Rock = new Color(0.62f, 0.58f, 0.52f);
        private static readonly Color Ash = new Color(0.36f, 0.33f, 0.30f);
        private static readonly Color Water = new Color(0.36f, 0.52f, 0.60f);
        private static readonly Color WaterEdge = new Color(0.22f, 0.34f, 0.42f);
        private static readonly Color Road = new Color(0.66f, 0.52f, 0.36f);
        private static readonly Color RoadEdge = new Color(0.45f, 0.34f, 0.24f);
        private static readonly Color Tree = new Color(0.30f, 0.42f, 0.24f);
        private static readonly Color TreeDark = new Color(0.20f, 0.29f, 0.17f);
        private static readonly Color Ink = new Color(0.22f, 0.17f, 0.12f);
        private static readonly Color Roof = new Color(0.62f, 0.36f, 0.26f);
        private static readonly Color RoofBurned = new Color(0.26f, 0.22f, 0.20f);
        private static readonly Color RoofCollapsed = new Color(0.45f, 0.42f, 0.38f);
        private static readonly Color Wheat = new Color(0.82f, 0.72f, 0.42f);
        private static readonly Color FieldBurned = new Color(0.30f, 0.26f, 0.22f);
        private static readonly Color Stubble = new Color(0.70f, 0.62f, 0.44f);
        private static readonly Color Aether = new Color(0.25f, 0.80f, 0.76f);

        private readonly RegionLayout _layout;
        private readonly float[,] _heightGrid;
        private readonly float _maxHeight;
        private readonly float[,,] _alphamap;
        private readonly int _size;
        private readonly float _origin;
        private readonly float _metresPerPixel;
        private readonly Color[] _pixels;

        /// <summary>Creates the painter.</summary>
        /// <param name="layout">Region layout.</param>
        /// <param name="heightGrid">Normalised heights <c>[z, x]</c> over the whole terrain (<see cref="LayoutHeightField.SampleNormalizedHeights"/>).</param>
        /// <param name="alphamap">Ground weights <c>[z, x, GroundKind]</c> over the whole terrain (any resolution).</param>
        /// <param name="size">Picture size in pixels (square).</param>
        public RegionMapPainter(RegionLayout layout, float[,] heightGrid, float[,,] alphamap, int size)
        {
            _layout = layout ?? throw new ArgumentNullException(nameof(layout));
            _heightGrid = heightGrid ?? throw new ArgumentNullException(nameof(heightGrid));
            _maxHeight = (float)layout.Terrain.MaxHeight;
            _alphamap = alphamap ?? throw new ArgumentNullException(nameof(alphamap));
            _size = Math.Max(16, size);
            float extent = (float)layout.Terrain.Size;
            _origin = -extent * 0.5f;
            _metresPerPixel = extent / _size;
            _pixels = new Color[_size * _size];
        }

        /// <summary>West and south edge of the picture in world metres.</summary>
        public float Origin => _origin;

        /// <summary>Side length of the picture in metres.</summary>
        public float Extent => _metresPerPixel * _size;

        /// <summary>Paints everything and returns the pixels (rows from south to north, like <see cref="Texture2D.SetPixels32(Color32[])"/>).</summary>
        /// <param name="plants">Scattered trees and bushes (<see cref="VegetationScatter.Scatter"/>).</param>
        public Color32[] Paint(IReadOnlyList<VegetationInstance> plants)
        {
            PaintGround();
            foreach (LayoutField field in _layout.Fields)
            {
                Color crop = field.State == FieldState.Burned ? FieldBurned : field.State == FieldState.Stubble ? Stubble : Wheat;
                FillRect(field.Center.X, field.Center.Z, field.Width, field.Depth, field.Yaw, crop, 0.85f, Ink, 0.25f);
            }

            foreach (LayoutRiver river in _layout.Rivers)
            {
                StrokePolyline(river.Points, river.Width * 0.5 + 1.2, WaterEdge, 0.9f);
                StrokePolyline(river.Points, river.Width * 0.5, Water, 1f);
            }

            foreach (LayoutPath path in _layout.Paths)
            {
                StrokePolyline(path.Points, path.Width * 0.5 + 0.6, RoadEdge, 0.55f);
                StrokePolyline(path.Points, path.Width * 0.5, Road, 0.9f);
            }

            foreach (LayoutBridge bridge in _layout.Bridges)
            {
                FillRect(bridge.Position.X, bridge.Position.Z, bridge.Width, bridge.Length, bridge.Yaw, RoadEdge, 1f, Ink, 0.6f);
            }

            if (plants != null)
            {
                foreach (VegetationInstance plant in plants)
                {
                    PaintPlant(plant);
                }
            }

            foreach (LayoutRock rock in _layout.Rocks)
            {
                FillRect(rock.Position.X, rock.Position.Z, rock.SizeX * 0.9, rock.SizeZ * 0.9, rock.Yaw, Rock * 0.85f, 1f, Ink, 0.5f);
            }

            foreach (LayoutBuilding building in _layout.Buildings)
            {
                Color roof = building.State == BuildingState.Burned ? RoofBurned : building.State == BuildingState.Collapsed ? RoofCollapsed : Roof;
                if (building.Kind == BuildingKind.Watchtower)
                {
                    roof = RoofCollapsed;
                }

                FillRect(building.Position.X, building.Position.Z, building.Width, building.Depth, building.Yaw, roof, 1f, Ink, 0.9f);
            }

            if (_layout.Rift != null)
            {
                FillCircle(_layout.Rift.Center.X, _layout.Rift.Center.Z, _layout.Rift.Radius, Ash, 0.7f);
                FillCircle(_layout.Rift.Center.X, _layout.Rift.Center.Z, _layout.Rift.Radius * 0.35, Aether, 0.9f);
            }

            PaintRim();
            var result = new Color32[_pixels.Length];
            for (int i = 0; i < _pixels.Length; i++)
            {
                result[i] = _pixels[i];
            }

            return result;
        }

        private void PaintGround()
        {
            int resolution = _alphamap.GetLength(0);
            double extent = _layout.Terrain.Size;
            float contour = 5f;
            var random = new System.Random(4711);
            for (int py = 0; py < _size; py++)
            {
                float z = _origin + (py + 0.5f) * _metresPerPixel;
                int iz = Mathf.Clamp((int)((z - _origin) / extent * resolution), 0, resolution - 1);
                for (int px = 0; px < _size; px++)
                {
                    float x = _origin + (px + 0.5f) * _metresPerPixel;
                    int ix = Mathf.Clamp((int)((x - _origin) / extent * resolution), 0, resolution - 1);
                    Color ground = Grass * _alphamap[iz, ix, (int)GroundKind.Grass] + Dirt * _alphamap[iz, ix, (int)GroundKind.Dirt] +
                                   Rock * _alphamap[iz, ix, (int)GroundKind.Rock] + Ash * _alphamap[iz, ix, (int)GroundKind.Ash];
                    float h = SampleHeight(x, z);
                    float east = SampleHeight(x + 1.5f, z);
                    float north = SampleHeight(x, z + 1.5f);
                    // Light from the north-west, as on old maps.
                    float shade = 1f + Mathf.Clamp(((east - h) * -0.6f + (north - h) * 0.6f) * 0.35f, -0.35f, 0.25f);
                    Color c = ground * shade;
                    if (Mathf.FloorToInt(h / contour) != Mathf.FloorToInt(east / contour) || Mathf.FloorToInt(h / contour) != Mathf.FloorToInt(north / contour))
                    {
                        c = Color.Lerp(c, Ink, 0.18f);
                    }

                    // Parchment: blend towards paper and add a little grain.
                    c = Color.Lerp(c, Parchment, 0.3f);
                    float grain = 1f + ((float)random.NextDouble() - 0.5f) * 0.05f;
                    c *= grain;
                    c.a = 1f;
                    _pixels[py * _size + px] = c;
                }
            }
        }

        private float SampleHeight(float x, float z)
        {
            int resolution = _heightGrid.GetLength(0);
            float extent = (float)_layout.Terrain.Size;
            float fx = Mathf.Clamp((x - _origin) / extent * (resolution - 1), 0f, resolution - 1.001f);
            float fz = Mathf.Clamp((z - _origin) / extent * (resolution - 1), 0f, resolution - 1.001f);
            int ix = (int)fx;
            int iz = (int)fz;
            float tx = fx - ix;
            float tz = fz - iz;
            float bottom = Mathf.Lerp(_heightGrid[iz, ix], _heightGrid[iz, ix + 1], tx);
            float top = Mathf.Lerp(_heightGrid[iz + 1, ix], _heightGrid[iz + 1, ix + 1], tx);
            return Mathf.Lerp(bottom, top, tz) * _maxHeight;
        }

        private void PaintPlant(VegetationInstance plant)
        {
            bool bush = plant.Kind == VegetationKind.Bush;
            bool dead = plant.Kind == VegetationKind.Dead;
            bool rock = plant.Kind == VegetationKind.Rock;
            double radius = (rock ? 0.9 : bush ? 1.2 : 2.4) * plant.Scale;
            Color colour = rock ? Rock * 0.85f : dead ? RoofBurned : bush ? Tree * 1.1f : Tree;
            FillCircle(plant.X, plant.Z, radius + 0.5, TreeDark, rock ? 0.4f : 0.55f);
            FillCircle(plant.X, plant.Z, radius, colour, 0.9f);
        }

        private void PaintRim()
        {
            LayoutBounds bounds = _layout.Terrain.PlayableBounds;
            float minX = (float)bounds.Min.X;
            float minZ = (float)bounds.Min.Z;
            float maxX = (float)bounds.Max.X;
            float maxZ = (float)bounds.Max.Z;
            for (int py = 0; py < _size; py++)
            {
                float z = _origin + (py + 0.5f) * _metresPerPixel;
                for (int px = 0; px < _size; px++)
                {
                    float x = _origin + (px + 0.5f) * _metresPerPixel;
                    float outside = Mathf.Max(Mathf.Max(minX - x, x - maxX), Mathf.Max(minZ - z, z - maxZ));
                    int i = py * _size + px;
                    if (outside > 0f)
                    {
                        // Beyond the edge of the world: darker and paler, fading out towards the picture edge.
                        float t = Mathf.Clamp01(0.45f + outside / 60f * 0.4f);
                        Color c = Color.Lerp(_pixels[i], new Color(0.42f, 0.36f, 0.28f), t);
                        c.a = 1f;
                        _pixels[i] = c;
                    }
                    else if (outside > -1.2f)
                    {
                        _pixels[i] = Color.Lerp(_pixels[i], Ink, 0.7f);
                    }
                }
            }
        }

        private void StrokePolyline(IReadOnlyList<LayoutPoint> points, double halfWidth, Color colour, float opacity)
        {
            if (points == null)
            {
                return;
            }

            for (int i = 0; i + 1 < points.Count; i++)
            {
                StrokeSegment(points[i], points[i + 1], halfWidth, colour, opacity);
            }
        }

        private void StrokeSegment(LayoutPoint a, LayoutPoint b, double halfWidth, Color colour, float opacity)
        {
            double minX = Math.Min(a.X, b.X) - halfWidth;
            double maxX = Math.Max(a.X, b.X) + halfWidth;
            double minZ = Math.Min(a.Z, b.Z) - halfWidth;
            double maxZ = Math.Max(a.Z, b.Z) + halfWidth;
            ForPixels(minX, minZ, maxX, maxZ, (x, z, i) =>
            {
                double d = LayoutGeometry.SegmentDistance(x, z, a, b, out _);
                if (d <= halfWidth)
                {
                    float edge = Mathf.Clamp01((float)((halfWidth - d) / Math.Max(0.5, _metresPerPixel)));
                    Blend(i, colour, opacity * edge);
                }
            });
        }

        private void FillCircle(double cx, double cz, double radius, Color colour, float opacity)
        {
            ForPixels(cx - radius, cz - radius, cx + radius, cz + radius, (x, z, i) =>
            {
                double d = Math.Sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
                if (d <= radius)
                {
                    float edge = Mathf.Clamp01((float)((radius - d) / Math.Max(0.5, _metresPerPixel)));
                    Blend(i, colour, opacity * edge);
                }
            });
        }

        private void FillRect(double cx, double cz, double width, double depth, double yaw, Color colour, float opacity, Color outline, float outlineOpacity)
        {
            double reach = Math.Sqrt(width * width + depth * depth) * 0.5 + 1.0;
            double line = Math.Max(0.6, _metresPerPixel * 1.2);
            ForPixels(cx - reach, cz - reach, cx + reach, cz + reach, (x, z, i) =>
            {
                LayoutPoint local = LayoutGeometry.ToLocal(x - cx, z - cz, yaw);
                double outside = Math.Max(Math.Abs(local.X) - width * 0.5, Math.Abs(local.Z) - depth * 0.5);
                if (outside > 0.0)
                {
                    return;
                }

                Blend(i, colour, opacity);
                if (outline.a > 0f && outside > -line)
                {
                    Blend(i, outline, outlineOpacity);
                }
            });
        }

        private void ForPixels(double minX, double minZ, double maxX, double maxZ, Action<double, double, int> action)
        {
            int x0 = Mathf.Clamp(Mathf.FloorToInt((float)((minX - _origin) / _metresPerPixel)), 0, _size - 1);
            int x1 = Mathf.Clamp(Mathf.CeilToInt((float)((maxX - _origin) / _metresPerPixel)), 0, _size - 1);
            int y0 = Mathf.Clamp(Mathf.FloorToInt((float)((minZ - _origin) / _metresPerPixel)), 0, _size - 1);
            int y1 = Mathf.Clamp(Mathf.CeilToInt((float)((maxZ - _origin) / _metresPerPixel)), 0, _size - 1);
            for (int py = y0; py <= y1; py++)
            {
                double z = _origin + (py + 0.5) * _metresPerPixel;
                for (int px = x0; px <= x1; px++)
                {
                    action(_origin + (px + 0.5) * _metresPerPixel, z, py * _size + px);
                }
            }
        }

        private void Blend(int index, Color colour, float opacity)
        {
            if (opacity <= 0f)
            {
                return;
            }

            Color c = Color.Lerp(_pixels[index], colour, Mathf.Clamp01(opacity));
            c.a = 1f;
            _pixels[index] = c;
        }
    }
}
