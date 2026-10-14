namespace Aetherfall.NPC
{
    /// <summary>
    /// Text of the interaction prompt of an NPC (pure logic): "Sprechen: Harrik", or the role while the name is unknown
    /// ("Sprechen: Banditenanfuehrer", GDD 02 12.7), "Sprechen" without both. TODO (localization step): text key instead of text.
    /// </summary>
    public static class NpcPromptText
    {
        /// <summary>German verb of the prompt.</summary>
        public const string Verb = "Sprechen";

        /// <summary>Builds the prompt.</summary>
        /// <param name="name">Name of the NPC.</param>
        /// <param name="role">Role of the NPC.</param>
        /// <param name="nameKnown">True if the player knows the name.</param>
        public static string For(string name, string role, bool nameKnown)
        {
            string shown = nameKnown && !string.IsNullOrEmpty(name) ? name : !string.IsNullOrEmpty(role) ? role : name;
            return string.IsNullOrEmpty(shown) ? Verb : Verb + ": " + shown;
        }
    }
}
