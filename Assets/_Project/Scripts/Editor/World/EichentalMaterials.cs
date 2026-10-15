using System.Collections.Generic;
using Aetherfall.World;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// URP/Lit materials of the Eichental from the layout palette (GDD 05 3.3: meadow green, ochre, straw yellow; glow red in the
    /// village, Aether turquoise at the rift). Assets in Art/Materials/Eichental; colours are updated on every run, because the
    /// layout file is the data source.
    /// </summary>
    public sealed class EichentalMaterials
    {
        private readonly Dictionary<string, Material> _materials = new Dictionary<string, Material>();
        private readonly LayoutPalette _palette;
        private readonly TestGroundReport _report;

        /// <summary>Creates the material set.</summary>
        /// <param name="palette">Palette of the layout.</param>
        /// <param name="report">Protocol.</param>
        public EichentalMaterials(LayoutPalette palette, TestGroundReport report)
        {
            _palette = palette;
            _report = report;
        }

        /// <summary>sRGB colour of a palette entry (grey if missing).</summary>
        /// <param name="key">Palette key.</param>
        public Color Color(string key)
        {
            // Without a palette (figures outside the Eichental, e.g. Maren in the crypt) every palette colour is grey.
            LayoutColor c = _palette != null ? _palette.Get(key, new LayoutColor(0.5, 0.5, 0.5)) : new LayoutColor(0.5, 0.5, 0.5);
            return new Color((float)c.R, (float)c.G, (float)c.B, 1f);
        }

        /// <summary>Opaque material of a palette colour.</summary>
        /// <param name="key">Palette key, e.g. "plaster".</param>
        /// <param name="smoothness">URP smoothness (GDD 05 3.1: wood 0.2–0.35, stone 0.1–0.3).</param>
        public Material Get(string key, float smoothness = 0.2f)
        {
            return Ensure("M_Eichental_" + key, Color(key), smoothness, 0f, null, 0f);
        }

        /// <summary>Opaque material of a fixed colour (colours that are not in the palette, e.g. windows).</summary>
        /// <param name="name">Name without prefix.</param>
        /// <param name="color">Colour.</param>
        /// <param name="smoothness">Smoothness.</param>
        /// <param name="metallic">Metallic.</param>
        public Material Fixed(string name, Color color, float smoothness = 0.2f, float metallic = 0f)
        {
            return Ensure("M_Eichental_" + name, color, smoothness, metallic, null, 0f);
        }

        /// <summary>Material that glows in a palette colour (emission; Aether and embers).</summary>
        /// <param name="key">Palette key, e.g. "aether" or "ember".</param>
        /// <param name="intensity">Emission intensity (HDR factor).</param>
        public Material Glow(string key, float intensity)
        {
            Color color = Color(key);
            return Ensure("M_Eichental_" + key + "_Glow", color * 0.6f, 0.9f, 0f, color, intensity);
        }

        /// <summary>
        /// Like <see cref="Glow(string, float)"/>, but its own material (the cache goes by name, so the first intensity of a key
        /// would win), e.g. the softer glow of the detective mode.
        /// </summary>
        /// <param name="key">Palette key.</param>
        /// <param name="intensity">Emission intensity (HDR factor).</param>
        /// <param name="variant">Name suffix of the material, e.g. "Untersuchen".</param>
        public Material Glow(string key, float intensity, string variant)
        {
            Color color = Color(key);
            return Ensure("M_Eichental_" + key + "_Glow_" + variant, color * 0.6f, 0.9f, 0f, color, intensity);
        }

        /// <summary>Water: dark, very smooth (no turquoise; GDD 05 3.4 reserves it for Aether).</summary>
        public Material Water()
        {
            return Ensure("M_Eichental_water", Color("water"), 0.92f, 0f, null, 0f);
        }

        private Material Ensure(string name, Color color, float smoothness, float metallic, Color? emission, float intensity)
        {
            if (_materials.TryGetValue(name, out Material cached))
            {
                return cached;
            }

            string path = EichentalPaths.MaterialFolder + "/" + name + ".mat";
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                Shader shader = Shader.Find(TestGroundAssets.LitShaderName);
                if (shader == null)
                {
                    shader = Shader.Find("Standard");
                }

                material = new Material(shader) { name = name };
                AssetDatabase.CreateAsset(material, path);
                _report.Info("Material angelegt: " + path);
            }

            if (material.HasProperty("_BaseColor"))
            {
                material.SetColor("_BaseColor", color);
            }

            if (material.HasProperty("_Color"))
            {
                material.SetColor("_Color", color);
            }

            if (material.HasProperty("_Smoothness"))
            {
                material.SetFloat("_Smoothness", smoothness);
            }

            if (material.HasProperty("_Metallic"))
            {
                material.SetFloat("_Metallic", metallic);
            }

            if (emission.HasValue)
            {
                material.EnableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", emission.Value * intensity);
                material.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            }
            else
            {
                material.DisableKeyword("_EMISSION");
                material.globalIlluminationFlags = MaterialGlobalIlluminationFlags.EmissiveIsBlack;
            }

            EditorUtility.SetDirty(material);
            _materials[name] = material;
            return material;
        }
    }
}
