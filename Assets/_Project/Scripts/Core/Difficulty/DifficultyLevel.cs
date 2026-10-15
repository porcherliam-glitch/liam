namespace Aetherfall.Core
{
    /// <summary>Difficulty levels (GDD 03 9.7, §20.4): changeable at any time in the options.</summary>
    public enum DifficultyLevel
    {
        /// <summary>Geschichte: for the story; enemies hit softer, more time to react.</summary>
        Story = 0,

        /// <summary>Normal.</summary>
        Normal = 1,

        /// <summary>Schwer.</summary>
        Hard = 2,

        /// <summary>Albtraum.</summary>
        Nightmare = 3
    }
}
