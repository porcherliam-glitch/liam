using Aetherfall.Events;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Constants of the damage pipeline (GDD 03 8.2, 4.9, 10.5) as plain data for <see cref="DamageCalculator"/>.
    /// <see cref="CreateDefault"/> returns the GDD values; a balancing asset can later fill an instance with tuned values.
    /// </summary>
    public sealed class DamageBalancing
    {
        /// <summary>Armor constant K in <c>R ÷ (R + K × Level_attacker)</c> (step 8: 10).</summary>
        public float ArmorConstant { get; set; } = 10f;

        /// <summary>Highest damage reduction by armor (GDD 03 10.5: 85 %).</summary>
        public float ArmorReductionCap { get; set; } = 0.85f;

        /// <summary>Share of the armor that counts against blunt damage (GDD 03 8.1: 80 %).</summary>
        public float BluntArmorFactor { get; set; } = 0.8f;

        /// <summary>Additional critical chance of hits whose primary type is stab (GDD 03 8.1: +5 percentage points).</summary>
        public float StabCritChanceBonus { get; set; } = 0.05f;

        /// <summary>Highest critical chance (GDD 03 10.5: hard cap 75 %).</summary>
        public float CritChanceCap { get; set; } = 0.75f;

        /// <summary>Highest critical damage factor (GDD 03 10.5: 300 %).</summary>
        public float CritDamageCap { get; set; } = 3f;

        /// <summary>Damage factor of body hits (step 4).</summary>
        public float BodyMultiplier { get; set; } = 1f;

        /// <summary>Damage factor of limb hits (step 4).</summary>
        public float LimbMultiplier { get; set; } = 0.9f;

        /// <summary>Damage factor of melee head hits (step 4).</summary>
        public float HeadMeleeMultiplier { get; set; } = 1.5f;

        /// <summary>Damage factor of ranged/projectile head hits (step 4).</summary>
        public float HeadRangedMultiplier { get; set; } = 1.75f;

        /// <summary>Damage factor of weak point hits (step 4).</summary>
        public float WeakPointMultiplier { get; set; } = 2f;

        /// <summary>Level difference factor per level (step 6: 0.03).</summary>
        public float LevelFactorPerLevel { get; set; } = 0.03f;

        /// <summary>Lowest level difference factor (step 6: 0.70).</summary>
        public float LevelFactorMin { get; set; } = 0.7f;

        /// <summary>Highest level difference factor (step 6: 1.15).</summary>
        public float LevelFactorMax { get; set; } = 1.15f;

        /// <summary>Lowest resistance (step 7: −1.0 = double damage).</summary>
        public float ResistanceMin { get; set; } = -1f;

        /// <summary>Highest resistance of player-side defenders (GDD 03 10.5: 75 %).</summary>
        public float PlayerResistanceMax { get; set; } = 0.75f;

        /// <summary>Highest resistance of enemies (step 7: 90 %).</summary>
        public float EnemyResistanceMax { get; set; } = 0.9f;

        /// <summary>Lowest product of the defender multipliers (GDD 03 10.5: at least 10 % of the damage gets through).</summary>
        public float MinimumIncomingDamageMultiplier { get; set; } = 0.1f;

        /// <summary>Smallest damage of a hit that is not immune or parried (step 12: 1).</summary>
        public int MinimumDamage { get; set; } = 1;

        /// <summary>Poise factor of blunt damage (GDD 03 4.9: 1.3).</summary>
        public float PoiseFactorBlunt { get; set; } = 1.3f;

        /// <summary>Poise factor of slash damage (1.0).</summary>
        public float PoiseFactorSlash { get; set; } = 1f;

        /// <summary>Poise factor of stab damage (0.9).</summary>
        public float PoiseFactorStab { get; set; } = 0.9f;

        /// <summary>Poise factor of lightning damage (0.7).</summary>
        public float PoiseFactorLightning { get; set; } = 0.7f;

        /// <summary>Poise factor of the other elements (0.5).</summary>
        public float PoiseFactorOtherElements { get; set; } = 0.5f;

        /// <summary>Poise factor of explosions (1.5).</summary>
        public float PoiseFactorExplosion { get; set; } = 1.5f;

        /// <summary>Returns a new instance with the values of GDD 03.</summary>
        public static DamageBalancing CreateDefault()
        {
            return new DamageBalancing();
        }

        /// <summary>Damage factor of a hit zone.</summary>
        /// <param name="zone">Zone.</param>
        /// <param name="isRanged">True for ranged hits.</param>
        public float ZoneMultiplier(HitZone zone, bool isRanged)
        {
            switch (zone)
            {
                case HitZone.Limb: return LimbMultiplier;
                case HitZone.Head: return isRanged ? HeadRangedMultiplier : HeadMeleeMultiplier;
                case HitZone.WeakPoint: return WeakPointMultiplier;
                default: return BodyMultiplier;
            }
        }

        /// <summary>Poise factor F_Art of a damage type (GDD 03 4.9).</summary>
        /// <param name="type">Damage type.</param>
        public float PoiseFactor(DamageType type)
        {
            switch (type)
            {
                case DamageType.Blunt: return PoiseFactorBlunt;
                case DamageType.Slash: return PoiseFactorSlash;
                case DamageType.Stab: return PoiseFactorStab;
                case DamageType.Lightning: return PoiseFactorLightning;
                default: return PoiseFactorOtherElements;
            }
        }

        /// <summary>Returns an error text if a value is out of range, otherwise an empty string.</summary>
        public string Validate()
        {
            if (!(ArmorConstant > 0f))
            {
                return "ArmorConstant must be greater than 0.";
            }

            if (!(ArmorReductionCap >= 0f && ArmorReductionCap < 1f))
            {
                return "ArmorReductionCap must be in [0, 1).";
            }

            if (!(LevelFactorMin > 0f && LevelFactorMin <= LevelFactorMax))
            {
                return "Level factor range must satisfy 0 < min <= max.";
            }

            if (!(ResistanceMin <= PlayerResistanceMax && PlayerResistanceMax < 1f && EnemyResistanceMax < 1f))
            {
                return "Resistance caps must be below 1 and above the minimum.";
            }

            if (!(MinimumIncomingDamageMultiplier > 0f) || MinimumDamage < 0)
            {
                return "MinimumIncomingDamageMultiplier must be greater than 0 and MinimumDamage 0 or more.";
            }

            return string.Empty;
        }
    }
}
