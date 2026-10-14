using Aetherfall.Dialogue;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>Game day set by the test (random nodes, dice checks).</summary>
    public sealed class FixedCalendar : IDialogueCalendar
    {
        /// <inheritdoc />
        public int CurrentDay { get; set; }
    }
}
