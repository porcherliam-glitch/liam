using System;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// The dialogue service (architecture 11.8): starts conversations, takes the player's input (continue, choose, cancel) and
    /// offers the <see cref="DialogueView"/> the dialogue screen shows. While a conversation runs, the game state is
    /// <c>Dialogue</c> (architecture 4.4) and saving is locked (GDD 05 5.2: running dialogues are never saved). Registered by
    /// <see cref="DialogueInstaller"/>.
    /// </summary>
    public interface IDialogueService
    {
        /// <summary>Raised after every change of <see cref="View"/> (line, options, end).</summary>
        event Action Changed;

        /// <summary>Raised when a conversation ended (exit, follow-up: trade or fight), after the game state was released.</summary>
        event Action<DialogueEndInfo> Ended;

        /// <summary>What the dialogue screen shows.</summary>
        DialogueView View { get; }

        /// <summary>True while a conversation runs.</summary>
        bool IsRunning { get; }

        /// <summary>All dialogues.</summary>
        DialogueCatalog Catalog { get; }

        /// <summary>
        /// Starts a conversation: pushes the game state <c>Dialogue</c>, locks saving, sends <c>NPCTalkedTo</c> and
        /// <c>DialogueStarted</c> and runs to the first line or choice.
        /// </summary>
        /// <param name="request">Dialogue, partner, optional start node.</param>
        /// <returns>False (logged) if a conversation runs, the dialogue is unknown or the game state does not allow it.</returns>
        bool TryStart(in DialogueStartRequest request);

        /// <summary>Continues after a line (A / Cross / E).</summary>
        /// <returns>False if no line is shown.</returns>
        bool Continue();

        /// <summary>Chooses an option of the shown choice.</summary>
        /// <param name="optionIndex">Index in <see cref="DialogueView.Options"/>.</param>
        /// <returns>False if the option is greyed or no choice is shown.</returns>
        bool Choose(int optionIndex);

        /// <summary>
        /// B / Circle / Esc: chooses the "[Ende]" option of a choice if there is one, otherwise cancels the conversation if the
        /// dialogue allows it (<see cref="DialogueView.CanCancel"/>).
        /// </summary>
        /// <returns>True if something happened.</returns>
        bool Back();

        /// <summary>Ends the running conversation without exit (e.g. the partner died, a fight began).</summary>
        /// <param name="reason">Reason for the log.</param>
        /// <returns>False if no conversation runs.</returns>
        bool ForceEnd(string reason);

        /// <summary>Re-evaluates the options of the shown choice (e.g. after the gold changed).</summary>
        void RefreshOptions();
    }
}
