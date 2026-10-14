using System;
using System.Collections.Generic;
using Aetherfall.SaveSystem;

namespace Aetherfall.WorldState
{
    /// <summary>
    /// Saves and restores the section <c>worldstate</c> (architecture 9.2, load order 20, before every system that reads
    /// flags). A new game (data null) starts with all start values.
    /// </summary>
    public sealed class WorldStateSaveable : Saveable<WorldStateDto>
    {
        /// <summary>Save key (table 9.2).</summary>
        public const string Key = "worldstate";

        /// <summary>Load order (table 9.2).</summary>
        public const int Order = 20;

        private readonly WorldStateService _service;

        /// <summary>Creates the saveable.</summary>
        /// <param name="service">World state.</param>
        public WorldStateSaveable(WorldStateService service) : base(Key, Order)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        protected override WorldStateDto Capture()
        {
            var dto = new WorldStateDto();
            List<KeyValuePair<string, FlagValue>> entries = _service.CaptureEntries();
            for (int i = 0; i < entries.Count; i++)
            {
                dto.Flags.Add(new FlagEntryDto { Id = entries[i].Key, Value = entries[i].Value.Value, ChangedAt = entries[i].Value.ChangedAtPlaytime });
            }

            return dto;
        }

        /// <inheritdoc />
        protected override void Restore(WorldStateDto data, in LoadContext ctx)
        {
            if (data == null || data.Flags == null)
            {
                _service.LoadEntries(null);
                return;
            }

            var entries = new List<KeyValuePair<string, FlagValue>>(data.Flags.Count);
            for (int i = 0; i < data.Flags.Count; i++)
            {
                FlagEntryDto entry = data.Flags[i];
                if (entry == null || string.IsNullOrEmpty(entry.Id))
                {
                    continue;
                }

                entries.Add(new KeyValuePair<string, FlagValue>(entry.Id, new FlagValue(entry.Value, entry.ChangedAt)));
            }

            _service.LoadEntries(entries);
        }
    }
}
