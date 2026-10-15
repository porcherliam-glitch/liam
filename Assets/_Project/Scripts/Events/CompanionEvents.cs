// Events of companions (GDD 01 10.3, GDD 02 4.1 "Begleiter-Reaktionen"). Sender: quests (reactions to outcomes) and the
// companion controller (warning, leaving, remarks). Receiver: the UI (short notice "Maren gefällt das." and the line).
using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// A companion reacted to a decision or an outcome: loyalty changed by <see cref="Delta"/>, optionally with a comment
    /// (GDD 02 12: shown after the choice as notice, never as a preview on the option).
    /// </summary>
    public readonly struct CompanionReacted : IGameEvent
    {
        /// <summary>Companion id, e.g. <c>npc.begleiter.maren_falkenried</c>.</summary>
        public readonly string CompanionId;

        /// <summary>Name shown in the notice, e.g. "Maren".</summary>
        public readonly string DisplayName;

        /// <summary>Loyalty change.</summary>
        public readonly int Delta;

        /// <summary>Comment (may be empty).</summary>
        public readonly string Comment;

        /// <summary>Creates the event.</summary>
        /// <param name="companionId">Companion id.</param>
        /// <param name="displayName">Name in the notice.</param>
        /// <param name="delta">Loyalty change.</param>
        /// <param name="comment">Comment or empty.</param>
        public CompanionReacted(string companionId, string displayName, int delta, string comment)
        {
            CompanionId = companionId ?? string.Empty;
            DisplayName = displayName ?? string.Empty;
            Delta = delta;
            Comment = comment ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "CompanionReacted(" + CompanionId + ", " + Delta + ")";
        }
    }

    /// <summary>A companion says something on its own (warning talk, leaving, a remark at a place).</summary>
    public readonly struct CompanionSpoke : IGameEvent
    {
        /// <summary>Companion id.</summary>
        public readonly string CompanionId;

        /// <summary>Name shown with the line.</summary>
        public readonly string DisplayName;

        /// <summary>The line.</summary>
        public readonly string Text;

        /// <summary>Creates the event.</summary>
        /// <param name="companionId">Companion id.</param>
        /// <param name="displayName">Name.</param>
        /// <param name="text">Line.</param>
        public CompanionSpoke(string companionId, string displayName, string text)
        {
            CompanionId = companionId ?? string.Empty;
            DisplayName = displayName ?? string.Empty;
            Text = text ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "CompanionSpoke(" + CompanionId + ": " + Text + ")";
        }
    }
}
