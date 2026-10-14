using System.IO;
using Aetherfall.World;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Builds the Unity terrain of a layout: heightmap from <see cref="LayoutHeightField"/>, four terrain layers (grass, earth,
    /// rock, ash; architecture 10.5 recommends at most 4 per cell) with small textures generated in code from the palette, and
    /// the splat map from <see cref="LayoutGroundMap"/>. The terrain lies at (−size/2, 0, −size/2), so layout coordinates are
    /// world coordinates.
    /// </summary>
    public static class EichentalTerrainBuilder
    {
        private const int TextureSize = 64;

        /// <summary>Creates or updates the terrain data asset and the terrain object.</summary>
        /// <param name="layout">Layout.</param>
        /// <param name="heights">Height field of the layout.</param>
        /// <param name="materials">Materials (palette colours).</param>
        /// <param name="parent">Parent of the terrain object.</param>
        /// <param name="terrainLayer">Unity layer of the terrain or −1.</param>
        /// <param name="report">Protocol.</param>
        public static Terrain Build(RegionLayout layout, LayoutHeightField heights, EichentalMaterials materials, Transform parent, int terrainLayer,
            TestGroundReport report)
        {
            LayoutTerrain t = layout.Terrain;
            TerrainData data = AssetDatabase.LoadAssetAtPath<TerrainData>(EichentalPaths.TerrainDataPath);
            if (data == null)
            {
                data = new TerrainData();
                AssetDatabase.CreateAsset(data, EichentalPaths.TerrainDataPath);
                report.Info("Terrain-Daten angelegt: " + EichentalPaths.TerrainDataPath);
            }

            data.heightmapResolution = t.HeightmapResolution;
            data.size = new Vector3((float)t.Size, (float)t.MaxHeight, (float)t.Size);
            data.SetHeights(0, 0, heights.SampleNormalizedHeights());

            TerrainLayer[] layers =
            {
                EnsureLayer("Gras", materials.Color("grass"), materials.Color("grassDry"), 4f, 0.1f, report),
                EnsureLayer("Erde", materials.Color("dirt"), materials.Color("woodDark"), 3f, 0.15f, report),
                EnsureLayer("Fels", materials.Color("rock"), materials.Color("stone"), 6f, 0.2f, report),
                EnsureLayer("Asche", materials.Color("ash"), materials.Color("burnedWood"), 3f, 0.05f, report)
            };
            data.terrainLayers = layers;
            data.alphamapResolution = t.AlphamapResolution;
            data.baseMapResolution = 512;
            data.SetAlphamaps(0, 0, new LayoutGroundMap(layout).SampleAlphamap(heights, t.AlphamapResolution));
            EditorUtility.SetDirty(data);

            GameObject terrainObject = Terrain.CreateTerrainGameObject(data);
            terrainObject.name = "Terrain";
            terrainObject.transform.SetParent(parent, false);
            terrainObject.transform.position = new Vector3((float)(-t.Size * 0.5), 0f, (float)(-t.Size * 0.5));
            if (terrainLayer >= 0)
            {
                terrainObject.layer = terrainLayer;
            }

            Terrain terrain = terrainObject.GetComponent<Terrain>();
            terrain.heightmapPixelError = 4f;
            terrain.basemapDistance = 220f;
            terrain.drawTreesAndFoliage = false;
            Material material = EnsureTerrainMaterial(report);
            if (material != null)
            {
                terrain.materialTemplate = material;
            }

            GameObjectUtility.SetStaticEditorFlags(terrainObject, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccluderStatic |
                                                                   StaticEditorFlags.OccludeeStatic);
            report.Info("Terrain " + t.Size + " × " + t.Size + " m, Höhen bis " + t.MaxHeight + " m, Heightmap " + t.HeightmapResolution +
                        "², 4 Bodenschichten (Gras, Erde, Fels, Asche) mit " + t.AlphamapResolution + "² Splatmap.");
            return terrain;
        }

        private static Material EnsureTerrainMaterial(TestGroundReport report)
        {
            string path = EichentalPaths.MaterialFolder + "/M_Eichental_Terrain.mat";
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material != null)
            {
                return material;
            }

            Shader shader = Shader.Find("Universal Render Pipeline/Terrain/Lit");
            if (shader == null)
            {
                report.Warning("Shader „Universal Render Pipeline/Terrain/Lit“ nicht gefunden (URP fehlt?). Das Terrain nutzt Unitys Standard.");
                return null;
            }

            material = new Material(shader) { name = "M_Eichental_Terrain" };
            AssetDatabase.CreateAsset(material, path);
            return material;
        }

        private static TerrainLayer EnsureLayer(string name, Color main, Color accent, float tileSize, float smoothness, TestGroundReport report)
        {
            string texturePath = EichentalPaths.TerrainFolder + "/T_Eichental_" + name + "_BC.png";
            WriteTexture(texturePath, main, accent, StableSeed(name));
            AssetDatabase.ImportAsset(texturePath, ImportAssetOptions.ForceUpdate);
            if (AssetImporter.GetAtPath(texturePath) is TextureImporter importer)
            {
                importer.sRGBTexture = true;
                importer.wrapMode = TextureWrapMode.Repeat;
                importer.mipmapEnabled = true;
                importer.SaveAndReimport();
            }

            Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(texturePath);
            string layerPath = EichentalPaths.TerrainFolder + "/TL_Eichental_" + name + ".terrainlayer";
            TerrainLayer layer = AssetDatabase.LoadAssetAtPath<TerrainLayer>(layerPath);
            if (layer == null)
            {
                layer = new TerrainLayer();
                AssetDatabase.CreateAsset(layer, layerPath);
                report.Info("Terrain-Schicht angelegt: " + layerPath);
            }

            layer.diffuseTexture = texture;
            layer.tileSize = new Vector2(tileSize, tileSize);
            layer.smoothness = smoothness;
            layer.metallic = 0f;
            EditorUtility.SetDirty(layer);
            return layer;
        }

        /// <summary>Small tileable texture: the main colour with soft spots of the accent colour (value noise, wraps around).</summary>
        private static void WriteTexture(string assetPath, Color main, Color accent, int seed)
        {
            var texture = new Texture2D(TextureSize, TextureSize, TextureFormat.RGB24, false);
            var pixels = new Color[TextureSize * TextureSize];
            for (int y = 0; y < TextureSize; y++)
            {
                for (int x = 0; x < TextureSize; x++)
                {
                    float coarse = Noise(x, y, 16, seed);
                    float fine = Noise(x, y, 4, seed + 7);
                    float mix = Mathf.Clamp01((coarse * 0.7f + fine * 0.3f - 0.35f) * 1.6f) * 0.55f;
                    Color c = Color.Lerp(main, accent, mix) * (0.92f + 0.16f * Noise(x, y, 2, seed + 13));
                    c.a = 1f;
                    pixels[y * TextureSize + x] = c;
                }
            }

            texture.SetPixels(pixels);
            texture.Apply();
            string fullPath = Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, assetPath);
            File.WriteAllBytes(fullPath, texture.EncodeToPNG());
            Object.DestroyImmediate(texture);
        }

        private static float Noise(int x, int y, int cell, int seed)
        {
            int cells = TextureSize / cell;
            float fx = (float)x / cell;
            float fy = (float)y / cell;
            int ix = Mathf.FloorToInt(fx);
            int iy = Mathf.FloorToInt(fy);
            float tx = Smooth(fx - ix);
            float ty = Smooth(fy - iy);
            float a = Hash(ix % cells, iy % cells, seed);
            float b = Hash((ix + 1) % cells, iy % cells, seed);
            float c = Hash(ix % cells, (iy + 1) % cells, seed);
            float d = Hash((ix + 1) % cells, (iy + 1) % cells, seed);
            return Mathf.Lerp(Mathf.Lerp(a, b, tx), Mathf.Lerp(c, d, tx), ty);
        }

        private static int StableSeed(string text)
        {
            int seed = 17;
            for (int i = 0; i < text.Length; i++)
            {
                seed = seed * 31 + text[i];
            }

            return seed;
        }

        private static float Smooth(float t)
        {
            return t * t * (3f - 2f * t);
        }

        private static float Hash(int x, int y, int seed)
        {
            unchecked
            {
                uint h = (uint)(x * 374761393 + y * 668265263 + seed * 362437);
                h = (h ^ (h >> 13)) * 1274126177u;
                return ((h ^ (h >> 16)) & 0xFFFF) / 65535f;
            }
        }
    }
}
