using System.IO;
using System.Runtime.CompilerServices;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>
    /// Finds files below <c>Assets/_Project</c> in Unity (working directory = project root) and outside of Unity (path of
    /// this source file), for tests that check the UI text assets (USS, UXML, TSS).
    /// </summary>
    public static class ProjectFiles
    {
        /// <summary>Full path of <c>Assets/_Project</c>.</summary>
        /// <param name="sourceFile">Filled by the compiler; do not pass.</param>
        public static string ProjectFolder([CallerFilePath] string sourceFile = "")
        {
            string fromSource = string.IsNullOrEmpty(sourceFile)
                ? null
                : Path.GetDirectoryName(Path.GetDirectoryName(Path.GetDirectoryName(sourceFile)));
            if (fromSource != null && Directory.Exists(Path.Combine(fromSource, "Art", "UI")))
            {
                return fromSource;
            }

            return Path.Combine(Directory.GetCurrentDirectory(), "Assets", "_Project");
        }

        /// <summary>Full path of a file below <c>Assets/_Project</c>.</summary>
        /// <param name="relativePath">Path with forward slashes, e.g. <c>Art/UI/Styles/Tokens.uss</c>.</param>
        public static string Get(string relativePath)
        {
            return Path.Combine(ProjectFolder(), relativePath.Replace('/', Path.DirectorySeparatorChar));
        }

        /// <summary>Reads a file below <c>Assets/_Project</c> as text (line ends normalized to LF).</summary>
        /// <param name="relativePath">Path with forward slashes.</param>
        public static string Read(string relativePath)
        {
            return File.ReadAllText(Get(relativePath)).Replace("\r\n", "\n");
        }
    }
}
