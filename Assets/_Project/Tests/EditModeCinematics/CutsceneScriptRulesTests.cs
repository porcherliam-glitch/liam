using System.Collections.Generic;
using Aetherfall.Cinematics;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Cinematics
{
    /// <summary>The checks of a cutscene script (S58) and the overlay of a moment.</summary>
    [TestFixture]
    public sealed class CutsceneScriptRulesTests
    {
        private static readonly CinePose Near = new CinePose(new CinePoint(0d, 2d, -5d), new CinePoint(0d, 1.5d, 0d), 40d);
        private static readonly CinePose Far = new CinePose(new CinePoint(0d, 4d, -9d), new CinePoint(0d, 1.5d, 0d), 50d);

        [Test]
        public void ValidScript_HasNoFindings()
        {
            Assert.That(CutsceneScriptRules.Check(Valid()), Is.Empty);
        }

        [Test]
        public void MissingScript_IsOneFinding()
        {
            Assert.That(CutsceneScriptRules.Check(null), Has.Count.EqualTo(1));
        }

        [Test]
        public void IdWithoutPrefix_IsOneFinding()
        {
            CutsceneScript script = Valid("prolog.test");

            AssertOne(script, "beginnen");
        }

        [Test]
        public void TooLong_IsOneFinding()
        {
            var script = new CutsceneScript("cs.test.lang", 61d);
            script.Shots.Add(new CutsceneShot("Lang", 0d, 61d, Near));

            AssertOne(script, "Länge");
        }

        [Test]
        public void GapBetweenShots_IsOneFinding()
        {
            CutsceneScript script = Shots(new CutsceneShot("A", 0d, 5d, Near), new CutsceneShot("B", 5.5d, 10d, Far));

            AssertOne(script, "Lücke");
        }

        [Test]
        public void OverlappingShots_IsOneFinding()
        {
            CutsceneScript script = Shots(new CutsceneShot("A", 0d, 5d, Near), new CutsceneShot("B", 4.5d, 10d, Far));

            AssertOne(script, "Überschneidung");
        }

        [Test]
        public void ShotShorterThanOneAndAHalfSeconds_IsOneFinding()
        {
            CutsceneScript script = Shots(new CutsceneShot("A", 0d, 1d, Near), new CutsceneShot("B", 1d, 10d, Far));

            AssertOne(script, "dauert nur");
        }

        [Test]
        public void MoveOutsideItsShot_IsOneFinding()
        {
            CutsceneScript script = Shots(new CutsceneShot("A", 0d, 5d, Near), new CutsceneShot("B", 5d, 10d, Near, Far, 5.5d, 10.5d));

            AssertOne(script, "Kamerafahrt");
        }

        [Test]
        public void BlackShotAtTheEnd_IsOneFinding()
        {
            CutsceneScript script = Shots(new CutsceneShot("A", 0d, 5d, Near), new CutsceneShot("B", 5d, 10d, Far, black: true));

            AssertOne(script, "schwarze Einstellung");
        }

        [Test]
        public void FieldOfViewOutOfRange_IsOneFinding()
        {
            var wide = new CinePose(Near.Position, Near.LookAt, 80d);
            CutsceneScript script = Shots(new CutsceneShot("A", 0d, 5d, wide), new CutsceneShot("B", 5d, 10d, Far));

            AssertOne(script, "Sichtfeld");
        }

        [Test]
        public void SubtitleTooShortToRead_IsOneFinding()
        {
            CutsceneScript script = Valid();
            script.Cues.Add(CutsceneCue.Subtitle(5f, 6f, "Lina", "Ein ziemlich langer Untertitel."));

            AssertOne(script, "zum Lesen");
        }

        [Test]
        public void SubtitleLongerThanOnePage_IsOneFinding()
        {
            CutsceneScript script = Valid();
            string text = new string('a', 40) + " " + new string('b', 40) + " " + new string('c', 38);
            script.Cues.Add(CutsceneCue.Subtitle(0.5f, 9.5f, string.Empty, text));

            AssertOne(script, "Seiten");
        }

        [Test]
        public void CueOutsideTheCutscene_IsOneFinding()
        {
            CutsceneScript script = Valid();
            script.Cues.Add(CutsceneCue.Caption(8f, 11f, "Zu spät."));

            AssertOne(script, "liegt nicht in");
        }

        [Test]
        public void FadeRampsLongerThanTheCue_IsOneFinding()
        {
            CutsceneScript script = Valid();
            script.Cues.Add(CutsceneCue.Fade(2f, 3f, 0.8f, 0.8f, CutsceneFadeColor.White));

            AssertOne(script, "Auf- und Abblende");
        }

        [Test]
        public void PoseAt_MovesLinearlyInsideTheMoveWindow()
        {
            var shot = new CutsceneShot("B", 5d, 10d, Near, Far, 6d, 8d);

            Assert.That(shot.PoseAt(5.5d).Position.Z, Is.EqualTo(-5d));
            Assert.That(shot.PoseAt(7d).Position.Z, Is.EqualTo(-7d).Within(1e-9));
            Assert.That(shot.PoseAt(7d).FieldOfView, Is.EqualTo(45d).Within(1e-9));
            Assert.That(shot.PoseAt(9d).Position.Z, Is.EqualTo(-9d));
        }

        [Test]
        public void Overlay_FadeRisesHoldsAndFalls()
        {
            var cues = new List<CutsceneCue> { CutsceneCue.Fade(0f, 4.5f, 0f, 1f, CutsceneFadeColor.Black) };

            Assert.That(CutsceneOverlayEvaluator.Evaluate(cues, 0d).FadeAlpha, Is.EqualTo(1f));
            Assert.That(CutsceneOverlayEvaluator.Evaluate(cues, 3.5d).FadeAlpha, Is.EqualTo(1f));
            Assert.That(CutsceneOverlayEvaluator.Evaluate(cues, 4d).FadeAlpha, Is.EqualTo(0.5f).Within(1e-4));
            Assert.That(CutsceneOverlayEvaluator.Evaluate(cues, 4.5d).FadeAlpha, Is.Zero, "the end is not part of the cue");
        }

        [Test]
        public void Overlay_TheStrongestVeilWins()
        {
            var cues = new List<CutsceneCue>
            {
                CutsceneCue.Fade(14.2f, 15f, 0.5f, 0f, CutsceneFadeColor.White),
                CutsceneCue.Fade(14.8f, 20f, 0.2f, 1.5f, CutsceneFadeColor.Black)
            };

            CutsceneOverlay flash = CutsceneOverlayEvaluator.Evaluate(cues, 14.9d);
            Assert.That(flash.FadeColor, Is.EqualTo(CutsceneFadeColor.White));
            Assert.That(flash.FadeAlpha, Is.EqualTo(1f));

            CutsceneOverlay black = CutsceneOverlayEvaluator.Evaluate(cues, 15.1d);
            Assert.That(black.FadeColor, Is.EqualTo(CutsceneFadeColor.Black));
            Assert.That(black.FadeAlpha, Is.EqualTo(1f));
            Assert.That(CutsceneOverlayEvaluator.Evaluate(cues, 19.25d).FadeAlpha, Is.EqualTo(0.5f).Within(1e-4));
        }

        [Test]
        public void Overlay_EqualVeils_TheLaterOneWins()
        {
            var cues = new List<CutsceneCue>
            {
                CutsceneCue.Fade(0f, 5f, 0f, 0f, CutsceneFadeColor.Black),
                CutsceneCue.Fade(2f, 5f, 0f, 0f, CutsceneFadeColor.White)
            };

            Assert.That(CutsceneOverlayEvaluator.Evaluate(cues, 3d).FadeColor, Is.EqualTo(CutsceneFadeColor.White));
        }

        [Test]
        public void Overlay_TheNewestCaptionAndSubtitleWin()
        {
            var cues = new List<CutsceneCue>
            {
                CutsceneCue.Caption(0f, 5f, "Erste Tafel"),
                CutsceneCue.Caption(2f, 4f, "Zweite Tafel"),
                CutsceneCue.Subtitle(1f, 5f, "Lina", "Erste Zeile"),
                CutsceneCue.Subtitle(3f, 5f, "Eine Stimme", "Zweite Zeile")
            };

            CutsceneOverlay at35 = CutsceneOverlayEvaluator.Evaluate(cues, 3.5d);
            Assert.That(at35.Caption, Is.EqualTo("Zweite Tafel"));
            Assert.That(at35.Speaker, Is.EqualTo("Eine Stimme"));
            Assert.That(at35.Text, Is.EqualTo("Zweite Zeile"));
            Assert.That(CutsceneOverlayEvaluator.Evaluate(cues, 4.5d).Caption, Is.EqualTo("Erste Tafel"));
        }

        [Test]
        public void Overlay_OutsideEveryCue_IsEmpty()
        {
            var cues = new List<CutsceneCue> { CutsceneCue.Caption(1f, 3f, "Tafel") };

            Assert.That(CutsceneOverlayEvaluator.Evaluate(cues, 5d).SameAs(CutsceneOverlay.Empty), Is.True);
            Assert.That(CutsceneOverlayEvaluator.Evaluate(null, 1d).SameAs(CutsceneOverlay.Empty), Is.True);
        }

        private static CutsceneScript Valid(string id = "cs.test.kurz")
        {
            var script = new CutsceneScript(id, 10d);
            script.Shots.Add(new CutsceneShot("A", 0d, 5d, Near));
            script.Shots.Add(new CutsceneShot("B", 5d, 10d, Near, Far, 5.5d, 9.5d));
            script.Cues.Add(CutsceneCue.Fade(0f, 2f, 0f, 1f, CutsceneFadeColor.Black));
            script.Cues.Add(CutsceneCue.Caption(0.5f, 4f, "Kurzer Text."));
            script.Cues.Add(CutsceneCue.Subtitle(5f, 9f, "Lina", "Ein Satz."));
            script.Activations.Add(new CutsceneActivation("Licht", 5d, 9d));
            return script;
        }

        private static CutsceneScript Shots(params CutsceneShot[] shots)
        {
            var script = new CutsceneScript("cs.test.einstellungen", 10d);
            script.Shots.AddRange(shots);
            return script;
        }

        private static void AssertOne(CutsceneScript script, string fragment)
        {
            List<string> findings = CutsceneScriptRules.Check(script);
            Assert.That(findings, Has.Count.EqualTo(1), string.Join("\n", findings));
            StringAssert.Contains(fragment, findings[0]);
        }
    }
}
