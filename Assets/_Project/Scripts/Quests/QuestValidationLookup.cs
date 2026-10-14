using System;
using System.Collections.Generic;
using Aetherfall.WorldState;

namespace Aetherfall.Quests
{
    /// <summary>Default <see cref="IQuestValidationLookup"/> on top of an id set and a flag registry.</summary>
    public sealed class QuestValidationLookup : IQuestValidationLookup
    {
        private readonly HashSet<string> _ids = new HashSet<string>(StringComparer.Ordinal);
        private readonly FlagRegistry _flags;

        /// <summary>Creates the lookup.</summary>
        /// <param name="contentIds">All known definition ids (null = unknown: foreign ids are not checked).</param>
        /// <param name="flags">Flag definitions (null = unknown: flag ids are not checked).</param>
        public QuestValidationLookup(IEnumerable<string> contentIds, FlagRegistry flags)
        {
            HasContentIds = contentIds != null;
            if (contentIds != null)
            {
                foreach (string id in contentIds)
                {
                    if (!string.IsNullOrEmpty(id))
                    {
                        _ids.Add(id);
                    }
                }
            }

            _flags = flags;
            if (flags != null)
            {
                IReadOnlyList<FlagSpec> all = flags.All;
                for (int i = 0; i < all.Count; i++)
                {
                    _ids.Add(all[i].Id);
                }
            }
        }

        /// <summary>A lookup that knows nothing (only intra-quest checks).</summary>
        public static QuestValidationLookup Empty => new QuestValidationLookup(null, null);

        /// <inheritdoc />
        public bool HasContentIds { get; }

        /// <inheritdoc />
        public bool HasFlagDefinitions => _flags != null;

        /// <inheritdoc />
        public IReadOnlyCollection<string> ContentIds => _ids;

        /// <inheritdoc />
        public bool ContentExists(string id)
        {
            return id != null && _ids.Contains(id);
        }

        /// <inheritdoc />
        public bool TryGetFlag(string flagId, out FlagSpec spec)
        {
            if (_flags == null)
            {
                spec = null;
                return false;
            }

            return _flags.TryGet(flagId, out spec);
        }
    }
}
