using Aetherfall.Stats;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Values of the attacker at the moment of the hit (architecture 11.4: "Stats-Werte zum Trefferzeitpunkt").
    /// Build it with <see cref="FromStats"/> (player, companions) or <see cref="ForEnemy"/>.
    /// </summary>
    public struct AttackerSnapshot
    {
        /// <summary>Level of the attacker (level difference and armor formula); values below 1 count as 1.</summary>
        public float Level { get; set; }

        /// <summary>Main attributes (for the weapon scaling, GDD 03 8.2 step 2).</summary>
        public AttributeSet Attributes { get; set; }

        /// <summary>Critical chance as fraction (0.05 = 5 %).</summary>
        public float CritChance { get; set; }

        /// <summary>Critical damage factor (1.5 = 150 %); values below 1 count as 1.</summary>
        public float CritDamage { get; set; }

        /// <summary>Σ of additive damage bonuses as fraction (step 3: skills, buffs, affixes, weather …).</summary>
        public float DamageBonus { get; set; }

        /// <summary>Armor penetration as fraction (crossbow 0.25).</summary>
        public float ArmorPenetration { get; set; }

        /// <summary>Resistance penetration: subtracted from positive resistances only (never below 0).</summary>
        public float ResistancePenetration { get; set; }

        /// <summary>Reads the snapshot from the attacker's stats.</summary>
        /// <param name="stats">Stats of the attacker.</param>
        /// <param name="extraDamageBonus">Additional situational bonus (e.g. weather, corruption level) added to <see cref="DamageBonus"/>.</param>
        public static AttackerSnapshot FromStats(IStatReader stats, float extraDamageBonus = 0f)
        {
            return new AttackerSnapshot
            {
                Level = stats.Get(StatId.Level),
                Attributes = AttributeSet.From(stats),
                CritChance = stats.Get(StatId.CritChance),
                CritDamage = stats.Get(StatId.CritDamage),
                DamageBonus = stats.Get(StatId.DamageBonus) + extraDamageBonus,
                ArmorPenetration = stats.Get(StatId.ArmorPenetration),
                ResistancePenetration = stats.Get(StatId.ResistancePenetration)
            };
        }

        /// <summary>Snapshot of an enemy: values from type data, neutral attributes (GDD 03 10.6).</summary>
        /// <param name="level">Enemy level.</param>
        /// <param name="critChance">Critical chance (default 0).</param>
        /// <param name="critDamage">Critical damage factor (default 1.5).</param>
        public static AttackerSnapshot ForEnemy(float level, float critChance = 0f, float critDamage = StatFormulas.CritDamageBase)
        {
            return new AttackerSnapshot
            {
                Level = level,
                Attributes = AttributeSet.Neutral,
                CritChance = critChance,
                CritDamage = critDamage
            };
        }
    }
}
