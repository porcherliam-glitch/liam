using System.IO;
using System.Runtime.CompilerServices;
using Aetherfall.World.Dungeons;

namespace Aetherfall.Tests.EditMode.Gruft
{
    /// <summary>
    /// Reads the real layout file <c>Assets/_Project/Data/Regions/Eichental/gruft_layout.json</c> in Unity (working directory =
    /// project root) and outside of Unity (path of this source file), so the tests check the same file the generator and the
    /// Blender preview use.
    /// </summary>
    public static class GruftLayoutFile
    {
        /// <summary>Project-relative path of the layout.</summary>
        public const string ProjectPath = "Assets/_Project/Data/Regions/Eichental/gruft_layout.json";

        /// <summary>Full path of the layout file.</summary>
        /// <param name="sourceFile">Filled by the compiler; do not pass.</param>
        public static string GetPath([CallerFilePath] string sourceFile = "")
        {
            if (!string.IsNullOrEmpty(sourceFile))
            {
                // .../Assets/_Project/Tests/EditModeGruft/GruftLayoutFile.cs -> .../Assets/_Project
                string project = Path.GetDirectoryName(Path.GetDirectoryName(Path.GetDirectoryName(sourceFile)));
                string candidate = Path.Combine(project ?? string.Empty, "Data", "Regions", "Eichental", "gruft_layout.json");
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            string fromWorkingDirectory = Path.Combine(Directory.GetCurrentDirectory(), ProjectPath);
            if (File.Exists(fromWorkingDirectory))
            {
                return fromWorkingDirectory;
            }

            throw new FileNotFoundException("gruft_layout.json not found (source '" + sourceFile + "', working directory '" +
                                            Directory.GetCurrentDirectory() + "').");
        }

        /// <summary>Reads the file text.</summary>
        /// <param name="sourceFile">Filled by the compiler; do not pass.</param>
        public static string ReadText([CallerFilePath] string sourceFile = "")
        {
            return File.ReadAllText(GetPath(sourceFile));
        }

        /// <summary>Reads and maps the layout.</summary>
        /// <param name="sourceFile">Filled by the compiler; do not pass.</param>
        public static DungeonLayout Load([CallerFilePath] string sourceFile = "")
        {
            return DungeonLayoutReader.Read(ReadText(sourceFile));
        }
    }
}
