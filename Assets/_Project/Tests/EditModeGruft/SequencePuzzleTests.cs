using Aetherfall.World.Puzzles;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gruft
{
    /// <summary>
    /// The grave-slab puzzle (GDD 02 11.7: "Eiche → Krone → Schild", wrong order = arrow trap and the slabs spring back) and the
    /// fairness hint after 120 s (GDD 01 6.7).
    /// </summary>
    [TestFixture]
    public sealed class SequencePuzzleTests
    {
        private const string Oak = "obj.eichental.gruft_grabplatte_eiche";
        private const string Crown = "obj.eichental.gruft_grabplatte_krone";
        private const string Shield = "obj.eichental.gruft_grabplatte_schild";

        private static SequencePuzzle Create()
        {
            return new SequencePuzzle(new[] { Oak, Crown, Shield });
        }

        [Test]
        public void RightOrderSolvesThePuzzle()
        {
            SequencePuzzle puzzle = Create();

            Assert.That(puzzle.Press(Oak), Is.EqualTo(SequenceStepResult.Progressed));
            Assert.That(puzzle.Press(Crown), Is.EqualTo(SequenceStepResult.Progressed));
            Assert.That(puzzle.Press(Shield), Is.EqualTo(SequenceStepResult.Solved));
            Assert.That(puzzle.IsSolved, Is.True);
            Assert.That(puzzle.FailedAttempts, Is.EqualTo(0));
        }

        [Test]
        public void WrongSlabFailsAndResetsTheAttempt()
        {
            SequencePuzzle puzzle = Create();
            puzzle.Press(Oak);

            Assert.That(puzzle.Press(Shield), Is.EqualTo(SequenceStepResult.Failed), "Schild before Krone");
            Assert.That(puzzle.Progress, Is.EqualTo(0), "the slabs spring back");
            Assert.That(puzzle.IsPressed(Oak), Is.False);
            Assert.That(puzzle.FailedAttempts, Is.EqualTo(1));
            Assert.That(puzzle.IsSolved, Is.False);
        }

        [Test]
        public void StartingWithTheWrongSlabFailsAtOnce()
        {
            SequencePuzzle puzzle = Create();

            Assert.That(puzzle.Press(Crown), Is.EqualTo(SequenceStepResult.Failed));
            Assert.That(puzzle.Press(Oak), Is.EqualTo(SequenceStepResult.Progressed), "a new attempt starts right away");
        }

        [Test]
        public void PressingAPressedSlabOrAnUnknownOneIsIgnored()
        {
            SequencePuzzle puzzle = Create();
            puzzle.Press(Oak);

            Assert.That(puzzle.Press(Oak), Is.EqualTo(SequenceStepResult.Ignored));
            Assert.That(puzzle.Press("obj.unbekannt"), Is.EqualTo(SequenceStepResult.Ignored));
            Assert.That(puzzle.Progress, Is.EqualTo(1));
        }

        [Test]
        public void SolvedPuzzleStaysSolvedAndIgnoresPresses()
        {
            SequencePuzzle puzzle = Create();
            puzzle.Press(Oak);
            puzzle.Press(Crown);
            puzzle.Press(Shield);

            Assert.That(puzzle.Press(Oak), Is.EqualTo(SequenceStepResult.Ignored));
            puzzle.ResetAttempt();
            Assert.That(puzzle.IsSolved, Is.True);
            Assert.That(puzzle.IsPressed(Shield), Is.True, "solved slabs stay down");
        }

        [Test]
        public void RestoreSetsTheSavedState()
        {
            SequencePuzzle puzzle = Create();
            puzzle.Press(Oak);

            puzzle.Restore(true);
            Assert.That(puzzle.IsSolved, Is.True);

            puzzle.Restore(false);
            Assert.That(puzzle.IsSolved, Is.False);
            Assert.That(puzzle.Progress, Is.EqualTo(0), "an attempt is not saved");
        }

        [Test]
        public void HintAppearsOnceAfter120SecondsInTheRoom()
        {
            var hint = new PuzzleHintTimer(120f);

            Assert.That(hint.Tick(100f, true), Is.False);
            Assert.That(hint.Tick(30f, false), Is.False, "outside the room the time does not count");
            Assert.That(hint.Tick(19f, true), Is.False);
            Assert.That(hint.Tick(1f, true), Is.True, "120 s in the room without progress");
            Assert.That(hint.IsHintShown, Is.True);
            Assert.That(hint.Tick(500f, true), Is.False, "only once");
        }

        [Test]
        public void ProgressRestartsTheHintTimerAndSolvingStopsIt()
        {
            var hint = new PuzzleHintTimer(120f);
            hint.Tick(110f, true);

            hint.NotifyProgress();
            Assert.That(hint.Tick(20f, true), Is.False, "counting starts again");
            Assert.That(hint.Elapsed, Is.EqualTo(20f).Within(0.001f));

            hint.Stop();
            Assert.That(hint.Tick(1000f, true), Is.False);
            Assert.That(hint.IsHintShown, Is.False);
        }

        [Test]
        public void LoadingAnUnsolvedStateRestartsTheHintAfterSolving()
        {
            var hint = new PuzzleHintTimer(120f);
            hint.Tick(50f, true);
            hint.Stop();
            Assert.That(hint.IsStopped, Is.True, "solved");

            // An older save in which the puzzle is not solved yet is loaded.
            hint.Restart();

            Assert.That(hint.IsStopped, Is.False);
            Assert.That(hint.Elapsed, Is.EqualTo(0f));
            Assert.That(hint.Tick(119f, true), Is.False, "counts from 0 again");
            Assert.That(hint.Tick(1f, true), Is.True, "after 120 s the hint is due again");
        }

        [Test]
        public void ZeroSecondsMeansNoHint()
        {
            var hint = new PuzzleHintTimer(0f);

            Assert.That(hint.Tick(1000f, true), Is.False);
        }
    }
}
