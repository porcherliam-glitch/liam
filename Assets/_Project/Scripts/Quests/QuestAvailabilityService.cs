using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Watches the start conditions of quests that have a giver and can be offered (not started, or repeatable after the
    /// cool-down) and publishes <c>QuestAvailabilityChanged</c> for the giver symbols (architecture 11.7, GDD 02 7.6). Hidden
    /// quests (<see cref="QuestTraits.Hidden"/>) are tracked but never announced. Owned by the <see cref="QuestService"/>.
    /// </summary>
    /// <remarks>
    /// After a load (<see cref="Rebuild"/>) every available quest is announced again; views should rebuild their symbols on
    /// <c>GameLoaded</c> as well. Quests without giver are not watched (cost: about 400 quests with giver, architecture 7.5).
    /// </remarks>
    public sealed class QuestAvailabilityService : IDisposable
    {
        private readonly QuestService _service;
        private readonly IEventBus _bus;
        private readonly IConditionWatcher _watcher;
        private readonly QuestCatalog _catalog;
        private readonly IServiceLocator _services;
        private readonly Dictionary<string, int> _watches = new Dictionary<string, int>(StringComparer.Ordinal);
        private readonly HashSet<string> _available = new HashSet<string>(StringComparer.Ordinal);
        private readonly HashSet<string> _coolingDown = new HashSet<string>(StringComparer.Ordinal);
        private readonly List<string> _scratch = new List<string>();

        internal QuestAvailabilityService(QuestService service, IEventBus bus, IConditionWatcher watcher, QuestCatalog catalog, IServiceLocator services)
        {
            _service = service;
            _bus = bus;
            _watcher = watcher;
            _catalog = catalog;
            _services = services;
        }

        /// <summary>Number of watched start conditions.</summary>
        public int WatchCount => _watches.Count;

        /// <summary>Ids of the quests that can be accepted now.</summary>
        public IReadOnlyCollection<string> AvailableQuestIds => _available;

        /// <summary>True if the quest can be accepted now.</summary>
        /// <param name="questId">Quest id.</param>
        public bool IsAvailable(string questId)
        {
            return questId != null && _available.Contains(questId);
        }

        /// <summary>Forgets everything and watches all quests again (boot, after loading); announces every available quest.</summary>
        public void Rebuild()
        {
            Clear();
            IReadOnlyList<QuestSpec> all = _catalog.All;
            for (int i = 0; i < all.Count; i++)
            {
                Refresh(all[i].Id);
            }
        }

        /// <summary>Re-checks one quest after its status changed (started, finished, reset, cool-down over).</summary>
        /// <param name="questId">Quest id.</param>
        public void Refresh(string questId)
        {
            if (!_catalog.TryGet(questId, out QuestSpec spec))
            {
                return;
            }

            if (spec.GiverId.Length == 0)
            {
                StopWatching(questId);
                SetAvailable(spec, false);
                return;
            }

            bool offer = _service.CanBeOffered(spec, out bool coolingDown);
            if (coolingDown)
            {
                _coolingDown.Add(questId);
            }
            else
            {
                _coolingDown.Remove(questId);
            }

            if (!offer)
            {
                StopWatching(questId);
                SetAvailable(spec, false);
                return;
            }

            if (!_watches.TryGetValue(questId, out int watchId))
            {
                var ctx = new ConditionContext(_services, SubjectIds.Player, string.Empty, questId);
                watchId = _watcher.Watch(spec.StartCondition, ctx, value => OnConditionChanged(questId, value));
                _watches.Add(questId, watchId);
            }

            SetAvailable(spec, _watcher.IsMet(watchId));
        }

        /// <summary>Re-checks repeatable quests whose cool-down may be over (called about once per second).</summary>
        public void CheckCooldowns()
        {
            if (_coolingDown.Count == 0)
            {
                return;
            }

            _scratch.Clear();
            _scratch.AddRange(_coolingDown);
            for (int i = 0; i < _scratch.Count; i++)
            {
                Refresh(_scratch[i]);
            }

            _scratch.Clear();
        }

        /// <summary>Stops every watch and forgets the availability without events.</summary>
        public void Clear()
        {
            foreach (int watchId in _watches.Values)
            {
                _watcher.Unwatch(watchId);
            }

            _watches.Clear();
            _available.Clear();
            _coolingDown.Clear();
        }

        /// <summary>Stops every watch.</summary>
        public void Dispose()
        {
            Clear();
        }

        private void StopWatching(string questId)
        {
            if (_watches.TryGetValue(questId, out int watchId))
            {
                _watcher.Unwatch(watchId);
                _watches.Remove(questId);
            }
        }

        private void OnConditionChanged(string questId, bool value)
        {
            if (_catalog.TryGet(questId, out QuestSpec spec) && _watches.ContainsKey(questId))
            {
                SetAvailable(spec, value);
            }
        }

        private void SetAvailable(QuestSpec spec, bool available)
        {
            bool was = _available.Contains(spec.Id);
            if (was == available)
            {
                return;
            }

            if (available)
            {
                _available.Add(spec.Id);
            }
            else
            {
                _available.Remove(spec.Id);
            }

            _service.OnAvailabilityChanged();
            if (!spec.Has(QuestTraits.Hidden))
            {
                _bus.Publish(new QuestAvailabilityChanged(spec.Id, spec.GiverId, available));
            }
        }
    }
}
