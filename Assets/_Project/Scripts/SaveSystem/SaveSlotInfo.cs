using Aetherfall.Events;

namespace Aetherfall.SaveSystem
{
    /// <summary>One entry of the slot list (read from the <c>.head.json</c> files only, architecture 9.3).</summary>
    public sealed class SaveSlotInfo
    {
        /// <summary>Creates an entry.</summary>
        /// <param name="characterId">Character folder.</param>
        /// <param name="slotName">Slot name.</param>
        /// <param name="header">Parsed header, or null if the header file is missing or damaged.</param>
        /// <param name="hasBackup">True if a <c>.sav.bak</c> exists.</param>
        /// <param name="hasSave">True if the <c>.sav</c> main file exists (false after it was moved to <c>Beschaedigt/</c>).</param>
        public SaveSlotInfo(string characterId, string slotName, SaveHeader header, bool hasBackup, bool hasSave = true)
        {
            CharacterId = characterId;
            SlotName = slotName;
            Header = header;
            HasBackup = hasBackup;
            HasSave = hasSave;
            SaveKindIds.TryParse(header != null ? header.Kind : null, out SaveKind kind);
            Kind = header != null ? kind : KindFromName(slotName);
        }

        /// <summary>Character folder.</summary>
        public string CharacterId { get; }

        /// <summary>Slot name, e.g. <c>quick_0</c>.</summary>
        public string SlotName { get; }

        /// <summary>Slot id <c>&lt;character&gt;/&lt;slot&gt;</c>.</summary>
        public string SlotId => SaveSlotId.Compose(CharacterId, SlotName);

        /// <summary>Kind (from the header, or from the name prefix if the header is unreadable).</summary>
        public SaveKind Kind { get; }

        /// <summary>The header, or null if it is missing or damaged.</summary>
        public SaveHeader Header { get; }

        /// <summary>
        /// True if the slot cannot be loaded: the header is unreadable, or neither the main file nor a backup is left (the
        /// damaged main file was moved to <c>Beschaedigt/</c>). The slot shows the warning "Beschaedigt" (GDD 05 5.6),
        /// quick load and "Fortsetzen" skip it, the rotation overwrites it first.
        /// </summary>
        public bool IsDamaged => Header == null || (!HasSave && !HasBackup);

        /// <summary>True if a backup exists.</summary>
        public bool HasBackup { get; }

        /// <summary>True if the main file (<c>.sav</c>) exists.</summary>
        public bool HasSave { get; }

        /// <summary>Creation time (ISO 8601 UTC) or empty.</summary>
        public string CreatedUtc => Header != null ? Header.CreatedUtc ?? string.Empty : string.Empty;

        /// <summary>Save number of the character (<see cref="SaveHeader.SaveSequence"/>), -1 without readable header.</summary>
        public long Sequence => Header != null ? Header.SaveSequence : -1L;

        /// <summary>World space of the save (<see cref="SaveHeaderLocation.WorldSpaceId"/>) or empty.</summary>
        public string WorldSpaceId => Header != null && Header.Location != null ? Header.Location.WorldSpaceId ?? string.Empty : string.Empty;

        private static SaveKind KindFromName(string slotName)
        {
            int underscore = slotName.IndexOf('_');
            SaveKindIds.TryParse(underscore > 0 ? slotName.Substring(0, underscore) : slotName, out SaveKind kind);
            return kind;
        }
    }
}
