using UnityEngine.Scripting;

namespace Aetherfall.Quests
{
    /// <summary>Saved state of one objective of the active stage (architecture 11.7 "ObjectiveState").</summary>
    [Preserve]
    public sealed class ObjectiveStateDto
    {
        /// <summary>Local objective id.</summary>
        public string Id = string.Empty;

        /// <summary>Progress.</summary>
        public int Progress;

        /// <summary>True if fulfilled.</summary>
        public bool Done;

        /// <summary>True if failed.</summary>
        public bool Failed;

        /// <summary>Remaining seconds of a time limit.</summary>
        public float TimerRemaining;

        /// <summary>Free text state (inspected clues, chosen option …).</summary>
        public string Extra = string.Empty;

        /// <summary>True once the completion actions ran.</summary>
        public bool BonusGiven;
    }
}
