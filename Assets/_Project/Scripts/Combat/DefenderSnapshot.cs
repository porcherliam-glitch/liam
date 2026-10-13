using Aetherfall.Stats;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Values of the defender at the moment of the hit (architecture 11.4: armor, resistances, block/parry state).
    /// Build it with <see cref="FromStats"/> or <see cref="Create"/>, which set the neutral factors to 1.
    /// </summary>
    public struct DefenderSnapshot
    {
        /// <summary>Level of the defender (level difference, step 6).</summary>
        public float Level { get; set; }

        /// <summary>Armor value (step 8).</summary>
        public float Armor { get; set; }

        /// <summary>Resistances and immunities per damage type (step 7).</summary>
        public ResistanceProfile Resistances { get; set; }

        /// <summary>
        /// True for the player and companions: resistances are capped at 75 % (enemies 90 %) and the difficulty factors
        /// of the request apply (steps 7 and 11).
        /// </summary>
        public bool IsPlayerSide { get; set; }

        /// <summary>Block or parry state (step 9).</summary>
        public BlockState Block { get; set; }

        /// <summary>Damage reduction of the block against physical damage (fraction; wooden shield 0.8).</summary>
        public float BlockPhysicalReduction { get; set; }

        /// <summary>Damage reduction of the block against elemental damage (fraction; wooden shield 0.2).</summary>
        public float BlockElementalReduction { get; set; }

        /// <summary>Block stability (fraction; lowers the stamina cost of blocked hits, GDD 03 4.7).</summary>
        public float BlockStability { get; set; }

        /// <summary>
        /// Product of the defender multipliers Π (1 + vₖ) (step 10: marked +0.3, stunned +0.2, shield wall −0.5 …).
        /// 1 = neutral. Never below 0.1: at least 10 % of the damage gets through (GDD 03 10.5).
        /// </summary>
        public float IncomingDamageMultiplier { get; set; }

        /// <summary>Resistance against poise damage as fraction (GDD 03 4.9).</summary>
        public float PoiseResistance { get; set; }

        /// <summary>A defender with the given level and armor, no resistances, not blocking, neutral multiplier.</summary>
        /// <param name="level">Level.</param>
        /// <param name="armor">Armor.</param>
        /// <param name="isPlayerSide">True for the player and companions.</param>
        public static DefenderSnapshot Create(float level, float armor, bool isPlayerSide = false)
        {
            return new DefenderSnapshot
            {
                Level = level,
                Armor = armor,
                IsPlayerSide = isPlayerSide,
                IncomingDamageMultiplier = 1f
            };
        }

        /// <summary>Reads level, armor and resistances from the defender's stats.</summary>
        /// <param name="stats">Stats of the defender.</param>
        /// <param name="isPlayerSide">True for the player and companions.</param>
        public static DefenderSnapshot FromStats(IStatReader stats, bool isPlayerSide)
        {
            DefenderSnapshot snapshot = Create(stats.Get(StatId.Level), stats.Get(StatId.Armor), isPlayerSide);
            snapshot.Resistances = ResistanceProfile.FromStats(stats);
            return snapshot;
        }
    }
}
