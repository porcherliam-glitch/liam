using Aetherfall.Events;
using Aetherfall.Stats;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// The values of the player that skill checks and bribe prices need (GDD 02, 12.3): raw attributes, level and the rank of
    /// the dialogue skill. Default: <see cref="PlayerStatsCheckSource"/> (player stats bound to the inventory); a fake in tests.
    /// Registered by the dialogue installer; actions reach it through their context.
    /// </summary>
    public interface IDialogueCheckStats
    {
        /// <summary>Player level (at least 1).</summary>
        int PlayerLevel { get; }

        /// <summary>Raw value of an attribute (Charisma, Strength …), rounded down.</summary>
        /// <param name="attribute">Attribute.</param>
        int GetAttribute(StatId attribute);

        /// <summary>Rank of the dialogue skill for a check (tree "Sprache/Charisma"; 0 without skill).</summary>
        /// <param name="type">Kind of check.</param>
        int GetSkillRank(SkillCheckType type);
    }
}
