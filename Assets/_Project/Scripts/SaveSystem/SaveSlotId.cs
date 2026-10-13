namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Slot ids have the form <c>&lt;characterId&gt;/&lt;slotName&gt;</c>, e.g. <c>char_01/quick_0</c> (architecture 9.3).
    /// Both parts may only contain lowercase letters, digits, <c>_</c> and <c>-</c>, so they are safe as file names.
    /// </summary>
    public static class SaveSlotId
    {
        /// <summary>Longest allowed part.</summary>
        public const int MaxPartLength = 64;

        /// <summary>Builds a slot id.</summary>
        /// <param name="characterId">Character folder.</param>
        /// <param name="slotName">Slot name.</param>
        public static string Compose(string characterId, string slotName)
        {
            return characterId + "/" + slotName;
        }

        /// <summary>Splits and validates a slot id.</summary>
        /// <param name="slotId">Slot id.</param>
        /// <param name="characterId">Character part.</param>
        /// <param name="slotName">Slot part.</param>
        /// <returns>True if both parts are valid names.</returns>
        public static bool TryParse(string slotId, out string characterId, out string slotName)
        {
            characterId = string.Empty;
            slotName = string.Empty;
            if (string.IsNullOrEmpty(slotId))
            {
                return false;
            }

            int slash = slotId.IndexOf('/');
            if (slash <= 0 || slash != slotId.LastIndexOf('/'))
            {
                return false;
            }

            string character = slotId.Substring(0, slash);
            string slot = slotId.Substring(slash + 1);
            if (!IsValidName(character) || !IsValidName(slot))
            {
                return false;
            }

            characterId = character;
            slotName = slot;
            return true;
        }

        /// <summary>True for 1–64 characters of <c>a-z</c>, <c>0-9</c>, <c>_</c>, <c>-</c>.</summary>
        /// <param name="name">Name to check.</param>
        public static bool IsValidName(string name)
        {
            if (string.IsNullOrEmpty(name) || name.Length > MaxPartLength)
            {
                return false;
            }

            for (int i = 0; i < name.Length; i++)
            {
                char c = name[i];
                bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-';
                if (!ok)
                {
                    return false;
                }
            }

            return true;
        }
    }
}
