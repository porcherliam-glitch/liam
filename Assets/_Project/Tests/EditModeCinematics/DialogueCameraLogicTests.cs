using System.Collections.Generic;
using Aetherfall.Cinematics;
using Aetherfall.Dialogue;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Cinematics
{
    /// <summary>Cutting rules, framing and blends of the dialogue camera (S58, GDD 02 12.6, GDD 03 "Dialogkamera").</summary>
    [TestFixture]
    public sealed class DialogueCameraLogicTests
    {
        private static readonly CinePoint Player = new CinePoint(0d, 0d, 0d);
        private static readonly CinePoint Partner = new CinePoint(0d, 0d, 2d);

        [Test]
        public void Planner_OpensOnTheTwoShot_AndCutsToTheShotAfterOneAndAHalfSeconds()
        {
            var planner = new DialogueShotPlanner();
            planner.Begin(0d);

            Assert.That(Line(planner, 1, DialogueCameraHint.Auto, 0d), Is.False);
            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.Wide));
            Assert.That(Line(planner, 1, DialogueCameraHint.Auto, 1.4d), Is.False);
            Assert.That(Line(planner, 1, DialogueCameraHint.Auto, 1.5d), Is.True);
            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.Shot));
        }

        [Test]
        public void Planner_OpeningHint_HoldsTheTwoShotTwoAndAHalfSeconds()
        {
            var planner = new DialogueShotPlanner();
            planner.Begin(0d);

            Line(planner, 1, DialogueCameraHint.Opening, 0d);
            Assert.That(Line(planner, 1, DialogueCameraHint.Opening, 2.4d), Is.False);
            Assert.That(Line(planner, 1, DialogueCameraHint.Opening, 2.5d), Is.True);
            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.Shot));
        }

        [TestCase(DialogueCameraHint.Close, DialogueSetup.Close)]
        [TestCase(DialogueCameraHint.Wide, DialogueSetup.Wide)]
        [TestCase(DialogueCameraHint.Object, DialogueSetup.Wide)]
        [TestCase(DialogueCameraHint.OverShoulder, DialogueSetup.Shot)]
        [TestCase(DialogueCameraHint.Auto, DialogueSetup.Shot)]
        public void Planner_MapsTheHintsOfTheLines(DialogueCameraHint hint, DialogueSetup expected)
        {
            var planner = new DialogueShotPlanner();
            planner.Begin(0d);
            Line(planner, 1, DialogueCameraHint.Auto, 0d);
            Line(planner, 1, DialogueCameraHint.Auto, 2d);
            Line(planner, 2, DialogueCameraHint.Auto, 4d);

            Line(planner, 3, hint, 6d);

            Assert.That(planner.Current, Is.EqualTo(expected));
        }

        [Test]
        public void Planner_Choice_IsTheReverseShot_OrTheListeningCloseUp()
        {
            var planner = new DialogueShotPlanner();
            planner.Begin(0d);
            planner.Update(1, true, DialogueCameraHint.Auto, DialogueSpeaker.Partner, ChoiceFraming.ReverseShot, 2d);
            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.ReverseShot));

            var listening = new DialogueShotPlanner();
            listening.Begin(0d);
            listening.Update(1, true, DialogueCameraHint.Auto, DialogueSpeaker.Partner, ChoiceFraming.ListeningCloseUp, 2d);
            Assert.That(listening.Current, Is.EqualTo(DialogueSetup.Close));
        }

        [Test]
        public void Planner_PlayerLine_IsTheReverseShot_ThirdSpeakerTheTwoShot()
        {
            var planner = new DialogueShotPlanner();
            planner.Begin(0d);
            planner.Update(1, false, DialogueCameraHint.Auto, DialogueSpeaker.Player, ChoiceFraming.ReverseShot, 2d);
            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.ReverseShot));

            planner.Update(2, false, DialogueCameraHint.Auto, DialogueSpeaker.Other, ChoiceFraming.ReverseShot, 4d);
            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.Wide));
        }

        [Test]
        public void Planner_TooEarlyCut_WaitsInsideItsLine_AndIsDroppedByTheNextLine()
        {
            var planner = new DialogueShotPlanner();
            planner.Begin(0d);
            Line(planner, 1, DialogueCameraHint.Auto, 1.5d);
            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.Shot));

            Assert.That(Line(planner, 2, DialogueCameraHint.Wide, 2.3d), Is.False, "0.8 s after the cut");
            Assert.That(Line(planner, 2, DialogueCameraHint.Wide, 3.0d), Is.True, "the waiting cut comes at 1.5 s");
            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.Wide));

            Assert.That(Line(planner, 3, DialogueCameraHint.Close, 3.5d), Is.False);
            Assert.That(Line(planner, 4, DialogueCameraHint.Wide, 4.0d), Is.False, "the next line wants the two-shot again: the close-up is dropped");
            Assert.That(Line(planner, 4, DialogueCameraHint.Wide, 9.0d), Is.False);
            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.Wide));
        }

        [Test]
        public void Planner_NeverCutsTwiceInOneLine()
        {
            var planner = new DialogueShotPlanner();
            planner.Begin(0d);
            Line(planner, 1, DialogueCameraHint.Auto, 2d);

            int cuts = 0;
            for (double t = 2d; t < 10d; t += 0.25d)
            {
                if (planner.Update(1, t > 5d, DialogueCameraHint.Auto, DialogueSpeaker.Partner, ChoiceFraming.ReverseShot, t))
                {
                    cuts++;
                }
            }

            Assert.That(cuts, Is.Zero, "beat 1 already cut once");
        }

        [Test]
        public void Planner_FourthAutomaticLineOnTheShot_GoesToTheTwoShot()
        {
            var planner = new DialogueShotPlanner();
            planner.Begin(0d);
            Line(planner, 1, DialogueCameraHint.Auto, 2d);
            Line(planner, 2, DialogueCameraHint.Auto, 4d);
            Line(planner, 3, DialogueCameraHint.Auto, 6d);
            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.Shot));
            Assert.That(planner.BeatsOnSetup, Is.EqualTo(3));

            Line(planner, 4, DialogueCameraHint.Auto, 8d);

            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.Wide));
            Line(planner, 5, DialogueCameraHint.Auto, 10d);
            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.Shot));
        }

        [Test]
        public void Planner_StandsStillWithoutTime()
        {
            var planner = new DialogueShotPlanner();
            planner.Begin(0d);
            for (int i = 0; i < 10; i++)
            {
                Assert.That(Line(planner, 1, DialogueCameraHint.Auto, 1d), Is.False);
            }

            Assert.That(planner.Current, Is.EqualTo(DialogueSetup.Wide));
        }

        [TestCase(1)]
        [TestCase(-1)]
        public void Framing_AllSetupsStayOnOneSideOfTheAxis(int side)
        {
            foreach (DialogueSetup setup in new[] { DialogueSetup.Shot, DialogueSetup.ReverseShot, DialogueSetup.Close, DialogueSetup.Wide })
            {
                CinePose pose = DialogueFraming.Pose(setup, Player, Partner, side);
                Assert.That(DialogueFraming.SideOf(pose.Position, Player, Partner), Is.EqualTo(side), setup.ToString());
            }
        }

        [Test]
        public void Framing_DistancesAndFieldsOfViewFollowGdd03()
        {
            var playerHead = new CinePoint(0d, 1.6d, 0d);
            var partnerHead = new CinePoint(0d, 1.6d, 2d);

            CinePose shot = DialogueFraming.Pose(DialogueSetup.Shot, Player, Partner, 1);
            CinePose reverse = DialogueFraming.Pose(DialogueSetup.ReverseShot, Player, Partner, 1);
            CinePose close = DialogueFraming.Pose(DialogueSetup.Close, Player, Partner, 1);
            CinePose wide = DialogueFraming.Pose(DialogueSetup.Wide, Player, Partner, 1);

            Assert.That(shot.Position.Z, Is.EqualTo(-1.4d).Within(1e-9), "1.4 m behind the player");
            Assert.That(CinePoint.Distance(shot.LookAt, partnerHead), Is.LessThan(1e-9));
            Assert.That(reverse.Position.Z, Is.EqualTo(3.4d).Within(1e-9));
            Assert.That(CinePoint.Distance(reverse.LookAt, playerHead), Is.LessThan(1e-9));
            Assert.That(CinePoint.Distance(close.Position, partnerHead), Is.EqualTo(0.9d).Within(1e-9));
            Assert.That(close.Position.Z, Is.LessThan(2d), "in front of the partner's face");
            Assert.That(wide.Position.X, Is.GreaterThanOrEqualTo(3.5d), "at least 3.5 m to the side");
            Assert.That(BothInWideFrame(wide, playerHead, partnerHead), Is.True);
            Assert.That(shot.FieldOfView, Is.EqualTo(36d));
            Assert.That(reverse.FieldOfView, Is.EqualTo(36d));
            Assert.That(close.FieldOfView, Is.EqualTo(32d));
            Assert.That(wide.FieldOfView, Is.EqualTo(40d));
        }

        [TestCase(5d)]
        [TestCase(8d)]
        public void Framing_PartnerFartherThanFourMetres_OnlyTheTwoShot_WithBothInTheFrame(double metres)
        {
            var far = new CinePoint(0d, 0d, metres);

            CinePose shot = DialogueFraming.Pose(DialogueSetup.Shot, Player, far, 1);

            Assert.That(shot.FieldOfView, Is.EqualTo(40d), "only the two-shot");
            Assert.That(BothInWideFrame(shot, new CinePoint(0d, 1.6d, 0d), new CinePoint(0d, 1.6d, metres)), Is.True,
                "both people inside the picture, also at 4:3");
        }

        /// <summary>True if both heads lie inside the horizontal view of a 4:3 picture with half a metre to spare.</summary>
        private static bool BothInWideFrame(CinePose pose, CinePoint first, CinePoint second)
        {
            double halfTangent = System.Math.Tan(pose.FieldOfView * System.Math.PI / 360d) * 4d / 3d;
            CinePoint forward = (pose.LookAt - pose.Position).Normalized;
            foreach (CinePoint head in new[] { first, second })
            {
                CinePoint toHead = head - pose.Position;
                double depth = CinePoint.Dot(toHead, forward);
                double sideways = System.Math.Abs(CinePoint.Dot(toHead, CinePoint.Cross(CinePoint.Up, forward).Normalized));
                if (depth <= 0d || (sideways + 0.5d) / depth > halfTangent)
                {
                    return false;
                }
            }

            return true;
        }

        [Test]
        public void Framing_SideFollowsTheGameCamera_AndFlipsOnlyIfThatSideIsBlocked()
        {
            var cameraLeft = new CinePoint(-3d, 2d, 1d);
            var cameraRight = new CinePoint(3d, 2d, 1d);

            Assert.That(DialogueFraming.ChooseSide(cameraRight, Player, Partner, pose => false), Is.EqualTo(1));
            Assert.That(DialogueFraming.ChooseSide(cameraLeft, Player, Partner, pose => false), Is.EqualTo(-1));
            Assert.That(DialogueFraming.ChooseSide(cameraRight, Player, Partner, pose => pose.Position.X > 0d), Is.EqualTo(-1), "right blocked, left free");
            Assert.That(DialogueFraming.ChooseSide(cameraRight, Player, Partner, pose => true), Is.EqualTo(1), "both blocked: stay");
        }

        [Test]
        public void Framing_CandidatesFollowTheFallbackOrder()
        {
            var result = new List<KeyValuePair<DialogueSetup, CinePose>>();

            DialogueFraming.Candidates(DialogueSetup.Shot, Player, Partner, 1, result);
            Assert.That(Setups(result), Is.EqualTo(new[] { DialogueSetup.Shot, DialogueSetup.Shot, DialogueSetup.Wide, DialogueSetup.Close }));
            Assert.That(result[1].Value.Position.Y - result[0].Value.Position.Y, Is.EqualTo(0.4d).Within(1e-9));

            DialogueFraming.Candidates(DialogueSetup.ReverseShot, Player, Partner, 1, result);
            Assert.That(Setups(result), Is.EqualTo(new[] { DialogueSetup.ReverseShot, DialogueSetup.ReverseShot, DialogueSetup.Close, DialogueSetup.Wide }));
        }

        [TestCase(CinematicCameraRole.Gameplay, CinematicCameraRole.Dialogue, CinematicBlendKind.Ease)]
        [TestCase(CinematicCameraRole.Dialogue, CinematicCameraRole.Dialogue, CinematicBlendKind.Cut)]
        [TestCase(CinematicCameraRole.Dialogue, CinematicCameraRole.Gameplay, CinematicBlendKind.Ease)]
        [TestCase(CinematicCameraRole.Gameplay, CinematicCameraRole.Gameplay, CinematicBlendKind.Default)]
        public void BlendRules_EaseIntoAndOut_CutInBetween(CinematicCameraRole from, CinematicCameraRole to, CinematicBlendKind expected)
        {
            CinematicBlend blend = CinematicBlendRules.Choose(from, to);

            Assert.That(blend.Kind, Is.EqualTo(expected));
            if (expected == CinematicBlendKind.Ease)
            {
                Assert.That(blend.Seconds, Is.EqualTo(0.4f));
            }
        }

        private static bool Line(DialogueShotPlanner planner, int beat, DialogueCameraHint hint, double now)
        {
            return planner.Update(beat, false, hint, DialogueSpeaker.Partner, ChoiceFraming.ReverseShot, now);
        }

        private static DialogueSetup[] Setups(List<KeyValuePair<DialogueSetup, CinePose>> candidates)
        {
            var setups = new DialogueSetup[candidates.Count];
            for (int i = 0; i < candidates.Count; i++)
            {
                setups[i] = candidates[i].Key;
            }

            return setups;
        }
    }
}
