namespace Aetherfall.Combat
{
    /// <summary>Why <see cref="IDamageable.ApplyDamage"/> did not apply damage.</summary>
    public enum DamageIgnoredReason
    {
        /// <summary>The damage was applied.</summary>
        None = 0,

        /// <summary>The target is already dead.</summary>
        Dead = 1,

        /// <summary>The target is invulnerable (i-frames, finisher, cutscene, god mode).</summary>
        Invulnerable = 2,

        /// <summary>The amount was 0 or less (immune, parried).</summary>
        NoDamage = 3
    }
}
