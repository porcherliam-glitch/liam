using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// World-space text signs of the Eichental blockout (NPC placeholders, notice board, crypt entrance): a <see cref="TextMesh"/>
    /// with the built-in font, no shadows. Placeholders for testing; the real UI (architecture 12) replaces them later.
    /// </summary>
    public static class EichentalLabel
    {
        /// <summary>Creates a sign under <paramref name="parent"/>; without a font nothing is created.</summary>
        /// <param name="parent">Parent.</param>
        /// <param name="text">Text (German, may contain line breaks).</param>
        /// <param name="localPosition">Position relative to the parent.</param>
        /// <param name="localYaw">Rotation around y relative to the parent; 180 = readable from the parent's front.</param>
        /// <param name="font">Font (may be null).</param>
        /// <param name="characterSize">Character size (0.03–0.06).</param>
        /// <returns>The sign or null.</returns>
        public static TextMesh Create(Transform parent, string text, Vector3 localPosition, float localYaw, Font font, float characterSize)
        {
            if (font == null)
            {
                return null;
            }

            var label = new GameObject("Schild " + text.Replace('\n', ' '));
            label.transform.SetParent(parent, false);
            label.transform.localPosition = localPosition;
            label.transform.localRotation = Quaternion.Euler(0f, localYaw, 0f);
            TextMesh mesh = label.AddComponent<TextMesh>();
            mesh.text = text;
            mesh.font = font;
            mesh.fontSize = 64;
            mesh.characterSize = characterSize;
            mesh.anchor = TextAnchor.MiddleCenter;
            mesh.alignment = TextAlignment.Center;
            mesh.color = Color.white;
            if (label.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = WorldTextMaterial.For(font);
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }

            return mesh;
        }
    }
}
