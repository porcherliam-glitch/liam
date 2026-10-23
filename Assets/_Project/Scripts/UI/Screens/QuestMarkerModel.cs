using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Quests;
using Aetherfall.UI.Framework;
using Aetherfall.World.Exploration;
using UnityEngine;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Quest markers for the compass and the map (S60, GDD 02 7.3, GDD 05 1.8): for the focus quest and the other tracked
    /// quests, the targets of each open objective of their current stage (<see cref="ObjectiveTargets"/>) and the stage's own
    /// marker ids, resolved to world positions — places through the region map, objects, clues, NPCs, trail nodes, areas,
    /// enemies, bosses and dungeon entrances through the <see cref="IWorldMarkerRegistry"/>. Each objective shows up to
    /// <see cref="MaxTargets"/> markers; with more it becomes one search area around them ("Marker je Ziel … bis zu 3 Marker,
    /// danach nur das Suchgebiet"). Markers and areas of the focus quest are <see cref="CompassMarkerKind.FocusQuest"/> (large,
    /// with distance, pinned to the edge), those of other tracked quests <see cref="CompassMarkerKind.TrackedQuest"/> or
    /// <see cref="CompassMarkerKind.SearchArea"/>; every candidate carries the colour tone of the quest category.
    /// </summary>
    /// <remarks>
    /// The target ids are collected again when <see cref="IQuestService.Revision"/> changed and every
    /// <see cref="RebuildEvery"/> calls (objective visibility follows conditions that do not count as a quest change); the
    /// positions every call (NPCs walk, enemies run). Targets that are not loaded (another scene) give no marker: stages inside a
    /// dungeon name the dungeon entrance as a stage marker for that (GDD 02 7.3 "Mehrstufige Wege").
    /// </remarks>
    public sealed class QuestMarkerModel
    {
        /// <summary>At most this many markers per objective (GDD 02 7.3: then only the search area).</summary>
        public const int MaxTargets = 3;

        /// <summary>Margin added around the targets of a search area (metres).</summary>
        public const float SearchAreaMargin = 12f;

        /// <summary>Calls of <see cref="Collect"/> after which the target ids are collected again even without a quest change.</summary>
        public const int RebuildEvery = 30;

        private readonly IQuestService _quests;
        private readonly IExplorationService _exploration;
        private readonly IWorldMarkerRegistry _registry;
        private readonly List<string> _ids = new List<string>();
        private readonly List<QuestTarget> _targets = new List<QuestTarget>();
        private readonly List<Vector3> _positions = new List<Vector3>();
        private int _revision = -1;
        private int _callsSinceRebuild;

        /// <summary>Creates the model (any service may be null: then there are fewer or no quest markers).</summary>
        /// <param name="quests">Quest service.</param>
        /// <param name="exploration">Exploration (places of the map).</param>
        /// <param name="registry">World marker registry (objects, NPCs, trail nodes, areas, enemies, bosses, entrances).</param>
        public QuestMarkerModel(IQuestService quests, IExplorationService exploration, IWorldMarkerRegistry registry)
        {
            _quests = quests;
            _exploration = exploration;
            _registry = registry;
        }

        /// <summary>
        /// Colour tone of a quest category for compass and map (GDD 05 1.9: gold main quests, bronze faction, silver region,
        /// white side quests, rosé companion, red bounty, sand treasure, copper crafting, blue repeatable, orange legendary).
        /// </summary>
        /// <param name="category">Quest category.</param>
        public static string ToneOf(QuestCategory category)
        {
            // The same names as the category classes of the quest log (af-cat--main …).
            return QuestLogRules.CategoryClass(category).Substring(QuestLogRules.CategoryClassPrefix.Length);
        }

        /// <summary>Adds the quest markers as candidates: targets and search areas of the focus quest and the tracked quests.</summary>
        /// <param name="result">Receives the candidates.</param>
        public void Collect(List<CompassCandidate> result)
        {
            if (result == null)
            {
                return;
            }

            Rebuild();
            for (int t = 0; t < _targets.Count; t++)
            {
                QuestTarget target = _targets[t];
                for (int g = 0; g < target.Groups.Count; g++)
                {
                    TargetGroup group = target.Groups[g];
                    _positions.Clear();
                    for (int i = 0; i < group.Ids.Count; i++)
                    {
                        Resolve(group.Ids[i], group.Counted);
                    }

                    AddGroup(target, group, result);
                }
            }
        }

        /// <summary>Forgets the collected target ids (new game, loaded game).</summary>
        public void Reset()
        {
            _revision = -1;
            _targets.Clear();
        }

        private void AddGroup(QuestTarget target, TargetGroup group, List<CompassCandidate> result)
        {
            if (_positions.Count == 0)
            {
                return;
            }

            if (_positions.Count <= MaxTargets)
            {
                CompassMarkerKind kind = target.Focus ? CompassMarkerKind.FocusQuest : CompassMarkerKind.TrackedQuest;
                for (int i = 0; i < _positions.Count; i++)
                {
                    Vector3 p = _positions[i];
                    result.Add(new CompassCandidate(kind, p.x, p.y, p.z, target.Title, 0f, target.Tone));
                }

                return;
            }

            // Too many targets (a pack of wolves, five straw targets): one search area around their middle.
            float sumX = 0f;
            float sumZ = 0f;
            for (int i = 0; i < _positions.Count; i++)
            {
                sumX += _positions[i].x;
                sumZ += _positions[i].z;
            }

            float x = sumX / _positions.Count;
            float z = sumZ / _positions.Count;
            float spread = 0f;
            for (int i = 0; i < _positions.Count; i++)
            {
                spread = Mathf.Max(spread, new Vector2(_positions[i].x - x, _positions[i].z - z).magnitude);
            }

            // GDD 02 7.3: the stage sets the radius of its search area (50–150 m); the area always covers its targets.
            float radius = Mathf.Max(spread + SearchAreaMargin, group.MinimumRadius);
            CompassMarkerKind areaKind = target.Focus ? CompassMarkerKind.FocusQuest : CompassMarkerKind.SearchArea;
            result.Add(new CompassCandidate(areaKind, x, float.NaN, z, target.Title, radius, target.Tone));
        }

        private void Rebuild()
        {
            if (_quests == null)
            {
                return;
            }

            _callsSinceRebuild++;
            if (_quests.Revision == _revision && _callsSinceRebuild < RebuildEvery)
            {
                return;
            }

            _revision = _quests.Revision;
            _callsSinceRebuild = 0;
            _targets.Clear();
            string focus = _quests.FocusQuestId ?? string.Empty;
            if (focus.Length > 0)
            {
                AddQuest(focus, true);
            }

            IReadOnlyList<string> tracked = _quests.TrackedQuestIds;
            for (int i = 0; tracked != null && i < tracked.Count; i++)
            {
                if (tracked[i] != focus)
                {
                    AddQuest(tracked[i], false);
                }
            }
        }

        private void AddQuest(string questId, bool focus)
        {
            if (_quests.Catalog == null || !_quests.Catalog.TryGet(questId, out QuestSpec spec) ||
                !_quests.TryGetInstance(questId, out QuestInstance instance) || !instance.IsActive ||
                !spec.TryGetStage(instance.StageId, out StageDefinition stage))
            {
                return;
            }

            var target = new QuestTarget(spec.Title.Length > 0 ? spec.Title : spec.Id, focus, ToneOf(spec.Category));
            for (int i = 0; i < stage.Objectives.Count; i++)
            {
                QuestObjective objective = stage.Objectives[i];
                if (objective == null || !_quests.IsObjectiveVisible(questId, objective.Id))
                {
                    continue;
                }

                instance.TryGetObjective(objective.Id, out ObjectiveState state);
                _ids.Clear();
                ObjectiveTargets.Collect(objective, state, _ids);
                if (_ids.Count == 0)
                {
                    continue;
                }

                var group = new TargetGroup(new List<string>(_ids), stage.SearchRadius);
                ObjectiveTargets.CollectCounted(state, group.Counted);
                target.Groups.Add(group);
            }

            // The stage's own marker targets form a group of their own (e.g. the dungeon entrance while the targets are inside).
            _ids.Clear();
            for (int i = 0; i < stage.MarkerIds.Count; i++)
            {
                string id = stage.MarkerIds[i];
                if (!string.IsNullOrEmpty(id) && !_ids.Contains(id))
                {
                    _ids.Add(id);
                }
            }

            if (_ids.Count > 0)
            {
                target.Groups.Add(new TargetGroup(new List<string>(_ids), stage.SearchRadius));
            }

            if (target.Groups.Count > 0)
            {
                _targets.Add(target);
            }
        }

        private void Resolve(string id, HashSet<string> counted)
        {
            // Places first: a place of the map is known even where its area trigger lies in another scene.
            RegionMapDefinition map = _exploration != null ? _exploration.ActiveMap : null;
            if (map != null && map.TryGetPlace(id, out MapPlace place))
            {
                _positions.Add(new Vector3(place.X, float.NaN, place.Z));
                return;
            }

            _registry?.CollectPositions(id, _positions, counted.Count > 0 ? counted : null);
        }

        private sealed class QuestTarget
        {
            public QuestTarget(string title, bool focus, string tone)
            {
                Title = title;
                Focus = focus;
                Tone = tone;
            }

            public string Title { get; }

            public bool Focus { get; }

            public string Tone { get; }

            public List<TargetGroup> Groups { get; } = new List<TargetGroup>();
        }

        private sealed class TargetGroup
        {
            public TargetGroup(List<string> ids, float minimumRadius)
            {
                Ids = ids;
                MinimumRadius = minimumRadius;
            }

            public List<string> Ids { get; }

            /// <summary>Ids the objective has counted already (left out of wildcard groups).</summary>
            public HashSet<string> Counted { get; } = new HashSet<string>(System.StringComparer.Ordinal);

            public float MinimumRadius { get; }
        }
    }
}
