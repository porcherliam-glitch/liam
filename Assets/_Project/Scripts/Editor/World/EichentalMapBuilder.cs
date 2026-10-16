using System.Collections.Generic;
using System.IO;
using Aetherfall.World;
using Aetherfall.World.Exploration;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// World map of the Eichental (S34/S63): paints the map picture from the layout (<see cref="RegionMapPainter"/>), writes the
    /// map definition with the places (<see cref="RegionMapDefinition"/>: map names and reveal radii from the layout), puts a
    /// <see cref="RegionMapAnchor"/> into the scene and a <see cref="ViewpointZone"/> on top of every viewpoint (the crow's nest
    /// deck of the Wachturm Grauwacht, the Rabenfels summit).
    /// </summary>
    public static class EichentalMapBuilder
    {
        /// <summary>Size of the map picture in pixels (0.5 m per pixel over the 512 m terrain).</summary>
        public const int MapSize = 1024;

        /// <summary>Paints the picture, writes the definition and places the anchor and the viewpoint zones.</summary>
        /// <param name="layout">Layout.</param>
        /// <param name="heights">Heights of the layout.</param>
        /// <param name="worldSpaceId">World space id of the scene.</param>
        /// <param name="parent">Parent in the scene.</param>
        /// <param name="triggerLayer">Layer of the viewpoint triggers (TriggerVolume) or −1.</param>
        /// <param name="playerLayer">Player layer or −1.</param>
        /// <param name="report">Protocol.</param>
        public static RegionMapDefinition Build(RegionLayout layout, LayoutHeightField heights, string worldSpaceId, Transform parent, int triggerLayer,
            int playerLayer, TestGroundReport report)
        {
            float[,] grid = heights.SampleNormalizedHeights();
            float[,,] ground = new LayoutGroundMap(layout).SampleAlphamap(heights, 256);
            var painter = new RegionMapPainter(layout, grid, ground, MapSize);
            Color32[] pixels = painter.Paint(VegetationScatter.Scatter(layout));
            Texture2D mapImage = WritePicture(pixels, report);

            var places = new List<MapPlace>();
            int shown = 0;
            int waypoints = 0;
            foreach (LayoutLocation location in layout.Locations)
            {
                bool show = location.MapName.Length > 0;
                float radius = (float)(location.Shape == LocationShape.Circle ? location.Radius : Mathf.Max((float)location.Width, (float)location.Depth) * 0.5);
                bool box = location.Shape != LocationShape.Circle;
                var place = new MapPlace(location.Id, show ? location.MapName : location.Name, location.Kind, (float)location.Center.X,
                    (float)location.Center.Z, radius, show, (float)location.RevealRadius, box ? (float)location.Width : 0f, box ? (float)location.Depth : 0f,
                    box ? (float)location.Yaw : 0f);
                if (location.HasWaypoint)
                {
                    // S50: the player arrives here on the terrain (the generator bakes the height).
                    float wx = (float)location.Waypoint.X;
                    float wz = (float)location.Waypoint.Z;
                    place.WithWaypoint(new Vector3(wx, (float)heights.Height(wx, wz) + 0.1f, wz), (float)location.WaypointYaw);
                    waypoints++;
                }

                places.Add(place);
                if (show)
                {
                    shown++;
                }
            }

            LayoutBounds bounds = layout.Terrain.PlayableBounds;
            var projection = new MapProjection(painter.Origin, painter.Origin, painter.Extent);
            var min = new Vector2((float)bounds.Min.X, (float)bounds.Min.Z);
            var max = new Vector2((float)bounds.Max.X, (float)bounds.Max.Z);
            RegionMapDefinition map = AssetDatabase.LoadAssetAtPath<RegionMapDefinition>(EichentalPaths.RegionMapPath);
            if (map == null)
            {
                map = RegionMapDefinition.Create(EichentalPaths.MapId, layout.RegionId, "Eichental", worldSpaceId, mapImage, projection, min, max, 4f, 60f, places);
                AssetDatabase.CreateAsset(map, EichentalPaths.RegionMapPath);
            }
            else
            {
                map.Apply(EichentalPaths.MapId, layout.RegionId, "Eichental", worldSpaceId, mapImage, projection, min, max, 4f, 60f, places);
                EditorUtility.SetDirty(map);
            }

            AssetDatabase.SaveAssets();

            var anchorObject = new GameObject("Weltkarte");
            anchorObject.transform.SetParent(parent, false);
            RegionMapAnchor anchor = anchorObject.AddComponent<RegionMapAnchor>();
            TestGroundFields.SetReference(anchor, "map", map, report);
            int viewpoints = BuildViewpoints(layout, heights, parent, triggerLayer, playerLayer, report);
            report.Info("Weltkarte: " + MapSize + "² px gemalt (" + EichentalPaths.MapImagePath + "), " + places.Count + " Orte, davon " + shown +
                        " auf der Karte, " + waypoints + " Schnellreise-Ziele, Nebel " + map.FogColumns + " × " + map.FogRows + " Zellen à " + map.FogCellSize + " m, " + viewpoints +
                        " Aussichtspunkt-Zonen.");
            return map;
        }

        private static Texture2D WritePicture(Color32[] pixels, TestGroundReport report)
        {
            var texture = new Texture2D(MapSize, MapSize, TextureFormat.RGBA32, false);
            texture.SetPixels32(pixels);
            texture.Apply();
            byte[] png = texture.EncodeToPNG();
            Object.DestroyImmediate(texture);

            string fullPath = Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? ".", EichentalPaths.MapImagePath);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath) ?? ".");
            bool changed = !File.Exists(fullPath) || !SameBytes(File.ReadAllBytes(fullPath), png);
            if (changed)
            {
                // Written only when the picture changed, so a generator run without layout changes leaves Git clean.
                File.WriteAllBytes(fullPath, png);
                AssetDatabase.ImportAsset(EichentalPaths.MapImagePath, ImportAssetOptions.ForceUpdate);
            }

            var importer = AssetImporter.GetAtPath(EichentalPaths.MapImagePath) as TextureImporter;
            if (importer != null)
            {
                bool dirty = importer.textureType != TextureImporterType.Default || !importer.sRGBTexture || !importer.mipmapEnabled ||
                             importer.wrapMode != TextureWrapMode.Clamp || importer.maxTextureSize != MapSize ||
                             importer.textureCompression != TextureImporterCompression.CompressedHQ;
                if (dirty)
                {
                    importer.textureType = TextureImporterType.Default;
                    importer.sRGBTexture = true;
                    importer.mipmapEnabled = true;
                    importer.wrapMode = TextureWrapMode.Clamp;
                    importer.filterMode = FilterMode.Trilinear;
                    importer.maxTextureSize = MapSize;
                    importer.textureCompression = TextureImporterCompression.CompressedHQ;
                    importer.SaveAndReimport();
                }
            }

            if (changed)
            {
                report.Info("Kartenbild neu gemalt: " + EichentalPaths.MapImagePath);
            }

            return AssetDatabase.LoadAssetAtPath<Texture2D>(EichentalPaths.MapImagePath);
        }

        private static bool SameBytes(byte[] a, byte[] b)
        {
            if (a.Length != b.Length)
            {
                return false;
            }

            for (int i = 0; i < a.Length; i++)
            {
                if (a[i] != b[i])
                {
                    return false;
                }
            }

            return true;
        }

        private static int BuildViewpoints(RegionLayout layout, LayoutHeightField heights, Transform parent, int triggerLayer, int playerLayer,
            TestGroundReport report)
        {
            int count = 0;
            foreach (LayoutLocation location in layout.Locations)
            {
                if (location.Kind != LocationKind.Viewpoint)
                {
                    continue;
                }

                Vector3 center;
                Vector3 size;
                float yaw = 0f;
                LayoutBuilding tower = TowerAt(layout, location.Center);
                if (tower != null)
                {
                    // The deck of the tower (the crow's nest): only who climbs up activates it.
                    float top = EichentalBuildingBuilder.BaseHeight(tower, heights) + (float)tower.WallHeight + WatchtowerBuilder.DeckThickness;
                    center = new Vector3((float)tower.Position.X, top + 1.25f, (float)tower.Position.Z);
                    size = new Vector3((float)tower.Width - 0.4f, 2.5f, (float)tower.Depth - 0.4f);
                    yaw = (float)tower.Yaw;
                }
                else
                {
                    float radius = Mathf.Min((float)location.Radius, 8f);
                    float ground = (float)heights.Height(location.Center.X, location.Center.Z);
                    center = new Vector3((float)location.Center.X, ground + 1.5f, (float)location.Center.Z);
                    size = new Vector3(radius * 2f, 4f, radius * 2f);
                }

                var zone = new GameObject("Aussichtspunkt " + location.Id);
                zone.transform.SetParent(parent, false);
                zone.transform.SetPositionAndRotation(center, Quaternion.Euler(0f, yaw, 0f));
                zone.layer = triggerLayer >= 0 ? triggerLayer : 0;
                BoxCollider box = zone.AddComponent<BoxCollider>();
                box.isTrigger = true;
                box.size = size;
                Rigidbody body = zone.AddComponent<Rigidbody>();
                body.isKinematic = true;
                body.useGravity = false;
                ViewpointZone viewpoint = zone.AddComponent<ViewpointZone>();
                TestGroundFields.SetString(viewpoint, "placeId", location.Id, report);
                TestGroundFields.SetInt(viewpoint, "playerLayers", playerLayer >= 0 ? 1 << playerLayer : 1 << TestGroundPaths.PlayerLayerIndex, report);
                count++;
            }

            return count;
        }

        private static LayoutBuilding TowerAt(RegionLayout layout, LayoutPoint point)
        {
            foreach (LayoutBuilding building in layout.Buildings)
            {
                if (building.Kind != BuildingKind.Watchtower)
                {
                    continue;
                }

                LayoutPoint local = LayoutGeometry.ToLocal(point.X - building.Position.X, point.Z - building.Position.Z, building.Yaw);
                if (System.Math.Abs(local.X) <= building.Width * 0.5 && System.Math.Abs(local.Z) <= building.Depth * 0.5)
                {
                    return building;
                }
            }

            return null;
        }
    }
}
