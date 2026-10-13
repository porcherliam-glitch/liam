namespace Aetherfall.Combat
{
    /// <summary>Result of poise damage on a <see cref="PoiseMeter"/> (GDD 03 4.9, 4.11).</summary>
    public enum PoiseOutcome
    {
        /// <summary>Nothing visible.</summary>
        None = 0,

        /// <summary>Flinch: the hit had at least 8 % of the maximum poise (GDD 03 4.11 "Zuck-Animation").</summary>
        Flinch = 1,

        /// <summary>Poise broken: stunned, open for a finisher (GDD 03 4.9, 4.10).</summary>
        Broken = 2
    }
}
