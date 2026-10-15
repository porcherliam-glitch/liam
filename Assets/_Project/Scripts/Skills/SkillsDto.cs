using UnityEngine.Scripting;

namespace Aetherfall.Skills
{
    /// <summary>Save section <c>skills</c> (load order 47): learned nodes and their ranks (GDD 03 11).</summary>
    [Preserve]
    public sealed class SkillsDto
    {
        /// <summary>Node ids.</summary>
        public string[] Nodes;

        /// <summary>Ranks in the same order.</summary>
        public int[] Ranks;
    }
}
