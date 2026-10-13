namespace Aetherfall.Combat
{
    /// <summary>The eight status effects with build-up bars (GDD 03 7.2). Values index arrays: never renumber.</summary>
    public enum StatusEffectId
    {
        /// <summary>Burning (<c>effect.brennen</c>).</summary>
        Burning = 0,

        /// <summary>Freezing (<c>effect.frieren</c>).</summary>
        Freezing = 1,

        /// <summary>Shock (<c>effect.schock</c>).</summary>
        Shock = 2,

        /// <summary>Poison (<c>effect.gift</c>).</summary>
        Poison = 3,

        /// <summary>Bleeding (<c>effect.blutung</c>).</summary>
        Bleeding = 4,

        /// <summary>Stun (<c>effect.betaeubung</c>).</summary>
        Stun = 5,

        /// <summary>Curse (<c>effect.verfluchung</c>).</summary>
        Curse = 6,

        /// <summary>Aether corruption (<c>effect.aether_verderbnis</c>).</summary>
        AetherCorruption = 7
    }
}
