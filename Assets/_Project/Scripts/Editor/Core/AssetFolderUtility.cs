using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// File and folder helpers of the setup steps: project paths, folder creation via the AssetDatabase (so Unity
    /// writes the .meta files) and the ".gitkeep" placeholders. Stateless.
    /// </summary>
    internal static class AssetFolderUtility
    {
        /// <summary>Absolute path of the project root (the folder that contains Assets/).</summary>
        public static string ProjectRoot => Path.GetDirectoryName(Application.dataPath);

        /// <summary>Converts a project-relative path ("Assets/…" or "ArtSource") into an absolute path.</summary>
        /// <param name="projectRelativePath">Path relative to the project root, with forward slashes.</param>
        public static string ToFullPath(string projectRelativePath)
        {
            return Path.Combine(ProjectRoot, projectRelativePath.Replace('/', Path.DirectorySeparatorChar));
        }

        /// <summary>True if a file or folder exists at the project-relative path.</summary>
        /// <param name="projectRelativePath">Path relative to the project root.</param>
        public static bool Exists(string projectRelativePath)
        {
            string fullPath = ToFullPath(projectRelativePath);
            return File.Exists(fullPath) || Directory.Exists(fullPath);
        }

        /// <summary>
        /// Creates an asset folder and all missing parents with <see cref="AssetDatabase.CreateFolder"/>.
        /// Does nothing if the folder exists.
        /// </summary>
        /// <param name="assetFolderPath">Folder path starting with "Assets".</param>
        /// <param name="log">Protocol; every created folder is logged. May be null.</param>
        /// <returns>True if the folder exists afterwards.</returns>
        public static bool EnsureAssetFolder(string assetFolderPath, SetupLog log)
        {
            if (AssetDatabase.IsValidFolder(assetFolderPath))
            {
                return true;
            }

            int slash = assetFolderPath.LastIndexOf('/');
            if (slash <= 0)
            {
                log?.Error("Ungültiger Ordnerpfad: " + assetFolderPath);
                return false;
            }

            string parent = assetFolderPath.Substring(0, slash);
            string name = assetFolderPath.Substring(slash + 1);
            if (!EnsureAssetFolder(parent, log))
            {
                return false;
            }

            if (File.Exists(ToFullPath(assetFolderPath)))
            {
                log?.Error("Ordner " + assetFolderPath + " kann nicht angelegt werden: Dort liegt bereits eine Datei mit diesem Namen.");
                return false;
            }

            string guid = AssetDatabase.CreateFolder(parent, name);
            if (string.IsNullOrEmpty(guid) || !AssetDatabase.IsValidFolder(assetFolderPath))
            {
                log?.Error("Ordner " + assetFolderPath + " konnte nicht angelegt werden.");
                return false;
            }

            log?.Info("Ordner angelegt: " + assetFolderPath);
            return true;
        }

        /// <summary>Creates a folder outside of Assets/ (relative to the project root) with System.IO.</summary>
        /// <param name="projectRelativeFolder">Folder relative to the project root, e.g. "ArtSource".</param>
        /// <param name="log">Protocol. May be null.</param>
        /// <returns>True if the folder exists afterwards.</returns>
        public static bool EnsureExternalFolder(string projectRelativeFolder, SetupLog log)
        {
            string fullPath = ToFullPath(projectRelativeFolder);
            if (Directory.Exists(fullPath))
            {
                return true;
            }

            try
            {
                Directory.CreateDirectory(fullPath);
                log?.Info("Ordner angelegt (außerhalb von Assets): " + projectRelativeFolder);
                return true;
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException)
            {
                log?.Error("Ordner " + projectRelativeFolder + " konnte nicht angelegt werden: " + exception.Message);
                return false;
            }
        }

        /// <summary>True if the folder contains nothing except ignorable files (".gitkeep", ".DS_Store").</summary>
        /// <param name="projectRelativeFolder">Folder relative to the project root.</param>
        public static bool IsEmptyExceptPlaceholders(string projectRelativeFolder)
        {
            string fullPath = ToFullPath(projectRelativeFolder);
            if (!Directory.Exists(fullPath))
            {
                return false;
            }

            foreach (string entry in Directory.EnumerateFileSystemEntries(fullPath))
            {
                string name = Path.GetFileName(entry);
                if (name != SetupPaths.GitKeepFileName && name != ".DS_Store")
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>True if the folder contains a ".gitkeep" file.</summary>
        /// <param name="projectRelativeFolder">Folder relative to the project root.</param>
        public static bool HasGitKeep(string projectRelativeFolder)
        {
            return File.Exists(Path.Combine(ToFullPath(projectRelativeFolder), SetupPaths.GitKeepFileName));
        }

        /// <summary>
        /// Writes an empty ".gitkeep" into the folder if it is missing. Unity ignores files starting with a dot,
        /// so no .meta file is created, and Git keeps the otherwise empty folder (and with it the folder's .meta file).
        /// </summary>
        /// <param name="projectRelativeFolder">Folder relative to the project root.</param>
        /// <param name="log">Protocol. May be null.</param>
        /// <returns>True if a file was written.</returns>
        public static bool WriteGitKeep(string projectRelativeFolder, SetupLog log)
        {
            if (HasGitKeep(projectRelativeFolder))
            {
                return false;
            }

            try
            {
                File.WriteAllText(Path.Combine(ToFullPath(projectRelativeFolder), SetupPaths.GitKeepFileName), string.Empty);
                log?.Info(".gitkeep angelegt: " + projectRelativeFolder + "/" + SetupPaths.GitKeepFileName);
                return true;
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException)
            {
                log?.Error(".gitkeep in " + projectRelativeFolder + " konnte nicht geschrieben werden: " + exception.Message);
                return false;
            }
        }
    }
}
