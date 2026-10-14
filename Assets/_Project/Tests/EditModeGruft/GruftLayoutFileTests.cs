using System.Collections.Generic;
using System.Linq;
using Aetherfall.World.Dungeons;
using Aetherfall.World.Puzzles;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gruft
{
    /// <summary>
    /// The real layout file of "Die vergessene Gruft" against GDD 02 11.7 (stages, ids, puzzles, mini boss, rewards), GDD 01
    /// 11.4 (skeleton warriors, elite with tower shield), GDD 03 9.6 (arena rules) and the validator.
    /// </summary>
    [TestFixture]
    public sealed class GruftLayoutFileTests
    {
        private DungeonLayout _layout;

        [SetUp]
        public void SetUp()
        {
            _layout = GruftLayoutFile.Load();
        }

        [Test]
        public void FileIsTheForgottenCryptOfTheEichental()
        {
            Assert.That(_layout.Id, Is.EqualTo("dungeon.eichental.vergessene_gruft"));
            Assert.That(_layout.Name, Is.EqualTo("Die vergessene Gruft"));
            Assert.That(_layout.LocationId, Is.EqualTo("loc.eichental.vergessene_gruft"));
            Assert.That(_layout.QuestId, Is.EqualTo("quest.dungeon.eichental.vergessene_gruft"));
            Assert.That(_layout.SceneKey, Is.EqualTo("Assets/_Project/Scenes/Dungeons/Gruft.unity"), "architecture 10.8: own dungeon scene");
            Assert.That(_layout.AreaLevel, Is.EqualTo(4), "Mini-Slice: level 4 instead of 6 (GDD 02 11.7), only quests 1 and 2 lie before it");
        }

        [Test]
        public void ValidatorFindsNoErrorsAndNoWarnings()
        {
            DungeonLayoutReport report = DungeonLayoutValidator.Validate(_layout);

            Assert.That(report.ErrorCount, Is.EqualTo(0), report.ToString());
            Assert.That(report.WarningCount, Is.EqualTo(0), report.ToString());
        }

        [Test]
        public void EveryIdOfGdd02Section117IsInTheLayout()
        {
            HashSet<string> ids = DungeonLayoutReader.CollectIds(_layout);
            string[] required =
            {
                "loc.eichental.vergessene_gruft",
                "loc.eichental.gruft_siegelkammer_vorraum",
                "loc.eichental.gruft_ausgang",
                "puzzle.eichental.gruft_grabplatten",
                "puzzle.eichental.gruft_spiegel",
                "door.eichental.gruft_tor",
                "door.eichental.gruft_siegelkammer",
                "spawn.eichental.gruft_hallen",
                "enemy.untot.skelett_krieger",
                "obj.eichental.gruft_kaefig",
                "npc.eichental.grabraeuber_fenn",
                "obj.eichental.gruft_siegelstein",
                "item.quest.siegelstein_gruft",
                "item.quest.klingenfragment_eidwahrer",
                "boss.eichental.wachender_ritter",
                "mus.boss_gruft",
                "clue.eichental.gruft_wandrelief_1",
                "clue.eichental.gruft_wandrelief_2",
                "clue.eichental.gruft_wandrelief_3"
            };

            string[] missing = required.Where(id => !ids.Contains(id)).ToArray();

            Assert.That(missing, Is.Empty, "missing ids: " + string.Join(", ", missing));
        }

        [Test]
        public void GraveSlabsMustBeUsedOakCrownShieldAsTheInscriptionSays()
        {
            DungeonPuzzle puzzle = _layout.FindPuzzle("puzzle.eichental.gruft_grabplatten");
            Assert.That(puzzle, Is.Not.Null);
            Assert.That(puzzle.IsSequence, Is.True, "GDD 01 6.7: Hebel und Sequenzen");

            string[] reliefs = puzzle.Steps.Select(id => _layout.FindObject(id).Relief).ToArray();
            Assert.That(reliefs, Is.EqualTo(new[] { "eiche", "krone", "schild" }));
            Assert.That(puzzle.Door, Is.EqualTo("door.eichental.gruft_tor"));
            Assert.That(puzzle.HintAfterSeconds, Is.EqualTo(120f));

            DungeonObject inscription = _layout.FindObject("obj.eichental.gruft_tor_inschrift");
            StringAssert.Contains("Erst die Eiche, die den Schild trug, dann die Krone, die sich beugte, zuletzt der Schild, der nie brach.",
                inscription.Text, "GDD 02 11.7: the quest log quotes the inscription word for word");

            DungeonTrap trap = _layout.FindTrap(puzzle.FailTrap);
            Assert.That(trap.DamageFraction, Is.EqualTo(0.1f), "GDD 02 11.7: Pfeilfalle (10 % LP)");
            Assert.That(trap.Trigger.Type, Is.EqualTo(DungeonTrigger.PuzzleFailed));
        }

        [Test]
        public void SlabsDoNotLieInTheOrderOfTheSolution()
        {
            DungeonPuzzle puzzle = _layout.FindPuzzle("puzzle.eichental.gruft_grabplatten");
            float[] xs = puzzle.Steps.Select(id => _layout.FindObject(id).X).ToArray();

            bool leftToRight = xs[0] < xs[1] && xs[1] < xs[2];
            bool rightToLeft = xs[0] > xs[1] && xs[1] > xs[2];
            Assert.That(leftToRight || rightToLeft, Is.False, "walking along the slabs must not solve the puzzle by accident");
        }

        [Test]
        public void MirrorSolutionIsEastNorthWestAndSolvesThePuzzle()
        {
            DungeonPuzzle puzzle = _layout.FindPuzzle("puzzle.eichental.gruft_spiegel");
            Assert.That(puzzle.IsMirror, Is.True);
            Assert.That(puzzle.Mirrors.Select(m => m.Solution).ToArray(),
                Is.EqualTo(new[] { GridDirection.East, GridDirection.North, GridDirection.West }), "GDD 02 11.7: Spiegel 1 Ost, 2 Nord, 3 West");

            MirrorPuzzle logic = DungeonPuzzleFactory.CreateMirrorPuzzle(_layout, puzzle);
            Assert.That(logic.IsSolved, Is.False, "the mirrors stand crooked at the start");
            foreach (DungeonPuzzleMirror mirror in puzzle.Mirrors)
            {
                while (logic.DirectionOf(mirror.Id) != mirror.Solution)
                {
                    Assert.That(logic.IsSolved, Is.False, "solved too early while turning " + mirror.Id);
                    logic.Rotate(mirror.Id);
                }
            }

            Assert.That(logic.IsSolved, Is.True);
            Assert.That(logic.Trace.MirrorsHit, Is.EqualTo(puzzle.Mirrors.Select(m => m.Id).ToArray()), "the beam passes all three mirrors");
            Assert.That(puzzle.Door, Is.EqualTo("door.eichental.gruft_siegelkammer"));
        }

        [Test]
        public void SootMarksFollowTheSolvedBeam()
        {
            DungeonPuzzle puzzle = _layout.FindPuzzle("puzzle.eichental.gruft_spiegel");
            MirrorPuzzle logic = DungeonPuzzleFactory.CreateMirrorPuzzle(_layout, puzzle);
            foreach (DungeonPuzzleMirror mirror in puzzle.Mirrors)
            {
                while (logic.DirectionOf(mirror.Id) != mirror.Solution)
                {
                    logic.Rotate(mirror.Id);
                }
            }

            IReadOnlyList<PlanarPoint> path = logic.Trace.Path;
            foreach (string sootId in puzzle.HintObjects)
            {
                DungeonObject soot = _layout.FindObject(sootId);
                Assert.That(soot.Kind, Is.EqualTo(DungeonObject.Soot));
                Assert.That(IsOnPath(path, soot.X, soot.Z), Is.True, sootId + " lies on the old beam path (fairness hint, GDD 02 11.7)");
            }
        }

        [Test]
        public void HallsHoldSixSkeletonWarriorsWithOneTowerShieldElite()
        {
            DungeonSpawner spawner = _layout.FindSpawner("spawn.eichental.gruft_hallen");
            Assert.That(spawner, Is.Not.Null);
            Assert.That(spawner.Enemies.Count, Is.EqualTo(6), "GDD 02 11.7: 6 × enemy.untot.skelett_krieger");
            Assert.That(spawner.Enemies.All(e => e.Type == "enemy.untot.skelett_krieger"), Is.True);
            DungeonEnemy[] elites = spawner.Enemies.Where(e => e.Variant == DungeonEnemy.Elite).ToArray();
            Assert.That(elites.Length, Is.EqualTo(1), "davon 1 Elite");
            Assert.That(elites[0].TowerShield, Is.True, "mit Turmschild");
            Assert.That(spawner.Activation.Type, Is.EqualTo(DungeonTrigger.Puzzle), "the dead rise when the gate opens (start of s30)");
        }

        [Test]
        public void BossArenaFollowsTheBossRules()
        {
            DungeonBossArena arena = _layout.BossArena;
            Assert.That(arena, Is.Not.Null);
            Assert.That(arena.BossId, Is.EqualTo("boss.eichental.wachender_ritter"));
            Assert.That(arena.Variant, Is.EqualTo(DungeonEnemy.Champion), "champion variant of the skeleton warrior, no new rig");
            DungeonRect room = _layout.FindRoom(arena.Room).Bounds;
            Assert.That(room.Width, Is.GreaterThanOrEqualTo(25f), "GDD 03 9.6: at least 25 × 25 m");
            Assert.That(room.Depth, Is.GreaterThanOrEqualTo(25f));
            Assert.That(arena.Covers.Count, Is.InRange(2, 4), "2–4 covers");
            Assert.That(arena.Phases.Count, Is.EqualTo(2));
            Assert.That(arena.Phases[1].FromHealth, Is.EqualTo(0.5f), "Phase 2 (< 50 %)");
            Assert.That(arena.Phases[1].Summon, Is.EqualTo(2), "ruft 2 Skelett-Krieger");
            Assert.That(arena.BeamStunSeconds, Is.EqualTo(5f), "der Strahl betäubt ihn 5 s");
            Assert.That(arena.BeamFromPhase, Is.EqualTo(2));
            Assert.That(_layout.FindObject(arena.Reward).ItemId, Is.EqualTo("item.quest.klingenfragment_eidwahrer"));
            Assert.That(_layout.FindObject(arena.SealStone).ItemId, Is.EqualTo("item.quest.siegelstein_gruft"));
            Assert.That(arena.Music, Is.EqualTo("mus.boss_gruft"));
        }

        [Test]
        public void PlayerIsSurelyInsideWhenTheArenaGateFalls()
        {
            DungeonBossArena arena = _layout.BossArena;
            DungeonDoor gate = _layout.FindDoor("door.eichental.gruft_arena_tor");
            DungeonRect room = _layout.FindRoom(arena.Room).Bounds;

            Assert.That(arena.CloseGates, Does.Contain(gate.Id));
            Assert.That(arena.EncounterArea.Z - gate.Z, Is.GreaterThanOrEqualTo(DungeonLayoutValidator.MinGateGap),
                "the fight starts 3.6 m behind the gate, so stepping back at once does not shut the player out");
            Assert.That(room.Z, Is.LessThanOrEqualTo(gate.Z), "the arena bounds (room) reach up to the gate: the strip in front of it counts as inside");
        }

        [Test]
        public void SpawnIsAtTheEntranceInsideTheCryptZone()
        {
            DungeonSpawn spawn = _layout.Spawn;
            DungeonRoom entrance = _layout.FindRoom("room.vorraum");
            Assert.That(entrance.Bounds.Contains(spawn.X, spawn.Z), Is.True);
            Assert.That(_layout.Areas.Any(a => a.LocationId == "loc.eichental.vergessene_gruft" && a.Bounds.Contains(spawn.X, spawn.Z)), Is.True);
            Assert.That(spawn.AnchorId, Is.EqualTo("anchor.gruft.eingang"));
        }

        [Test]
        public void BothExitsLeadBackToTheEichental()
        {
            Assert.That(_layout.Exits.Count, Is.EqualTo(2));
            foreach (DungeonExit exit in _layout.Exits)
            {
                Assert.That(exit.TargetSceneKey, Is.EqualTo("Assets/_Project/Scenes/World/Eichental.unity"));
                Assert.That(exit.TargetAnchorId, Is.EqualTo("anchor.eichental.gruft_eingang"));
                DungeonObject portal = _layout.FindObject(exit.ObjectId);
                Assert.That(_layout.Areas.Any(a => a.LocationId == "loc.eichental.gruft_ausgang" && a.Bounds.Contains(portal.X, portal.Z)), Is.True,
                    exit.ObjectId + " lies in a zone loc.eichental.gruft_ausgang (s60 b \"Lass ihn liegen\")");
            }
        }

        [Test]
        public void CheckpointLiesBeforeTheArenaNotInIt()
        {
            DungeonCheckpoint checkpoint = _layout.Checkpoints.Single();
            DungeonRect arenaRoom = _layout.FindRoom(_layout.BossArena.Room).Bounds;

            Assert.That(arenaRoom.Overlaps(checkpoint.Bounds), Is.False, "GDD 05 5.3: Vorkammer, nicht in der Arena");
            Assert.That(checkpoint.Autosave, Is.True);
        }

        [Test]
        public void GeometryHasNoWallAcrossTheOpenings()
        {
            DungeonGeometry geometry = DungeonGeometry.Build(_layout);

            Assert.That(geometry.FloorCellCount, Is.GreaterThan(1000));
            Assert.That(geometry.Walls.Count, Is.GreaterThan(20));
            foreach (DungeonWallSegment wall in geometry.Walls.Where(w => w.Kind == DungeonWallKind.Wall))
            {
                // The gate opening between the entrance hall and the stairs: x -2..2 on z = -4.
                bool crossesGate = wall.AlongX && System.Math.Abs(wall.Line + 4f) < 1e-3f && wall.Start < 2f && wall.End > -2f;
                Assert.That(crossesGate, Is.False, "a wall closes the opening at the gate: " + wall);
            }

            Assert.That(geometry.FloorAt(0f, -17f), Is.EqualTo(0f));
            Assert.That(geometry.FloorAt(0f, 18f), Is.EqualTo(-3f));
            Assert.That(geometry.FloorAt(-14f, 75f), Is.EqualTo(-6f));
            Assert.That(geometry.FloorAt(0f, 0f), Is.EqualTo(-1.5f).Within(1e-4f), "half way down the stairs");
        }

        private static bool IsOnPath(IReadOnlyList<PlanarPoint> path, float x, float z)
        {
            for (int i = 0; i + 1 < path.Count; i++)
            {
                PlanarPoint a = path[i];
                PlanarPoint b = path[i + 1];
                float minX = System.Math.Min(a.X, b.X) - 0.35f;
                float maxX = System.Math.Max(a.X, b.X) + 0.35f;
                float minZ = System.Math.Min(a.Z, b.Z) - 0.35f;
                float maxZ = System.Math.Max(a.Z, b.Z) + 0.35f;
                if (x >= minX && x <= maxX && z >= minZ && z <= maxZ)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
