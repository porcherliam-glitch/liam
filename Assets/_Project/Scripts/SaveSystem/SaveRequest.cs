using Aetherfall.Events;

namespace Aetherfall.SaveSystem
{
    /// <summary>What to save (architecture 4.7: "Slot + Art"). Use the factories.</summary>
    public readonly struct SaveRequest
    {
        /// <summary>Kind of save.</summary>
        public readonly SaveKind Kind;

        /// <summary>Slot name for manual saves (null = next free <c>manual_NNN</c>); ignored for rotating kinds.</summary>
        public readonly string SlotName;

        /// <summary>Character folder (null = the current character).</summary>
        public readonly string CharacterId;

        /// <summary>Creates a request.</summary>
        /// <param name="kind">Kind of save.</param>
        /// <param name="slotName">Slot name or null.</param>
        /// <param name="characterId">Character folder or null.</param>
        public SaveRequest(SaveKind kind, string slotName = null, string characterId = null)
        {
            Kind = kind;
            SlotName = slotName;
            CharacterId = characterId;
        }

        /// <summary>Quick save (F5): 3 rotating slots <c>quick_0..2</c>.</summary>
        public static SaveRequest Quick()
        {
            return new SaveRequest(SaveKind.Quick);
        }

        /// <summary>Autosave: 3 rotating slots <c>auto_0..2</c>.</summary>
        public static SaveRequest Auto()
        {
            return new SaveRequest(SaveKind.Auto);
        }

        /// <summary>Manual save into a named slot (null = next free number).</summary>
        /// <param name="slotName">Slot name (a-z, 0-9, _ and -) or null.</param>
        public static SaveRequest Manual(string slotName = null)
        {
            return new SaveRequest(SaveKind.Manual, slotName);
        }

        /// <summary>Milestone save (never overwritten).</summary>
        public static SaveRequest Milestone()
        {
            return new SaveRequest(SaveKind.Milestone);
        }
    }
}
