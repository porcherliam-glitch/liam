using System;
using System.Collections.Generic;
using Aetherfall.Classes;
using Aetherfall.Core;
using Aetherfall.Progression;

namespace Aetherfall.Skills
{
    /// <summary>
    /// Default <see cref="ISkillService"/> (GDD 03 11.1–11.3): the trees of the content database, the tree of the current class,
    /// the learned ranks and learning with the skill points of the progression. The core of the class is learned for free as
    /// soon as the class is set (new game or loaded game). Saved by <see cref="SkillSaveable"/>.
    /// </summary>
    public sealed class SkillService : ISkillService, IDisposable
    {
        private readonly List<SkillTree> _trees = new List<SkillTree>();
        private readonly IClassService _classes;
        private readonly IProgressionService _progression;
        private readonly SkillTreeState _state = new SkillTreeState();
        private readonly SkillBonuses _bonuses = new SkillBonuses();
        private int _revision;

        /// <summary>Creates the service.</summary>
        /// <param name="trees">Trees (one per class; broken trees are skipped with an error).</param>
        /// <param name="classes">Class service (null: no tree is current).</param>
        /// <param name="progression">Progression with the skill points (null: no points).</param>
        public SkillService(IEnumerable<SkillTree> trees, IClassService classes, IProgressionService progression)
        {
            _classes = classes;
            _progression = progression;
            if (trees != null)
            {
                foreach (SkillTree tree in trees)
                {
                    if (tree == null)
                    {
                        continue;
                    }

                    string problem = tree.Validate();
                    if (problem.Length > 0)
                    {
                        Log.Error(LogCategory.Data, "Skill tree skipped: " + problem);
                        continue;
                    }

                    _trees.Add(tree);
                }
            }

            if (_classes != null)
            {
                _classes.Changed += OnClassChanged;
            }

            if (_progression != null)
            {
                _progression.Changed += OnProgressionChanged;
            }

            EnsureCore();
            _bonuses.Compute(CurrentTree, _state);
        }

        /// <inheritdoc />
        public int Revision => _revision + _state.Revision + (_progression != null ? _progression.Revision : 0);

        /// <summary>All trees.</summary>
        public IReadOnlyList<SkillTree> Trees => _trees;

        /// <inheritdoc />
        public SkillTree CurrentTree
        {
            get
            {
                string classId = _classes != null && _classes.Current != null ? _classes.Current.Id : string.Empty;
                for (int i = 0; i < _trees.Count; i++)
                {
                    if (_trees[i].ClassId == classId)
                    {
                        return _trees[i];
                    }
                }

                return null;
            }
        }

        /// <inheritdoc />
        public int FreePoints => _progression != null ? _progression.UnspentSkillPoints : 0;

        /// <inheritdoc />
        public int Level => _progression != null ? _progression.Level : 1;

        /// <inheritdoc />
        public SkillBonuses Bonuses => _bonuses;

        /// <inheritdoc />
        public ISkillLoadout Loadout { get; set; }

        /// <inheritdoc />
        public event Action Changed;

        /// <inheritdoc />
        public int Rank(string nodeId)
        {
            return _state.Rank(nodeId);
        }

        /// <inheritdoc />
        public SkillCheck Check(string nodeId)
        {
            SkillTree tree = CurrentTree;
            return tree != null ? _state.Check(tree, tree.Find(nodeId), FreePoints, Level) : SkillCheck.Unknown;
        }

        /// <inheritdoc />
        public bool TryLearn(string nodeId)
        {
            SkillTree tree = CurrentTree;
            SkillNode node = tree != null ? tree.Find(nodeId) : null;
            if (node == null || _state.Check(tree, node, FreePoints, Level) != SkillCheck.Ok)
            {
                return false;
            }

            if (_progression != null && !_progression.TrySpendSkillPoints(node.Cost))
            {
                return false;
            }

            _state.Add(node.Id, true);
            Log.Info(LogCategory.Player, "Skill learned: " + node.Id + " (rank " + _state.Rank(node.Id) + ").");
            Recompute();
            return true;
        }

        /// <inheritdoc />
        public bool CanRefund(string nodeId)
        {
            SkillTree tree = CurrentTree;
            return tree != null && _state.CanRefund(tree, tree.Find(nodeId));
        }

        /// <inheritdoc />
        public bool TryRefund(string nodeId)
        {
            SkillTree tree = CurrentTree;
            SkillNode node = tree != null ? tree.Find(nodeId) : null;
            if (node == null || !_state.CanRefund(tree, node))
            {
                return false;
            }

            _state.Remove(node.Id);
            if (_progression != null)
            {
                _progression.RefundSkillPoints(node.Cost);
            }

            Recompute();
            return true;
        }

        /// <inheritdoc />
        public void LockSession()
        {
            _state.LockSession();
        }

        /// <summary>The learned ranks for the save.</summary>
        /// <param name="nodes">Node ids.</param>
        /// <param name="ranks">Ranks.</param>
        public void Capture(out string[] nodes, out int[] ranks)
        {
            _state.Capture(out nodes, out ranks);
        }

        /// <summary>Loads the learned ranks (null = new game: nothing learned but the core).</summary>
        /// <param name="nodes">Node ids.</param>
        /// <param name="ranks">Ranks.</param>
        public void Restore(string[] nodes, int[] ranks)
        {
            _state.Load(nodes, ranks);
            EnsureCore();
            Recompute();
        }

        /// <inheritdoc />
        public void Dispose()
        {
            if (_classes != null)
            {
                _classes.Changed -= OnClassChanged;
            }

            if (_progression != null)
            {
                _progression.Changed -= OnProgressionChanged;
            }
        }

        private void OnClassChanged(ClassSpec spec, bool newGame)
        {
            if (newGame)
            {
                _state.Clear();
            }

            EnsureCore();
            Recompute();
        }

        private void OnProgressionChanged()
        {
            // Free points and level are part of what the skill page shows.
            _revision++;
            Changed?.Invoke();
        }

        private void EnsureCore()
        {
            // GDD 03 11.1: the class choice unlocks the core of the class for free.
            SkillTree tree = CurrentTree;
            SkillNode core = tree != null ? tree.Core : null;
            if (core != null && _state.Rank(core.Id) == 0)
            {
                _state.Add(core.Id, false);
            }
        }

        private void Recompute()
        {
            _bonuses.Compute(CurrentTree, _state);
            _revision++;
            Changed?.Invoke();
        }
    }
}
