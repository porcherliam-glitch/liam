using System;
using System.Collections.Generic;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// A dungeon as data (one source for the Unity generator and the Blender preview): meta data, atmosphere, rooms, corridors,
    /// doors, puzzles, traps, objects, enemy spawners, location zones, checkpoints, spawn, exits, boss arena and lights. Read by
    /// <see cref="DungeonLayoutReader"/>, checked by <see cref="DungeonLayoutValidator"/>, turned into geometry by
    /// <see cref="DungeonGeometry"/>. Pure data, no UnityEngine.
    /// </summary>
    public sealed class DungeonLayout
    {
        /// <summary>Expected value of the field <c>format</c>.</summary>
        public const string FormatId = "aetherfall.dungeon_layout";

        /// <summary>Supported file version.</summary>
        public const int SupportedVersion = 1;

        /// <summary>Format id of the file.</summary>
        public string Format { get; set; } = FormatId;

        /// <summary>File version.</summary>
        public int Version { get; set; } = SupportedVersion;

        /// <summary>Dungeon id, e.g. <c>dungeon.eichental.vergessene_gruft</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>German name.</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>English working title.</summary>
        public string NameEn { get; set; } = string.Empty;

        /// <summary>Region id.</summary>
        public string RegionId { get; set; } = string.Empty;

        /// <summary>Location id of the dungeon (quest objective "Gehe zu").</summary>
        public string LocationId { get; set; } = string.Empty;

        /// <summary>Quest of the dungeon.</summary>
        public string QuestId { get; set; } = string.Empty;

        /// <summary>World space id of the dungeon scene (saved with the player).</summary>
        public string WorldSpaceId { get; set; } = string.Empty;

        /// <summary>Scene key (path) of the dungeon scene.</summary>
        public string SceneKey { get; set; } = string.Empty;

        /// <summary>Area level of the enemies (GDD 03 9.7: fixed per area; elite +2, champion +3).</summary>
        public int AreaLevel { get; set; } = 1;

        /// <summary>Grid cell size in metres (only 1 is supported).</summary>
        public float CellSize { get; set; } = 1f;

        /// <summary>Wall thickness in metres.</summary>
        public float WallThickness { get; set; } = 0.6f;

        /// <summary>Sources of the values (documentation).</summary>
        public string Source { get; set; } = string.Empty;

        /// <summary>Notes (documentation).</summary>
        public List<string> Notes { get; } = new List<string>();

        /// <summary>Mood.</summary>
        public DungeonAtmosphere Atmosphere { get; set; } = new DungeonAtmosphere();

        /// <summary>Rooms.</summary>
        public List<DungeonRoom> Rooms { get; } = new List<DungeonRoom>();

        /// <summary>Corridors.</summary>
        public List<DungeonCorridor> Corridors { get; } = new List<DungeonCorridor>();

        /// <summary>Doors.</summary>
        public List<DungeonDoor> Doors { get; } = new List<DungeonDoor>();

        /// <summary>Puzzles.</summary>
        public List<DungeonPuzzle> Puzzles { get; } = new List<DungeonPuzzle>();

        /// <summary>Traps.</summary>
        public List<DungeonTrap> Traps { get; } = new List<DungeonTrap>();

        /// <summary>Objects.</summary>
        public List<DungeonObject> Objects { get; } = new List<DungeonObject>();

        /// <summary>Enemy spawners.</summary>
        public List<DungeonSpawner> Spawners { get; } = new List<DungeonSpawner>();

        /// <summary>Location zones.</summary>
        public List<DungeonArea> Areas { get; } = new List<DungeonArea>();

        /// <summary>Checkpoints.</summary>
        public List<DungeonCheckpoint> Checkpoints { get; } = new List<DungeonCheckpoint>();

        /// <summary>Start point.</summary>
        public DungeonSpawn Spawn { get; set; } = new DungeonSpawn();

        /// <summary>Exits.</summary>
        public List<DungeonExit> Exits { get; } = new List<DungeonExit>();

        /// <summary>Boss arena, or null.</summary>
        public DungeonBossArena BossArena { get; set; }

        /// <summary>Lights.</summary>
        public List<DungeonLight> Lights { get; } = new List<DungeonLight>();

        /// <summary>Room by id, or null.</summary>
        /// <param name="id">Room id.</param>
        public DungeonRoom FindRoom(string id)
        {
            return Find(Rooms, id, r => r.Id);
        }

        /// <summary>Door by id, or null.</summary>
        /// <param name="id">Door id.</param>
        public DungeonDoor FindDoor(string id)
        {
            return Find(Doors, id, d => d.Id);
        }

        /// <summary>Puzzle by id, or null.</summary>
        /// <param name="id">Puzzle id.</param>
        public DungeonPuzzle FindPuzzle(string id)
        {
            return Find(Puzzles, id, p => p.Id);
        }

        /// <summary>Trap by id, or null.</summary>
        /// <param name="id">Trap id.</param>
        public DungeonTrap FindTrap(string id)
        {
            return Find(Traps, id, t => t.Id);
        }

        /// <summary>Object by id, or null.</summary>
        /// <param name="id">Object id.</param>
        public DungeonObject FindObject(string id)
        {
            return Find(Objects, id, o => o.Id);
        }

        /// <summary>Spawner by id, or null.</summary>
        /// <param name="id">Spawner id.</param>
        public DungeonSpawner FindSpawner(string id)
        {
            return Find(Spawners, id, s => s.Id);
        }

        /// <summary>All objects of a kind in file order.</summary>
        /// <param name="kind">Kind (constants of <see cref="DungeonObject"/>).</param>
        public List<DungeonObject> ObjectsOfKind(string kind)
        {
            var result = new List<DungeonObject>();
            for (int i = 0; i < Objects.Count; i++)
            {
                if (Objects[i].Kind == kind)
                {
                    result.Add(Objects[i]);
                }
            }

            return result;
        }

        /// <summary>The exit of a portal object, or null.</summary>
        /// <param name="objectId">Portal object id.</param>
        public DungeonExit FindExit(string objectId)
        {
            return Find(Exits, objectId, e => e.ObjectId);
        }

        /// <summary>The puzzle a mirror or step object belongs to, or null.</summary>
        /// <param name="objectId">Object id.</param>
        public DungeonPuzzle PuzzleOfElement(string objectId)
        {
            for (int i = 0; i < Puzzles.Count; i++)
            {
                DungeonPuzzle puzzle = Puzzles[i];
                if (puzzle.Steps.Contains(objectId) || puzzle.Source == objectId || puzzle.Target == objectId)
                {
                    return puzzle;
                }

                for (int m = 0; m < puzzle.Mirrors.Count; m++)
                {
                    if (puzzle.Mirrors[m].Id == objectId)
                    {
                        return puzzle;
                    }
                }
            }

            return null;
        }

        private static T Find<T>(List<T> list, string id, Func<T, string> idOf) where T : class
        {
            if (string.IsNullOrEmpty(id))
            {
                return null;
            }

            for (int i = 0; i < list.Count; i++)
            {
                if (string.Equals(idOf(list[i]), id, StringComparison.Ordinal))
                {
                    return list[i];
                }
            }

            return null;
        }
    }
}
