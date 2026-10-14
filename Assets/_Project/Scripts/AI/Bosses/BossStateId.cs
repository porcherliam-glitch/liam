namespace Aetherfall.AI.Bosses
{
    /// <summary>State of a <see cref="BossBrain"/>. Values may be logged; never renumber them.</summary>
    public enum BossStateId
    {
        /// <summary>Waits at its place until the player enters the arena (kneels, invulnerable).</summary>
        Dormant = 0,

        /// <summary>Rises (encounter started, arena gate closes; invulnerable).</summary>
        Awakening = 1,

        /// <summary>Fights: approach, attack, recover.</summary>
        Fighting = 2,

        /// <summary>Phase change (GDD 03 9.6: at most 3 s, invulnerable; summons adds).</summary>
        Transition = 3,

        /// <summary>Stunned or opened (broken poise, parried shield bash, Aether beam).</summary>
        Stunned = 4,

        /// <summary>Beaten.</summary>
        Dead = 5
    }
}
