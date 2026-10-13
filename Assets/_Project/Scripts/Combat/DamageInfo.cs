using Aetherfall.Events;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Damage that reaches an <see cref="IDamageable"/>: the final amount (usually <see cref="DamageResult.Damage"/>) plus
    /// what the receiver needs for reactions and events. Plain values only.
    /// </summary>
    public readonly struct DamageInfo
    {
        /// <summary>Damage amount (0 or less is ignored).</summary>
        public readonly float Amount;

        /// <summary>Id of the source for events and logs (enemy unique id, <c>player</c>, <c>env.fall</c>, <c>debug</c> …).</summary>
        public readonly string SourceId;

        /// <summary>Main damage type of the hit (reaction, VFX).</summary>
        public readonly DamageType Type;

        /// <summary>Flags of the damage calculation (critical, blocked …).</summary>
        public readonly HitFlags Flags;

        /// <summary>Poise damage of the hit (GDD 03 4.9).</summary>
        public readonly float PoiseDamage;

        /// <summary>Creates the info.</summary>
        /// <param name="amount">Damage amount.</param>
        /// <param name="sourceId">Source id (null is stored as empty).</param>
        /// <param name="type">Main damage type.</param>
        /// <param name="flags">Hit flags.</param>
        /// <param name="poiseDamage">Poise damage.</param>
        public DamageInfo(float amount, string sourceId, DamageType type = DamageType.Slash, HitFlags flags = HitFlags.None, float poiseDamage = 0f)
        {
            Amount = amount;
            SourceId = sourceId ?? string.Empty;
            Type = type;
            Flags = flags;
            PoiseDamage = poiseDamage;
        }

        /// <summary>Creates the info from a calculated hit.</summary>
        /// <param name="result">Result of <see cref="DamageCalculator.Calculate"/>.</param>
        /// <param name="packet">The base packet (for the main type).</param>
        /// <param name="sourceId">Id of the attacker.</param>
        public static DamageInfo FromResult(in DamageResult result, in DamagePacket packet, string sourceId)
        {
            return new DamageInfo(result.Damage, sourceId, packet.PrimaryType, result.Flags, result.PoiseDamage);
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "DamageInfo(" + Amount + " " + Type + " from '" + SourceId + "', " + Flags + ")";
        }
    }
}
