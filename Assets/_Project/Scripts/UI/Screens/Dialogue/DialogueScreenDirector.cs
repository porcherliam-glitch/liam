using System;
using Aetherfall.UI.Framework;

namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// Opens the dialogue screen while a conversation runs and closes it afterwards (pure logic; called every frame by the UI
    /// root). The screen stays open below the pause menu (the pause menu opens later and lies on top of the focus stack).
    /// </summary>
    public sealed class DialogueScreenDirector
    {
        private readonly IUIManager _ui;
        private readonly UIScreen _screen;
        private readonly IDialogueScreenSource _source;

        /// <summary>Creates the director.</summary>
        /// <param name="ui">UI manager.</param>
        /// <param name="screen">The dialogue screen (<see cref="DialogueScreen"/>).</param>
        /// <param name="source">Dialogue source.</param>
        public DialogueScreenDirector(IUIManager ui, UIScreen screen, IDialogueScreenSource source)
        {
            _ui = ui ?? throw new ArgumentNullException(nameof(ui));
            _screen = screen ?? throw new ArgumentNullException(nameof(screen));
            _source = source ?? throw new ArgumentNullException(nameof(source));
        }

        /// <summary>True if the screen should be open: a line or a choice is shown.</summary>
        /// <param name="mode">Mode of the source.</param>
        public static bool ShouldBeOpen(DialogueScreenMode mode)
        {
            return mode != DialogueScreenMode.None;
        }

        /// <summary>Opens or closes the screen to match the source.</summary>
        /// <returns>True if the screen was opened or closed.</returns>
        public bool Update()
        {
            bool wanted = ShouldBeOpen(_source.Mode);
            if (wanted && !_screen.IsOpen)
            {
                _ui.Open(_screen);
                return true;
            }

            if (!wanted && _screen.IsOpen)
            {
                _ui.Close(_screen);
                return true;
            }

            return false;
        }
    }
}
