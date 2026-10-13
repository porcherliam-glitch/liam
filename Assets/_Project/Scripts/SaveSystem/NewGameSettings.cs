namespace Aetherfall.SaveSystem
{
    /// <summary>Settings of a new game (architecture 4.7 <c>NewGameAsync</c>). Grows with character creation.</summary>
    public readonly struct NewGameSettings
    {
        /// <summary>Character folder for the saves of the new game (null = keep the current one).</summary>
        public readonly string CharacterId;

        /// <summary>Creates the settings.</summary>
        /// <param name="characterId">Character folder or null.</param>
        public NewGameSettings(string characterId)
        {
            CharacterId = characterId;
        }
    }
}
