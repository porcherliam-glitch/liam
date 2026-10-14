using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.GameTime;

namespace Aetherfall.WorldState
{
    /// <summary>
    /// Default <see cref="IWorldState"/> and <see cref="IWorldStateDebug"/> (architecture 8.3). Pure logic: a sparse
    /// dictionary of non-default values with the playtime of their last change, the change history (last 200 changes with
    /// source), the write log per source and the list of undefined ids. Publishes <c>FlagChanged</c> after every real change.
    /// </summary>
    /// <remarks>
    /// <para>Clamping follows the definition (<see cref="FlagSpec.Normalize"/>). An enum value outside the value list is
    /// stored anyway but logged (validator rule V17 catches it in the data). Undefined ids are stored like counters without
    /// range and logged once per id; ids loaded from a save without definition are kept and saved again (architecture 8.3
    /// "Waisen": no data loss while content is missing).</para>
    /// <para>Loading (<see cref="LoadEntries"/>) sets state without events (architecture 9.1). Main thread only.</para>
    /// </remarks>
    public sealed class WorldStateService : IWorldState, IWorldStateDebug
    {
        /// <summary>Number of kept history entries (architecture 8.3).</summary>
        public const int HistorySize = 200;

        private readonly IEventBus _bus;
        private readonly IPlaytimeClock _clock;
        private readonly Dictionary<string, FlagValue> _values = new Dictionary<string, FlagValue>(StringComparer.Ordinal);
        private readonly HashSet<string> _undefined = new HashSet<string>(StringComparer.Ordinal);
        private readonly HashSet<string> _warnedUndefined = new HashSet<string>(StringComparer.Ordinal);
        private readonly Dictionary<string, HashSet<string>> _writtenBy = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        private readonly FlagChangeRecord[] _history = new FlagChangeRecord[HistorySize];
        private int _historyStart;
        private int _historyCount;

        /// <summary>Creates the service.</summary>
        /// <param name="bus">Event bus for <c>FlagChanged</c>.</param>
        /// <param name="registry">Defined flags (null = none).</param>
        /// <param name="clock">Active playtime for the change time stamps (null = always 0).</param>
        public WorldStateService(IEventBus bus, FlagRegistry registry, IPlaytimeClock clock)
        {
            _bus = bus ?? throw new ArgumentNullException(nameof(bus));
            Registry = registry ?? new FlagRegistry();
            _clock = clock;
        }

        /// <summary>The defined flags.</summary>
        public FlagRegistry Registry { get; }

        /// <inheritdoc />
        public int Revision { get; private set; }

        /// <summary>Number of stored (non-default) entries.</summary>
        public int StoredCount => _values.Count;

        /// <inheritdoc />
        public IReadOnlyCollection<string> UndefinedFlagIds => _undefined;

        private double Playtime => _clock != null ? _clock.PlaytimeSeconds : 0.0;

        /// <inheritdoc />
        public bool GetBool(string flagId)
        {
            return GetInt(flagId) != 0;
        }

        /// <inheritdoc />
        public int GetInt(string flagId)
        {
            if (string.IsNullOrEmpty(flagId))
            {
                return 0;
            }

            if (_values.TryGetValue(flagId, out FlagValue stored))
            {
                return stored.Value;
            }

            return Registry.TryGet(flagId, out FlagSpec spec) ? spec.DefaultValue : 0;
        }

        /// <inheritdoc />
        public void SetBool(string flagId, bool value, string sourceId)
        {
            Write(flagId, value ? 1 : 0, sourceId);
        }

        /// <inheritdoc />
        public void SetInt(string flagId, int value, string sourceId)
        {
            Write(flagId, value, sourceId);
        }

        /// <inheritdoc />
        public int Add(string flagId, int delta, string sourceId)
        {
            long sum = (long)GetInt(flagId) + delta;
            int value = sum > int.MaxValue ? int.MaxValue : sum < int.MinValue ? int.MinValue : (int)sum;
            Write(flagId, value, sourceId);
            return GetInt(flagId);
        }

        /// <inheritdoc />
        public double LastChangedPlaytime(string flagId)
        {
            return flagId != null && _values.TryGetValue(flagId, out FlagValue stored) ? stored.ChangedAtPlaytime : 0.0;
        }

        /// <inheritdoc />
        public double SecondsSinceChange(string flagId)
        {
            return Math.Max(0.0, Playtime - LastChangedPlaytime(flagId));
        }

        /// <inheritdoc />
        public bool IsDefined(string flagId)
        {
            return Registry.IsDefined(flagId);
        }

