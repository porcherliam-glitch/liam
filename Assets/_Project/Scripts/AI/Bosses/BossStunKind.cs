namespace Aetherfall.AI.Bosses
{
    /// <summary>Why a boss is <see cref="BossStateId.Stunned"/>.</summary>
    public enum BossStunKind
    {
        /// <summary>Not stunned.</summary>
        None = 0,

        /// <summary>Poise broken (GDD 03 4.8; finisher possible if the poise meter allows it).</summary>
        PoiseBreak = 1,

        /// <summary>Shield bash parried: the guard is open for a short time (GDD 02 11.7).</summary>
        Parried = 2,

        /// <summary>Hit by the Aether beam of the arena mirror (GDD 02 11.7: 5 s).</summary>
        Beam = 3
    }
}
