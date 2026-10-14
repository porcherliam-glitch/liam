using System.IO;
using System.Runtime.CompilerServices;
using Aetherfall.World;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.World
{
    /// <summary>
    /// Reads the real layout file <c>Assets/_Project/Data/Regions/Eichental/eichental_layout.json</c>, in Unity (working directory
    /// = project root) and outside of Unity (path of this source file).
    /// </summary>
    public static class LayoutTestFiles
    {
        /// <summary>Project-relative path of the Eichental layout.</summary>
        public const string EichentalPath = "Assets/_Project/Data/Regions/Eichental/eichental_layout.json";

        /// <summary>Text of the Eichental layout.</summary>
        /// <param name="sourceFile">Filled by the compiler; do not pass.</param>
        public static string ReadEichental([CallerFilePath] string sourceFile = "")
        {
            string fromSource = string.IsNullOrEmpty(sourceFile)
                ? null
                : Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(Path.GetDirectoryName(sourceFile))) ?? string.Empty,
                    "Data", "Regions", "Eichental", "eichental_layout.json");
            if (fromSource != null && File.Exists(fromSource))
            {
                return File.ReadAllText(fromSource);
            }

            string fromWorkingDirectory = Path.Combine(Directory.GetCurrentDirectory(), EichentalPath);
            if (File.Exists(fromWorkingDirectory))
            {
                return File.ReadAllText(fromWorkingDirectory);
            }

            throw new FileNotFoundException("Layout not found (tried '" + fromSource + "' and '" + fromWorkingDirectory + "').");
        }

        /// <summary>Reads and validates the Eichental layout; fails the test on any finding.</summary>
        public static RegionLayout LoadEichental()
        {
            var report = new LayoutReport();
            RegionLayout layout = RegionLayoutValidator.ReadAndValidate(ReadEichental(), report);
            Assert.That(layout, Is.Not.Null, Describe(report));
            Assert.That(report.Issues, Is.Empty, Describe(report));
            return layout;
        }

        /// <summary>All findings as text (assert message).</summary>
        /// <param name="report">Report.</param>
        public static string Describe(LayoutReport report)
        {
            var text = new System.Text.StringBuilder();
            for (int i = 0; i < report.Issues.Count; i++)
            {
                text.Append(report.Issues[i]).Append('\n');
            }

            return text.ToString();
        }
    }
}
