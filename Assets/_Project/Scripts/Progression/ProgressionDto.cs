using System.Collections.Generic;
using UnityEngine.Scripting;

namespace Aetherfall.Progression
{
    /// <summary>
    /// Save section <c>progression</c> (architecture 9.2, load order 40): level, experience in the level, free attribute and
    /// skill points, skill points from quests and the distributed attribute points (attribute saved by name, architecture
    /// 11.5). Unlocked skill nodes and classes follow with the skill trees.
    /// </summary>
    [Preserve]
    public sealed class ProgressionDto
    {
        /// <summary>Level (1 … 80).</summary>
        public int Level = 1;

        /// <summary>Experience collected in the current level.</summary>
        public int XpIntoLevel;

        /// <summary>Total experience at the time of saving (information only; level and XpIntoLevel are authoritative).</summary>
        public int TotalXp;

        /// <summary>Free attribute points.</summary>
        public int UnspentAttributePoints;

        /// <summary>Free skill points.</summary>
        public int UnspentSkillPoints;

        /// <summary>Skill points received from special quests and secrets so far.</summary>
        public int BonusSkillPoints;

        /// <summary>Distributed attribute points (only attributes with points).</summary>
        public List<AttributePointsDto> Attributes = new List<AttributePointsDto>();
    }
}
