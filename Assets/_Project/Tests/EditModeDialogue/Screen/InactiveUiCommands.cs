using Aetherfall.UI.Framework;

namespace Aetherfall.Tests.EditMode.DialogueScreen
{
    /// <summary>UI map input that is off, as in the game state Dialogue (only the Dialog map is active).</summary>
    public sealed class InactiveUiCommands : IUiCommandSource
    {
        /// <inheritdoc />
        public bool IsActive => false;

        /// <inheritdoc />
        public void Read(ref UiInputFrame frame)
        {
        }
    }
}
