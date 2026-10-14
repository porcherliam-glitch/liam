using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEditor;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// Unity's API for stored <c>[SerializeReference]</c> data (Unity 2021.2 and newer): the managed reference id of a field
    /// (<c>SerializedProperty.managedReferenceId</c>) and the missing classes of an asset
    /// (<c>SerializationUtility.HasManagedReferencesWithMissingTypes</c> / <c>GetManagedReferencesWithMissingTypes</c>,
    /// architecture 6.4 and 7.6 no. 6). Also collects the ids of all fields of an asset and scans asset folders.
    /// </summary>
    /// <remarks>
    /// The members are called through reflection on purpose: the compile check without Unity (<c>Tools/Harness</c>) builds
    /// editor code against the UnityEditor 2021.1 reference, which does not have them yet. They are looked up once. If a
    /// future Unity version renames them, <see cref="CanReadMissingTypes"/> or <see cref="CanReadReferenceIds"/> is false and
    /// the callers report that instead of passing silently. Replace by direct calls once the harness knows the API.
    /// </remarks>
    public static class ManagedReferenceApi
    {
        private const BindingFlags PublicStatic = BindingFlags.Public | BindingFlags.Static;
        private const BindingFlags PublicInstance = BindingFlags.Public | BindingFlags.Instance;

        private static readonly Type UtilityType = typeof(SerializedProperty).Assembly.GetType("UnityEditor.SerializationUtility");
        private static readonly MethodInfo HasMissingMethod = StaticMethod("HasManagedReferencesWithMissingTypes");
        private static readonly MethodInfo GetMissingMethod = StaticMethod("GetManagedReferencesWithMissingTypes");
        private static readonly PropertyInfo IdProperty = typeof(SerializedProperty).GetProperty("managedReferenceId", PublicInstance);

        /// <summary>True if the missing classes of an asset can be read.</summary>
        public static bool CanReadMissingTypes => HasMissingMethod != null && GetMissingMethod != null;

        /// <summary>True if the managed reference ids of fields can be read.</summary>
        public static bool CanReadReferenceIds => IdProperty != null && IdProperty.PropertyType == typeof(long);

        /// <summary>Reads the managed reference id of a <c>[SerializeReference]</c> field.</summary>
        /// <param name="property">Field of type managed reference.</param>
        /// <param name="id">Id, or <see cref="ManagedReferenceChecks.NullId"/>.</param>
        /// <returns>False if the property is no managed reference or the id cannot be read.</returns>
        public static bool TryGetReferenceId(SerializedProperty property, out long id)
        {
            id = ManagedReferenceChecks.NullId;
            if (property == null || property.propertyType != SerializedPropertyType.ManagedReference || !CanReadReferenceIds)
            {
                return false;
            }

            try
            {
                id = (long)IdProperty.GetValue(property);
                return true;
            }
            catch (TargetInvocationException)
            {
                return false;
            }
        }

        /// <summary>Reads the stored <c>[SerializeReference]</c> entries of an asset whose class is missing.</summary>
        /// <param name="asset">Asset (e.g. a quest).</param>
        /// <param name="results">Cleared and filled.</param>
        /// <returns>False if the asset could not be checked (no asset, or the Unity API is missing).</returns>
        public static bool TryGetMissingTypes(UnityEngine.Object asset, List<MissingManagedType> results)
        {
            results?.Clear();
            if (asset == null || results == null || !CanReadMissingTypes)
            {
                return false;
            }

            try
            {
                if (!(HasMissingMethod.Invoke(null, new object[] { asset }) is bool hasMissing))
                {
                    return false;
                }

                if (!hasMissing)
                {
                    return true;
                }

                if (!(GetMissingMethod.Invoke(null, new object[] { asset }) is Array entries))
                {
                    return false;
                }

                foreach (object entry in entries)
                {
                    results.Add(new MissingManagedType(Read<string>(entry, "assemblyName"), Read<string>(entry, "namespaceName"), Read<string>(entry, "className"),
                                                       Read<long>(entry, "referenceId")));
                }

                return true;
            }
            catch (TargetInvocationException)
            {
                return false;
            }
        }

        /// <summary>
        /// Property path and managed reference id of every <c>[SerializeReference]</c> field of a serialized object, in document
        /// order (nested references included). Empty if the ids cannot be read.
        /// </summary>
        /// <param name="serializedObject">Serialized object (e.g. of a quest asset).</param>
        public static List<KeyValuePair<string, long>> CollectReferenceIds(SerializedObject serializedObject)
        {
            var places = new List<KeyValuePair<string, long>>();
            if (serializedObject == null || !CanReadReferenceIds)
            {
                return places;
            }

            SerializedProperty iterator = serializedObject.GetIterator();
            bool enterChildren = true;
            while (iterator.Next(enterChildren))
            {
                // Strings would be entered character by character; nothing inside them can be a reference.
                enterChildren = iterator.propertyType != SerializedPropertyType.String;
                if (iterator.propertyType == SerializedPropertyType.ManagedReference && TryGetReferenceId(iterator, out long id))
                {
                    places.Add(new KeyValuePair<string, long>(iterator.propertyPath, id));
                }
            }

            return places;
        }

        /// <summary>
        /// Finds every ScriptableObject asset below a folder that stores <c>[SerializeReference]</c> entries of missing classes
        /// (architecture 7.6 no. 6, CI check).
        /// </summary>
        /// <param name="folder">Folder, e.g. <c>Assets/_Project</c>.</param>
        /// <returns>Asset path and missing classes of every affected asset, sorted by path.</returns>
        public static List<KeyValuePair<string, List<MissingManagedType>>> FindAssetsWithMissingTypes(string folder)
        {
            var result = new List<KeyValuePair<string, List<MissingManagedType>>>();
            string[] guids = AssetDatabase.FindAssets("t:ScriptableObject", new[] { folder });
            for (int i = 0; i < guids.Length; i++)
            {
                string path = AssetDatabase.GUIDToAssetPath(guids[i]);
                var missing = new List<MissingManagedType>();
                if (TryGetMissingTypes(AssetDatabase.LoadMainAssetAtPath(path), missing) && missing.Count > 0)
                {
                    result.Add(new KeyValuePair<string, List<MissingManagedType>>(path, missing));
                }
            }

            result.Sort((a, b) => string.CompareOrdinal(a.Key, b.Key));
            return result;
        }

        private static MethodInfo StaticMethod(string name)
        {
            return UtilityType != null ? UtilityType.GetMethod(name, PublicStatic, null, new[] { typeof(UnityEngine.Object) }, null) : null;
        }

        private static T Read<T>(object entry, string member)
        {
            Type type = entry.GetType();
            FieldInfo field = type.GetField(member, PublicInstance);
            object value = field != null ? field.GetValue(entry) : type.GetProperty(member, PublicInstance)?.GetValue(entry);
            return value is T typed ? typed : default(T);
        }
    }
}
