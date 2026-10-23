using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;
using Aetherfall.Cinematics;
using Aetherfall.Conditions;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Quests;
using Aetherfall.World;
using Aetherfall.WorldState;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// The prologue cutscene of the mini slice (S58): stage s10 of "Asche über Eichental" plays it, and its script built from the
    /// real Eichental layout passes every check and hands over to the exploration camera.
    /// </summary>
    [TestFixture]
    public sealed class MiniSliceCutsceneTests
    {
        private static readonly ExploreRestPose Rest = new ExploreRestPose(4.0, 1.6, 15.0, 55.0, -0.04);

        [Test]
        public void PrologueStageS10_SetsTheFlagThenPlaysTheCutscene()
        {
            StageDefinition s10 = Stage(MiniSliceQuestLibrary.CreatePrologue(), "s10");

            Assert.That(s10.OnStart, Has.Count.EqualTo(2));
            var flag = s10.OnStart[0] as SetFlag;
            Assert.That(flag, Is.Not.Null);
            Assert.That(flag.FlagId, Is.EqualTo(MiniSliceQuestLibrary.FlagVillageDestroyed));
            Assert.That(flag.Value, Is.EqualTo(1));
            var cutscene = s10.OnStart[1] as PlayCutscene;
            Assert.That(cutscene, Is.Not.Null);
            Assert.That(cutscene.CutsceneId, Is.EqualTo(CutsceneIds.PrologueAwakening));
        }

        [Test]
        public void EveryCutsceneOfTheQuests_IsAKnownId()
        {
            var known = new HashSet<string>(CutsceneIds.All, StringComparer.Ordinal);
            int found = 0;
            foreach (QuestSpec quest in MiniSliceQuestLibrary.CreateQuests())
            {
                foreach (StageDefinition stage in quest.Stages)
                {
                    foreach (GameAction action in Concat(stage.OnStart, stage.OnComplete))
                    {
                        if (action is PlayCutscene cutscene)
                        {
                            found++;
                            Assert.That(known.Contains(cutscene.CutsceneId), Is.True, quest.Id + "/" + stage.Id + ": " + cutscene.CutsceneId);
                        }
                    }
                }
            }

            Assert.That(found, Is.GreaterThanOrEqualTo(1));
        }

        [Test]
        public void PrologueScript_OnTheRealLayout_PassesEveryCheck()
        {
            RegionLayout layout = LoadEichental();
            CutsceneScript script = EichentalCutscenes.Prologue(layout, new LayoutHeightField(layout), Rest);

            Assert.That(CutsceneScriptRules.Check(script), Is.Empty, string.Join("\n", CutsceneScriptRules.Check(script)));
            Assert.That(script.Id, Is.EqualTo(CutsceneIds.PrologueAwakening));
            Assert.That(script.Duration, Is.EqualTo(EichentalCutscenes.PrologueDuration));
            Assert.That(script.Shots, Has.Count.EqualTo(5));
            Assert.That(script.Activations, Has.Count.EqualTo(1));
            Assert.That(script.Activations[0].TargetKey, Is.EqualTo(EichentalCutscenes.LightColumnKey));
        }

        [Test]
        public void PrologueScript_EndsInTheRestPoseOfTheExplorationCamera()
        {
            RegionLayout layout = LoadEichental();
            var heights = new LayoutHeightField(layout);
            CutsceneScript script = EichentalCutscenes.Prologue(layout, heights, Rest);
            CutsceneShot last = script.Shots[script.Shots.Count - 1];
            LayoutPoint start = layout.PlayerStart.Position;
            double yaw = layout.PlayerStart.Yaw * Math.PI / 180d;
            var feet = new CinePoint(start.X, heights.Height(start.X, start.Z) + EichentalCutscenes.SpawnLift, start.Z);
            CinePose expected = Rest.PoseFor(feet, new CinePoint(Math.Sin(yaw), 0d, Math.Cos(yaw)));
            CinePose end = last.PoseAt(script.Duration);

            Assert.That(CinePoint.Distance(end.Position, expected.Position), Is.LessThan(1e-6));
            Assert.That(CinePoint.Distance(end.LookAt, expected.LookAt), Is.LessThan(1e-6));
            Assert.That(end.FieldOfView, Is.EqualTo(55d));
            Assert.That(end.Dutch, Is.Zero);
        }

        [Test]
        public void RestPose_SitsOnTheOrbitBehindThePlayer_AndLooksPastThePivot()
        {
            var feet = new CinePoint(10d, 2d, 20d);
            var north = new CinePoint(0d, 0d, 1d);

            CinePose pose = Rest.PoseFor(feet, north);

            var pivot = new CinePoint(10d, 3.6d, 20d);
            Assert.That(CinePoint.Distance(pose.Position, pivot), Is.EqualTo(4d).Within(1e-9));
            Assert.That(pose.Position.Z, Is.LessThan(20d), "behind the player");
            Assert.That(pose.Position.Y - pivot.Y, Is.EqualTo(4d * Math.Sin(15d * Math.PI / 180d)).Within(1e-9));
            Assert.That(pose.LookAt.X, Is.GreaterThan(10d), "the pivot sits left of the centre, so the camera looks to its right");
            Assert.That(pose.LookAt.Y, Is.EqualTo(pivot.Y).Within(1e-9));
        }

        private static StageDefinition Stage(QuestSpec quest, string stageId)
        {
            foreach (StageDefinition stage in quest.Stages)
            {
                if (stage.Id == stageId)
                {
                    return stage;
                }
            }

            Assert.Fail(quest.Id + " has no stage " + stageId);
            return null;
        }

        private static IEnumerable<GameAction> Concat(IReadOnlyList<GameAction> first, IReadOnlyList<GameAction> second)
        {
            foreach (GameAction action in first)
            {
                yield return action;
            }

            foreach (GameAction action in second)
            {
                yield return action;
            }
        }

        private static RegionLayout LoadEichental([CallerFilePath] string sourceFile = "")
        {
            string fromSource = string.IsNullOrEmpty(sourceFile)
                ? null
                : Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(Path.GetDirectoryName(sourceFile))) ?? string.Empty,
                    "Data", "Regions", "Eichental", "eichental_layout.json");
            string path = fromSource != null && File.Exists(fromSource)
                ? fromSource
                : Path.Combine(Directory.GetCurrentDirectory(), "Assets/_Project/Data/Regions/Eichental/eichental_layout.json");
            var report = new LayoutReport();
            RegionLayout layout = RegionLayoutValidator.ReadAndValidate(File.ReadAllText(path), report);
            Assert.That(layout, Is.Not.Null, "layout " + path);
            return layout;
        }
    }
}
