using System;
using System.Collections.Generic;
using System.Reflection;
using Aetherfall.Conditions;
using UnityEditor;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// The types the type picker offers for a <c>[SerializeReference]</c> base type (architecture 7.4): all derived types found
    /// by <see cref="TypeCache"/> that Unity can serialize as managed reference (not abstract, not generic, not a
    /// <c>UnityEngine.Object</c>, <c>[Serializable]</c>, parameterless constructor), with the German menu path of their
    /// <see cref="TypeMenuAttribute"/> ("Sonstige/&lt;Klassenname&gt;" without it), sorted by sub menu, order and name.
    /// </summary>
    public static class TypeMenuCatalog
    {
        /// <summary>Sub menu of types without <see cref="TypeMenuAttribute"/>.</summary>
        public const string FallbackFolder = "Sonstige";

        private static readonly Dictionary<Type, List<TypeMenuEntry>> Cache = new Dictionary<Type, List<TypeMenuEntry>>();

        /// <summary>All selectable types derived from the base type (cached until the next script reload).</summary>
        /// <param name="baseType">Field type, e.g. <c>Condition</c>.</param>
        public static IReadOnlyList<TypeMenuEntry> GetEntries(Type baseType)
        {
            if (baseType == null)
            {
                return Array.Empty<TypeMenuEntry>();
            }

            if (!Cache.TryGetValue(baseType, out List<TypeMenuEntry> entries))
            {
                var candidates = new List<Type>();
                if (IsSelectable(baseType))
                {
                    candidates.Add(baseType);
                }

                foreach (Type type in TypeCache.GetTypesDerivedFrom(baseType))
                {
                    candidates.Add(type);
                }

                entries = BuildEntries(candidates);
                Cache.Add(baseType, entries);
            }

            return entries;
        }

        /// <summary>Filters and sorts candidate types into menu entries (pure logic, testable without the editor).</summary>
        /// <param name="candidates">Types.</param>
        public static List<TypeMenuEntry> BuildEntries(IEnumerable<Type> candidates)
        {
            var entries = new List<TypeMenuEntry>();
            var seen = new HashSet<Type>();
            foreach (Type type in candidates)
            {
                if (type == null || !seen.Add(type) || !IsSelectable(type))
                {
                    continue;
                }

                var attribute = type.GetCustomAttribute<TypeMenuAttribute>(false);
                string path = attribute != null && attribute.Path.Length > 0 ? attribute.Path : FallbackFolder + "/" + type.Name;
                entries.Add(new TypeMenuEntry(type, path, attribute != null ? attribute.Order : 1000));
            }

            entries.Sort(Compare);
            return entries;
        }

        /// <summary>True if Unity can create and serialize the type as managed reference.</summary>
        /// <param name="type">Type.</param>
        public static bool IsSelectable(Type type)
        {
            if (type == null || type.IsAbstract || type.IsInterface || type.IsGenericType || type.ContainsGenericParameters)
            {
                return false;
            }

            if (typeof(UnityEngine.Object).IsAssignableFrom(type) || !type.IsSerializable)
            {
                return false;
            }

            return type.GetConstructor(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic, null, Type.EmptyTypes, null) != null;
        }

        /// <summary>German menu path of a type.</summary>
        /// <param name="type">Type.</param>
        public static string MenuPath(Type type)
        {
            if (type == null)
            {
                return string.Empty;
            }

            var attribute = type.GetCustomAttribute<TypeMenuAttribute>(false);
            return attribute != null && attribute.Path.Length > 0 ? attribute.Path : FallbackFolder + "/" + type.Name;
        }

        /// <summary>Last segment of the menu path of a type (shown on the picker button).</summary>
        /// <param name="type">Type.</param>
        public static string DisplayName(Type type)
        {
            string path = MenuPath(type);
            int slash = path.LastIndexOf('/');
            return slash >= 0 ? path.Substring(slash + 1) : path;
        }

        /// <summary>
        /// Resolves Unity's managed reference type name (<c>"Assembly Namespace.Type"</c>, from
        /// <c>managedReferenceFieldTypename</c> or <c>managedReferenceFullTypename</c>).
        /// </summary>
        /// <param name="unityTypeName">Type name as Unity reports it.</param>
        public static Type ResolveUnityTypeName(string unityTypeName)
        {
            if (string.IsNullOrEmpty(unityTypeName))
            {
                return null;
            }

            int space = unityTypeName.IndexOf(' ');
            if (space <= 0)
            {
                return Type.GetType(unityTypeName);
            }

            string assembly = unityTypeName.Substring(0, space);
            string typeName = unityTypeName.Substring(space + 1).Replace('/', '+');
            return Type.GetType(typeName + ", " + assembly);
        }

        [InitializeOnLoadMethod]
        private static void ClearCacheOnReload()
        {
            Cache.Clear();
        }

        private static int Compare(TypeMenuEntry a, TypeMenuEntry b)
        {
            int folder = string.Compare(a.Folder, b.Folder, StringComparison.Ordinal);
            if (folder != 0)
            {
                bool aFallback = a.Folder == FallbackFolder;
                bool bFallback = b.Folder == FallbackFolder;
                if (aFallback != bFallback)
                {
                    return aFallback ? 1 : -1;
                }

                return folder;
            }

            int order = a.Order.CompareTo(b.Order);
            return order != 0 ? order : string.Compare(a.DisplayName, b.DisplayName, StringComparison.Ordinal);
        }
    }
}
