using System.Collections.Generic;
using Aetherfall.World.Puzzles;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Reads a dungeon layout file (format <c>aetherfall.dungeon_layout</c>, version 1) into a <see cref="DungeonLayout"/>.
    /// Missing required fields, wrong types and unknown directions throw <see cref="DungeonLayoutException"/> with the path of
    /// the field; content rules (ids, connections, puzzle solvable …) are checked afterwards by
    /// <see cref="DungeonLayoutValidator"/>. Pure C#.
    /// </summary>
    public static class DungeonLayoutReader
    {
        /// <summary>Parses and maps the text of a layout file.</summary>
        /// <param name="json">File content.</param>
        /// <returns>The layout.</returns>
        /// <exception cref="DungeonLayoutException">Broken JSON or a missing/wrongly typed field.</exception>
        public static DungeonLayout Read(string json)
        {
            DungeonJsonValue root = DungeonJsonParser.Parse(json);
            root.RequireKind(DungeonJsonKind.Object);
            var layout = new DungeonLayout
            {
                Format = root.GetString("format"),
                Version = root.GetInt("version"),
                Id = root.GetString("id"),
                Name = root.GetString("name"),
                NameEn = root.GetString("nameEn", string.Empty),
                RegionId = root.GetString("regionId", string.Empty),
                LocationId = root.GetString("locationId", string.Empty),
                QuestId = root.GetString("questId", string.Empty),
                WorldSpaceId = root.GetString("worldSpaceId", string.Empty),
                SceneKey = root.GetString("sceneKey", string.Empty),
                AreaLevel = root.GetInt("areaLevel", 1),
                CellSize = root.GetFloat("cellSize", 1f),
                WallThickness = root.GetFloat("wallThickness", 0.6f),
                Source = root.GetString("source", string.Empty)
            };

            if (layout.Format != DungeonLayout.FormatId)
            {
                throw new DungeonLayoutException("Feld 'format' muss '" + DungeonLayout.FormatId + "' sein (gefunden: '" + layout.Format + "').");
            }

            if (layout.Version != DungeonLayout.SupportedVersion)
            {
                throw new DungeonLayoutException("Version " + layout.Version + " wird nicht unterstützt (erwartet: " + DungeonLayout.SupportedVersion + ").");
            }

            layout.Notes.AddRange(root.GetStringList("notes"));
            DungeonJsonValue atmosphere = root.Member("atmosphere");
            if (atmosphere != null)
            {
                layout.Atmosphere = ReadAtmosphere(atmosphere);
            }

            foreach (DungeonJsonValue item in root.GetArray("rooms"))
            {
                layout.Rooms.Add(ReadRoom(item));
            }

            foreach (DungeonJsonValue item in root.GetArray("corridors"))
            {
                layout.Corridors.Add(ReadCorridor(item));
            }

            foreach (DungeonJsonValue item in root.GetArray("doors"))
            {
                layout.Doors.Add(ReadDoor(item));
            }

            foreach (DungeonJsonValue item in root.GetArray("puzzles"))
            {
                layout.Puzzles.Add(ReadPuzzle(item));
            }

            foreach (DungeonJsonValue item in root.GetArray("traps"))
            {
                layout.Traps.Add(ReadTrap(item));
            }

            foreach (DungeonJsonValue item in root.GetArray("objects"))
            {
                layout.Objects.Add(ReadObject(item));
            }

            foreach (DungeonJsonValue item in root.GetArray("spawners"))
            {
                layout.Spawners.Add(ReadSpawner(item));
            }

            foreach (DungeonJsonValue item in root.GetArray("areas"))
            {
                layout.Areas.Add(new DungeonArea { Id = item.GetString("id"), LocationId = item.GetString("locationId"), Bounds = ReadRect(item) });
            }

            foreach (DungeonJsonValue item in root.GetArray("checkpoints"))
            {
                layout.Checkpoints.Add(ReadCheckpoint(item));
            }

            DungeonJsonValue spawn = root.Required("spawn");
            layout.Spawn = new DungeonSpawn
            {
                Id = spawn.GetString("id"),
                AnchorId = spawn.GetString("anchorId", string.Empty),
                X = spawn.GetFloat("x"),
                Z = spawn.GetFloat("z"),
                Yaw = spawn.GetFloat("yaw", 0f)
            };

            foreach (DungeonJsonValue item in root.GetArray("exits"))
            {
                layout.Exits.Add(new DungeonExit
                {
                    ObjectId = item.GetString("object"),
                    TargetSceneKey = item.GetString("targetSceneKey"),
                    TargetTitle = item.GetString("targetTitle", string.Empty),
                    TargetAnchorId = item.GetString("targetAnchorId", string.Empty)
                });
            }

            DungeonJsonValue arena = root.Member("bossArena");
            if (arena != null)
            {
                layout.BossArena = ReadArena(arena);
            }

            foreach (DungeonJsonValue item in root.GetArray("lights"))
            {
                layout.Lights.Add(ReadLight(item));
            }

            return layout;
        }

        private static DungeonAtmosphere ReadAtmosphere(DungeonJsonValue value)
        {
            var defaults = new DungeonAtmosphere();
            return new DungeonAtmosphere
            {
                AmbientColor = value.GetString("ambientColor", defaults.AmbientColor),
                FogColor = value.GetString("fogColor", defaults.FogColor),
                FogDensity = value.GetFloat("fogDensity", defaults.FogDensity),
                StoneColor = value.GetString("stoneColor", defaults.StoneColor),
                FloorColor = value.GetString("floorColor", defaults.FloorColor),
                CeilingColor = value.GetString("ceilingColor", defaults.CeilingColor),
                TorchColor = value.GetString("torchColor", defaults.TorchColor),
                AetherColor = value.GetString("aetherColor", defaults.AetherColor),
                DaylightColor = value.GetString("daylightColor", defaults.DaylightColor)
            };
        }

        private static DungeonRoom ReadRoom(DungeonJsonValue value)
        {
            return new DungeonRoom
            {
                Id = value.GetString("id"),
                Name = value.GetString("name", string.Empty),
                Bounds = ReadRect(value),
                FloorY = value.GetFloat("floorY"),
                Height = value.GetFloat("height")
            };
        }

        private static DungeonRect ReadRect(DungeonJsonValue value)
        {
            return new DungeonRect(value.GetFloat("x"), value.GetFloat("z"), value.GetFloat("width"), value.GetFloat("depth"));
        }

        private static DungeonCorridor ReadCorridor(DungeonJsonValue value)
        {
            var corridor = new DungeonCorridor
            {
                Id = value.GetString("id"),
                Name = value.GetString("name", string.Empty),
                Width = value.GetFloat("width"),
                Height = value.GetFloat("height")
            };

            DungeonJsonValue points = value.Required("points");
            points.RequireKind(DungeonJsonKind.Array);
            foreach (DungeonJsonValue point in points.Items)
            {
                point.RequireKind(DungeonJsonKind.Array);
                if (point.Count != 3)
                {
                    throw new DungeonLayoutException("Feld '" + point.Path + "' braucht genau 3 Zahlen [x, z, y].");
                }

                corridor.Points.Add(new DungeonCorridorPoint(point.Items[0].AsFloat(), point.Items[1].AsFloat(), point.Items[2].AsFloat()));
            }

            return corridor;
        }

        private static DungeonDoor ReadDoor(DungeonJsonValue value)
        {
            return new DungeonDoor
            {
                Id = value.GetString("id"),
                Name = value.GetString("name", string.Empty),
                Kind = value.GetString("kind"),
                X = value.GetFloat("x"),
                Z = value.GetFloat("z"),
                Y = value.GetFloat("y", float.NaN),
                Axis = value.GetString("axis", "x"),
                Width = value.GetFloat("width"),
                Height = value.GetFloat("height"),
                StartsOpen = value.GetBool("startsOpen", false),
                OpensOn = ReadTrigger(value.Member("opensOn"), DungeonTrigger.None)
            };
        }

        private static DungeonTrigger ReadTrigger(DungeonJsonValue value, string defaultType)
        {
            if (value == null)
            {
                return new DungeonTrigger { Type = defaultType };
            }

            return new DungeonTrigger
            {
                Type = value.GetString("type"),
                Id = value.GetString("id", string.Empty),
                State = value.GetInt("state", 1)
            };
        }

        private static DungeonPuzzle ReadPuzzle(DungeonJsonValue value)
        {
            var puzzle = new DungeonPuzzle
            {
                Id = value.GetString("id"),
                Type = value.GetString("type"),
                Name = value.GetString("name", string.Empty),
                QuestStage = value.GetString("questStage", string.Empty),
                PuzzleType = value.GetString("puzzleType", string.Empty),
                Door = value.GetString("door", string.Empty),
                FailTrap = value.GetString("failTrap", string.Empty),
                HintAfterSeconds = value.GetFloat("hintAfterSeconds", 0f),
                Source = value.GetString("source", string.Empty),
                Target = value.GetString("target", string.Empty)
            };

            puzzle.Steps.AddRange(value.GetStringList("steps"));
            puzzle.HintObjects.AddRange(value.GetStringList("hintObjects"));
            if (value.Has("sourceDirection"))
            {
                puzzle.SourceDirection = ReadDirection(value.Required("sourceDirection"));
            }

            foreach (DungeonJsonValue mirror in value.GetArray("mirrors"))
            {
                puzzle.Mirrors.Add(new DungeonPuzzleMirror
                {
                    Id = mirror.GetString("id"),
                    Start = ReadDirection(mirror.Required("start")),
                    Solution = ReadDirection(mirror.Required("solution"))
                });
            }

            return puzzle;
        }

        private static GridDirection ReadDirection(DungeonJsonValue value)
        {
            string text = value.AsString();
            if (!GridDirections.TryParse(text, out GridDirection direction))
            {
                throw new DungeonLayoutException("Feld '" + value.Path + "' muss N, E, S oder W sein (gefunden: '" + text + "').");
            }

            return direction;
        }

        private static DungeonTrap ReadTrap(DungeonJsonValue value)
        {
            var trap = new DungeonTrap
            {
                Id = value.GetString("id"),
                Name = value.GetString("name", string.Empty),
                Kind = value.GetString("kind", "arrows"),
                DamageFraction = value.GetFloat("damageFraction", 0.1f),
                Trigger = ReadTrigger(value.Required("trigger"), DungeonTrigger.None)
            };

            trap.Slits.AddRange(value.GetStringList("slits"));
            return trap;
        }

        private static DungeonObject ReadObject(DungeonJsonValue value)
        {
            var result = new DungeonObject
            {
                Id = value.GetString("id"),
                Kind = value.GetString("kind"),
                Name = value.GetString("name", string.Empty),
                X = value.GetFloat("x"),
                Z = value.GetFloat("z"),
                Y = value.GetFloat("y", float.NaN),
                Height = value.GetFloat("height", 0f),
                Yaw = value.GetFloat("yaw", 0f),
                Prompt = value.GetString("prompt", string.Empty),
                Text = value.GetString("text", string.Empty),
                ClueId = value.GetString("clueId", string.Empty),
                Tier = value.GetString("tier", string.Empty),
                LootTable = value.GetString("lootTable", string.Empty),
                Relief = value.GetString("relief", string.Empty),
                ItemId = value.GetString("itemId", string.Empty)
            };

            DungeonJsonValue size = value.Member("size");
            if (size != null)
            {
                size.RequireKind(DungeonJsonKind.Array);
                if (size.Count != 3)
                {
                    throw new DungeonLayoutException("Feld '" + size.Path + "' braucht genau 3 Zahlen [Breite, Höhe, Tiefe].");
                }

                result.HasSize = true;
                result.SizeX = size.Items[0].AsFloat();
                result.SizeY = size.Items[1].AsFloat();
                result.SizeZ = size.Items[2].AsFloat();
            }

            return result;
        }

        private static DungeonSpawner ReadSpawner(DungeonJsonValue value)
        {
            var spawner = new DungeonSpawner
            {
                Id = value.GetString("id"),
                Name = value.GetString("name", string.Empty),
                Room = value.GetString("room", string.Empty),
                Activation = ReadTrigger(value.Member("activation"), DungeonTrigger.Always)
            };

            foreach (DungeonJsonValue enemy in value.GetArray("enemies"))
            {
                spawner.Enemies.Add(ReadEnemy(enemy));
            }

            return spawner;
        }

        private static DungeonEnemy ReadEnemy(DungeonJsonValue value)
        {
            var enemy = new DungeonEnemy
            {
                Number = value.GetString("number"),
                Type = value.GetString("type"),
                Variant = value.GetString("variant", DungeonEnemy.Normal),
                X = value.GetFloat("x"),
                Z = value.GetFloat("z"),
                Yaw = value.GetFloat("yaw", 0f),
                Guard = value.GetBool("guard", true),
                TowerShield = value.GetBool("towerShield", false)
            };

            foreach (DungeonJsonValue point in value.GetArray("patrol"))
            {
                point.RequireKind(DungeonJsonKind.Array);
                if (point.Count != 2)
                {
                    throw new DungeonLayoutException("Feld '" + point.Path + "' braucht genau 2 Zahlen [x, z].");
                }

                enemy.Patrol.Add(new DungeonPoint(point.Items[0].AsFloat(), point.Items[1].AsFloat()));
            }

            return enemy;
        }

        private static DungeonCheckpoint ReadCheckpoint(DungeonJsonValue value)
        {
            var checkpoint = new DungeonCheckpoint
            {
                Id = value.GetString("id"),
                Name = value.GetString("name", string.Empty),
                Bounds = ReadRect(value),
                Autosave = value.GetBool("autosave", true)
            };

            DungeonJsonValue respawn = value.Required("respawn");
            checkpoint.RespawnX = respawn.GetFloat("x");
            checkpoint.RespawnZ = respawn.GetFloat("z");
            checkpoint.RespawnYaw = respawn.GetFloat("yaw", 0f);
            return checkpoint;
        }

        private static DungeonBossArena ReadArena(DungeonJsonValue value)
        {
            var arena = new DungeonBossArena
            {
                Id = value.GetString("id"),
                Room = value.GetString("room"),
                BossId = value.GetString("bossId"),
                Name = value.GetString("name"),
                Title = value.GetString("title", string.Empty),
                EnemyType = value.GetString("enemyType"),
                Variant = value.GetString("variant", DungeonEnemy.Champion),
                X = value.GetFloat("x"),
                Z = value.GetFloat("z"),
                Yaw = value.GetFloat("yaw", 0f),
                EncounterArea = ReadRect(value.Required("encounterArea")),
                Mirror = value.GetString("mirror", string.Empty),
                BeamSource = value.GetString("beamSource", string.Empty),
                BeamFromPhase = value.GetInt("beamFromPhase", 2),
                BeamStunSeconds = value.GetFloat("beamStunSeconds", 5f),
                BeamCooldownSeconds = value.GetFloat("beamCooldownSeconds", 8f),
                LootTable = value.GetString("lootTable", string.Empty),
                Reward = value.GetString("reward", string.Empty),
                SealStone = value.GetString("sealStone", string.Empty),
                Music = value.GetString("music", string.Empty)
            };

            if (value.Has("mirrorStart"))
            {
                arena.MirrorStart = ReadDirection(value.Required("mirrorStart"));
            }

            if (value.Has("beamSourceDirection"))
            {
                arena.BeamSourceDirection = ReadDirection(value.Required("beamSourceDirection"));
            }

            arena.CloseGates.AddRange(value.GetStringList("closeGates"));
            arena.Covers.AddRange(value.GetStringList("covers"));
            foreach (DungeonJsonValue phase in value.GetArray("phases"))
            {
                arena.Phases.Add(new DungeonBossPhase
                {
                    Phase = phase.GetInt("phase"),
                    FromHealth = phase.GetFloat("fromHealth"),
                    Summon = phase.GetInt("summon", 0)
                });
            }

            foreach (DungeonJsonValue add in value.GetArray("adds"))
            {
                arena.Adds.Add(ReadEnemy(add));
            }

            return arena;
        }

        private static DungeonLight ReadLight(DungeonJsonValue value)
        {
            return new DungeonLight
            {
                Kind = value.GetString("kind"),
                X = value.GetFloat("x"),
                Z = value.GetFloat("z"),
                Y = value.GetFloat("y", float.NaN),
                Height = value.GetFloat("height", float.NaN),
                Range = value.GetFloat("range", 8f),
                Intensity = value.GetFloat("intensity", 1f),
                Color = value.GetString("color", string.Empty)
            };
        }

        /// <summary>Collects every id the layout defines or mentions (for checks against the GDD id lists).</summary>
        /// <param name="layout">Layout.</param>
        /// <returns>Set of ids.</returns>
        public static HashSet<string> CollectIds(DungeonLayout layout)
        {
            var ids = new HashSet<string>(System.StringComparer.Ordinal);
            if (layout == null)
            {
                return ids;
            }

            Add(ids, layout.Id);
            Add(ids, layout.LocationId);
            Add(ids, layout.QuestId);
            Add(ids, layout.RegionId);
            Add(ids, layout.WorldSpaceId);
            layout.Rooms.ForEach(r => Add(ids, r.Id));
            layout.Corridors.ForEach(c => Add(ids, c.Id));
            layout.Doors.ForEach(d => Add(ids, d.Id));
            layout.Puzzles.ForEach(p => Add(ids, p.Id));
            layout.Traps.ForEach(t => Add(ids, t.Id));
            layout.Spawners.ForEach(s => Add(ids, s.Id));
            layout.Areas.ForEach(a =>
            {
                Add(ids, a.Id);
                Add(ids, a.LocationId);
            });
            layout.Checkpoints.ForEach(c => Add(ids, c.Id));
            foreach (DungeonObject item in layout.Objects)
            {
                Add(ids, item.Id);
                Add(ids, item.ClueId);
                Add(ids, item.ItemId);
                Add(ids, item.LootTable);
            }

            Add(ids, layout.Spawn.Id);
            Add(ids, layout.Spawn.AnchorId);
            layout.Exits.ForEach(e => Add(ids, e.TargetAnchorId));
            DungeonBossArena arena = layout.BossArena;
            if (arena != null)
            {
                Add(ids, arena.Id);
                Add(ids, arena.BossId);
                Add(ids, arena.EnemyType);
                Add(ids, arena.LootTable);
                Add(ids, arena.Music);
            }

            foreach (DungeonSpawner spawner in layout.Spawners)
            {
                spawner.Enemies.ForEach(e => Add(ids, e.Type));
            }

            return ids;
        }

        private static void Add(HashSet<string> ids, string id)
        {
            if (!string.IsNullOrEmpty(id))
            {
                ids.Add(id);
            }
        }
    }
}