        /// <inheritdoc />
        public bool TryGetDefinition(string flagId, out FlagSpec spec)
        {
            return Registry.TryGet(flagId, out spec);
        }

        /// <inheritdoc />
        public int ResetPrefix(string prefix, string sourceId)
        {
            if (string.IsNullOrEmpty(prefix))
            {
                return 0;
            }

            List<string> ids = null;
            foreach (string id in _values.Keys)
            {
                if (id.StartsWith(prefix, StringComparison.Ordinal))
                {
                    if (ids == null)
                    {
                        ids = new List<string>();
                    }

                    ids.Add(id);
                }
            }

            if (ids == null)
            {
                return 0;
            }

            ids.Sort(string.CompareOrdinal);
            int count = 0;
            for (int i = 0; i < ids.Count; i++)
            {
                if (ResetToDefault(ids[i], sourceId))
                {
                    count++;
                }
            }

            return count;
        }

        /// <inheritdoc />
        public List<FlagSnapshot> Query(string prefix, bool onlyChanged)
        {
            var ids = new HashSet<string>(StringComparer.Ordinal);
            IReadOnlyList<FlagSpec> all = Registry.All;
            for (int i = 0; i < all.Count; i++)
            {
                ids.Add(all[i].Id);
            }

            foreach (string id in _values.Keys)
            {
                ids.Add(id);
            }

            var sorted = new List<string>();
            foreach (string id in ids)
            {
                if (string.IsNullOrEmpty(prefix) || id.StartsWith(prefix, StringComparison.Ordinal))
                {
                    sorted.Add(id);
                }
            }

            sorted.Sort(string.CompareOrdinal);
            var result = new List<FlagSnapshot>(sorted.Count);
            for (int i = 0; i < sorted.Count; i++)
            {
                FlagSnapshot snapshot = CreateSnapshot(sorted[i]);
                if (!onlyChanged || snapshot.IsChanged)
                {
                    result.Add(snapshot);
                }
            }

            return result;
        }

        /// <inheritdoc />
        public bool TryGetSnapshot(string flagId, out FlagSnapshot snapshot)
        {
            if (string.IsNullOrEmpty(flagId) || (!Registry.IsDefined(flagId) && !_values.ContainsKey(flagId)))
            {
                snapshot = default;
                return false;
            }

            snapshot = CreateSnapshot(flagId);
            return true;
        }

        /// <inheritdoc />
        public bool TrySetFromText(string flagId, string valueText, string sourceId, out string message)
        {
            if (string.IsNullOrEmpty(flagId))
            {
                message = "Keine Flag-ID angegeben.";
                return false;
            }

            int value;
            bool parsed = Registry.TryGet(flagId, out FlagSpec spec) ? spec.TryParseValue(valueText, out value) : FlagSpec.TryParseCommon(valueText, out value);
            if (!parsed)
            {
                message = "Wert '" + valueText + "' nicht verstanden (Zahl, wahr/falsch oder Name aus der Werteliste).";
                return false;
            }

            Write(flagId, value, sourceId);
            message = CreateSnapshot(flagId).ToString();
            return true;
        }

        /// <inheritdoc />
        public List<FlagChangeRecord> GetRecentChanges()
        {
            var result = new List<FlagChangeRecord>(_historyCount);
            for (int i = 0; i < _historyCount; i++)
            {
                result.Add(_history[(_historyStart + i) % HistorySize]);
            }

            return result;
        }

        /// <inheritdoc />
        public List<string> GetFlagsWrittenBy(string sourceId)
        {
            var result = new List<string>();
            if (sourceId != null && _writtenBy.TryGetValue(sourceId, out HashSet<string> ids))
            {
                result.AddRange(ids);
                result.Sort(string.CompareOrdinal);
            }

            return result;
        }

        /// <inheritdoc />
        public bool ResetToDefault(string flagId, string sourceId)
        {
            if (string.IsNullOrEmpty(flagId))
            {
                return false;
            }

            int before = GetInt(flagId);
            int target = Registry.TryGet(flagId, out FlagSpec spec) ? spec.DefaultValue : 0;
            if (before == target)
            {
                _values.Remove(flagId);
                return false;
            }

            Write(flagId, target, sourceId);
            return true;
        }

        /// <inheritdoc />
        public int ResetFlagsWrittenBy(string writerSourceId, string sourceId)
        {
            List<string> ids = GetFlagsWrittenBy(writerSourceId);
            int count = 0;
            for (int i = 0; i < ids.Count; i++)
            {
                if (ResetToDefault(ids[i], sourceId))
                {
                    count++;
                }
            }

            return count;
        }

