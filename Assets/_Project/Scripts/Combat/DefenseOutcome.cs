namespace Aetherfall.Combat
{
    /// <summary>How the defender met an incoming hit (GDD 03 3.2, 4.7, 4.8).</summary>
    public enum DefenseOutcome
    {
        /// <summary>The hit lands normally.</summary>
        Hit = 0,

        /// <summary>Invulnerable (i-frames of a roll, finisher): no damage, no reaction.</summary>
        Evaded = 1,

        /// <summary>Blocked: reduced damage, stamina cost, no poise damage.</summary>
        Blocked = 2,

        /// <summary>Perfect parry: no damage, the attacker is opened for a counter.</summary>
        Parried = 3,

        /// <summary>Ignored: the target is dead or the hit was not allowed.</summary>
        Ignored = 4
    }
}
