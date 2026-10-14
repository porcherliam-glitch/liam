using System.Collections.Generic;
using Aetherfall.Dialogue;
using Aetherfall.Events;
using Aetherfall.Stats;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>Player values set by the test (attributes default 10, level 1, no dialogue skill).</summary>
    public sealed class FakeCheckStats : IDialogueCheckStats
    {
        private readonly Dictionary<StatId, int> _attributes = new Dictionary<StatId, int>();
        private readonly Dictionary<SkillCheckType, int> _ranks = new Dictionary<SkillCheckType, int>();

        /// <inheritdoc />
        public int PlayerLevel { get; set; } = 1;

        /// <summary>Charisma.</summary>
        public int Charisma
        {
            get => GetAttribute(StatId.Charisma);
            set => _attributes[StatId.Charisma] = value;
        }

        /// <summary>Strength.</summary>
        public int Strength
        {
            get => GetAttribute(StatId.Strength);
            set => _attributes[StatId.Strength] = value;
        }

        /// <inheritdoc />
        public int GetAttribute(StatId attribute)
        {
            return _attributes.TryGetValue(attribute, out int value) ? value : 10;
        }

        /// <inheritdoc />
        public int GetSkillRank(SkillCheckType type)
        {
            return _ranks.TryGetValue(type, out int rank) ? rank : 0;
        }

        /// <summary>Sets the rank of a dialogue skill.</summary>
        /// <param name="type">Kind of check.</param>
        /// <param name="rank">Rank.</param>
        public void SetRank(SkillCheckType type, int rank)
        {
            _ranks[type] = rank;
        }
    }
}
