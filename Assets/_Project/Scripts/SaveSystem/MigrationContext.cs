using System.Collections.Generic;

namespace Aetherfall.SaveSystem
{
    /// <summary>Information for an <see cref="ISaveMigration"/> and the notes it leaves for the log.</summary>
    public sealed class MigrationContext
    {
        private readonly List<string> _notes = new List<string>();

        /// <summary>Creates the context.</summary>
        /// <param name="slotId">Slot id of the save being migrated.</param>
        /// <param name="originalVersion">Version of the file before the first step.</param>
        public MigrationContext(string slotId, int originalVersion)
        {
            SlotId = slotId ?? string.Empty;
            OriginalVersion = originalVersion;
        }

        /// <summary>Slot id of the save being migrated.</summary>
        public string SlotId { get; }

        /// <summary>Version of the file before the first step.</summary>
        public int OriginalVersion { get; }

        /// <summary>What the migrations changed (English, for the log).</summary>
        public IReadOnlyList<string> Notes => _notes;

        /// <summary>Adds a note.</summary>
        /// <param name="note">Text.</param>
        public void Note(string note)
        {
            _notes.Add(note);
        }
    }
}
