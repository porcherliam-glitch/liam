using System.Collections.Generic;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Items
{
    /// <summary>
    /// A loot table as data (§12.5 "Loot-Tabellen als ScriptableObjects", architecture 11.6 "LootTableDefinition", GDD 04
    /// 5.1): id <c>loot.&lt;bereich&gt;.&lt;name&gt;</c>, number of rolls, optional loot quality override and weighted entries
    /// (items, nested tables, random equipment, gold, currencies, nothing; guaranteed entries). Lives in
    /// <c>Assets/_Project/Data/LootTables/</c>. Enemy types name it in their <c>lootTableId</c>.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Items/Loot-Tabelle", fileName = "LootTable", order = 32)]
    public sealed class LootTableDefinition : GameDefinition
    {
        [Tooltip("Wenigste Würfe (Elite bekommt +1 Wurf von der Quelle).")]
        [Min(0)] [SerializeField] private int minRolls = 1;

        [Tooltip("Meiste Würfe.")]
        [Min(0)] [SerializeField] private int maxRolls = 1;

        [Tooltip("Loot-Qualitätsstufe 0–6, die die der Quelle ersetzt (GDD 04, 5.2). −1 = Stufe der Quelle verwenden.")]
        [Range(-1, 6)] [SerializeField] private int lootQualityOverride = -1;

        [Tooltip("Einträge. Gewichte relativ zueinander; garantierte Einträge kommen immer zusätzlich.")]
        [SerializeField] private List<LootEntry> entries = new List<LootEntry>();

        /// <summary>Creates the plain data for the loot roller.</summary>
        public LootTableSpec CreateSpec()
        {
            var spec = new LootTableSpec
            {
                Id = Id,
                MinRolls = minRolls,
                MaxRolls = Mathf.Max(minRolls, maxRolls),
                LootQualityOverride = lootQualityOverride
            };
            for (int i = 0; i < entries.Count; i++)
            {
                if (entries[i] != null)
                {
                    spec.Entries.Add(entries[i].CreateSpec());
                }
            }

            return spec;
        }
    }
}
