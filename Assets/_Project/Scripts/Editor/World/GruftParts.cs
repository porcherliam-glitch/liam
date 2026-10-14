using System.Text;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>Small building blocks of the crypt builder: primitives, trigger volumes, 3D texts, glow children, field setters.</summary>
    public static class GruftParts
    {
        /// <summary>Creates an empty child.</summary>
        /// <param name="parent">Parent.</param>
        /// <param name="name">Name.</param>
        /// <param name="localPosition">Local position.</param>
        /// <returns>The child transform.</returns>
        public static Transform Empty(Transform parent, string name, Vector3 localPosition)
        {
            var child = new GameObject(name);
            child.transform.SetParent(parent, false);
            child.transform.localPosition = localPosition;
            child.layer = parent != null ? parent.gameObject.layer : 0;
            return child.transform;
        }

        /// <summary>Creates a primitive child.</summary>
        /// <param name="parent">Parent.</param>
        /// <param name="name">Name.</param>
        /// <param name="type">Primitive.</param>
        /// <param name="localPosition">Local position.</param>
        /// <param name="localScale">Local scale.</param>
        /// <param name="material">Material.</param>
        /// <param name="layer">Layer.</param>
        /// <param name="solid">Keep the collider.</param>
        /// <returns>The object.</returns>
        public static GameObject Part(Transform parent, string name, PrimitiveType type, Vector3 localPosition, Vector3 localScale, Material material,
            int layer, bool solid)
        {
            GameObject part = GameObject.CreatePrimitive(type);
            part.name = name;
            part.layer = layer;
            part.transform.SetParent(parent, false);
            part.transform.localPosition = localPosition;
            part.transform.localScale = localScale;
            if (part.TryGetComponent(out Collider collider))
            {
                if (solid)
                {
                    if (type == PrimitiveType.Cylinder && collider is CapsuleCollider)
                    {
                        // Unity's cylinder has a capsule collider; columns need flat ends.
                        Object.DestroyImmediate(collider);
                        part.AddComponent<BoxCollider>();
                    }
                }
                else
                {
                    Object.DestroyImmediate(collider);
                }
            }

            if (material != null && part.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = material;
            }

            return part;
        }

        /// <summary>Adds a trigger box (interaction or zone) as child.</summary>
        /// <param name="parent">Parent.</param>
        /// <param name="name">Name.</param>
        /// <param name="center">Local centre.</param>
        /// <param name="size">Size.</param>
        /// <param name="layer">Layer.</param>
        /// <param name="kinematicBody">Add a kinematic Rigidbody (zones that must see the player).</param>
        /// <returns>The trigger object.</returns>
        public static GameObject Trigger(Transform parent, string name, Vector3 center, Vector3 size, int layer, bool kinematicBody)
        {
            var trigger = new GameObject(name);
            trigger.transform.SetParent(parent, false);
            trigger.layer = layer;
            BoxCollider box = trigger.AddComponent<BoxCollider>();
            box.isTrigger = true;
            box.center = center;
            box.size = size;
            if (kinematicBody)
            {
                Rigidbody body = trigger.AddComponent<Rigidbody>();
                body.isKinematic = true;
                body.useGravity = false;
            }

            return trigger;
        }

        /// <summary>Adds a trigger box to an object itself (zones whose component sits on the same object).</summary>
        /// <param name="target">Object.</param>
        /// <param name="center">Local centre.</param>
        /// <param name="size">Size.</param>
        /// <param name="layer">Layer.</param>
        public static void TriggerOn(GameObject target, Vector3 center, Vector3 size, int layer)
        {
            target.layer = layer;
            BoxCollider box = target.AddComponent<BoxCollider>();
            box.isTrigger = true;
            box.center = center;
            box.size = size;
            Rigidbody body = target.AddComponent<Rigidbody>();
            body.isKinematic = true;
            body.useGravity = false;
        }

        /// <summary>Creates a 3D text child (reads from the front of the parent, i.e. the viewer stands on the parent's +Z side).</summary>
        /// <param name="parent">Parent.</param>
        /// <param name="name">Name.</param>
        /// <param name="text">Text.</param>
        /// <param name="localPosition">Local position.</param>
        /// <param name="characterSize">Character size.</param>
        /// <param name="color">Colour.</param>
        /// <param name="font">Font (null = no text).</param>
        /// <returns>The text object, or null without font.</returns>
        public static GameObject Text(Transform parent, string name, string text, Vector3 localPosition, float characterSize, Color color, Font font)
        {
            if (font == null)
            {
                return null;
            }

            var label = new GameObject(name);
            label.transform.SetParent(parent, false);
            label.transform.localPosition = localPosition;
            label.transform.localRotation = Quaternion.Euler(0f, 180f, 0f);
            TextMesh mesh = label.AddComponent<TextMesh>();
            mesh.text = text;
            mesh.font = font;
            mesh.fontSize = 64;
            mesh.characterSize = characterSize;
            mesh.anchor = TextAnchor.MiddleCenter;
            mesh.alignment = TextAlignment.Center;
            mesh.color = color;
            if (label.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = WorldTextMaterial.For(font);
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }

            return label;
        }

        /// <summary>Breaks a text into lines of at most <paramref name="width"/> characters (at spaces).</summary>
        /// <param name="text">Text.</param>
        /// <param name="width">Line width.</param>
        public static string Wrap(string text, int width)
        {
            if (string.IsNullOrEmpty(text) || text.Length <= width)
            {
                return text ?? string.Empty;
            }

            var result = new StringBuilder();
            int lineLength = 0;
            string[] words = text.Split(' ');
            for (int i = 0; i < words.Length; i++)
            {
                if (lineLength > 0 && lineLength + 1 + words[i].Length > width)
                {
                    result.Append('\n');
                    lineLength = 0;
                }
                else if (lineLength > 0)
                {
                    result.Append(' ');
                    lineLength++;
                }

                result.Append(words[i]);
                lineLength += words[i].Length;
            }

            return result.ToString();
        }

        /// <summary>Sets a Vector4 field.</summary>
        /// <param name="target">Component.</param>
        /// <param name="field">Field.</param>
        /// <param name="value">Value.</param>
        /// <param name="report">Protocol.</param>
        public static void SetVector4(Object target, string field, Vector4 value, TestGroundReport report)
        {
            var serialized = new SerializedObject(target);
            SerializedProperty property = serialized.FindProperty(field);
            if (property == null)
            {
                report.Warning("Feld „" + field + "“ an " + target.GetType().Name + " nicht gefunden.");
                return;
            }

            property.vector4Value = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>Appends a state requirement (object id, state) to the list field "requirements".</summary>
        /// <param name="target">State interactable.</param>
        /// <param name="objectId">Id.</param>
        /// <param name="state">State.</param>
        /// <param name="report">Protocol.</param>
        public static void AddRequirement(Object target, string objectId, int state, TestGroundReport report)
        {
            var serialized = new SerializedObject(target);
            SerializedProperty list = serialized.FindProperty("requirements");
            if (list == null || !list.isArray)
            {
                report.Warning("Liste „requirements“ an " + target.GetType().Name + " nicht gefunden.");
                return;
            }

            list.arraySize++;
            SerializedProperty element = list.GetArrayElementAtIndex(list.arraySize - 1);
            element.FindPropertyRelative("objectId").stringValue = objectId;
            element.FindPropertyRelative("state").intValue = state;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
