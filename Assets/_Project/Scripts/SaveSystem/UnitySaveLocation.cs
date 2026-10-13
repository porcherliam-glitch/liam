using System.IO;
using UnityEngine;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Platform adapter for the save folder (architecture 9.9). In the editor the saves go to <c>&lt;project&gt;/SavesDev/</c>
    /// (ignored by Git), so editor and player saves do not mix. In a build they go to
    /// <c>Application.persistentDataPath/Saves/</c>:
    /// macOS <c>~/Library/Application Support/&lt;company&gt;.&lt;product&gt;/Saves/</c>,
    /// Windows <c>%userprofile%\AppData\LocalLow\&lt;company&gt;\&lt;product&gt;\Saves\</c>.
    /// </summary>
    /// <remarks>The only class of the save system that touches Unity paths; everything else gets the folder from here.</remarks>
    public sealed class UnitySaveLocation : ISaveLocation
    {
        /// <summary>Folder name of the editor saves next to <c>Assets/</c>.</summary>
        public const string EditorFolderName = "SavesDev";

        private UnitySaveLocation(string rootDirectory)
        {
            RootDirectory = rootDirectory;
        }

        /// <inheritdoc />
        public string RootDirectory { get; }

        /// <summary>Creates the location for the running platform. Main thread only (Unity paths).</summary>
        public static UnitySaveLocation Create()
        {
#if UNITY_EDITOR
            string projectFolder = Path.GetDirectoryName(Application.dataPath) ?? Application.dataPath;
            return new UnitySaveLocation(Path.Combine(projectFolder, EditorFolderName));
#else
            return new UnitySaveLocation(Path.Combine(Application.persistentDataPath, SaveFormat.SavesFolderName));
#endif
        }
    }
}
