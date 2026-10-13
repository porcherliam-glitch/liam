using System;
using System.IO;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// File names of a slot (architecture 9.3): <c>&lt;root&gt;/&lt;character&gt;/&lt;slot&gt;.sav</c>, <c>.head.json</c>,
    /// <c>.sav.bak</c>, <c>.tmp</c> and the folder for damaged saves. Pure path logic.
    /// </summary>
    public sealed class SavePaths
    {
        /// <summary>Creates the paths below a root folder.</summary>
        /// <param name="rootDirectory">Folder that contains the character folders.</param>
        public SavePaths(string rootDirectory)
        {
            if (string.IsNullOrEmpty(rootDirectory))
            {
                throw new ArgumentException("A save root directory is required.", nameof(rootDirectory));
            }

            Root = rootDirectory;
        }

        /// <summary>Folder that contains the character folders.</summary>
        public string Root { get; }

        /// <summary>Folder of a character.</summary>
        /// <param name="characterId">Character id.</param>
        public string CharacterDirectory(string characterId)
        {
            return Path.Combine(Root, characterId);
        }

        /// <summary>The full save (<c>&lt;slot&gt;.sav</c>).</summary>
        /// <param name="characterId">Character id.</param>
        /// <param name="slotName">Slot name.</param>
        public string SaveFile(string characterId, string slotName)
        {
            return Path.Combine(CharacterDirectory(characterId), slotName + SaveFormat.SaveExtension);
        }

        /// <summary>The header file (<c>&lt;slot&gt;.head.json</c>).</summary>
        /// <param name="characterId">Character id.</param>
        /// <param name="slotName">Slot name.</param>
        public string HeadFile(string characterId, string slotName)
        {
            return Path.Combine(CharacterDirectory(characterId), slotName + SaveFormat.HeadExtension);
        }

        /// <summary>The previous version of the save (<c>&lt;slot&gt;.sav.bak</c>).</summary>
        /// <param name="characterId">Character id.</param>
        /// <param name="slotName">Slot name.</param>
        public string BackupFile(string characterId, string slotName)
        {
            return SaveFile(characterId, slotName) + SaveFormat.BackupSuffix;
        }

        /// <summary>Folder for damaged saves of a character.</summary>
        /// <param name="characterId">Character id.</param>
        public string CorruptDirectory(string characterId)
        {
            return Path.Combine(CharacterDirectory(characterId), SaveFormat.CorruptFolderName);
        }

        /// <summary>Temporary file used while writing <paramref name="path"/>.</summary>
        /// <param name="path">Final file path.</param>
        public static string TempFile(string path)
        {
            return path + SaveFormat.TempSuffix;
        }
    }
}
