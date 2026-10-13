namespace Aetherfall.Combat
{
    /// <summary>
    /// Anything that can take damage: player, enemies, companions, destructible objects (§9.8 "ein gemeinsames
    /// Health/Damageable-System", architecture 11.4). Hurtboxes and hazards talk to this interface only.
    /// </summary>
    /// <remarks>Implemented by <see cref="Health"/> (pure logic) and <see cref="DamageableComponent"/> (scene adapter).</remarks>
    public interface IDamageable
    {
        /// <summary>True until the health reached 0.</summary>
        bool IsAlive { get; }

        /// <summary>True while damage is ignored (i-frames, finisher, cutscene).</summary>
        bool IsInvulnerable { get; }

        /// <summary>Applies damage unless the target is dead or invulnerable.</summary>
        /// <param name="damage">Final damage of the hit.</param>
        /// <returns>What happened.</returns>
        DamageOutcome ApplyDamage(in DamageInfo damage);

        /// <summary>Restores health (not when dead).</summary>
        /// <param name="amount">Amount.</param>
        /// <returns>Health actually restored.</returns>
        float Heal(float amount);
    }
}
