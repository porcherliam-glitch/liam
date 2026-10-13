using System.Collections.Generic;

namespace Aetherfall.Items
{
    /// <summary>
    /// Plain data of a loot table (GDD 04 5.1, built from <see cref="LootTableDefinition"/> or in tests): id, number of rolls,
    /// optional loot quality override and the entries (guaranteed ones are given in addition to the rolls).
    /// </summary>
    public sealed class LootTableSpec
    {
        /// <summary>Table id, e.g. <c>loot.enemy.wolf.grauwolf</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>Fewest rolls.</summary>
        public int MinRolls { get; set; } = 1;

        /// <summary>Most rolls.</summary>
        public int MaxRolls { get; set; } = 1;

        /// <summary>Loot quality 0–6 that replaces the one of the source; −1 = none (GDD 04 5.1 "LQ-Override").</summary>
        public int LootQualityOverride { get; set; } = -1;

        /// <summary>Entries in order.</summary>
        public List<LootEntrySpec> Entries { get; set; } = new List<LootEntrySpec>();

        /// <summary>Returns an error text if the table is unusable, otherwise an empty string.</summary>
        public string Validate()
        {
            if (string.IsNullOrEmpty(Id))
            {
                return "Loot table without id.";
            }

            if (MinRolls < 0 || MaxRolls < MinRolls)
            {
                return "Loot table '" + Id + "': rolls must be 0 or more and max ≥ min.";
            }

            if (Entries == null || Entries.Count == 0)
            {
                return "Loot table '" + Id + "' has no entries.";
            }

            for (int i = 0; i < Entries.Count; i++)
            {
                if (Entries[i] == null)
                {
                    return "Loot table '" + Id + "': entry " + (i + 1) + " is empty.";
                }

                string problem = Entries[i].Validate();
                if (problem.Length > 0)
                {
                    return "Loot table '" + Id + "': " + problem;
                }
            }

            return string.Empty;
        }
    }
}
