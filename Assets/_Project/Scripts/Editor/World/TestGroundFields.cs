using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Sets serialized private fields of components and assets by name (SerializedObject), so the test ground menu needs no
    /// public setters in runtime code. A missing field (renamed in code) becomes a warning in the protocol.
    /// </summary>
    public static class TestGroundFields
    {
        /// <summary>Sets an object reference.</summary>
        /// <param name="target">Component or asset.</param>
        /// <param name="field">Serialized field name.</param>
        /// <param name="value">Value.</param>
        /// <param name="report">Protocol.</param>
        public static void SetReference(Object target, string field, Object value, TestGroundReport report)
        {
            SerializedProperty property = Find(target, field, report, out SerializedObject serialized);
            if (property == null)
            {
                return;
            }

            property.objectReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>Sets a string.</summary>
        /// <param name="target">Component or asset.</param>
        /// <param name="field">Serialized field name.</param>
        /// <param name="value">Value.</param>
        /// <param name="report">Protocol.</param>
        public static void SetString(Object target, string field, string value, TestGroundReport report)
        {
            SerializedProperty property = Find(target, field, report, out SerializedObject serialized);
            if (property == null)
            {
                return;
            }

            property.stringValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>Sets an int, enum or layer mask (underlying integer value).</summary>
        /// <param name="target">Component or asset.</param>
        /// <param name="field">Serialized field name.</param>
        /// <param name="value">Value.</param>
        /// <param name="report">Protocol.</param>
        public static void SetInt(Object target, string field, int value, TestGroundReport report)
        {
            SerializedProperty property = Find(target, field, report, out SerializedObject serialized);
            if (property == null)
            {
                return;
            }

            property.intValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>Sets a float.</summary>
        /// <param name="target">Component or asset.</param>
        /// <param name="field">Serialized field name.</param>
        /// <param name="value">Value.</param>
        /// <param name="report">Protocol.</param>
        public static void SetFloat(Object target, string field, float value, TestGroundReport report)
        {
            SerializedProperty property = Find(target, field, report, out SerializedObject serialized);
            if (property == null)
            {
                return;
            }

            property.floatValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>Sets a bool.</summary>
        /// <param name="target">Component or asset.</param>
        /// <param name="field">Serialized field name.</param>
        /// <param name="value">Value.</param>
        /// <param name="report">Protocol.</param>
        public static void SetBool(Object target, string field, bool value, TestGroundReport report)
        {
            SerializedProperty property = Find(target, field, report, out SerializedObject serialized);
            if (property == null)
            {
                return;
            }

            property.boolValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>Sets a Vector3.</summary>
        /// <param name="target">Component or asset.</param>
        /// <param name="field">Serialized field name.</param>
        /// <param name="value">Value.</param>
        /// <param name="report">Protocol.</param>
        public static void SetVector3(Object target, string field, Vector3 value, TestGroundReport report)
        {
            SerializedProperty property = Find(target, field, report, out SerializedObject serialized);
            if (property == null)
            {
                return;
            }

            property.vector3Value = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>Fills a serialized array or list of object references.</summary>
        /// <param name="target">Component or asset.</param>
        /// <param name="field">Serialized field name.</param>
        /// <param name="values">Values in order.</param>
        /// <param name="report">Protocol.</param>
        public static void SetReferences(Object target, string field, Object[] values, TestGroundReport report)
        {
            SerializedProperty property = Find(target, field, report, out SerializedObject serialized);
            if (property == null || !property.isArray)
            {
                return;
            }

            property.arraySize = values.Length;
            for (int i = 0; i < values.Length; i++)
            {
                property.GetArrayElementAtIndex(i).objectReferenceValue = values[i];
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>Finds a serialized property; logs a warning if it does not exist.</summary>
        /// <param name="target">Component or asset.</param>
        /// <param name="field">Serialized field name.</param>
        /// <param name="report">Protocol.</param>
        /// <param name="serialized">The serialized object (apply it after changing the property).</param>
        public static SerializedProperty Find(Object target, string field, TestGroundReport report, out SerializedObject serialized)
        {
            serialized = new SerializedObject(target);
            SerializedProperty property = serialized.FindProperty(field);
            if (property == null)
            {
                report.Warning("Feld „" + field + "“ an " + target.GetType().Name + " nicht gefunden (Code umbenannt?). Bitte im Inspector von Hand setzen.");
            }

            return property;
        }
    }
}
