using System.Linq;
using Aetherfall.World.Dungeons;
using Aetherfall.World.Puzzles;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gruft
{
    /// <summary>
    /// The layout reader and validator find broken data before the generator builds a scene: malformed JSON, duplicate keys,
    /// unsolvable or already solved light puzzles, unreachable rooms, duplicate ids, too small arenas, an encounter area right
    /// behind the arena gate, traps without a fitting
    /// trigger. Each test breaks one thing in a copy of the real crypt layout.
    /// </summary>
    [TestFixture]
    public sealed class DungeonLayoutValidationTests
    {
        private DungeonLayout _layout;

        [SetUp]
        public void SetUp()
        {
            _layout = GruftLayoutFile.Load();
        }

        [Test]
        public void MalformedJsonIsRefusedWithAPosition()
        {
            var exception = Assert.Throws<DungeonLayoutException>(() => DungeonLayoutReader.Read("{\n  \"format\": ,\n}"));

            StringAssert.Contains("2", exception.Message, "the line of the mistake");
        }

        [Test]
        public void DuplicateKeysAreRefused()
        {
            Assert.Throws<DungeonLayoutException>(() => DungeonJsonParser.Parse("{ \"id\": \"a\", \"id\": \"b\" }"));
        }

        [Test]
        public void WrongFormatIsRefused()
        {
            Assert.Throws<DungeonLayoutException>(() => DungeonLayoutReader.Read("{ \"format\": \"something.else\", \"version\": 1, \"id\": \"x\", \"name\": \"x\" }"));
        }

        [Test]
        public void UnsolvableMirrorSolutionIsAnError()
        {
            DungeonPuzzle puzzle = _layout.Puzzles.First(p => p.IsMirror);
            puzzle.Mirrors[2].Solution = GridDirection.East;

            Assert.That(DungeonLayoutValidator.Validate(_layout).Has("puzzle.unsolvable", puzzle.Id), Is.True);
        }

        [Test]
        public void MirrorPuzzleSolvedAtTheStartIsAnError()
        {
            DungeonPuzzle puzzle = _layout.Puzzles.First(p => p.IsMirror);
            foreach (DungeonPuzzleMirror mirror in puzzle.Mirrors)
            {
                mirror.Start = mirror.Solution;
            }

            Assert.That(DungeonLayoutValidator.Validate(_layout).Has("puzzle.presolved", puzzle.Id), Is.True);
        }

        [Test]
        public void RoomWithoutConnectionIsUnreachable()
        {
            _layout.Rooms.Add(new DungeonRoom { Id = "room.insel", Name = "Insel", Bounds = new DungeonRect(60f, 0f, 6f, 6f), FloorY = 0f, Height = 4f });

            Assert.That(DungeonLayoutValidator.Validate(_layout).Has("reach.unreachable"), Is.True);
        }

        [Test]
        public void DuplicateIdIsAnError()
        {
            DungeonObject copy = _layout.Objects.First(o => o.Kind == DungeonObject.Rubble);
            _layout.Objects.Add(new DungeonObject { Id = copy.Id, Kind = DungeonObject.Rubble, X = copy.X, Z = copy.Z });

            Assert.That(DungeonLayoutValidator.Validate(_layout).Has("id.duplicate", copy.Id), Is.True);
        }

        [Test]
        public void TooSmallArenaIsAnError()
        {
            DungeonRoom arenaRoom = _layout.FindRoom(_layout.BossArena.Room);
            arenaRoom.Bounds = new DungeonRect(arenaRoom.Bounds.X, arenaRoom.Bounds.Z, 20f, arenaRoom.Bounds.Depth);

            DungeonLayoutReport report = DungeonLayoutValidator.Validate(_layout);

            Assert.That(report.Has("arena.size", _layout.BossArena.Id), Is.True, "GDD 03 9.6: at least 25 x 25 m");
            Assert.That(report.IsValid, Is.False);
        }

        [Test]
        public void EncounterAreaRightBehindTheArenaGateIsAnError()
        {
            DungeonBossArena arena = _layout.BossArena;
            DungeonRect area = arena.EncounterArea;
            arena.EncounterArea = new DungeonRect(area.X, 63f, area.Width, area.MaxZ - 63f);

            DungeonLayoutReport report = DungeonLayoutValidator.Validate(_layout);

            Assert.That(report.Has("arena.gate_gap", arena.Id), Is.True, "0.6 m behind the gate: one step back and the player is shut out");
            Assert.That(report.IsValid, Is.False);
        }

        [Test]
        public void TrapNeedsAFailureOrPlateTrigger()
        {
            DungeonTrap trap = _layout.Traps[0];
            trap.Trigger = new DungeonTrigger { Type = DungeonTrigger.Lever, Id = "obj.eichental.gruft_hebel_seitengang" };

            Assert.That(DungeonLayoutValidator.Validate(_layout).Has("trap.trigger", trap.Id), Is.True);
        }

        [Test]
        public void GeometryMatchesTheBlenderPreview()
        {
            // Tools/Preview/gruft_preview.py mirrors DungeonGeometry; it prints the same numbers for this layout.
            DungeonGeometry geometry = DungeonGeometry.Build(_layout);

            Assert.That(geometry.Pieces.Count, Is.EqualTo(17));
            Assert.That(geometry.FloorCellCount, Is.EqualTo(2304));
            Assert.That(geometry.Walls.Count(w => w.Kind == DungeonWallKind.Wall), Is.EqualTo(56));
            Assert.That(geometry.Walls.Count(w => w.Kind == DungeonWallKind.Lintel), Is.EqualTo(12));
            Assert.That(geometry.Walls.Count(w => w.Kind == DungeonWallKind.Riser), Is.EqualTo(2));
        }

        [Test]
        public void GeometryPutsRampsBetweenTheLevels()
        {
            DungeonGeometry geometry = DungeonGeometry.Build(_layout);
            DungeonFloorPiece stair = geometry.PieceAt(0f, 0f);

            Assert.That(stair, Is.Not.Null);
            Assert.That(stair.IsSloped, Is.True, "stair from the antechamber (0 m) down to the hall (−3 m)");
            Assert.That(stair.SlopeDegrees, Is.LessThanOrEqualTo(DungeonLayoutValidator.MaxSlopeDegrees));
            Assert.That(geometry.Walls.Any(w => w.Kind == DungeonWallKind.Lintel), Is.True, "lintels above lower corridor openings");
            Assert.That(geometry.Walls.Any(w => w.Kind == DungeonWallKind.Riser), Is.True, "risers at steps (climbing spot)");
        }
    }
}
