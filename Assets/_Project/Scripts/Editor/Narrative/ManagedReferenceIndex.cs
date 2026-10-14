using System.Collections.Generic;
using UnityEditor;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// For the type picker: the first property path of every managed reference id of the inspected object (document order).
    /// A field whose id already belongs to an earlier path shares its object and gets its own copy
    /// (<see cref="ManagedReferenceTypeDrawer"/>). The index is built once per object and rebuilt only when an id is unknown or
    /// an entry no longer holds its id (list changed), so drawing stays cheap.
    /// </summary>
    internal static class ManagedReferenceIndex
    {
        private static readonly Dictionary<long, string> FirstPathById = new Dictionary<long, string>();
        private static UnityEngine.Object _target;

        /// <summary>
        /// The first path that holds the id (the field itself if it is the first or only one).
        /// </summary>
        /// <param name="serializedObject">Serialized object of the field.</param>
        /// <param name="id">Managed reference id of the field.</param>
        /// <param name="path">Property path of the field.</param>
        public static string FirstPathOf(SerializedObject serializedObject, long id, string path)
        {
            if (serializedObject.targetObject != _target)
            {
                Rebuild(serializedObject);
            }

            if (FirstPathById.TryGetValue(id, out string first) && (first == path || StillHolds(serializedObject, first, id)))
            {
                return first;
            }

            Rebuild(serializedObject);
            return FirstPathById.TryGetValue(id, out first) ? first : path;
        }

        [InitializeOnLoadMethod]
        private static void ResetOnReload()
        {
            _target = null;
            FirstPathById.Clear();
        }

        private static bool StillHolds(SerializedObject serializedObject, string path, long id)
        {
            SerializedProperty property = serializedObject.FindProperty(path);
            return ManagedReferenceApi.TryGetReferenceId(property, out long current) && current == id;
        }

        private static void Rebuild(SerializedObject serializedObject)
        {
            _target = serializedObject.targetObject;
            FirstPathById.Clear();
            List<KeyValuePair<string, long>> places = ManagedReferenceApi.CollectReferenceIds(serializedObject);
            for (int i = 0; i < places.Count; i++)
            {
                if (ManagedReferenceChecks.IsReferenceId(places[i].Value) && !FirstPathById.ContainsKey(places[i].Value))
                {
                    FirstPathById.Add(places[i].Value, places[i].Key);
                }
            }
        }
    }
}
