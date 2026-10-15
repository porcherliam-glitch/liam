using System;
using Aetherfall.Core;

namespace Aetherfall.Difficulty
{
    /// <summary>
    /// Default <see cref="IDifficultyService"/> (GDD 03 9.7): the level of the running game. A new game keeps the level chosen
    /// in the options; a loaded game brings its own. Saved by <see cref="DifficultySaveable"/>.
    /// </summary>
    public sealed class DifficultyService : IDifficultyService
    {
        /// <summary>Creates the service.</summary>
        /// <param name="level">Start level.</param>
        public DifficultyService(DifficultyLevel level = DifficultyLevel.Normal)
        {
            Level = level;
        }

        /// <inheritdoc />
        public DifficultyLevel Level { get; private set; }

        /// <inheritdoc />
        public DifficultySettings Settings => DifficultySettings.For(Level);

        /// <inheritdoc />
        public event Action<DifficultyLevel> Changed;

        /// <inheritdoc />
        public void SetLevel(DifficultyLevel level)
        {
            if (level < DifficultyLevel.Story || level > DifficultyLevel.Nightmare || level == Level)
            {
                return;
            }

            Level = level;
            Log.Info(LogCategory.Data, "Difficulty: " + Settings.Name + ".");
            Changed?.Invoke(level);
        }
    }
}
