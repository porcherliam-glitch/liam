using System.Collections.Generic;

namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// What the dialogue screen needs from the dialogue system (presentation contract of the screen): the current line as
    /// subtitle pages with speaker name, or the answers of a choice, plus the commands continue, choose and back. The screen
    /// polls <see cref="Revision"/> every frame and rebuilds when it changed.
    /// </summary>
    /// <remarks>
    /// Implemented in the integration step by an adapter over <c>Aetherfall.Dialogue.IDialogueService</c> (guide 10, section
    /// "Integration"; UI.Screens may reference Dialogue, architecture 3.3); in tests and the preview by fakes. The screen does not
    /// know the dialogue data, so it can be built and tested on its own.
    /// </remarks>
    public interface IDialogueScreenSource
    {
        /// <summary>Counter that changes with every new line, choice or end.</summary>
        int Revision { get; }

        /// <summary>What is shown.</summary>
        DialogueScreenMode Mode { get; }

        /// <summary>Speaker of the current line ("Harrik" or the role "Banditenanfuehrer").</summary>
        string SpeakerName { get; }

        /// <summary>Subtitle pages of the current line (2 lines × 45 characters each).</summary>
        IReadOnlyList<string> LinePages { get; }

        /// <summary>Display duration of the whole line in seconds at reading factor 1 (auto continue).</summary>
        float LineSeconds { get; }

        /// <summary>Number of visible answers.</summary>
        int OptionCount { get; }

        /// <summary>Index of the answer chosen by B / Circle / Esc ("[Ende]"); -1 if none.</summary>
        int BackOptionIndex { get; }

        /// <summary>True if B / Esc may cancel the conversation (no end answer, short dialogues).</summary>
        bool CanCancel { get; }

        /// <summary>Returns a visible answer.</summary>
        /// <param name="index">0 .. <see cref="OptionCount"/> - 1.</param>
        DialogueScreenOption GetOption(int index);

        /// <summary>Continues after the current line.</summary>
        void Continue();

        /// <summary>Chooses an answer.</summary>
        /// <param name="index">Answer index.</param>
        void Choose(int index);

        /// <summary>B / Circle / Esc: chooses the end answer or cancels where allowed.</summary>
        void Back();
    }
}
