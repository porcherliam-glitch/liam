using System;
using System.Collections.Generic;
using System.Globalization;
using Aetherfall.World.Puzzles;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Checks a <see cref="DungeonLayout"/> before the generator builds it (architecture 6.4 "Validator"): ids unique and in
    /// the id scheme (architecture 6.1, GDD 02 2.3), rooms on the grid without overlaps, corridors axis-aligned with at most
    /// 30° slope, everything reachable from the spawn by walking and jumping (step up at most 1.2 m), objects, doors, enemies
    /// and lights on a floor, all references resolvable, the sequence puzzle consistent, the light puzzle solvable with its
    /// solution and not solved at the start, and the boss arena after GDD 03 9.6 (at least 25 × 25 m, 2–4 covers, encounter area at
    /// least 3 m behind the closing gate). Pure logic.
    /// </summary>
    public static class DungeonLayoutValidator
    {
        /// <summary>Largest step up the player manages (jump height, GDD 03 3.1: 1.2 m).</summary>
        public const float MaxStepUp = 1.2f;

        /// <summary>Steepest corridor slope in degrees (CharacterController walks up to 45°; stairs as ramps stay below).</summary>
        public const float MaxSlopeDegrees = 30f;

        /// <summary>Lowest room or corridor height (player 1.8 m + camera).</summary>
        public const float MinClearHeight = 2.5f;

        /// <summary>Smallest boss arena edge (GDD 03 9.6: at least 25 × 25 m).</summary>
        public const float MinArenaSize = 25f;

        /// <summary>
        /// Smallest gap between a closing arena gate and the encounter area: the fight starts this far behind the gate, so the
        /// player is surely inside when the gate falls (otherwise one can shut oneself out by stepping back at once).
        /// </summary>
        public const float MinGateGap = 3f;

        /// <summary>Most point lights that may light one room (URP forward: 8 additional lights per object).</summary>
        public const int MaxLightsPerRoom = 8;

        private static readonly string[] ChestTiers = { "crate", "wooden", "iron", "hidden", "ornate", "secret", "rift" };

        /// <summary>Validates the layout.</summary>
        /// <param name="layout">Layout.</param>
        /// <returns>The findings.</returns>
        public static DungeonLayoutReport Validate(DungeonLayout layout)
        {
            var report = new DungeonLayoutReport();
            if (layout == null)
            {
                report.Error("layout.missing", string.Empty, "Kein Layout.");
                return report;
            }

            CheckMeta(layout, report);
            CheckIds(layout, report);
            CheckRooms(layout, report);
            CheckCorridors(layout, report);
            DungeonGeometry geometry = DungeonGeometry.Build(layout);
            CheckReachability(layout, geometry, report);
            CheckDoors(layout, geometry, report);
            CheckObjects(layout, geometry, report);
            CheckPuzzles(layout, report);
            CheckTraps(layout, report);
            CheckSpawners(layout, geometry, report);
            CheckZones(layout, geometry, report);
            CheckExits(layout, report);
            CheckArena(layout, geometry, report);
            CheckLights(layout, geometry, report);
            return report;
        }

        /// <summary>True if the id is lower case snake case with dots (a–z, 0–9, _ and .), no leading or trailing dot.</summary>
        /// <param name="id">Id.</param>
        public static bool IsValidIdText(string id)
        {
            if (string.IsNullOrEmpty(id) || id[0] == '.' || id[id.Length - 1] == '.' || id.Contains(".."))
            {
                return false;
            }

            for (int i = 0; i < id.Length; i++)
            {
                char c = id[i];
                bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '.';
                if (!ok)
                {
                    return false;
                }
            }

            return true;
        }

        private static void CheckMeta(DungeonLayout layout, DungeonLayoutReport report)
        {
            if (Math.Abs(layout.CellSize - 1f) > 1e-4f)
            {
                report.Error("meta.cell_size", layout.Id, "Nur Rastergröße 1 m wird unterstützt.");
            }

            if (!(layout.WallThickness > 0.05f && layout.WallThickness <= 1f))
            {
                report.Error("meta.wall_thickness", layout.Id, "Wandstärke muss zwischen 0,05 und 1 m liegen.");
            }

            RequirePrefix(report, layout.Id, "dungeon.", "meta.id", layout.Id);
            RequirePrefix(report, layout.LocationId, "loc.", "meta.location", layout.Id);
            if (!string.IsNullOrEmpty(layout.QuestId))
            {
                RequirePrefix(report, layout.QuestId, "quest.", "meta.quest", layout.Id);
            }

            RequirePrefix(report, layout.WorldSpaceId, "worldspace.", "meta.worldspace", layout.Id);
            if (string.IsNullOrEmpty(layout.SceneKey) || !layout.SceneKey.EndsWith(".unity", StringComparison.Ordinal))
            {
                report.Error("meta.scene", layout.Id, "sceneKey muss ein Szenenpfad mit .unity sein.");
            }

            if (layout.AreaLevel < 1 || layout.AreaLevel > 80)
            {
                report.Error("meta.level", layout.Id, "areaLevel muss zwischen 1 und 80 liegen.");
            }

            if (layout.Rooms.Count == 0)
            {
                report.Error("rooms.empty", layout.Id, "Das Layout hat keinen Raum.");
            }
        }

        private static void CheckIds(DungeonLayout layout, DungeonLayoutReport report)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (DungeonRoom room in layout.Rooms)
            {
                Unique(seen, room.Id, report);
                RequirePrefix(report, room.Id, "room.", "id.prefix", room.Id);
            }

            foreach (DungeonCorridor corridor in layout.Corridors)
            {
                Unique(seen, corridor.Id, report);
                RequirePrefix(report, corridor.Id, "corridor.", "id.prefix", corridor.Id);
            }

            foreach (DungeonDoor door in layout.Doors)
            {
                Unique(seen, door.Id, report);
                RequirePrefix(report, door.Id, "door.", "id.prefix", door.Id);
            }

            foreach (DungeonPuzzle puzzle in layout.Puzzles)
            {
                Unique(seen, puzzle.Id, report);
                RequirePrefix(report, puzzle.Id, "puzzle.", "id.prefix", puzzle.Id);
            }

            foreach (DungeonTrap trap in layout.Traps)
            {
                Unique(seen, trap.Id, report);
                RequirePrefix(report, trap.Id, "trap.", "id.prefix", trap.Id);
            }

            foreach (DungeonObject item in layout.Objects)
            {
                Unique(seen, item.Id, report);
                if (!(item.Id.StartsWith("obj.", StringComparison.Ordinal) || item.Id.StartsWith("prop.", StringComparison.Ordinal) ||
                      item.Id.StartsWith("npc.", StringComparison.Ordinal)))
                {
                    report.Error("id.prefix", item.Id, "Objekt-IDs beginnen mit obj., prop. oder npc.");
                }

                if (item.IsInteractive && !item.Id.StartsWith("obj.", StringComparison.Ordinal))
                {
                    report.Error("id.prefix", item.Id, "Interaktive Objekte brauchen eine obj.-ID (Ereignis Interacted).");
                }
            }

            foreach (DungeonSpawner spawner in layout.Spawners)
            {
                Unique(seen, spawner.Id, report);
                RequirePrefix(report, spawner.Id, "spawn.", "id.prefix", spawner.Id);
            }

            foreach (DungeonArea area in layout.Areas)
            {
                Unique(seen, area.Id, report);
                RequirePrefix(report, area.Id, "zone.", "id.prefix", area.Id);
                RequirePrefix(report, area.LocationId, "loc.", "id.prefix", area.Id);
            }

            foreach (DungeonCheckpoint checkpoint in layout.Checkpoints)
            {
                Unique(seen, checkpoint.Id, report);
                RequirePrefix(report, checkpoint.Id, "checkpoint.", "id.prefix", checkpoint.Id);
            }

            Unique(seen, layout.Spawn.Id, report);
            RequirePrefix(report, layout.Spawn.Id, "spawn.", "id.prefix", layout.Spawn.Id);
            if (!string.IsNullOrEmpty(layout.Spawn.AnchorId))
            {
                RequirePrefix(report, layout.Spawn.AnchorId, "anchor.", "id.prefix", layout.Spawn.Id);
            }

            var enemyNumbers = new HashSet<string>(StringComparer.Ordinal);
            foreach (DungeonSpawner spawner in layout.Spawners)
            {
                foreach (DungeonEnemy enemy in spawner.Enemies)
                {
                    UniqueEnemy(enemyNumbers, enemy, report);
                }
            }

            if (layout.BossArena != null)
            {
                Unique(seen, layout.BossArena.Id, report);
                RequirePrefix(report, layout.BossArena.Id, "arena.", "id.prefix", layout.BossArena.Id);
                foreach (DungeonEnemy add in layout.BossArena.Adds)
                {
                    UniqueEnemy(enemyNumbers, add, report);
                }
            }
        }

        private static void UniqueEnemy(HashSet<string> numbers, DungeonEnemy enemy, DungeonLayoutReport report)
        {
            if (!numbers.Add(enemy.UniqueId))
            {
                report.Error("id.duplicate", enemy.UniqueId, "Gegner-Nummer doppelt (die eindeutige ID wäre gleich).");
            }

            if (!IsValidIdText(enemy.Number))
            {
                report.Error("id.format", enemy.UniqueId, "Gegner-Nummer nur aus a–z, 0–9 und _.");
            }

            RequirePrefix(report, enemy.Type, "enemy.", "id.prefix", enemy.UniqueId);
            if (!enemy.IsKnownVariant)
            {
                report.Error("enemy.variant", enemy.UniqueId, "Unbekannte Variante '" + enemy.Variant + "' (normal, elite, champion).");
            }
        }

        private static void CheckRooms(DungeonLayout layout, DungeonLayoutReport report)
        {
            for (int i = 0; i < layout.Rooms.Count; i++)
            {
                DungeonRoom room = layout.Rooms[i];
                DungeonRect r = room.Bounds;
                if (!(r.Width >= 2f && r.Depth >= 2f))
                {
                    report.Error("room.size", room.Id, "Raum kleiner als 2 × 2 m.");
                }

                if (!r.IsGridAligned)
                {
                    report.Error("room.grid", room.Id, "Raum liegt nicht auf dem 1-m-Raster (ganze Zahlen für x, z, width, depth).");
                }

                if (room.Height < MinClearHeight)
                {
                    report.Error("room.height", room.Id, "Raumhöhe unter " + Format(MinClearHeight) + " m.");
                }

                for (int k = i + 1; k < layout.Rooms.Count; k++)
                {
                    if (r.Overlaps(layout.Rooms[k].Bounds))
                    {
                        report.Error("room.overlap", room.Id, "Überschneidet sich mit " + layout.Rooms[k].Id + ".");
                    }
                }
            }
        }

        private static void CheckCorridors(DungeonLayout layout, DungeonLayoutReport report)
        {
            foreach (DungeonCorridor corridor in layout.Corridors)
            {
                if (corridor.Points.Count < 2)
                {
                    report.Error("corridor.points", corridor.Id, "Ein Gang braucht mindestens 2 Punkte.");
                    continue;
                }

                bool evenWidth = corridor.Width >= 2f && Math.Abs(corridor.Width / 2f - Math.Round(corridor.Width / 2f)) < 1e-4;
                if (!evenWidth)
                {
                    report.Error("corridor.width", corridor.Id, "Gangbreite muss gerade sein (2, 4, …), damit die Mittellinie auf dem Raster liegt.");
                }

                if (corridor.Height < MinClearHeight)
                {
                    report.Error("corridor.height", corridor.Id, "Ganghöhe unter " + Format(MinClearHeight) + " m.");
                }

                float half = corridor.Width * 0.5f;
                for (int i = 0; i + 1 < corridor.Points.Count; i++)
                {
                    DungeonCorridorPoint a = corridor.Points[i];
                    DungeonCorridorPoint b = corridor.Points[i + 1];
                    bool alongX = Math.Abs(a.Z - b.Z) < 1e-4f;
                    bool alongZ = Math.Abs(a.X - b.X) < 1e-4f;
                    if (alongX == alongZ)
                    {
                        report.Error("corridor.axis", corridor.Id, "Abschnitt " + (i + 1) + " ist nicht achsparallel oder hat Länge 0.");
                        continue;
                    }

                    if (!IsWhole(a.X) || !IsWhole(a.Z) || !IsWhole(b.X) || !IsWhole(b.Z))
                    {
                        report.Error("corridor.grid", corridor.Id, "Gangpunkte müssen auf ganzen Metern liegen.");
                    }

                    float length = alongX ? Math.Abs(b.X - a.X) : Math.Abs(b.Z - a.Z);
                    int trimmedEnds = (i > 0 ? 1 : 0) + (i + 2 < corridor.Points.Count ? 1 : 0);
                    float rampLength = length - trimmedEnds * half;
                    if (rampLength < 1f - 1e-4f)
                    {
                        report.Error("corridor.segment", corridor.Id, "Abschnitt " + (i + 1) + " ist zu kurz für die Gangbreite.");
                        continue;
                    }

                    double slope = Math.Atan(Math.Abs(b.Y - a.Y) / rampLength) * 180.0 / Math.PI;
                    if (slope > MaxSlopeDegrees + 1e-3)
                    {
                        report.Error("corridor.slope", corridor.Id, "Abschnitt " + (i + 1) + " ist " + Format((float)slope) + "° steil (höchstens " +
                                                                    Format(MaxSlopeDegrees) + "°).");
                    }
                }
            }
        }

        private static void CheckReachability(DungeonLayout layout, DungeonGeometry geometry, DungeonLayoutReport report)
        {
            DungeonSpawn spawn = layout.Spawn;
            if (!geometry.IsOnFloor(spawn.X, spawn.Z))
            {
                report.Error("spawn.floor", spawn.Id, "Der Startpunkt liegt nicht auf einem Boden.");
                return;
            }

            HashSet<long> reached = geometry.ReachableCells(spawn.X, spawn.Z, MaxStepUp);
            if (reached.Count < geometry.FloorCellCount)
            {
                var owners = new SortedSet<string>(StringComparer.Ordinal);
                for (int iz = 0; iz < geometry.CellsZ; iz++)
                {
                    for (int ix = 0; ix < geometry.CellsX; ix++)
                    {
                        int cx = geometry.MinCellX + ix;
                        int cz = geometry.MinCellZ + iz;
                        DungeonFloorPiece piece = geometry.PieceAtCell(cx, cz);
                        if (piece != null && !reached.Contains(DungeonGeometry.CellKey(cx, cz)))
                        {
                            owners.Add(piece.OwnerId);
                        }
                    }
                }

                report.Error("reach.unreachable", string.Join(", ", owners), (geometry.FloorCellCount - reached.Count) +
                                                                           " Bodenzellen sind vom Start aus nicht erreichbar (Lücke oder Stufe über " +
                                                                           Format(MaxStepUp) + " m).");
            }
        }

        private static void CheckDoors(DungeonLayout layout, DungeonGeometry geometry, DungeonLayoutReport report)
        {
            foreach (DungeonDoor door in layout.Doors)
            {
                if (!door.IsKnownKind)
                {
                    report.Error("door.kind", door.Id, "Unbekannte Türart '" + door.Kind + "'.");
                }

                if (door.Axis != "x" && door.Axis != "z")
                {
                    report.Error("door.axis", door.Id, "axis muss x oder z sein.");
                }

                if (!(door.Width > 0f && door.Height > 0f))
                {
                    report.Error("door.size", door.Id, "Breite und Höhe müssen größer als 0 sein.");
                }

                if (!geometry.IsOnFloor(door.X, door.Z))
                {
                    report.Error("door.floor", door.Id, "Die Tür steht nicht auf einem Boden.");
                }
                else
                {
                    float clearance = DoorClearance(geometry, door);
                    if (door.Height < clearance - 0.1f)
                    {
                        report.Warning("door.gap", door.Id, "Über der Tür bleibt eine Lücke (" + Format(clearance - door.Height) + " m).");
                    }
                }

                CheckTrigger(layout, door.OpensOn, door.Id, report, "door.trigger");
                if (door.OpensOn.Type == DungeonTrigger.PuzzleFailed || door.OpensOn.Type == DungeonTrigger.Always)
                {
                    report.Error("door.trigger", door.Id, "Türen öffnen sich nicht über '" + door.OpensOn.Type + "'.");
                }
            }
        }

        private static void CheckTrigger(DungeonLayout layout, DungeonTrigger trigger, string owner, DungeonLayoutReport report, string code)
        {
            if (trigger == null || !trigger.IsKnownType)
            {
                report.Error(code, owner, "Unbekannter Auslöser '" + (trigger != null ? trigger.Type : "null") + "'.");
                return;
            }

            if (!trigger.NeedsId)
            {
                return;
            }

            if (string.IsNullOrEmpty(trigger.Id))
            {
                report.Error(code, owner, "Auslöser '" + trigger.Type + "' braucht eine id.");
                return;
            }

            bool found;
            switch (trigger.Type)
            {
                case DungeonTrigger.Puzzle:
                case DungeonTrigger.PuzzleFailed:
                    found = layout.FindPuzzle(trigger.Id) != null;
                    break;
                case DungeonTrigger.Lever:
                    found = IsKind(layout, trigger.Id, DungeonObject.Lever);
                    break;
                case DungeonTrigger.PressurePlate:
                    found = IsKind(layout, trigger.Id, DungeonObject.PressurePlate);
                    break;
                case DungeonTrigger.BossDefeated:
                case DungeonTrigger.Arena:
                    found = layout.BossArena != null && layout.BossArena.BossId == trigger.Id;
                    break;
                default:
                    found = layout.FindObject(trigger.Id) != null || layout.FindDoor(trigger.Id) != null || layout.FindPuzzle(trigger.Id) != null;
                    break;
            }

            if (!found)
            {
                report.Error(code, owner, "Auslöser '" + trigger + "' verweist auf eine unbekannte oder falsche ID.");
            }
        }

        private static void CheckObjects(DungeonLayout layout, DungeonGeometry geometry, DungeonLayoutReport report)
        {
            foreach (DungeonObject item in layout.Objects)
            {
                if (!item.IsKnownKind)
                {
                    report.Error("object.kind", item.Id, "Unbekannte Objektart '" + item.Kind + "'.");
                    continue;
                }

                bool placed = item.IsWallMounted ? geometry.IsNearFloor(item.X, item.Z, 0.5f) : geometry.IsOnFloor(item.X, item.Z);
                if (!placed)
                {
                    report.Error("object.floor", item.Id, item.IsWallMounted ? "Das Wandobjekt liegt nicht an einem Raum." : "Das Objekt steht nicht auf einem Boden.");
                }

                if (item.HasSize && !(item.SizeX > 0f && item.SizeY > 0f && item.SizeZ > 0f))
                {
                    report.Error("object.size", item.Id, "size braucht drei positive Werte.");
                }

                // Chests build their prompt from the tier ("Oeffnen: Versteckte Truhe", LootChest).
                if (item.IsInteractive && item.Kind != DungeonObject.Chest && string.IsNullOrEmpty(item.Prompt))
                {
                    report.Error("object.prompt", item.Id, "Interaktive Objekte brauchen einen Hinweistext (prompt).");
                }

                if (item.IsReadable && string.IsNullOrEmpty(item.Text))
                {
                    report.Error("object.text", item.Id, "Lesbare Objekte brauchen einen Text.");
                }

                if (item.Kind == DungeonObject.WallRelief)
                {
                    RequirePrefix(report, item.ClueId, "clue.", "object.clue", item.Id);
                }

                if (item.Kind == DungeonObject.Reward || item.Kind == DungeonObject.SealStone)
                {
                    RequirePrefix(report, item.ItemId, "item.", "object.item", item.Id);
                }

                if (item.Kind == DungeonObject.Chest)
                {
                    RequirePrefix(report, item.LootTable, "loot.", "object.loot", item.Id);
                    if (Array.IndexOf(ChestTiers, item.Tier) < 0)
                    {
                        report.Error("object.tier", item.Id, "Unbekannte Truhenstufe '" + item.Tier + "'.");
                    }
                }

                if (item.Kind == DungeonObject.Portal && layout.FindExit(item.Id) == null)
                {
                    report.Error("object.exit", item.Id, "Zum Ausgang fehlt der Eintrag in exits.");
                }

                if (item.Kind == DungeonObject.GraveSlab && string.IsNullOrEmpty(item.Relief))
                {
                    report.Error("object.relief", item.Id, "Grabplatten brauchen ein Relief (eiche, krone, schild).");
                }
            }
        }

        private static void CheckPuzzles(DungeonLayout layout, DungeonLayoutReport report)
        {
            foreach (DungeonPuzzle puzzle in layout.Puzzles)
            {
                if (!string.IsNullOrEmpty(puzzle.Door) && layout.FindDoor(puzzle.Door) == null)
                {
                    report.Error("puzzle.door", puzzle.Id, "Unbekannte Tür " + puzzle.Door + ".");
                }

                if (puzzle.HintAfterSeconds < 0f)
                {
                    report.Error("puzzle.hint", puzzle.Id, "hintAfterSeconds darf nicht negativ sein.");
                }

                foreach (string hint in puzzle.HintObjects)
                {
                    if (layout.FindObject(hint) == null)
                    {
                        report.Error("puzzle.hint", puzzle.Id, "Unbekanntes Hinweis-Objekt " + hint + ".");
                    }
                }

                if (puzzle.IsSequence)
                {
                    CheckSequence(layout, puzzle, report);
                }
                else if (puzzle.IsMirror)
                {
                    CheckMirrorPuzzle(layout, puzzle, report);
                }
                else
                {
                    report.Error("puzzle.type", puzzle.Id, "Unbekannte Rätselart '" + puzzle.Type + "' (sequence, mirror).");
                }
            }
        }

        private static void CheckSequence(DungeonLayout layout, DungeonPuzzle puzzle, DungeonLayoutReport report)
        {
            if (puzzle.Steps.Count < 2)
            {
                report.Error("puzzle.steps", puzzle.Id, "Eine Reihenfolge braucht mindestens 2 Schritte.");
            }

            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (string step in puzzle.Steps)
            {
                if (!seen.Add(step))
                {
                    report.Error("puzzle.steps", puzzle.Id, "Schritt " + step + " kommt doppelt vor.");
                }

                if (!IsKind(layout, step, DungeonObject.GraveSlab) && !IsKind(layout, step, DungeonObject.Lever))
                {
                    report.Error("puzzle.steps", puzzle.Id, "Schritt " + step + " ist keine Grabplatte und kein Hebel.");
                }
            }

            if (!string.IsNullOrEmpty(puzzle.FailTrap))
            {
                DungeonTrap trap = layout.FindTrap(puzzle.FailTrap);
                if (trap == null)
                {
                    report.Error("puzzle.trap", puzzle.Id, "Unbekannte Falle " + puzzle.FailTrap + ".");
                }
                else if (trap.Trigger.Type != DungeonTrigger.PuzzleFailed || trap.Trigger.Id != puzzle.Id)
                {
                    report.Error("puzzle.trap", puzzle.Id, "Die Falle " + trap.Id + " löst nicht bei einem Fehlversuch dieses Rätsels aus.");
                }
            }
        }

        private static void CheckMirrorPuzzle(DungeonLayout layout, DungeonPuzzle puzzle, DungeonLayoutReport report)
        {
            DungeonObject source = layout.FindObject(puzzle.Source);
            DungeonObject target = layout.FindObject(puzzle.Target);
            if (source == null || source.Kind != DungeonObject.AetherCrack)
            {
                report.Error("puzzle.source", puzzle.Id, "Die Lichtquelle muss ein aether_crack sein.");
            }

            if (target == null || target.Kind != DungeonObject.Seal)
            {
                report.Error("puzzle.target", puzzle.Id, "Das Ziel muss ein seal sein.");
            }

            if (puzzle.Mirrors.Count == 0)
            {
                report.Error("puzzle.mirrors", puzzle.Id, "Das Lichträtsel braucht Spiegel.");
                return;
            }

            var start = new List<BeamMirror>();
            var solution = new List<BeamMirror>();
            foreach (DungeonPuzzleMirror mirror in puzzle.Mirrors)
            {
                DungeonObject item = layout.FindObject(mirror.Id);
                if (item == null || item.Kind != DungeonObject.Mirror)
                {
                    report.Error("puzzle.mirrors", puzzle.Id, mirror.Id + " ist kein Spiegel-Objekt.");
                    continue;
                }

                start.Add(new BeamMirror(item.Id, new PlanarPoint(item.X, item.Z), mirror.Start));
                solution.Add(new BeamMirror(item.Id, new PlanarPoint(item.X, item.Z), mirror.Solution));
            }

            if (source == null || target == null)
            {
                return;
            }

            var from = new PlanarPoint(source.X, source.Z);
            var to = new PlanarPoint(target.X, target.Z);
            BeamTrace solved = MirrorBeamTracer.Trace(from, puzzle.SourceDirection, solution, to);
            if (!solved.HitTarget || solved.MirrorsHit.Count != puzzle.Mirrors.Count)
            {
                report.Error("puzzle.unsolvable", puzzle.Id, "Mit der angegebenen Lösung trifft der Strahl das Siegel nicht über alle Spiegel (" +
                                                             solved.MirrorsHit.Count + " von " + puzzle.Mirrors.Count + " Spiegeln).");
            }

            BeamTrace initial = MirrorBeamTracer.Trace(from, puzzle.SourceDirection, start, to);
            if (initial.HitTarget)
            {
                report.Error("puzzle.presolved", puzzle.Id, "Das Rätsel ist schon in der Startstellung gelöst.");
            }
        }

        private static void CheckTraps(DungeonLayout layout, DungeonLayoutReport report)
        {
            foreach (DungeonTrap trap in layout.Traps)
            {
                if (!(trap.DamageFraction > 0f && trap.DamageFraction <= 1f))
                {
                    report.Error("trap.damage", trap.Id, "damageFraction muss in (0, 1] liegen.");
                }

                if (trap.Trigger.Type != DungeonTrigger.PuzzleFailed && trap.Trigger.Type != DungeonTrigger.PressurePlate)
                {
                    report.Error("trap.trigger", trap.Id, "Fallen lösen über puzzleFailed oder pressurePlate aus.");
                }
                else
                {
                    CheckTrigger(layout, trap.Trigger, trap.Id, report, "trap.trigger");
                }

                if (trap.Slits.Count == 0)
                {
                    report.Error("trap.slits", trap.Id, "Die Falle braucht mindestens einen Pfeilschlitz.");
                }

                foreach (string slit in trap.Slits)
                {
                    if (!IsKind(layout, slit, DungeonObject.TrapSlit))
                    {
                        report.Error("trap.slits", trap.Id, slit + " ist kein trap_slit.");
                    }
                }
            }
        }

        private static void CheckSpawners(DungeonLayout layout, DungeonGeometry geometry, DungeonLayoutReport report)
        {
            foreach (DungeonSpawner spawner in layout.Spawners)
            {
                DungeonRoom room = layout.FindRoom(spawner.Room);
                if (room == null)
                {
                    report.Error("spawner.room", spawner.Id, "Unbekannter Raum " + spawner.Room + ".");
                }

                CheckTrigger(layout, spawner.Activation, spawner.Id, report, "spawner.activation");
                if (spawner.Enemies.Count == 0)
                {
                    report.Error("spawner.empty", spawner.Id, "Der Spawner hat keine Gegner.");
                }

                foreach (DungeonEnemy enemy in spawner.Enemies)
                {
                    CheckEnemyPlacement(geometry, room, enemy, report);
                }
            }
        }

        private static void CheckEnemyPlacement(DungeonGeometry geometry, DungeonRoom room, DungeonEnemy enemy, DungeonLayoutReport report)
        {
            if (!geometry.IsOnFloor(enemy.X, enemy.Z) || (room != null && !room.Bounds.Contains(enemy.X, enemy.Z)))
            {
                report.Error("enemy.floor", enemy.UniqueId, "Der Gegner steht nicht im Raum " + (room != null ? room.Id : "?") + ".");
            }

            foreach (DungeonPoint point in enemy.Patrol)
            {
                if (!geometry.IsOnFloor(point.X, point.Z))
                {
                    report.Error("enemy.patrol", enemy.UniqueId, "Ein Patrouillenpunkt liegt nicht auf einem Boden.");
                }
            }
        }

        private static void CheckZones(DungeonLayout layout, DungeonGeometry geometry, DungeonLayoutReport report)
        {
            bool spawnInDungeonZone = false;
            foreach (DungeonArea area in layout.Areas)
            {
                if (!(area.Bounds.Width > 0f && area.Bounds.Depth > 0f) || !geometry.IsOnFloor(area.Bounds.CenterX, area.Bounds.CenterZ))
                {
                    report.Error("zone.floor", area.Id, "Die Zone liegt nicht über einem Boden.");
                }

                if (area.LocationId == layout.LocationId && area.Bounds.Contains(layout.Spawn.X, layout.Spawn.Z))
                {
                    spawnInDungeonZone = true;
                }
            }

            if (!spawnInDungeonZone)
            {
                report.Warning("zone.spawn", layout.Spawn.Id, "Der Start liegt in keiner Zone mit " + layout.LocationId + " (Ziel „Gehe zu“ beim Betreten).");
            }

            foreach (DungeonCheckpoint checkpoint in layout.Checkpoints)
            {
                if (!geometry.IsOnFloor(checkpoint.Bounds.CenterX, checkpoint.Bounds.CenterZ))
                {
                    report.Error("checkpoint.floor", checkpoint.Id, "Die Zone liegt nicht über einem Boden.");
                }

                if (!geometry.IsOnFloor(checkpoint.RespawnX, checkpoint.RespawnZ))
                {
                    report.Error("checkpoint.respawn", checkpoint.Id, "Der Wiedereinstieg liegt nicht auf einem Boden.");
                }
            }
        }

        private static void CheckExits(DungeonLayout layout, DungeonLayoutReport report)
        {
            if (layout.Exits.Count == 0)
            {
                report.Error("exit.missing", layout.Id, "Der Dungeon hat keinen Ausgang.");
            }

            foreach (DungeonExit exit in layout.Exits)
            {
                if (!IsKind(layout, exit.ObjectId, DungeonObject.Portal))
                {
                    report.Error("exit.object", exit.ObjectId, "Der Ausgang braucht ein portal-Objekt.");
                }

                if (string.IsNullOrEmpty(exit.TargetSceneKey) || !exit.TargetSceneKey.EndsWith(".unity", StringComparison.Ordinal))
                {
                    report.Error("exit.scene", exit.ObjectId, "targetSceneKey muss ein Szenenpfad mit .unity sein.");
                }

                RequirePrefix(report, exit.TargetAnchorId, "anchor.", "exit.anchor", exit.ObjectId);
            }
        }

        private static void CheckArena(DungeonLayout layout, DungeonGeometry geometry, DungeonLayoutReport report)
        {
            DungeonBossArena arena = layout.BossArena;
            if (arena == null)
            {
                return;
            }

            RequirePrefix(report, arena.BossId, "boss.", "arena.boss", arena.Id);
            RequirePrefix(report, arena.EnemyType, "enemy.", "arena.type", arena.Id);
            if (!string.IsNullOrEmpty(arena.LootTable))
            {
                RequirePrefix(report, arena.LootTable, "loot.", "arena.loot", arena.Id);
            }

            if (!string.IsNullOrEmpty(arena.Music))
            {
                RequirePrefix(report, arena.Music, "mus.", "arena.music", arena.Id);
            }

            DungeonRoom room = layout.FindRoom(arena.Room);
            if (room == null)
            {
                report.Error("arena.room", arena.Id, "Unbekannter Raum " + arena.Room + ".");
                return;
            }

            if (room.Bounds.Width < MinArenaSize || room.Bounds.Depth < MinArenaSize)
            {
                report.Error("arena.size", arena.Id, "Die Arena ist " + Format(room.Bounds.Width) + " × " + Format(room.Bounds.Depth) +
                                                     " m groß (mindestens 25 × 25 m, GDD 03, 9.6).");
            }

            if (!room.Bounds.Encloses(arena.EncounterArea))
            {
                report.Error("arena.area", arena.Id, "Der Kampfbereich liegt nicht ganz im Raum.");
            }

            if (!arena.EncounterArea.Contains(arena.X, arena.Z) || !geometry.IsOnFloor(arena.X, arena.Z))
            {
                report.Error("arena.boss_position", arena.Id, "Der Boss steht nicht im Kampfbereich.");
            }

            if (arena.Covers.Count < 2 || arena.Covers.Count > 4)
            {
                report.Error("arena.covers", arena.Id, "Eine Arena braucht 2 bis 4 Deckungen (GDD 03, 9.6).");
            }

            foreach (string cover in arena.Covers)
            {
                DungeonObject item = layout.FindObject(cover);
                if (item == null || !item.IsSolid || !room.Bounds.Contains(item.X, item.Z))
                {
                    report.Error("arena.covers", arena.Id, cover + " ist keine feste Deckung im Raum.");
                }
            }

            foreach (string gate in arena.CloseGates)
            {
                DungeonDoor door = layout.FindDoor(gate);
                if (door == null || door.OpensOn.Type != DungeonTrigger.Arena || door.OpensOn.Id != arena.BossId)
                {
                    report.Error("arena.gates", arena.Id, gate + " ist kein Arena-Tor dieses Bosses.");
                    continue;
                }

                float gap = DistanceToRect(door.X, door.Z, arena.EncounterArea);
                if (gap < MinGateGap)
                {
                    report.Error("arena.gate_gap", arena.Id, "Der Kampfbereich beginnt nur " + Format(gap) + " m hinter " + gate +
                                                             " (mindestens 3 m, sonst kann sich der Spieler beim Schließen aussperren).");
                }
            }

            if (arena.CloseGates.Count == 0)
            {
                report.Error("arena.gates", arena.Id, "Die Arena wird nicht geschlossen (GDD 03, 9.6).");
            }

            bool mechanic = IsKind(layout, arena.Mirror, DungeonObject.Mirror) && IsKind(layout, arena.BeamSource, DungeonObject.AetherCrack);
            if (!mechanic)
            {
                report.Error("arena.mechanic", arena.Id, "Die Arena braucht ihre Umgebungsmechanik (Spiegel und Lichtquelle).");
            }
            else
            {
                DungeonObject mirror = layout.FindObject(arena.Mirror);
                DungeonObject crack = layout.FindObject(arena.BeamSource);
                float along = MirrorBeamTracer.AlongRay(new PlanarPoint(crack.X, crack.Z), arena.BeamSourceDirection, new PlanarPoint(mirror.X, mirror.Z));
                if (float.IsNaN(along))
                {
                    report.Error("arena.mechanic", arena.Id, "Der Strahl der Lichtquelle trifft den Arena-Spiegel nicht.");
                }
            }

            CheckArenaPhases(arena, report);
            foreach (DungeonEnemy add in arena.Adds)
            {
                CheckEnemyPlacement(geometry, room, add, report);
            }

            int summons = 0;
            foreach (DungeonBossPhase phase in arena.Phases)
            {
                summons += phase.Summon;
            }

            if (summons > arena.Adds.Count)
            {
                report.Error("arena.adds", arena.Id, "Die Phasen rufen " + summons + " Gegner, es gibt aber nur " + arena.Adds.Count + ".");
            }

            if (!IsKind(layout, arena.Reward, DungeonObject.Reward))
            {
                report.Error("arena.reward", arena.Id, "Die garantierte Beute braucht ein reward-Objekt.");
            }

            if (!IsKind(layout, arena.SealStone, DungeonObject.SealStone))
            {
                report.Error("arena.seal_stone", arena.Id, "Der Siegelstein fehlt.");
            }
        }

        private static float DistanceToRect(float x, float z, in DungeonRect rect)
        {
            float dx = Math.Max(Math.Max(rect.X - x, 0f), x - rect.MaxX);
            float dz = Math.Max(Math.Max(rect.Z - z, 0f), z - rect.MaxZ);
            return (float)Math.Sqrt(dx * dx + dz * dz);
        }

        private static void CheckArenaPhases(DungeonBossArena arena, DungeonLayoutReport report)
        {
            if (arena.Phases.Count == 0)
            {
                report.Error("arena.phases", arena.Id, "Der Boss braucht mindestens eine Phase.");
                return;
            }

            if (arena.Phases[0].Phase != 1 || Math.Abs(arena.Phases[0].FromHealth - 1f) > 1e-4f)
            {
                report.Error("arena.phases", arena.Id, "Phase 1 beginnt bei voller Gesundheit (fromHealth 1.0).");
            }

            for (int i = 1; i < arena.Phases.Count; i++)
            {
                DungeonBossPhase phase = arena.Phases[i];
                DungeonBossPhase previous = arena.Phases[i - 1];
                if (phase.Phase != previous.Phase + 1 || !(phase.FromHealth < previous.FromHealth) || !(phase.FromHealth > 0f))
                {
                    report.Error("arena.phases", arena.Id, "Phasen müssen fortlaufend nummeriert sein und bei fallender Gesundheit beginnen.");
                }
            }

            if (arena.BeamFromPhase < 1 || arena.BeamFromPhase > arena.Phases.Count)
            {
                report.Error("arena.phases", arena.Id, "beamFromPhase liegt außerhalb der Phasen.");
            }

            if (!(arena.BeamStunSeconds > 0f) || arena.BeamCooldownSeconds < 0f)
            {
                report.Error("arena.beam", arena.Id, "Betäubung muss länger als 0 s sein, die Abklingzeit 0 s oder mehr.");
            }
        }

        private static void CheckLights(DungeonLayout layout, DungeonGeometry geometry, DungeonLayoutReport report)
        {
            var perRoom = new Dictionary<string, int>(StringComparer.Ordinal);
            for (int i = 0; i < layout.Lights.Count; i++)
            {
                DungeonLight light = layout.Lights[i];
                string id = "light[" + i + "]";
                if (!light.IsKnownKind)
                {
                    report.Error("light.kind", id, "Unbekannte Lichtart '" + light.Kind + "'.");
                }

                if (!(light.Range > 0f && light.Intensity > 0f))
                {
                    report.Error("light.values", id, "range und intensity müssen größer als 0 sein.");
                }

                if (!geometry.IsNearFloor(light.X, light.Z, 0.5f))
                {
                    report.Error("light.floor", id, "Das Licht liegt außerhalb der Räume.");
                    continue;
                }

                foreach (DungeonRoom room in layout.Rooms)
                {
                    if (room.Bounds.ContainsWithin(light.X, light.Z, 0.5f))
                    {
                        perRoom.TryGetValue(room.Id, out int count);
                        perRoom[room.Id] = count + 1;
                    }
                }
            }

            foreach (KeyValuePair<string, int> pair in perRoom)
            {
                if (pair.Value > MaxLightsPerRoom)
                {
                    report.Warning("light.count", pair.Key, pair.Value + " Lichter in einem Raum (URP rechnet höchstens " + MaxLightsPerRoom +
                                                            " Zusatzlichter je Objekt).");
                }
            }
        }

        private static float DoorClearance(DungeonGeometry geometry, DungeonDoor door)
        {
            // The opening is as high as the lowest ceiling on either side of the door (the door may stand just inside a room).
            float floor = FloorOf(geometry, door.X, door.Z, door.Y);
            float ceiling = geometry.CeilingAt(door.X, door.Z);
            for (int side = -1; side <= 1; side += 2)
            {
                float x = door.SpansX ? door.X : door.X + side * 0.6f;
                float z = door.SpansX ? door.Z + side * 0.6f : door.Z;
                if (geometry.IsOnFloor(x, z))
                {
                    ceiling = Math.Min(ceiling, geometry.CeilingAt(x, z));
                }
            }

            return ceiling - floor;
        }

        private static float FloorOf(DungeonGeometry geometry, float x, float z, float explicitY)
        {
            return float.IsNaN(explicitY) ? geometry.FloorAt(x, z) : explicitY;
        }

        private static bool IsKind(DungeonLayout layout, string id, string kind)
        {
            DungeonObject item = layout.FindObject(id);
            return item != null && item.Kind == kind;
        }

        private static void Unique(HashSet<string> seen, string id, DungeonLayoutReport report)
        {
            if (string.IsNullOrEmpty(id))
            {
                report.Error("id.missing", string.Empty, "Ein Eintrag hat keine ID.");
                return;
            }

            if (!IsValidIdText(id))
            {
                report.Error("id.format", id, "IDs nur aus a–z, 0–9, _ und Punkten (snake_case, Architektur 6.1).");
            }

            if (!seen.Add(id))
            {
                report.Error("id.duplicate", id, "Die ID kommt doppelt vor.");
            }
        }

        private static void RequirePrefix(DungeonLayoutReport report, string id, string prefix, string code, string subject)
        {
            if (string.IsNullOrEmpty(id) || !id.StartsWith(prefix, StringComparison.Ordinal) || !IsValidIdText(id))
            {
                report.Error(code, subject, "'" + id + "' muss mit " + prefix + " beginnen und snake_case sein.");
            }
        }

        private static bool IsWhole(float value)
        {
            return Math.Abs(value - Math.Round(value)) < 1e-4;
        }

        private static string Format(float value)
        {
            // German decimal comma without depending on installed cultures (IL2CPP, invariant globalization).
            return value.ToString("0.##", CultureInfo.InvariantCulture).Replace('.', ',');
        }
    }
}
