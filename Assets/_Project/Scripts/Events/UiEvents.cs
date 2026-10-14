// Global events of the user interface (architecture 4.3, area "UI"). Several event structs of one area may share a file
// (architecture 15.2, rule 18).

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// A UI screen was opened (e.g. <c>screen.pause</c>). Sender: UI.Screens. Receivers: telemetry only (architecture 14.5,
    /// e.g. how often the quest log is opened).
    /// </summary>
    public readonly struct ScreenOpened : IGameEvent
    {
        /// <summary>Id of the screen, e.g. <c>screen.mainmenu</c>.</summary>
        public readonly string ScreenId;

        /// <summary>Creates the event.</summary>
        /// <param name="screenId">Id of the screen.</param>
        public ScreenOpened(string screenId)
        {
            ScreenId = screenId ?? string.Empty;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "ScreenOpened(" + ScreenId + ")";
        }
    }
}
