using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>
    /// The scenes and the generated mesh libraries (<c>Art/Models/Generated</c>) belong together: a generator run writes both, and
    /// every mesh a scene points to must exist in the library. If only one of the two is reverted or committed, the buildings of
    /// the Eichental are invisible while their kit doors and windows still stand (happened once, found on a screenshot).
    /// </summary>
    [TestFixture]
    public sealed class GeneratedAssetReferenceTests
    {
        private static readonly Regex GuidRegex = new Regex(@"^guid: ([0-9a-f]{32})", RegexOptions.Compiled | RegexOptions.Multiline);
        private static readonly Regex ObjectRegex = new Regex(@"^--- !u!\d+ &(-?\d+)", RegexOptions.Compiled | RegexOptions.Multiline);

        [Test]
        public void Scenes_PointOnlyToMeshesThatExistInTheGeneratedLibraries()
        {
            string generated = ProjectFiles.Get("Art/Models/Generated");
            if (!Directory.Exists(generated))
            {
                Assert.Ignore("No generated mesh libraries yet.");
            }

            var libraries = new Dictionary<string, HashSet<string>>();
            foreach (string meta in Directory.GetFiles(generated, "*.asset.meta", SearchOption.AllDirectories))
            {
                Match guid = GuidRegex.Match(File.ReadAllText(meta));
                if (!guid.Success)
                {
                    continue;
                }

                var ids = new HashSet<string>();
                foreach (Match match in ObjectRegex.Matches(File.ReadAllText(meta.Substring(0, meta.Length - ".meta".Length))))
                {
                    ids.Add(match.Groups[1].Value);
                }

                libraries[guid.Groups[1].Value] = ids;
            }

            int checkedReferences = 0;
            foreach (string scene in Directory.GetFiles(ProjectFiles.Get("Scenes"), "*.unity", SearchOption.AllDirectories))
            {
                string text = File.ReadAllText(scene);
                foreach (KeyValuePair<string, HashSet<string>> library in libraries)
                {
                    foreach (Match reference in Regex.Matches(text, @"fileID: (-?\d+), guid: " + library.Key))
                    {
                        checkedReferences++;
                        Assert.That(library.Value.Contains(reference.Groups[1].Value), Is.True,
                            Path.GetFileName(scene) + " points to mesh " + reference.Groups[1].Value + ", which the generated library does not contain. " +
                            "Commit (or revert) scene and mesh library together.");
                    }
                }
            }

            Assert.That(checkedReferences, Is.GreaterThan(0), "no scene uses a generated mesh library");
        }
    }
}
