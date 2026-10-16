using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.UI
{
    /// <summary>
    /// The generated cutscene Timelines (<c>Art/Animations/Cinematics</c>, S58) and the world scenes belong together like the mesh
    /// libraries: a scene's director points to its Timeline, binds the Timeline's tracks by their object id and resolves every
    /// camera name of its shots. If only one of the two is committed or reverted, the cutscene plays without cameras or not at all.
    /// </summary>
    [TestFixture]
    public sealed class CutsceneAssetReferenceTests
    {
        private const string TimelineFolder = "Art/Animations/Cinematics";

        private static readonly Regex GuidRegex = new Regex(@"^guid: ([0-9a-f]{32})", RegexOptions.Compiled | RegexOptions.Multiline);
        private static readonly Regex ObjectRegex = new Regex(@"^--- !u!\d+ &(-?\d+)", RegexOptions.Compiled | RegexOptions.Multiline);
        private static readonly Regex ExposedNameRegex = new Regex(@"^\s*exposedName: (.+?)\s*$", RegexOptions.Compiled | RegexOptions.Multiline);
        private static readonly Regex DirectorRegex = new Regex(@"m_PlayableAsset: \{fileID: 11400000, guid: ([0-9a-f]{32})", RegexOptions.Compiled);

        [Test]
        public void Scenes_PlayOnlyTimelinesThatExist()
        {
            HashSet<string> timelines = TimelineGuids();
            int references = 0;
            foreach (string scene in Directory.GetFiles(ProjectFiles.Get("Scenes"), "*.unity", SearchOption.AllDirectories))
            {
                foreach (Match director in DirectorRegex.Matches(File.ReadAllText(scene)))
                {
                    references++;
                    Assert.That(timelines.Contains(director.Groups[1].Value), Is.True,
                        Path.GetFileName(scene) + " plays Timeline " + director.Groups[1].Value + ", which is missing in " + TimelineFolder +
                        ". Commit (or revert) scene and Timeline together.");
                }
            }

            if (references == 0 && timelines.Count == 0)
            {
                Assert.Ignore("No cutscene Timelines yet.");
            }
        }

        [Test]
        public void Scenes_BindOnlyTracksAndCamerasThatTheTimelinesContain()
        {
            string folder = ProjectFiles.Get(TimelineFolder);
            if (!Directory.Exists(folder) || Directory.GetFiles(folder, "*.playable").Length == 0)
            {
                Assert.Ignore("No generated cutscene Timelines yet.");
            }

            int timelinesInScenes = 0;
            foreach (string playable in Directory.GetFiles(folder, "*.playable"))
            {
                Match guid = GuidRegex.Match(File.ReadAllText(playable + ".meta"));
                Assert.That(guid.Success, Is.True, Path.GetFileName(playable) + ".meta has no guid");
                string timeline = File.ReadAllText(playable);
                var objects = new HashSet<string>();
                foreach (Match match in ObjectRegex.Matches(timeline))
                {
                    objects.Add(match.Groups[1].Value);
                }

                var cameraNames = new HashSet<string>();
                foreach (Match match in ExposedNameRegex.Matches(timeline))
                {
                    cameraNames.Add(match.Groups[1].Value);
                }

                foreach (string scene in Directory.GetFiles(ProjectFiles.Get("Scenes"), "*.unity", SearchOption.AllDirectories))
                {
                    string text = File.ReadAllText(scene);
                    if (!text.Contains("m_PlayableAsset: {fileID: 11400000, guid: " + guid.Groups[1].Value))
                    {
                        continue;
                    }

                    timelinesInScenes++;
                    string label = Path.GetFileName(scene) + " / " + Path.GetFileName(playable);
                    foreach (Match binding in Regex.Matches(text, @"key: \{fileID: (-?\d+), guid: " + guid.Groups[1].Value))
                    {
                        Assert.That(objects.Contains(binding.Groups[1].Value), Is.True,
                            label + ": the scene binds track " + binding.Groups[1].Value + ", which the Timeline does not contain. " +
                            "Commit (or revert) scene and Timeline together.");
                    }

                    foreach (string camera in cameraNames)
                    {
                        Assert.That(text.Contains("- " + camera + ": {fileID: "), Is.True,
                            label + ": no camera for the shot " + camera + " in the director's references.");
                    }
                }
            }

            Assert.That(timelinesInScenes, Is.GreaterThan(0), "no scene plays a generated cutscene Timeline");
        }

        private static HashSet<string> TimelineGuids()
        {
            var guids = new HashSet<string>();
            string folder = ProjectFiles.Get(TimelineFolder);
            if (!Directory.Exists(folder))
            {
                return guids;
            }

            foreach (string meta in Directory.GetFiles(folder, "*.playable.meta"))
            {
                Match guid = GuidRegex.Match(File.ReadAllText(meta));
                if (guid.Success)
                {
                    guids.Add(guid.Groups[1].Value);
                }
            }

            return guids;
        }
    }
}
