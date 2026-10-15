using System;

namespace Aetherfall.Core
{
    /// <summary>
    /// The difficulty of the running game (GDD 03 9.7): the level and its factors. Changeable at any time; enemies already in
    /// the world keep their health until they respawn (in a boss fight it counts from the next attempt). Saved with the game.
    /// </summary>
    public interface IDifficultyService
    {
        /// <summary>Current level.</summary>
        DifficultyLevel Level { get; }

        /// <summary>Factors of the current level.</summary>
        DifficultySettings Settings { get; }

        /// <summary>Raised when the level changes.</summary>
        event Action<DifficultyLevel> Changed;

        /// <summary>Sets the level.</summary>
        /// <param name="level">New level.</param>
        void SetLevel(DifficultyLevel level);
    }
}