        /// <summary>All stored (non-default) entries sorted by id (snapshot for the save).</summary>
        public List<KeyValuePair<string, FlagValue>> CaptureEntries()
        {
            var keys = new List<string>(_values.Keys);
            keys.Sort(string.CompareOrdinal);
            var result = new List<KeyValuePair<string, FlagValue>>(keys.Count);
            for (int i = 0; i < keys.Count; i++)
            {
                result.Add(new KeyValuePair<string, FlagValue>(keys[i], _values[keys[i]]));
            }

            return result;
        }

        /// <summary>
        /// Replaces the whole state (load or new game) without events: values are normalized, start values are dropped
        /// (sparse), undefined ids are kept and logged once. History and write log start empty.
        /// </summary>
        /// <param name="entries">Entries; null = new game (all start values).</param>
        public void LoadEntries(IEnumerable<KeyValuePair<string, FlagValue>> entries)
        {
            _values.Clear();
            _undefined.Clear();
            _writtenBy.Clear();
            _historyStart = 0;
            _historyCount = 0;
            Revision++;
            if (entries == null)
            {
                return;
            }

            int undefinedCount = 0;
            foreach (KeyValuePair<string, FlagValue> entry in entries)
            {
                if (string.IsNullOrEmpty(entry.Key))
                {
                    continue;
                }

                int value = entry.Value.Value;
                int defaultValue = 0;
                if (Registry.TryGet(entry.Key, out FlagSpec spec))
                {
                    value = spec.Normalize(value);
                    defaultValue = spec.DefaultValue;
                }
                else
                {
                    _undefined.Add(entry.Key);
                    _warnedUndefined.Add(entry.Key);
                    undefinedCount++;
                }

                if (value == defaultValue)
                {
                    continue;
                }

                _values[entry.Key] = new FlagValue(value, entry.Value.ChangedAtPlaytime);
            }

            if (undefinedCount > 0)
            {
                Log.Warning(LogCategory.World, "WorldState: " + undefinedCount + " saved flag(s) have no definition and are kept unchanged " +
                                               "(content missing or renamed): " + string.Join(", ", _undefined));
            }
        }

        private void Write(string flagId, int rawValue, string sourceId)
        {
            if (string.IsNullOrEmpty(flagId))
            {
                Log.Warning(LogCategory.World, "WorldState: write without flag id ignored (source '" + sourceId + "').");
                return;
            }

            int value = rawValue;
            int defaultValue = 0;
            if (Registry.TryGet(flagId, out FlagSpec spec))
            {
                value = spec.Normalize(rawValue);
                defaultValue = spec.DefaultValue;
                if (spec.Kind == FlagKind.Enum && !spec.IsKnownValue(value))
                {
                    Log.Warning(LogCategory.World, "WorldState: value " + value + " is not in the value list of '" + flagId + "' (source '" + sourceId + "').");
                }
            }
            else
            {
                _undefined.Add(flagId);
                if (_warnedUndefined.Add(flagId))
                {
                    Log.Warning(LogCategory.World, "WorldState: flag '" + flagId + "' has no FlagDefinition (typo?). It is stored anyway (source '" + sourceId + "').");
                }
            }

            int oldValue = GetInt(flagId);
            if (oldValue == value)
            {
                return;
            }

            double now = Playtime;
            if (value == defaultValue)
            {
                _values.Remove(flagId);
            }
            else
            {
                _values[flagId] = new FlagValue(value, now);
            }

            string source = sourceId ?? string.Empty;
            if (!_writtenBy.TryGetValue(source, out HashSet<string> written))
            {
                written = new HashSet<string>(StringComparer.Ordinal);
                _writtenBy.Add(source, written);
            }

            written.Add(flagId);
            AddHistory(new FlagChangeRecord(flagId, oldValue, value, source, now));
            Revision++;
            _bus.Publish(new FlagChanged(flagId, oldValue, value));
        }

        private void AddHistory(in FlagChangeRecord record)
        {
            if (_historyCount < HistorySize)
            {
                _history[(_historyStart + _historyCount) % HistorySize] = record;
                _historyCount++;
                return;
            }

            _history[_historyStart] = record;
            _historyStart = (_historyStart + 1) % HistorySize;
        }

        private FlagSnapshot CreateSnapshot(string flagId)
        {
            int value = GetInt(flagId);
            double changedAt = LastChangedPlaytime(flagId);
            if (Registry.TryGet(flagId, out FlagSpec spec))
            {
                return new FlagSnapshot(flagId, value, spec.DefaultValue, true, spec.Kind, changedAt, spec.FormatValue(value));
            }

            return new FlagSnapshot(flagId, value, 0, false, FlagKind.Counter, changedAt, value.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }
    }
}
