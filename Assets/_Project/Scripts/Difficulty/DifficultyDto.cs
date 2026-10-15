using Aetherfall.Core;
using UnityEngine.Scripting;

namespace Aetherfall.Difficulty
{
    /// <summary>Save section <c>difficulty</c>: the difficulty level of the game (GDD 03 9.7).</summary>
    [Preserve]
    public sealed class DifficultyDto
    {
        /// <summary>Level as number (0 Geschichte, 1 Normal, 2 Schwer, 3 Albtraum).</summary>
        public int Level = (int)DifficultyLevel.Normal;
    }
}
