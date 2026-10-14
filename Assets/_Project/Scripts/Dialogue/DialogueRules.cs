namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Settings of the dialogue system (set by the installer): check mode (GDD 02 12.3, open decision, default deterministic)
    /// and safety limits of the runner.
    /// </summary>
    public sealed class DialogueRules
    {
        /// <summary>Default for <see cref="MaxAutomaticSteps"/>.</summary>
        public const int DefaultMaxAutomaticSteps = 64;

        /// <summary>Default for <see cref="MaxPathLength"/>.</summary>
        public const int DefaultMaxPathLength = 16;

        /// <summary>Creates the rules.</summary>
        /// <param name="checkMode">How checks are decided.</param>
        /// <param name="maxAutomaticSteps">Most nodes without player input in one step (cycle protection).</param>
        /// <param name="maxPathLength">How far the option analysis follows lines and actions to find the exit of an option.</param>
        public DialogueRules(DialogueCheckMode checkMode = DialogueCheckMode.Deterministic, int maxAutomaticSteps = DefaultMaxAutomaticSteps,
            int maxPathLength = DefaultMaxPathLength)
        {
            CheckMode = checkMode;
            MaxAutomaticSteps = maxAutomaticSteps < 8 ? 8 : maxAutomaticSteps;
            MaxPathLength = maxPathLength < 1 ? 1 : maxPathLength;
        }

        /// <summary>How checks are decided.</summary>
        public DialogueCheckMode CheckMode { get; }

        /// <summary>Most nodes without player input in one step; more ends the conversation with an error (cycle protection).</summary>
        public int MaxAutomaticSteps { get; }

        /// <summary>How far the option analysis follows lines and actions.</summary>
        public int MaxPathLength { get; }

        /// <summary>True in the dice mode.</summary>
        public bool IsDiceMode => CheckMode == DialogueCheckMode.Dice;
    }
}
