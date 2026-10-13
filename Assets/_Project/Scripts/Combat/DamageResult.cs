namespace Aetherfall.Combat
{
    /// <summary>Output of <see cref="DamageCalculator.Calculate"/> (GDD 03 8.4).</summary>
    public readonly struct DamageResult
    {
        /// <summary>Final damage (step 12): rounded half away from zero, at least 1; 0 only for immunity or a perfect parry.</summary>
        public readonly int Damage;

        /// <summary>Damage before rounding and minimum (sum of all shares after step 11).</summary>
        public readonly float RawDamage;

        /// <summary>Poise damage for the defender (GDD 03 4.9); 0 when blocked or parried.</summary>
        public readonly float PoiseDamage;

        /// <summary>Status build-up for the defender's status effect controller (GDD 03 7).</summary>
        public readonly StatusBuildup Buildup;

        /// <summary>What happened (critical, weakness, immune, blocked, parried, zone).</summary>
        public readonly HitFlags Flags;

        /// <summary>Stamina the defender loses for a blocked hit: stamina damage × (1 − stability) (GDD 03 4.7).</summary>
        public readonly float BlockStaminaCost;

        /// <summary>Creates a result.</summary>
        /// <param name="damage">Final damage.</param>
        /// <param name="rawDamage">Damage before rounding.</param>
        /// <param name="poiseDamage">Poise damage.</param>
        /// <param name="buildup">Status build-up.</param>
        /// <param name="flags">Flags.</param>
        /// <param name="blockStaminaCost">Stamina cost of a block.</param>
        public DamageResult(int damage, float rawDamage, float poiseDamage, StatusBuildup buildup, HitFlags flags, float blockStaminaCost)
        {
            Damage = damage;
            RawDamage = rawDamage;
            PoiseDamage = poiseDamage;
            Buildup = buildup;
            Flags = flags;
            BlockStaminaCost = blockStaminaCost;
        }

        /// <summary>True if <paramref name="flag"/> is set.</summary>
        /// <param name="flag">Flag to check.</param>
        public bool Has(HitFlags flag)
        {
            return (Flags & flag) == flag;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "DamageResult(" + Damage + " [raw " + RawDamage + "], poise " + PoiseDamage + ", " + Flags + ")";
        }
    }
}
