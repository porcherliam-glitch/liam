using System.IO;
using System.Runtime.CompilerServices;

namespace Aetherfall.Tests.Shared
{
    /// <summary>
    /// Reads test data files from <c>Assets/_Project/Tests/TestData/</c> (golden saves, architecture 9.5), in Unity
    /// (working directory = project root) and outside of Unity (path of this source file).
    /// </summary>
    public static class TestDataFiles
    {
        /// <summary>Project-relative folder of the test data.</summary>
        public const string ProjectRelativeFolder = "Assets/_Project/Tests/TestData";

        /// <summary>Full path of a test data file.</summary>
        /// <param name="relativePath">Path below TestData, e.g. <c>Saves/v1/golden_v1.sav.json</c>.</param>
        /// <param name="sourceFile">Filled by the compiler; do not pass.</param>
        /// <exception cref="FileNotFoundException">The file exists in none of the candidate folders.</exception>
        public static string GetPath(string relativePath, [CallerFilePath] string sourceFile = "")
        {
            string fromSource = string.IsNullOrEmpty(sourceFile)
                ? null
                : Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(sourceFile)) ?? string.Empty, "TestData", relativePath);
            if (fromSource != null && File.Exists(fromSource))
            {
                return fromSource;
            }

            string fromWorkingDirectory = Path.Combine(Directory.GetCurrentDirectory(), ProjectRelativeFolder, relativePath);
            if (File.Exists(fromWorkingDirectory))
            {
                return fromWorkingDirectory;
            }

            throw new FileNotFoundException("Test data '" + relativePath + "' not found (tried '" + fromSource + "' and '" + fromWorkingDirectory + "').");
        }

        /// <summary>Reads a test data file as bytes.</summary>
        /// <param name="relativePath">Path below TestData.</param>
        /// <param name="sourceFile">Filled by the compiler; do not pass.</param>
        public static byte[] ReadAllBytes(string relativePath, [CallerFilePath] string sourceFile = "")
        {
            return File.ReadAllBytes(GetPath(relativePath, sourceFile));
        }

        /// <summary>Reads a test data file as text with line ends normalized to LF (Git may check it out with CRLF).</summary>
        /// <param name="relativePath">Path below TestData.</param>
        /// <param name="sourceFile">Filled by the compiler; do not pass.</param>
        public static string ReadAllText(string relativePath, [CallerFilePath] string sourceFile = "")
        {
            return File.ReadAllText(GetPath(relativePath, sourceFile)).Replace("\r\n", "\n");
        }
    }
}
