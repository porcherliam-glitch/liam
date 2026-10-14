using System;
using Aetherfall.Events;
using Aetherfall.Inventory;
using Aetherfall.Stats;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Default <see cref="IDialogueCheckStats"/>: reads the player's stats that the player character binds to the inventory
    /// service (<see cref="IInventoryService.PlayerStats"/>). Before the player exists every attribute counts as
    /// <see cref="DefaultAttribute"/> and the level as 1.
    /// </summary>
    /// <remarks>TODO (progression step): rank of the dialogue skills from the skill tree "Sprache/Charisma"; until then 0.</remarks>
    public sealed class PlayerStatsCheckSource : IDialogueCheckStats
    {
        /// <summary>Attribute value without bound stats (10 = neutral; GDD 03 10.1 starts the prologue with 11).</summary>
        public const int DefaultAttribute = 10;

        private readonly Func<IStatReader> _stats;

        /// <summary>Creates the source on top of the inventory service.</summary>
        /// <param name="inventory">Inventory service (holds the bound player stats).</param>
        public PlayerStatsCheckSource(IInventoryService inventory)
        {
            if (inventory == null)
            {
                throw new ArgumentNullException(nameof(inventory));
            }

            _stats = () => inventory.PlayerStats;
        }

        /// <summary>Creates the source on top of a stat reader (tests, other owners).</summary>
        /// <param name="stats">Stat reader; null = defaults.</param>
        public PlayerStatsCheckSource(IStatReader stats)
        {
            _stats = () => stats;
        }

        /// <inheritdoc />
        public int PlayerLevel
        {
            get
            {
                IStatReader reader = _stats();
                int level = reader != null ? (int)Math.Floor(reader.Get(StatId.Level)) : 1;
                return Math.Max(1, level);
            }
        }

        /// <inheritdoc />
        public int GetAttribute(StatId attribute)
        {
            IStatReader reader = _stats();
            return reader != null ? (int)Math.Floor(reader.Get(attribute)) : DefaultAttribute;
        }

        /// <inheritdoc />
        public int GetSkillRank(SkillCheckType type)
        {
            return 0;
        }
    }
}
