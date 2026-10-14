namespace Aetherfall.Events
{
    /// <summary>
    /// Conversation mode (GDD 02, 12.1; architecture 4.3 payload <c>Mode</c> of <see cref="DialogueStarted"/>). Values may be
    /// stored in content assets: never renumber.
    /// </summary>
    public enum DialogueMode
    {
        /// <summary>
        /// Full mode (German "Voll"): quest dialogues, companions, important NPCs. Dialogue camera, the time of day stops.
        /// </summary>
        Full = 0,

        /// <summary>Short mode (German "Kurz"): traders, guards, short answers. No camera move, the clock keeps running.</summary>
        Short = 1,

        /// <summary>Bark: one ambient line without input and without a dialogue screen (not started by the dialogue runner).</summary>
        Bark = 2
    }
}
