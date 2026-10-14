namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Implemented by actions that mark the dialogue options leading to them (GDD 02, 12.4), e.g. "Kampf beginnen" → "[Angriff]",
    /// "Dialog/Bestechen" → "[80 Gold]". Assemblies above Dialogue (NPC, no. 22) implement it directly; actions of assemblies
    /// that may not reference Dialogue are mapped by class name in <see cref="DialogueBadgeRules"/>.
    /// </summary>
    public interface IDialogueBadgeSource
    {
        /// <summary>Markings this action gives an option that leads to it.</summary>
        DialogueOptionMarks DialogueMarks { get; }
    }
}
