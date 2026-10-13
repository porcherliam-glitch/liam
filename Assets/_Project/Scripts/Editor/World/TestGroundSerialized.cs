using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Helpers of the test ground menu for data assets: load-or-create an asset (never overwrite an existing one) and set
    /// serialized private fields by name on a <see cref="SerializedObject"/>; a missing field (renamed in code) becomes a
    /// warning in the protocol.
    /// </summary>
    public static class TestGroundSerialized
    {
        /// <summary>
        /// Loads an asset or creates it and lets <paramref name="fill"/> set its fields. Existing assets stay unchanged (the
        /// user may have tuned them).
        /// </summary>
        /// <typeparam name="T">Asset type.</typeparam>
        /// <param name="path">Asset path.</param>
        /// <param name="report">Protocol.</param>
        /// <param name="fill">Fills a new asset (SerializedObject is applied afterwards); may be null.</param>
        /// <returns>The asset, or null if another asset type blocks the path.</returns>
        public static T EnsureAsset<T>(string path, TestGroundReport report, Action<SerializedObject> fill) where T : ScriptableObject
        {
            T existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing != null)
            {
                return existing;
            }

            if (File.Exists(Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, path)))
            {
                report.Warning(path + " existiert, ist aber kein " + typeof(T).Name + " – bitte prüfen.");
                return null;
            }

            T asset = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(asset, path);
            if (fill != null)
            {
                var serialized = new SerializedObject(asset);
                fill(serialized);
                serialized.ApplyModifiedPropertiesWithoutUndo();
            }

            EditorUtility.SetDirty(asset);
            report.Info("Angelegt: " + path);
            return asset;
        }

        /// <summary>Sets a float.</summary>
        /// <param name="so">Serialized object.</param>
        /// <param name="field">Field name.</param>
        /// <param name="value">Value.</param>
        /// <param name="report">Protocol.</param>
        public static void Set(SerializedObject so, string field, float value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.floatValue = value;
            }
        }

        /// <summary>Sets an int, enum or flags value (underlying integer).</summary>
        /// <param name="so">Serialized object.</param>
        /// <param name="field">Field name.</param>
        /// <param name="value">Value.</param>
        /// <param name="report">Protocol.</param>
        public static void Set(SerializedObject so, string field, int value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.intValue = value;
            }
        }

        /// <summary>Sets a bool.</summary>
        /// <param name="so">Serialized object.</param>
        /// <param name="field">Field name.</param>
        /// <param name="value">Value.</param>
        /// <param name="report">Protocol.</param>
        public static void Set(SerializedObject so, string field, bool value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.boolValue = value;
            }
        }

        /// <summary>Sets a string.</summary>
        /// <param name="so">Serialized object.</param>
        /// <param name="field">Field name.</param>
        /// <param name="value">Value.</param>
        /// <param name="report">Protocol.</param>
        public static void Set(SerializedObject so, string field, string value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.stringValue = value;
            }
        }

        /// <summary>Sets an object reference.</summary>
        /// <param name="so">Serialized object.</param>
        /// <param name="field">Field name.</param>
        /// <param name="value">Value.</param>
        /// <param name="report">Protocol.</param>
        public static void Set(SerializedObject so, string field, Object value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.objectReferenceValue = value;
            }
        }

        /// <summary>Finds a property; logs a warning if it does not exist.</summary>
        /// <param name="so">Serialized object.</param>
        /// <param name="field">Field name.</param>
        /// <param name="report">Protocol.</param>
        public static SerializedProperty Property(SerializedObject so, string field, TestGroundReport report)
        {
            SerializedProperty property = so.FindProperty(field);
            if (property == null)
            {
                report.Warning("Feld „" + field + "“ an " + so.targetObject.GetType().Name + " nicht gefunden (Code umbenannt?).");
            }

            return property;
        }

        /// <summary>Finds a relative property of an array element; logs a warning if it does not exist.</summary>
        /// <param name="element">Array element.</param>
        /// <param name="field">Field name.</param>
        /// <param name="report">Protocol.</param>
        public static SerializedProperty Relative(SerializedProperty element, string field, TestGroundReport report)
        {
            SerializedProperty property = element.FindPropertyRelative(field);
            if (property == null)
            {
                report.Warning("Feld „" + field + "“ in " + element.propertyPath + " nicht gefunden (Code umbenannt?).");
            }

            return property;
        }
    }
}
