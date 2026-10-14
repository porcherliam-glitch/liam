namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Looks up speakers of dialogue lines (architecture 3.5 "Interface tief, Implementierung hoch"): implemented by the NPC
    /// service (<c>Aetherfall.NPC</c>, no. 22), which registers it after the dialogue service. The dialogue service resolves it
    /// in <c>PostInitialize</c>; without it, speakers are shown by id and checks get no level bonus.
    /// </summary>
    public interface IDialogueSpeakerDirectory
    {
        /// <summary>Returns the data of a speaker.</summary>
        /// <param name="speakerId">NPC id.</param>
        /// <param name="info">Name, role, level, greed.</param>
        /// <returns>False if the NPC is unknown.</returns>
        bool TryGetSpeaker(string speakerId, out DialogueSpeakerInfo info);
    }
}
