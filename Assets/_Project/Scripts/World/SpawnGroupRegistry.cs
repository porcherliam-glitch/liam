using System;
using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>
    /// Pure C# <see cref="ISpawnGroupRegistry"/>: a quest group is visible when it was activated and is not defeated yet; groups
    /// with activation "always" are never touched. Registered by the <see cref="WorldInstaller"/>.
    /// </summary>
    public sealed class SpawnGroupRegistry : ISpawnGroupRegistry
    {
        private readonly List<ISpawnGroup> _groups = new List<ISpawnGroup>();
        private readonly SortedSet<string> _activated = new SortedSet<string>(StringComparer.Ordinal);
        private readonly SortedSet<string> _cleared = new SortedSet<string>(StringComparer.Ordinal);

        /// <inheritdoc />
        public int RegisteredCount => _groups.Count;

        /// <inheritdoc />
        public IReadOnlyList<string> ActivatedIds => new List<string>(_activated);

        /// <inheritdoc />
        public IReadOnlyList<string> ClearedIds => new List<string>(_cleared);

        /// <inheritdoc />
        public void Register(ISpawnGroup group)
        {
            if (group == null || _groups.Contains(group))
            {
                return;
            }

            _groups.Add(group);
            Apply(group);
        }

        /// <inheritdoc />
        public void Unregister(ISpawnGroup group)
        {
            _groups.Remove(group);
        }

        /// <inheritdoc />
        public bool Activate(string spawnId)
        {
            if (string.IsNullOrEmpty(spawnId))
            {
                return false;
            }

            _activated.Add(spawnId);
            return ApplyTo(spawnId);
        }

        /// <inheritdoc />
        public void MarkCleared(string spawnId)
        {
            // The group is not switched off now (the dead enemies lie where they fell); it stays away after the next load.
            if (!string.IsNullOrEmpty(spawnId))
            {
                _cleared.Add(spawnId);
            }
        }

        /// <inheritdoc />
        public bool IsActivated(string spawnId)
        {
            return spawnId != null && _activated.Contains(spawnId);
        }

        /// <inheritdoc />
        public bool IsCleared(string spawnId)
        {
            return spawnId != null && _cleared.Contains(spawnId);
        }

        /// <inheritdoc />
        public void Restore(IEnumerable<string> activated, IEnumerable<string> cleared)
        {
            _activated.Clear();
            _cleared.Clear();
            AddAll(_activated, activated);
            AddAll(_cleared, cleared);
            for (int i = 0; i < _groups.Count; i++)
            {
                Apply(_groups[i]);
            }
        }

        /// <summary>True if a group with this id should show its enemies now.</summary>
        /// <param name="spawnId">Spawner id.</param>
        /// <param name="activation">Activation rule of the group.</param>
        public bool ShouldBeActive(string spawnId, SpawnActivation activation)
        {
            return activation == SpawnActivation.Always || (IsActivated(spawnId) && !IsCleared(spawnId));
        }

        private bool ApplyTo(string spawnId)
        {
            bool found = false;
            for (int i = 0; i < _groups.Count; i++)
            {
                if (string.Equals(_groups[i].SpawnId, spawnId, StringComparison.Ordinal))
                {
                    Apply(_groups[i]);
                    found = true;
                }
            }

            return found;
        }

        private void Apply(ISpawnGroup group)
        {
            if (group.Activation == SpawnActivation.Always)
            {
                return;
            }

            group.SetGroupActive(ShouldBeActive(group.SpawnId, group.Activation));
        }

        private static void AddAll(SortedSet<string> target, IEnumerable<string> ids)
        {
            if (ids == null)
            {
                return;
            }

            foreach (string id in ids)
            {
                if (!string.IsNullOrEmpty(id))
                {
                    target.Add(id);
                }
            }
        }
    }
}
