using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Material for world signs (<see cref="TextMesh"/>): the font texture with depth test (shader <c>Aetherfall/WorldText</c>).
    /// The font's own material uses the built-in "GUI/Text Shader", which draws on top of everything, so names and inscriptions
    /// shone through walls, terrain and figures. Falls back to the font's material if the shader is missing.
    /// </summary>
    public static class WorldTextMaterial
    {
        /// <summary>Shader of the world signs.</summary>
        public const string ShaderName = "Aetherfall/WorldText";

        private const string Folder = "Assets/_Project/Art/Materials";

        /// <summary>Creates or updates the sign material of a font (one asset per font).</summary>
        /// <param name="font">Font of the signs.</param>
        /// <returns>The material, the font's own material without the shader, or null without font.</returns>
        public static Material For(Font font)
        {
            if (font == null)
            {
                return null;
            }

            Texture texture = font.material != null ? font.material.mainTexture : null;
            Shader shader = Shader.Find(ShaderName);
            if (shader == null || texture == null)
            {
                return font.material;
            }

            string path = Folder + "/M_WorldText_" + font.name.Replace(' ', '_') + ".mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(shader) { name = "M_WorldText_" + font.name };
                material.mainTexture = texture;
                AssetDatabase.CreateAsset(material, path);
                return material;
            }

            if (material.shader != shader || material.mainTexture != texture)
            {
                material.shader = shader;
                material.mainTexture = texture;
                EditorUtility.SetDirty(material);
            }

            return material;
        }
    }
}
