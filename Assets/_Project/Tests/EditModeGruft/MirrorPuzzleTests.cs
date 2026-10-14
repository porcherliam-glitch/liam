using System.Collections.Generic;
using Aetherfall.World.Puzzles;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gruft
{
    /// <summary>
    /// Light puzzle of the mirror hall (GDD 02 11.7: "Spiegel 1 → Ost, Spiegel 2 → Nord, Spiegel 3 → West", no penalty) and the
    /// beam tracer: straight beams, reflection in the mirror's direction, a mirror facing back blocks, the beam ends at the room
    /// bounds, solved puzzles lock, saved directions restore, only real progress restarts the hint timer.
    /// </summary>
    [TestFixture]
    public sealed class MirrorPuzzleTests
    {
        private static readonly PlanarPoint Source = new PlanarPoint(-5f, 38.1f);
        private static readonly PlanarPoint Seal = new PlanarPoint(-9.25f, 52f);

        private static MirrorPuzzle Create()
        {
            var mirrors = new List<MirrorSetup>
            {
                new MirrorSetup("m1", new PlanarPoint(-5f, 41f), GridDirection.North),
                new MirrorSetup("m2", new PlanarPoint(5f, 41f), GridDirection.West),
                new MirrorSetup("m3", new PlanarPoint(5f, 52f), GridDirection.South)
            };
            return new MirrorPuzzle(Source, GridDirection.North, Seal, mirrors, -9f, 9f, 38f, 56f);
        }

        [Test]
        public void StartPositionDoesNotSolve()
        {
            MirrorPuzzle puzzle = Create();

            Assert.That(puzzle.IsSolved, Is.False);
            Assert.That(puzzle.Trace.MirrorsHit, Is.EqualTo(new[] { "m1" }), "mirror 1 points north: the beam passes on to the wall");
            Assert.That(puzzle.Trace.End.Z, Is.EqualTo(56f).Within(0.001f), "ends at the north wall of the room");
        }

        [Test]
        public void SolutionEastNorthWestReachesTheSeal()
        {
            MirrorPuzzle puzzle = Create();
            RotateTo(puzzle, "m1", GridDirection.East);
            RotateTo(puzzle, "m2", GridDirection.North);
            Assert.That(puzzle.IsSolved, Is.False);

            RotateTo(puzzle, "m3", GridDirection.West);

            Assert.That(puzzle.IsSolved, Is.True);
            Assert.That(puzzle.Trace.HitTarget, Is.True);
            Assert.That(puzzle.Trace.MirrorsHit, Is.EqualTo(new[] { "m1", "m2", "m3" }));
        }

        [Test]
        public void MirrorFacingBackBlocksTheBeam()
        {
            MirrorPuzzle puzzle = Create();
            RotateTo(puzzle, "m1", GridDirection.East);

            Assert.That(puzzle.Trace.BlockedBy, Is.EqualTo("m2"), "mirror 2 points west, back towards mirror 1");
        }

        [Test]
        public void SolvedPuzzleLocksTheMirrors()
        {
            MirrorPuzzle puzzle = Create();
            RotateTo(puzzle, "m1", GridDirection.East);
            RotateTo(puzzle, "m2", GridDirection.North);
            RotateTo(puzzle, "m3", GridDirection.West);

            Assert.That(puzzle.Rotate("m1"), Is.False);
            Assert.That(puzzle.DirectionOf("m1"), Is.EqualTo(GridDirection.East));
        }

        [Test]
        public void FourTurnsBringAMirrorBack()
        {
            MirrorPuzzle puzzle = Create();
            for (int i = 0; i < 4; i++)
            {
                Assert.That(puzzle.Rotate("m2"), Is.True);
            }

            Assert.That(puzzle.DirectionOf("m2"), Is.EqualTo(GridDirection.West));
            Assert.That(puzzle.Rotate("unknown"), Is.False);
        }

        [Test]
        public void RestoreUsesSavedDirectionsAndDetectsASolvedSetup()
        {
            MirrorPuzzle puzzle = Create();
            var saved = new Dictionary<string, GridDirection>
            {
                { "m1", GridDirection.East }, { "m2", GridDirection.North }, { "m3", GridDirection.West }, { "unknown", GridDirection.South }
            };

            puzzle.Restore(saved, false);

            Assert.That(puzzle.IsSolved, Is.True, "an older save with the right directions counts as solved");
            Assert.That(puzzle.DirectionOf("m2"), Is.EqualTo(GridDirection.North));
        }

        [Test]
        public void TracerEndsAtBoundsWithoutMirrors()
        {
            BeamTrace trace = MirrorBeamTracer.Trace(new PlanarPoint(0f, 0f), GridDirection.East, new List<BeamMirror>(), new PlanarPoint(0f, 50f),
                true, -10f, 10f, -10f, 10f);

            Assert.That(trace.HitTarget, Is.False);
            Assert.That(trace.End.X, Is.EqualTo(10f).Within(0.001f));
            Assert.That(trace.Path.Count, Is.EqualTo(2));
        }

        [Test]
        public void TracerHitsATargetSlightlyOffTheLine()
        {
            BeamTrace trace = MirrorBeamTracer.Trace(new PlanarPoint(0f, 0f), GridDirection.North, new List<BeamMirror>(), new PlanarPoint(0.3f, 8f));

            Assert.That(trace.HitTarget, Is.True, "within the alignment tolerance of 0.35 m");
        }

        [Test]
        public void TracerStopsInALoop()
        {
            var mirrors = new List<BeamMirror>
            {
                new BeamMirror("a", new PlanarPoint(0f, 5f), GridDirection.East),
                new BeamMirror("b", new PlanarPoint(5f, 5f), GridDirection.South),
                new BeamMirror("c", new PlanarPoint(5f, 0f), GridDirection.West),
                new BeamMirror("d", new PlanarPoint(0f, 0f), GridDirection.North)
            };

            BeamTrace trace = MirrorBeamTracer.Trace(new PlanarPoint(0f, -1f), GridDirection.North, mirrors, new PlanarPoint(100f, 100f));

            Assert.That(trace.HitTarget, Is.False);
            Assert.That(trace.MirrorsHit.Count, Is.LessThanOrEqualTo(MirrorBeamTracer.MaxBounces + 1), "terminates");
            Assert.That(trace.MirrorsHit.Count, Is.GreaterThanOrEqualTo(5), "went round the square once");
        }

        [Test]
        public void DirectionsParseTurnAndConvert()
        {
            Assert.That(GridDirections.TryParse("O", out GridDirection east) && east == GridDirection.East, Is.True, "German Ost");
            Assert.That(GridDirections.TryParse("Sueden", out GridDirection south) && south == GridDirection.South, Is.True);
            Assert.That(GridDirections.TryParse("x", out _), Is.False);
            Assert.That(GridDirections.Clockwise(GridDirection.West), Is.EqualTo(GridDirection.North));
            Assert.That(GridDirections.Opposite(GridDirection.North), Is.EqualTo(GridDirection.South));
            Assert.That(GridDirections.Yaw(GridDirection.West), Is.EqualTo(270f));
            Assert.That(GridDirections.FromYaw(-85f), Is.EqualTo(GridDirection.West));
            Assert.That(WorldObjectStates.TryGetDirection(WorldObjectStates.FromDirection(GridDirection.South), out GridDirection back), Is.True);
            Assert.That(back, Is.EqualTo(GridDirection.South));
            Assert.That(WorldObjectStates.TryGetDirection(WorldObjectStates.Initial, out _), Is.False, "0 = nothing saved");
        }

        [Test]
        public void TurningAMirrorOutsideTheBeamIsNoProgress()
        {
            MirrorPuzzle puzzle = Create();
            var hint = new PuzzleHintTimer(120f);
            hint.Tick(100f, true);

            Assert.That(puzzle.Rotate("m3"), Is.True);
            Assert.That(puzzle.Rotate("m2"), Is.True);
            Assert.That(puzzle.LastTurnMadeProgress, Is.False, "mirrors 2 and 3 are not in the beam yet");
            if (puzzle.LastTurnMadeProgress)
            {
                hint.NotifyProgress();
            }

            Assert.That(hint.Tick(20f, true), Is.True, "GDD 02 11.7: the 120 s keep running, the soot marks light up");
        }

        [Test]
        public void OnlyAMirrorMoreInTheBeamThanEverBeforeCountsAsProgress()
        {
            MirrorPuzzle puzzle = Create();
            Assert.That(puzzle.MostMirrorsHit, Is.EqualTo(1));

            puzzle.Rotate("m1");
            Assert.That(puzzle.DirectionOf("m1"), Is.EqualTo(GridDirection.East));
            Assert.That(puzzle.LastTurnMadeProgress, Is.True, "the beam now reaches mirror 2");

            puzzle.Rotate("m1");
            Assert.That(puzzle.LastTurnMadeProgress, Is.False, "away again");
            RotateTo(puzzle, "m1", GridDirection.East);
            Assert.That(puzzle.LastTurnMadeProgress, Is.False, "back to a known state: no progress");

            RotateTo(puzzle, "m2", GridDirection.North);
            Assert.That(puzzle.LastTurnMadeProgress, Is.True, "the beam reaches mirror 3");
            RotateTo(puzzle, "m3", GridDirection.West);
            Assert.That(puzzle.IsSolved, Is.True);
            Assert.That(puzzle.LastTurnMadeProgress, Is.True);

            puzzle.Restore(new Dictionary<string, GridDirection>(), false);
            Assert.That(puzzle.MostMirrorsHit, Is.EqualTo(puzzle.Trace.MirrorsHit.Count), "loading starts the measure anew");
        }

        private static void RotateTo(MirrorPuzzle puzzle, string id, GridDirection direction)
        {
            for (int i = 0; i < 4 && puzzle.DirectionOf(id) != direction; i++)
            {
                puzzle.Rotate(id);
            }

            Assert.That(puzzle.DirectionOf(id), Is.EqualTo(direction));
        }
    }
}
