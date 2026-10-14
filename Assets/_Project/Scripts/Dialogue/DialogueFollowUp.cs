namespace Aetherfall.Dialogue
{
    /// <summary>
    /// What happens after a conversation ends (GDD 02, 12.2 "Ende: Folgeaktion"). Read by the systems that listen to
    /// <see cref="IDialogueService.Ended"/> (trade screen, combat). Values are stored in assets: never renumber.
    /// </summary>
    public enum DialogueFollowUp
    {
        /// <summary>Back to the game (German "Gameplay").</summary>
        Gameplay = 0,

        /// <summary>Open the trade screen (German "Handel oeffnen"); the option shows "[Handel]".</summary>
        Trade = 1,

        /// <summary>A fight begins (German "Kampf"); the option shows "[Angriff]".</summary>
        Combat = 2
    }
}
