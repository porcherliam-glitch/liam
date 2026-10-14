namespace Aetherfall.Progression
{
    /// <summary>How the action <see cref="GiveXp"/> computes the experience. Stored in assets: never renumber.</summary>
    public enum XpRewardMode
    {
        /// <summary>A fixed amount of experience (German "fest").</summary>
        Fixed = 0,

        /// <summary>A share of a level (GDD 02 4.1 "0,5 Lv"): share × XP to the next level at the reference level.</summary>
        LevelShare = 1
    }
}
