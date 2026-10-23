using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Where the things quests point at stand (S60 compass, S63 map): quest objects, clues, NPCs, trail nodes, areas, enemies,
    /// bosses and dungeon entrances register their id with their transform while they are enabled, so the compass and the map
    /// resolve quest targets without Find*. Several transforms may share an id (five wolves of one type, two halves of one
    /// splinter). Registered by the World installer.
    /// </summary>
    public interface IWorldMarkerRegistry
    {
        /// <summary>Registers a world point (the same transform twice counts once).</summary>
        /// <param name="id">Object, clue, NPC, trail node (<see cref="WorldMarkerIds.TrailNode"/>), area, enemy or boss id.</param>
        /// <param name="anchor">Its transform.</param>
        void Register(string id, Transform anchor);

        /// <summary>Removes this transform from the id.</summary>
        /// <param name="id">Id.</param>
        /// <param name="anchor">Its transform.</param>
        void Unregister(string id, Transform anchor);

        /// <summary>
        /// Adds the positions registered under the id: one per target, so transforms of one id closer than
        /// <see cref="WorldMarkerRegistry.MergeDistance"/> count once (the two halves of the splinter), while five wolves of one type
        /// stay five. An id ending in <c>*</c> matches every id with that prefix (quest groups such as
        /// <c>obj.eichental.strohziel_*</c>).
        /// </summary>
        /// <param name="id">Id or prefix pattern.</param>
        /// <param name="result">Receives the world positions.</param>
        /// <param name="skipIds">Registered ids to leave out (targets the quest has counted already), or null.</param>
        /// <returns>Number of positions added.</returns>
        int CollectPositions(string id, List<Vector3> result, ICollection<string> skipIds = null);
    }

    /// <summary>Ids of world points that have no id of their own.</summary>
    public static class WorldMarkerIds
    {
        /// <summary>Id of a trail node in the marker registry: <c>trailId#index</c>.</summary>
        /// <param name="trailId">Trail id.</param>
        /// <param name="index">Node index (0 = first).</param>
        public static string TrailNode(string trailId, int index)
        {
            return (trailId ?? string.Empty) + "#" + index;
        }
    }

    /// <summary>Default <see cref="IWorldMarkerRegistry"/>.</summary>
    public sealed class WorldMarkerRegistry : IWorldMarkerRegistry
    {
        /// <summary>Transforms of one id closer than this (metres) are one target.</summary>
        public const float MergeDistance = 3f;

        private readonly Dictionary<string, List<Transform>> _anchors = new Dictionary<string, List<Transform>>(StringComparer.Ordinal);

        /// <summary>Number of registered ids (tests, tools).</summary>
        public int Count => _anchors.Count;

        /// <inheritdoc />
        public void Register(string id, Transform anchor)
        {
            if (string.IsNullOrEmpty(id) || anchor == null)
            {
                return;
            }

            if (!_anchors.TryGetValue(id, out List<Transform> list))
            {
                list = new List<Transform>(1);
                _anchors.Add(id, list);
            }

            if (!list.Contains(anchor))
            {
                list.Add(anchor);
            }
        }

        /// <inheritdoc />
        public void Unregister(string id, Transform anchor)
        {
            if (string.IsNullOrEmpty(id) || !_anchors.TryGetValue(id, out List<Transform> list))
            {
                return;
            }

            // ReferenceEquals: a transform destroyed with its scene still has to leave the list.
            for (int i = list.Count - 1; i >= 0; i--)
            {
                if (ReferenceEquals(list[i], anchor))
                {
                    list.RemoveAt(i);
                }
            }

            if (list.Count == 0)
            {
                _anchors.Remove(id);
            }
        }

        /// <inheritdoc />
        public int CollectPositions(string id, List<Vector3> result, ICollection<string> skipIds = null)
        {
            if (string.IsNullOrEmpty(id) || result == null)
            {
                return 0;
            }

            if (id[id.Length - 1] != '*')
            {
                if (skipIds != null && skipIds.Contains(id))
                {
                    return 0;
                }

                return _anchors.TryGetValue(id, out List<Transform> list) ? Add(list, result) : 0;
            }

            // Prefix compare without a substring: the HUD resolves quest targets every frame.
            int prefixLength = id.Length - 1;
            int added = 0;
            foreach (KeyValuePair<string, List<Transform>> pair in _anchors)
            {
                if (pair.Key.Length >= prefixLength && string.CompareOrdinal(pair.Key, 0, id, 0, prefixLength) == 0 &&
                    (skipIds == null || !skipIds.Contains(pair.Key)))
                {
                    added += Add(pair.Value, result);
                }
            }

            return added;
        }

        private static int Add(List<Transform> list, List<Vector3> result)
        {
            int start = result.Count;
            for (int i = 0; i < list.Count; i++)
            {
                if (list[i] == null)
                {
                    continue;
                }

                Vector3 position = list[i].position;
                bool merged = false;
                for (int k = start; k < result.Count && !merged; k++)
                {
                    merged = (result[k] - position).sqrMagnitude < MergeDistance * MergeDistance;
                }

                if (!merged)
                {
                    result.Add(position);
                }
            }

            return result.Count - start;
        }
    }
}
