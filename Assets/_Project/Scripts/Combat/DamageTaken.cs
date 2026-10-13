namespace Aetherfall.Combat
{
    /// <summary>Payload of <see cref="Health.Damaged"/> (local C# event, architecture 11.4).</summary>
    public readonly struct DamageTaken
    {
        /// <summary>The damage as received.</summary>
        public readonly DamageInfo Damage;

        /// <summary>Health actually removed.</summary>
        public readonly float Applied;

        /// <summary>Health before the hit.</summary>
        public readonly float HealthBefore;

        /// <summary>Health after the hit.</summary>
        public readonly float HealthAfter;

        /// <summary>Creates the payload.</summary>
        /// <param name="damage">Received damage.</param>
        /// <param name="applied">Removed health.</param>
        /// <param name="healthBefore">Health before.</param>
        /// <param name="healthAfter">Health after.</param>
        public DamageTaken(in DamageInfo damage, float applied, float healthBefore, float healthAfter)
        {
            Damage = damage;
            Applied = applied;
            HealthBefore = healthBefore;
            HealthAfter = healthAfter;
        }
    }
}
