namespace Aetherfall.Combat
{
    /// <summary>What one frame of running status effects does to the owner (returned by <see cref="StatusEffectController.Tick"/>).</summary>
    public readonly struct StatusTick
    {
        /// <summary>Fire damage of the burning effect this frame (share of max health, already multiplied).</summary>
        public readonly float BurnDamage;

        /// <summary>Poison damage this frame.</summary>
        public readonly float PoisonDamage;

        /// <summary>Damage of the corruption overflow this frame (player "Überflutet": 2 % max health per second).</summary>
        public readonly float CorruptionDamage;

        /// <summary>True if the corruption bar reached 100 this frame on an enemy: the owner bursts (3 m, 10 % max health as Aether, 2 s stun).</summary>
        public readonly bool CorruptionBurst;

        /// <summary>Creates the tick.</summary>
        public StatusTick(float burnDamage, float poisonDamage, float corruptionDamage, bool corruptionBurst)
        {
            BurnDamage = burnDamage;
            PoisonDamage = poisonDamage;
            CorruptionDamage = corruptionDamage;
            CorruptionBurst = corruptionBurst;
        }

        /// <summary>Nothing happened.</summary>
        public static StatusTick None => default;

        /// <summary>True if any damage is due.</summary>
        public bool HasDamage => BurnDamage > 0f || PoisonDamage > 0f || CorruptionDamage > 0f;
    }
}
