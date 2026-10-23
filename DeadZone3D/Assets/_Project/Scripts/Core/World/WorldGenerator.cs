using System;
using System.Collections.Generic;
using System.Linq;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    public sealed class Unreachable { public string kind, id; public int tx, ty; }

    public sealed class ValidationResult
    {
        public bool ok;
        public List<Unreachable> unreachable = new List<Unreachable>();
        public List<string> missingObjectives = new List<string>();
    }

    /// <summary>Procedural map generator (port of 08_world_gen.js). Tiles depend only on (mapId, seed).</summary>
    public static class WorldGenerator
    {
        public static readonly int[] DX = { 1, -1, 0, 0, 1, 1, -1, -1 };
        public static readonly int[] DY = { 0, 0, 1, -1, 1, -1, 1, -1 };
        private const int TILE = World.TILE;

        /// <summary>Debug hook called after each generation stage (parity checks against the HTML version).</summary>
        public static Action<string, World, Rng> DebugStage;

        private static readonly Dictionary<string, string[]> ZoneTypes = new Dictionary<string, string[]>
        {
            ["residential"] = new[] { "house", "apartment", "garage", "shop" },
            ["commercial"] = new[] { "shop", "supermarket", "pharmacy", "garage", "office", "apartment" },
            ["military"] = new[] { "barracks", "armory", "warehouse", "checkpoint", "hq", "storage", "garage", "medical", "bunker", "office" },
            ["industrial"] = new[] { "factory", "warehouse", "workshop", "storage", "garage", "office" },
            ["lab"] = new[] { "lab", "security", "medical", "server", "office", "storage", "bunker" },
        };

        private static readonly Dictionary<string, string[]> DefaultContainers = new Dictionary<string, string[]>
        {
            ["house"] = new[] { "crate", "fridge", "desk", "locker" }, ["apartment"] = new[] { "fridge", "desk", "locker", "crate", "safe" },
            ["shop"] = new[] { "crate", "desk", "locker" }, ["supermarket"] = new[] { "crate", "fridge", "crate", "locker" },
            ["pharmacy"] = new[] { "medcabinet", "medcabinet", "desk" }, ["garage"] = new[] { "toolbox", "crate", "locker" },
            ["barracks"] = new[] { "locker", "military_crate", "crate", "locker" }, ["armory"] = new[] { "weapon_rack", "military_crate", "military_crate", "safe" },
            ["warehouse"] = new[] { "crate", "crate", "military_crate", "toolbox" }, ["checkpoint"] = new[] { "military_crate", "locker", "desk" },
            ["hq"] = new[] { "desk", "safe", "military_crate", "locker" }, ["factory"] = new[] { "toolbox", "crate", "locker" },
            ["workshop"] = new[] { "toolbox", "toolbox", "crate" }, ["storage"] = new[] { "crate", "crate", "locker" },
            ["office"] = new[] { "desk", "desk", "safe", "locker" }, ["lab"] = new[] { "lab_cabinet", "lab_cabinet", "medcabinet", "desk" },
            ["security"] = new[] { "locker", "safe", "desk", "weapon_rack" }, ["medical"] = new[] { "medcabinet", "medcabinet", "lab_cabinet" },
            ["server"] = new[] { "server_rack", "server_rack", "desk" }, ["bunker"] = new[] { "military_crate", "weapon_rack", "safe", "lab_cabinet" },
        };

        private static readonly string[] Streets = { "Lindenstraße", "Marktplatz", "Bahnhofstraße", "Kirchweg", "Am Park", "Hafenstraße", "Schillerstraße", "Gartenweg",
            "Mühlenweg", "Rosenstraße", "Nordring", "Südallee", "Ulmenweg", "Brunnengasse", "Feldstraße", "Ahornweg" };

        private static readonly Dictionary<string, string[]> RetrieveHosts = new Dictionary<string, string[]>
        {
            ["mis_datapack"] = new[] { "office", "server", "lab", "hq", "security" },
            ["mis_generator_part"] = new[] { "workshop", "factory", "garage", "warehouse", "storage" },
            ["mis_sample_case"] = new[] { "lab", "medical", "pharmacy", "bunker" },
        };

        private sealed class BDef
        {
            public string type;
            public int[] count, w, h, containerCount;
            public int lootTier, placed, target;
            public string[] containers;
            public bool anyZone;
        }

        private sealed class BOpts
        {
            public string name;
            public bool locked, singleRoom, noWindows;
            public int doors, tierBonus, containerCount;
        }

        private sealed class Ctx
        {
            public World world;
            public Rng rng;
            public MapDef map;
            public LayoutResult layout;
            public byte[] reserved;
            public int containerSeq, propSeq, poiSeq;
            public List<RectI> outdoor = new List<RectI>();
        }

        // ------------------------------------------------------------------ entry points
        public static World Generate(string mapId, uint seed, IList<MissionDef> missionDefs = null)
        {
            if (!DataTables.MAPS.TryGetValue(mapId ?? "", out var map)) map = DataTables.MAPS["city"];
            var defs = missionDefs?.Where(m => m != null).ToList() ?? new List<MissionDef>();
            World world = null;
            for (int attempt = 0; attempt < 6; attempt++)
            {
                world = Attempt(map, map.id, seed, unchecked(seed + (uint)attempt), defs);
                var v = Validate(world, defs);
                for (int pass = 0; !v.ok && v.unreachable.Count > 0 && pass < 4; pass++)
                {
                    Log.Warn("WorldGenerator: repairing " + v.unreachable.Count + " unreachable targets (" + mapId + ", seed " + seed + ")");
                    Repair(world, v.unreachable);
                    v = Validate(world, defs);
                }
                if (v.ok) break;
                if (attempt < 5) Log.Warn("WorldGenerator: attempt " + (attempt + 1) + " failed for " + mapId + " seed " + seed + ", retrying");
                else Log.Warn("WorldGenerator: accepting last attempt with problems for " + mapId);
            }
            world.seed = seed;
            world.version = 0;
            world.dirtyChunks.Clear();
            return world;
        }

        public static World Generate(string mapId, string seed, IList<MissionDef> missionDefs = null) => Generate(mapId, Hash.String(seed), missionDefs);

        public static ValidationResult Validate(World world, IList<MissionDef> missionDefs = null)
        {
            var res = new ValidationResult();
            if (world == null) { res.unreachable.Add(new Unreachable { kind = "world" }); return res; }
            int sx = M.Floor(world.spawnX / TILE), sy = M.Floor(world.spawnY / TILE);
            var reach = world.Reachability(sx, sy);
            bool R(int tx, int ty) => tx >= 0 && ty >= 0 && tx < world.w && ty < world.h && reach[ty * world.w + tx] == 1;
            bool Near(int tx, int ty)
            {
                if (R(tx, ty)) return true;
                for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) if (R(tx + dx, ty + dy)) return true;
                return false;
            }
            if (!world.IsWalkable(sx, sy)) res.unreachable.Add(new Unreachable { kind = "spawn", id = "spawn", tx = sx, ty = sy });
            foreach (var e in world.extractions)
            {
                int tx = M.Floor(e.x / TILE), ty = M.Floor(e.y / TILE);
                if (!R(tx, ty)) res.unreachable.Add(new Unreachable { kind = "extraction", id = e.id, tx = tx, ty = ty });
            }
            foreach (var p in world.pois)
            {
                int tx = M.Floor(p.x / TILE), ty = M.Floor(p.y / TILE);
                if (!Near(tx, ty)) res.unreachable.Add(new Unreachable { kind = "poi", id = p.id, tx = tx, ty = ty });
            }
            foreach (var c in world.containers)
                if (!Near(c.tx, c.ty)) res.unreachable.Add(new Unreachable { kind = "container", id = c.uid, tx = c.tx, ty = c.ty });
            foreach (var fl in world.floorLoot)
            {
                int tx = M.Floor(fl.x / TILE), ty = M.Floor(fl.y / TILE);
                if (!Near(tx, ty)) res.unreachable.Add(new Unreachable { kind = "loot", id = fl.uid, tx = tx, ty = ty });
            }
            for (int i = 0; i < world.zombieSpawns.Count; i++)
            {
                var z = world.zombieSpawns[i];
                int tx = M.Floor(z.x / TILE), ty = M.Floor(z.y / TILE);
                if (!R(tx, ty)) res.unreachable.Add(new Unreachable { kind = "zombie", id = "z" + i, tx = tx, ty = ty });
            }
            bool HasItem(string id)
            {
                if (world.floorLoot.Any(fl => fl.inst != null && fl.inst.id == id)) return true;
                foreach (var c in world.containers)
                {
                    if (c.preset.Any(i => i != null && i.id == id)) return true;
                    if (c.items != null && c.items.Any(i => i != null && i.id == id)) return true;
                }
                return false;
            }
            foreach (var m in missionDefs ?? new List<MissionDef>())
            {
                if (m == null) continue;
                foreach (var o in AllObjectives(m))
                {
                    bool ok = true;
                    if (o.type == "retrieve" || o.type == "find_key") ok = HasItem(o.target);
                    else if (o.type == "investigate") ok = world.pois.Any(p => p.type == o.target);
                    else if (o.type == "generator") ok = world.pois.Any(p => p.type == "generator");
                    else if (o.type == "kill_boss") ok = world.bossArena != null && world.zombieSpawns.Any(z => z.types.Contains("boss"));
                    else if (o.type == "extract_at") ok = world.extractions.Any(e => e.id == o.target);
                    if (!ok) res.missingObjectives.Add(o.id);
                }
            }
            res.ok = res.unreachable.Count == 0 && res.missingObjectives.Count == 0;
            return res;
        }

        public static IEnumerable<ObjectiveDef> AllObjectives(MissionDef m)
        {
            if (m.objectives != null) foreach (var o in m.objectives) yield return o;
            if (m.optional != null) foreach (var o in m.optional) yield return o;
        }

        private static void Repair(World world, List<Unreachable> unreachable)
        {
            int sx = M.Floor(world.spawnX / TILE), sy = M.Floor(world.spawnY / TILE);
            foreach (var u in unreachable.Take(40))
            {
                var reach = world.Reachability(sx, sy);
                int best = -1; double bd = double.PositiveInfinity;
                for (int i = 0; i < reach.Length; i++)
                {
                    if (reach[i] == 0) continue;
                    int x0 = i % world.w, y0 = i / world.w;
                    double d = (x0 - u.tx) * (x0 - u.tx) + (y0 - u.ty) * (y0 - u.ty);
                    if (d < bd) { bd = d; best = i; }
                }
                if (best < 0) continue;
                int x = best % world.w, y = best / world.w;
                int guard = 0;
                while ((x != u.tx || y != u.ty) && guard++ < 600)
                {
                    if (Math.Abs(u.tx - x) >= Math.Abs(u.ty - y)) x += M.Sign(u.tx - x); else y += M.Sign(u.ty - y);
                    if (x < 3 || y < 3 || x >= world.w - 3 || y >= world.h - 3) break;
                    int t = world.Tile(x, y);
                    if (!T.BlocksMove(t) || t == T.DOOR_CLOSED || t == T.DOOR_LOCKED) continue;
                    bool inside = world.BuildingIndexAtTile(x, y) >= 0;
                    if (t == T.WALL || t == T.WINDOW) world.Put(x, y, T.DOOR_CLOSED);
                    else world.Put(x, y, inside ? T.FLOOR : T.GROUND);
                }
            }
            world.props = world.props.Where(p =>
            {
                if (!p.solid) return true;
                for (int y = p.ty; y < p.ty + p.h; y++) for (int x = p.tx; x < p.tx + p.w; x++) if (!T.BlocksMove(world.Tile(x, y))) return false;
                return true;
            }).ToList();
        }

        private static World Attempt(MapDef map, string mapId, uint seed, uint attemptSeed, List<MissionDef> missionDefs)
        {
            var rng = new Rng(Hash.String(mapId + ":" + attemptSeed));
            int w = map.size != null && map.size.w > 0 ? map.size.w : 150, h = map.size != null && map.size.h > 0 ? map.size.h : 150;
            var world = new World(mapId, seed, w, h);
            LayoutResult layout;
            switch (map.layout)
            {
                case "compound": layout = WorldLayouts.Compound(world, rng); break;
                case "industrial": layout = WorldLayouts.Industrial(world, rng, map); break;
                case "campus": layout = WorldLayouts.Campus(world, rng); break;
                default: layout = WorldLayouts.City(world, rng); break;
            }
            var ctx = new Ctx { world = world, rng = rng, map = map, layout = layout, reserved = new byte[world.w * world.h] };
            world.blocks = layout.blocks;
            world.roads = layout.roads;
            world.yards = layout.yards;
            PlaceBuildings(ctx); DebugStage?.Invoke("buildings", world, rng);
            if (layout.bossArena != null) BossHall(ctx, layout.bossArena);
            LayoutFeatures(ctx); DebugStage?.Invoke("features", world, rng);
            for (int i = 0; i < world.tileVariant.Length; i++) world.tileVariant[i] = (byte)rng.Int(0, 3);
            PlayerSpawn(ctx); DebugStage?.Invoke("spawn", world, rng);
            Extractions(ctx); DebugStage?.Invoke("extractions", world, rng);
            Generator(ctx); DebugStage?.Invoke("generator", world, rng);
            Props(ctx); DebugStage?.Invoke("props", world, rng);
            Lights(ctx); DebugStage?.Invoke("lights", world, rng);
            Zombies(ctx); DebugStage?.Invoke("zombies", world, rng);
            MissionPlacement(ctx, rng.Fork("missions"), missionDefs);
            return world;
        }

        // ------------------------------------------------------------------ buildings
        private static int[] Range(int[] v, int a, int b) => v != null && v.Length >= 2 ? new[] { v[0] != 0 ? v[0] : a, v[1] != 0 ? v[1] : b } : new[] { a, b };

        private static List<BDef> NormDefs(MapDef map)
        {
            var raw = map.buildings != null && map.buildings.Length > 0 ? map.buildings
                : new[] { new BuildingSpec { type = "house", count = new[] { 18, 24 }, w = new[] { 5, 8 }, h = new[] { 5, 8 }, lootTier = 1 } };
            return raw.Where(d => d != null && d.type != null).Select(d => new BDef
            {
                type = d.type,
                count = Range(d.count, 1, 2),
                w = Range(d.w, 5, 8).Select(v => Math.Max(5, v)).ToArray(),
                h = Range(d.h, 5, 8).Select(v => Math.Max(5, v)).ToArray(),
                lootTier = d.lootTier != 0 ? d.lootTier : 1,
                containers = d.containers != null && d.containers.Length > 0 ? d.containers : (DefaultContainers.TryGetValue(d.type, out var dc) ? dc : new[] { "crate" }),
                containerCount = Range(d.containerCount, 2, 4),
            }).ToList();
        }

        private static bool ZoneAllows(string zone, string type) => zone != null && ZoneTypes.TryGetValue(zone, out var list) && Array.IndexOf(list, type) >= 0;

        private static void PlaceBuildings(Ctx ctx)
        {
            var rng = ctx.rng; var layout = ctx.layout;
            var defs = NormDefs(ctx.map);
            foreach (var d in defs) d.target = rng.Int(d.count[0], d.count[1]);
            var zones = new HashSet<string>(layout.blocks.Select(b => b.zone));
            foreach (var d in defs) d.anyZone = !zones.Any(z => ZoneAllows(z, d.type));
            bool Allows(string zone, BDef d) => d.anyZone || ZoneAllows(zone, d.type);
            var blocks = rng.Shuffle(layout.blocks.ToList());
            var large = defs.Where(d => d.w[0] >= 10 || d.h[0] >= 10).OrderByDescending(a => a.w[0] * a.h[0]).ToList();
            var freeRects = new List<RectI>();
            foreach (var block in blocks)
            {
                var rects = new List<RectI> { new RectI(block.tx, block.ty, block.w, block.h) };
                var cand = large.Where(d => d.placed < d.target && Allows(block.zone, d) && d.w[0] + 2 <= block.w && d.h[0] + 2 <= block.h).ToList();
                var pickLarge = cand.Count > 0 ? cand.OrderBy(a => (double)a.placed / a.target).First() : null;
                if (pickLarge != null && rng.Chance(0.85))
                {
                    int bw = rng.Int(pickLarge.w[0], Math.Min(pickLarge.w[1], block.w - 2));
                    int bh = rng.Int(pickLarge.h[0], Math.Min(pickLarge.h[1], block.h - 2));
                    int lotW = bw + 2, lotH = bh + 2;
                    bool right = rng.Chance(0.5), bottom = rng.Chance(0.5);
                    int lx = right ? block.tx + block.w - lotW : block.tx;
                    int ly = bottom ? block.ty + block.h - lotH : block.ty;
                    BuildingAt(ctx, pickLarge, lx + 1, ly + 1, bw, bh, block, null);
                    pickLarge.placed++;
                    rects = new List<RectI>();
                    int sideW = block.w - lotW;
                    if (sideW >= 7) rects.Add(new RectI(right ? block.tx : block.tx + lotW, block.ty, sideW, block.h));
                    else if (sideW > 0) freeRects.Add(new RectI(right ? block.tx : block.tx + lotW, block.ty, sideW, block.h));
                    int capH = block.h - lotH;
                    if (capH >= 7) rects.Add(new RectI(lx, bottom ? block.ty : block.ty + lotH, lotW, capH));
                    else if (capH > 0) freeRects.Add(new RectI(lx, bottom ? block.ty : block.ty + lotH, lotW, capH));
                }
                foreach (var r in rects)
                {
                    foreach (var lot in SplitLots(rng, r, 0))
                    {
                        var fits = defs.Where(d => Allows(block.zone, d) && d.w[0] + 2 <= lot.w && d.h[0] + 2 <= lot.h).ToList();
                        double total = 0;
                        var weights = fits.Select(d =>
                        {
                            double w = d.placed < d.count[0] ? 6 : d.placed < d.target ? 2 : 0;
                            if (w > 0 && d.w[1] + 2 < lot.w * 0.55 && d.h[1] + 2 < lot.h * 0.55) w *= 0.5;
                            total += w;
                            return w;
                        }).ToList();
                        if (total <= 0 || (rng.Chance(0.12) && defs.All(d => d.placed >= d.count[0]))) { freeRects.Add(lot); continue; }
                        double roll = rng.Next() * total;
                        var pick = fits[fits.Count - 1];
                        for (int i = 0; i < fits.Count; i++) { roll -= weights[i]; if (roll < 0) { pick = fits[i]; break; } }
                        int bw = rng.Int(pick.w[0], Math.Max(pick.w[0], Math.Min(pick.w[1], lot.w - 2)));
                        int bh = rng.Int(pick.h[0], Math.Max(pick.h[0], Math.Min(pick.h[1], lot.h - 2)));
                        int ox = lot.tx + 1 + rng.Int(0, Math.Max(0, lot.w - 2 - bw));
                        int oy = lot.ty + 1 + rng.Int(0, Math.Max(0, lot.h - 2 - bh));
                        BuildingAt(ctx, pick, ox, oy, bw, bh, block, null);
                        pick.placed++;
                        freeRects.Add(lot);
                    }
                }
            }
            ctx.outdoor.AddRange(freeRects);
            ctx.outdoor.AddRange(layout.yards);
        }

        private static List<RectI> SplitLots(Rng rng, RectI r, int depth)
        {
            var outp = new List<RectI>();
            bool canV = r.w >= 14, canH = r.h >= 14;
            bool big = r.w > 16 || r.h > 16;
            if (depth < 6 && (canV || canH) && (big || rng.Chance(0.55)))
            {
                bool vertical = canV && (!canH || r.w >= r.h);
                if (vertical)
                {
                    int s = rng.Int(7, r.w - 7);
                    outp.AddRange(SplitLots(rng, new RectI(r.tx, r.ty, s, r.h), depth + 1));
                    outp.AddRange(SplitLots(rng, new RectI(r.tx + s, r.ty, r.w - s, r.h), depth + 1));
                }
                else
                {
                    int s = rng.Int(7, r.h - 7);
                    outp.AddRange(SplitLots(rng, new RectI(r.tx, r.ty, r.w, s), depth + 1));
                    outp.AddRange(SplitLots(rng, new RectI(r.tx, r.ty + s, r.w, r.h - s), depth + 1));
                }
            }
            else if (r.w >= 7 && r.h >= 7) outp.Add(r);
            return outp;
        }

        private static string BuildingName(Ctx ctx, string type, int index)
        {
            string bas = DataTables.BUILDING_NAMES.TryGetValue(type, out var n) ? n : type;
            if (ctx.map.layout == "city") return bas + " " + Streets[(index * 7 + ctx.world.buildings.Count) % Streets.Length];
            char letter = (char)(65 + (index % 6));
            return bas + " " + letter + (1 + index / 6);
        }

        private static Building BuildingAt(Ctx ctx, BDef def, int bx, int by, int bw, int bh, RectI block, BOpts opts)
        {
            opts = opts ?? new BOpts();
            var world = ctx.world; var rng = ctx.rng; var map = ctx.map;
            var pal = map.palette ?? new MapPalette();
            int typeCount = world.buildings.Count(q => q.type == def.type);
            var roofs = new[] { pal.roofA ?? "#4a3b33", pal.roofB ?? "#3b3f46", pal.roofC ?? "#55463a" };
            var walls = new[] { pal.wallA ?? "#6b6259", pal.wallB ?? "#5a5550" };
            var b = new Building
            {
                id = "b" + world.buildings.Count, type = def.type, name = opts.name ?? BuildingName(ctx, def.type, typeCount), tx = bx, ty = by, w = bw, h = bh,
                roofColor = rng.Pick(roofs), wallColor = rng.Pick(walls), floorColor = pal.floor ?? "#4a4440",
                lootTier = def.lootTier != 0 ? def.lootTier : 1, locked = opts.locked, zone = block?.zone,
            };
            int idx = world.buildings.Count;
            world.buildings.Add(b);
            world.IndexBuilding(b, idx);
            for (int y = by - 1; y <= by + bh; y++) for (int x = bx - 1; x <= bx + bw; x++) if (world.InBounds(x, y)) ctx.reserved[y * world.w + x] = 1;
            for (int y = by; y < by + bh; y++)
                for (int x = bx; x < bx + bw; x++)
                {
                    bool edge = x == bx || y == by || x == bx + bw - 1 || y == by + bh - 1;
                    world.Put(x, y, edge ? T.WALL : T.FLOOR);
                }
            var rooms = new List<RectI>();
            if (opts.singleRoom) rooms.Add(new RectI(bx + 1, by + 1, bw - 2, bh - 2));
            else SplitRooms(ctx, bx + 1, by + 1, bw - 2, bh - 2, 0, rooms);
            b.rooms = rooms;
            int area = bw * bh;
            int nDoors = opts.doors != 0 ? opts.doors : (area < 60 ? 1 : area < 150 ? 2 : 3);
            ExteriorDoors(ctx, b, nDoors, opts.locked ? T.DOOR_LOCKED : T.DOOR_CLOSED, block);
            if (!opts.noWindows) Windows(ctx, b);
            int tier = M.Clamp((map.lootTierBase != 0 ? map.lootTierBase : 1) + b.lootTier - 1 + opts.tierBonus, 1, 5);
            int n = rng.Int(def.containerCount[0], def.containerCount[1]) + area / 90;
            if (opts.containerCount != 0) n = opts.containerCount;
            PlaceContainers(ctx, b, def.containers, n, tier);
            foreach (var r in rooms)
                if (rng.Chance(0.3))
                    world.lights.Add(new LightDef { x = (r.tx + r.w / 2.0) * TILE, y = (r.ty + r.h / 2.0) * TILE, radius = M.Clamp(Math.Max(r.w, r.h) * 18.0, 90, 220), color = "#ffdcae", flicker = rng.Chance(0.25), indoor = true });
            return b;
        }

        private static bool IsDoorAt(World world, int x, int y) => T.IsDoor(world.Tile(x, y));

        private static void SplitRooms(Ctx ctx, int rx, int ry, int rw, int rh, int depth, List<RectI> outp)
        {
            var world = ctx.world; var rng = ctx.rng;
            bool vertical = rw >= rh;
            int len = vertical ? rw : rh;
            if (depth >= 3 || len < 7 || (len < 10 && rng.Chance(0.45)) || rw * rh < 30) { outp.Add(new RectI(rx, ry, rw, rh)); return; }
            var cands = new List<int>();
            for (int p = 3; p <= len - 4; p++) cands.Add(p);
            rng.Shuffle(cands);
            int pos = -1;
            foreach (int p in cands)
            {
                if (vertical) { int x = rx + p; if (IsDoorAt(world, x, ry - 1) || IsDoorAt(world, x, ry + rh)) continue; }
                else { int y = ry + p; if (IsDoorAt(world, rx - 1, y) || IsDoorAt(world, rx + rw, y)) continue; }
                pos = p; break;
            }
            if (pos < 0) { outp.Add(new RectI(rx, ry, rw, rh)); return; }
            if (vertical)
            {
                int x = rx + pos;
                for (int y = ry; y < ry + rh; y++) world.Put(x, y, T.WALL);
                world.Put(x, ry + rng.Int(0, rh - 1), T.DOOR_CLOSED);
                SplitRooms(ctx, rx, ry, pos, rh, depth + 1, outp);
                SplitRooms(ctx, x + 1, ry, rw - pos - 1, rh, depth + 1, outp);
            }
            else
            {
                int y = ry + pos;
                for (int x = rx; x < rx + rw; x++) world.Put(x, y, T.WALL);
                world.Put(rx + rng.Int(0, rw - 1), y, T.DOOR_CLOSED);
                SplitRooms(ctx, rx, ry, rw, pos, depth + 1, outp);
                SplitRooms(ctx, rx, y + 1, rw, rh - pos - 1, depth + 1, outp);
            }
        }

        private sealed class Side { public string name; public int len; public Func<int, (int x, int y, int ix, int iy, int ox, int oy)> at; }

        private static void ExteriorDoors(Ctx ctx, Building b, int n, byte doorTile, RectI block)
        {
            var world = ctx.world; var rng = ctx.rng;
            var sides = new List<Side>
            {
                new Side { name = "n", len = b.w, at = i => (b.tx + i, b.ty, b.tx + i, b.ty + 1, b.tx + i, b.ty - 1) },
                new Side { name = "s", len = b.w, at = i => (b.tx + i, b.ty + b.h - 1, b.tx + i, b.ty + b.h - 2, b.tx + i, b.ty + b.h) },
                new Side { name = "w", len = b.h, at = i => (b.tx, b.ty + i, b.tx + 1, b.ty + i, b.tx - 1, b.ty + i) },
                new Side { name = "e", len = b.h, at = i => (b.tx + b.w - 1, b.ty + i, b.tx + b.w - 2, b.ty + i, b.tx + b.w, b.ty + i) },
            };
            if (block != null)
            {
                var dist = new Dictionary<string, int> { ["n"] = b.ty - block.ty, ["s"] = block.ty + block.h - (b.ty + b.h), ["w"] = b.tx - block.tx, ["e"] = block.tx + block.w - (b.tx + b.w) };
                // JS: sides.sort((a, c) => dist[a] - dist[c] + rng.float(-0.5, 0.5)); emulate with an insertion sort calling the comparator like V8 does for short arrays
                JsSort(sides, (a, c) => dist[a.name] - dist[c.name] + rng.Float(-0.5, 0.5));
            }
            else rng.Shuffle(sides);
            int placed = 0;
            for (int s = 0; s < sides.Count && placed < n; s++)
            {
                var side = sides[s];
                var idxs = new List<int>();
                for (int i = 2; i <= side.len - 3; i++) idxs.Add(i);
                if (idxs.Count == 0) for (int i = 1; i <= side.len - 2; i++) idxs.Add(i);
                rng.Shuffle(idxs);
                foreach (int i in idxs)
                {
                    var p = side.at(i);
                    if (world.Tile(p.ix, p.iy) != T.FLOOR) continue;
                    int ot = world.Tile(p.ox, p.oy);
                    if (T.BlocksMove(ot) || world.BuildingIndexAtTile(p.ox, p.oy) >= 0) continue;
                    world.Put(p.x, p.y, doorTile);
                    b.doors.Add(new Door { tx = p.x, ty = p.y, ox = p.ox, oy = p.oy, side = side.name });
                    int dx = p.ox - p.x, dy = p.oy - p.y;
                    for (int k = 1; k <= 3; k++)
                        for (int q = -1; q <= 1; q++)
                        {
                            int rx = p.x + dx * k + (dy != 0 ? q : 0), ry = p.y + dy * k + (dx != 0 ? q : 0);
                            if (world.InBounds(rx, ry)) ctx.reserved[ry * world.w + rx] = 2;
                        }
                    placed++;
                    break;
                }
            }
            if (placed == 0)
            {
                foreach (var side in sides)
                {
                    for (int i = 1; i <= side.len - 2 && placed == 0; i++)
                    {
                        var p = side.at(i);
                        if (T.BlocksMove(world.Tile(p.ox, p.oy))) continue;
                        world.Put(p.x, p.y, doorTile);
                        if (world.Tile(p.ix, p.iy) != T.FLOOR) world.Put(p.ix, p.iy, T.FLOOR);
                        b.doors.Add(new Door { tx = p.x, ty = p.y, ox = p.ox, oy = p.oy, side = side.name });
                        placed++;
                    }
                    if (placed > 0) break;
                }
            }
        }

        /// <summary>
        /// V8's Array.prototype.sort for arrays shorter than 64 (TimSort = CountAndMakeRun + binary insertion sort),
        /// reproduced exactly because the HTML version sorts with a comparator that consumes random numbers.
        /// </summary>
        private static void JsSort<TItem>(List<TItem> a, Func<TItem, TItem, double> cmp)
        {
            int n = a.Count;
            if (n < 2) return;
            double Cmp(TItem x, TItem y) { double v = cmp(x, y); return double.IsNaN(v) ? 0 : v; }
            // CountAndMakeRun(0, n)
            int run = 2;
            bool desc = Cmp(a[1], a[0]) < 0;
            var prev = a[1];
            for (int i = 2; i < n; i++)
            {
                double order = Cmp(a[i], prev);
                if (desc ? order >= 0 : order < 0) break;
                prev = a[i];
                run++;
            }
            if (desc) a.Reverse(0, run);
            // BinaryInsertionSort(0, run, n)
            for (int start = run; start < n; start++)
            {
                int left = 0, right = start;
                var pivot = a[start];
                while (left < right)
                {
                    int mid = left + ((right - left) >> 1);
                    if (Cmp(pivot, a[mid]) < 0) right = mid; else left = mid + 1;
                }
                for (int p = start; p > left; p--) a[p] = a[p - 1];
                a[left] = pivot;
            }
        }

        private static void Windows(Ctx ctx, Building b)
        {
            var world = ctx.world; var rng = ctx.rng;
            bool TryWin(int x, int y, int ix, int iy, int ox, int oy)
            {
                if (world.Tile(x, y) != T.WALL || world.Tile(ix, iy) != T.FLOOR) return false;
                for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) if (T.IsDoor(world.Tile(x + dx, y + dy))) return false;
                if (world.BuildingIndexAtTile(ox, oy) >= 0) return false;
                world.Put(x, y, T.WINDOW);
                return true;
            }
            for (int i = 2; i < b.w - 2; i += rng.Int(3, 5))
            {
                TryWin(b.tx + i, b.ty, b.tx + i, b.ty + 1, b.tx + i, b.ty - 1);
                TryWin(b.tx + i, b.ty + b.h - 1, b.tx + i, b.ty + b.h - 2, b.tx + i, b.ty + b.h);
            }
            for (int i = 2; i < b.h - 2; i += rng.Int(3, 5))
            {
                TryWin(b.tx, b.ty + i, b.tx + 1, b.ty + i, b.tx - 1, b.ty + i);
                TryWin(b.tx + b.w - 1, b.ty + i, b.tx + b.w - 2, b.ty + i, b.tx + b.w, b.ty + i);
            }
        }

        private static void PlaceContainers(Ctx ctx, Building b, string[] types, int n, int tier)
        {
            var world = ctx.world; var rng = ctx.rng;
            var cands = new List<(int x, int y)>();
            for (int y = b.ty + 1; y < b.ty + b.h - 1; y++)
                for (int x = b.tx + 1; x < b.tx + b.w - 1; x++)
                {
                    if (world.Tile(x, y) != T.FLOOR) continue;
                    bool wall = false, doorNear = false;
                    for (int k = 0; k < 4; k++) { int t = world.Tile(x + DX[k], y + DY[k]); if (t == T.WALL || t == T.WINDOW) wall = true; }
                    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) if (T.IsDoor(world.Tile(x + dx, y + dy))) doorNear = true;
                    if (wall && !doorNear) cands.Add((x, y));
                }
            rng.Shuffle(cands);
            var used = new HashSet<long>();
            long Key(int x, int y) => ((long)x << 32) ^ (uint)y;
            int placed = 0;
            foreach (var c in cands)
            {
                if (placed >= n) break;
                if (used.Contains(Key(c.x, c.y))) continue;
                bool crowded = false;
                for (int dy = -1; dy <= 1 && !crowded; dy++) for (int dx = -1; dx <= 1; dx++) if (used.Contains(Key(c.x + dx, c.y + dy))) { crowded = true; break; }
                if (crowded) continue;
                used.Add(Key(c.x, c.y));
                string type = rng.Pick(types) ?? "crate";
                var cont = new Container
                {
                    uid = "c" + (++ctx.containerSeq), type = type, tx = c.x, ty = c.y, x = (c.x + 0.5) * TILE, y = (c.y + 0.5) * TILE,
                    tier = tier, buildingId = b.id, buildingType = b.type,
                };
                world.containers.Add(cont);
                b.containers.Add(cont.uid);
                placed++;
            }
        }

        private static void BossHall(Ctx ctx, RectI arena)
        {
            var world = ctx.world; var rng = ctx.rng;
            int hw = M.Clamp(arena.w - 4, 20, 30), hh = M.Clamp(arena.h - 4, 16, 22);
            int bx = arena.tx + (arena.w - hw) / 2, by = arena.ty + (arena.h - hh) / 2;
            var def = new BDef { type = "bunker", lootTier = 3, containers = new[] { "lab_cabinet", "safe", "military_crate", "weapon_rack" }, containerCount = new[] { 4, 6 } };
            var b = BuildingAt(ctx, def, bx, by, hw, hh, new RectI(arena.tx, arena.ty, arena.w, arena.h) { zone = "arena" },
                new BOpts { singleRoom = true, locked = true, doors = 1, noWindows = true, name = "Sektor U – Versuchshalle", tierBonus = 1, containerCount = 5 });
            b.hall = true;
            for (int k = 0; k < 6; k++)
            {
                int x = bx + 3 + rng.Int(0, hw - 7), y = by + 3 + rng.Int(0, hh - 7);
                if (Math.Abs(x - (bx + hw / 2.0)) < 3 && Math.Abs(y - (by + hh / 2.0)) < 3) continue;
                if (world.Tile(x, y) == T.FLOOR && world.Tile(x + 1, y) == T.FLOOR)
                {
                    world.Put(x, y, T.PROP_SOLID);
                    world.props.Add(new Prop { id = "p" + (++ctx.propSeq), type = "pillar", tx = x, ty = y, w = 1, h = 1, color = "#5b6066", solid = true });
                }
            }
            world.bossArena = new BossArena { x = (bx + hw / 2.0) * TILE, y = (by + hh / 2.0) * TILE, r = Math.Min(hw, hh) * TILE / 2.0, buildingId = b.id };
            world.pois.Add(new Poi { id = "poi" + (++ctx.poiSeq), type = "boss_arena", x = world.bossArena.x, y = world.bossArena.y, radius = 64, buildingId = b.id });
            if (b.doors.Count > 0)
            {
                var door = b.doors[0];
                world.pois.Add(new Poi { id = "poi" + (++ctx.poiSeq), type = "lab_entrance", x = (door.ox + 0.5) * TILE, y = (door.oy + 0.5) * TILE, radius = 64, buildingId = b.id });
                world.lights.Add(new LightDef { x = (door.ox + 0.5) * TILE, y = (door.oy + 0.5) * TILE, radius = 140, color = "#ff4a3a", flicker = true });
            }
            for (int k = 0; k < 3; k++) world.lights.Add(new LightDef { x = (bx + hw * (k + 1) / 4.0) * TILE, y = (by + hh / 2.0) * TILE, radius = 200, color = "#9fd0ff", flicker = k == 1 });
        }

        private static void LayoutFeatures(Ctx ctx)
        {
            var world = ctx.world; var rng = ctx.rng; var layout = ctx.layout; var map = ctx.map;
            var sp = layout.special;
            if (sp.pools != null)
            {
                var allowed = new[] { T.GRAVEL, T.GROUND, T.RUBBLE, T.GRASS };
                foreach (var p in sp.pools)
                {
                    bool ok = true;
                    for (int y = p.ty - p.r; y <= p.ty + p.r && ok; y++) for (int x = p.tx - p.r; x <= p.tx + p.r; x++) if (world.BuildingIndexAtTile(x, y) >= 0) { ok = false; break; }
                    if (!ok) continue;
                    WorldLayouts.Blob(world, rng, p.tx, p.ty, p.r, T.TOXIC, allowed);
                    world.toxicZones.Add(new ToxicZone { x = (p.tx + 0.5) * TILE, y = (p.ty + 0.5) * TILE, r = (p.r + 0.5) * TILE });
                }
            }
            if (map.layout == "campus" && sp.pools == null)
            {
                int n = map.toxicZones;
                var allowed = new[] { T.GRASS, T.GROUND, T.GRAVEL };
                for (int k = 0; k < n; k++)
                {
                    var y = rng.Pick(ctx.outdoor);
                    if (y == null || y.w < 8 || y.h < 8) continue;
                    int cx = y.tx + rng.Int(3, y.w - 4), cy = y.ty + rng.Int(3, y.h - 4);
                    WorldLayouts.Blob(world, rng, cx, cy, 2, T.TOXIC, allowed);
                    world.toxicZones.Add(new ToxicZone { x = (cx + 0.5) * TILE, y = (cy + 0.5) * TILE, r = 2.5 * TILE });
                }
            }
            if (sp.gates != null)
            {
                foreach (var gte in sp.gates)
                {
                    bool horiz = gte.dir == "n" || gte.dir == "s";
                    foreach (int off in new[] { -3, 5 })
                    {
                        int x = horiz ? gte.tx + off : gte.tx + (gte.dir == "w" ? 1 : -1);
                        int y = horiz ? gte.ty + (gte.dir == "n" ? 1 : -1) : gte.ty + off;
                        TryProp(ctx, "sandbag", x, y, horiz ? 2 : 1, horiz ? 1 : 2, T.PROP_LOW, false);
                    }
                }
                foreach (var (x, y) in new[] { (sp.fx0 + 1, sp.fy0 + 1), (sp.fx1 - 2, sp.fy0 + 1), (sp.fx0 + 1, sp.fy1 - 2), (sp.fx1 - 2, sp.fy1 - 2) })
                {
                    TryProp(ctx, "tower", x, y, 2, 2, T.PROP_SOLID, true, true);
                    world.lights.Add(new LightDef { x = (x + 1) * TILE, y = (y + 1) * TILE, radius = 240, color = "#fff2c8" });
                }
            }
            foreach (var y in layout.yards)
            {
                if (y.kind == "tankfarm")
                {
                    for (int k = 0; k < 5; k++) TryProp(ctx, "tank", y.tx + rng.Int(1, y.w - 5), y.ty + rng.Int(1, y.h - 5), 3, 3, T.PROP_SOLID, true);
                    for (int k = 0; k < 4; k++)
                    {
                        bool vertical = rng.Chance(0.5);
                        int len = rng.Int(4, 8);
                        TryProp(ctx, "pipe", y.tx + rng.Int(1, y.w - 2), y.ty + rng.Int(1, y.h - 2), vertical ? 1 : len, vertical ? len : 1, T.PROP_LOW, false);
                    }
                }
                else if (y.kind == "plaza" || y.kind == "quad")
                {
                    for (int k = 0; k < 6; k++) TryProp(ctx, "bench", y.tx + rng.Int(2, y.w - 4), y.ty + rng.Int(2, y.h - 3), 2, 1, T.PROP_LOW, false);
                }
                else if (y.kind == "parade")
                {
                    TryProp(ctx, "antenna", y.tx + (y.w >> 1), y.ty + (y.h >> 1), 1, 1, T.PROP_SOLID, true);
                }
            }
        }

        // ------------------------------------------------------------------ spawn / extraction
        private static (int tx, int ty) EdgeSpot(Ctx ctx, int edge, double along)
        {
            var world = ctx.world;
            int m = Math.Max(5, (ctx.layout.margin != 0 ? ctx.layout.margin : 8) / 2 + 1);
            int W = world.w, H = world.h, tx, ty;
            if (edge == 0) { tx = M.Round(along * W); ty = m; }
            else if (edge == 1) { tx = M.Round(along * W); ty = H - 1 - m; }
            else if (edge == 2) { tx = m; ty = M.Round(along * H); }
            else { tx = W - 1 - m; ty = M.Round(along * H); }
            return (M.Clamp(tx, 4, W - 5), M.Clamp(ty, 4, H - 5));
        }

        public static (int tx, int ty)? NearestWalkable(World world, int tx, int ty, int maxR = 8, bool avoidIndoor = true)
        {
            for (int r = 0; r <= maxR; r++)
                for (int dy = -r; dy <= r; dy++)
                    for (int dx = -r; dx <= r; dx++)
                    {
                        if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != r) continue;
                        int x = tx + dx, y = ty + dy;
                        if (!world.IsWalkable(x, y)) continue;
                        if (avoidIndoor && world.BuildingIndexAtTile(x, y) >= 0) continue;
                        if (world.Tile(x, y) == T.TOXIC) continue;
                        return (x, y);
                    }
            return null;
        }

        private static double EdgeDist(World world, int edge)
        {
            var a = world.bossArena;
            if (a == null) return 0;
            double ax = a.x / TILE, ay = a.y / TILE;
            return edge == 0 ? ay : edge == 1 ? world.h - ay : edge == 2 ? ax : world.w - ax;
        }

        private static void PlayerSpawn(Ctx ctx)
        {
            var world = ctx.world; var rng = ctx.rng;
            int edge = rng.Int(0, 3);
            if (world.bossArena != null) edge = new[] { 0, 1, 2, 3 }.OrderByDescending(e => EdgeDist(world, e)).First();
            var s = EdgeSpot(ctx, edge, rng.Float(0.3, 0.7));
            var p = NearestWalkable(world, s.tx, s.ty, 12) ?? s;
            world.spawnX = (p.tx + 0.5) * TILE; world.spawnY = (p.ty + 0.5) * TILE; world.spawnEdge = edge;
            for (int dy = -3; dy <= 3; dy++)
                for (int dx = -3; dx <= 3; dx++)
                {
                    int x = p.tx + dx, y = p.ty + dy;
                    if (world.InBounds(x, y) && ctx.reserved[y * world.w + x] == 0) ctx.reserved[y * world.w + x] = 4;
                }
        }

        private sealed class ExtCand { public int tx, ty, edge; public ExtractionSpec def; }

        private static void Extractions(Ctx ctx)
        {
            var world = ctx.world; var rng = ctx.rng; var map = ctx.map;
            var defs = map.extractions ?? new ExtractionSpec[0];
            var cands = new List<ExtCand>();
            for (int edge = 0; edge < 4; edge++)
                for (double a = 0.12; a <= 0.88; a += 0.04)
                {
                    var s = EdgeSpot(ctx, edge, a);
                    var p = NearestWalkable(world, s.tx, s.ty, 4);
                    if (p.HasValue) cands.Add(new ExtCand { tx = p.Value.tx, ty = p.Value.ty, edge = edge });
                }
            double spx = world.spawnX / TILE, spy = world.spawnY / TILE;
            double diag = M.Hypot(world.w, world.h);
            var chosen = new List<ExtCand>();
            var order = defs.OrderBy(d => d.kind == "always" ? -1 : 0).ToList();
            foreach (var def in order)
            {
                ExtCand best = null; double bs = double.NegativeInfinity;
                foreach (var c in cands)
                {
                    double ds = M.Hypot(c.tx - spx, c.ty - spy);
                    double score;
                    if (def.kind == "always") score = ds + rng.Float(0, 6);
                    else
                    {
                        if (ds < diag * 0.3) continue;
                        double md = double.PositiveInfinity;
                        foreach (var o in chosen) md = Math.Min(md, M.Hypot(c.tx - o.tx, c.ty - o.ty));
                        if (md < 30) continue;
                        score = Math.Min(md, ds) + (chosen.Any(o => o.edge == c.edge) ? -20 : 0) + rng.Float(0, 8);
                    }
                    if (score > bs) { bs = score; best = c; }
                }
                if (best == null) best = cands.Count > 0 ? cands[rng.Int(0, cands.Count - 1)] : new ExtCand { tx = 6, ty = 6, edge = 0 };
                chosen.Add(new ExtCand { tx = best.tx, ty = best.ty, edge = best.edge, def = def });
            }
            foreach (var c in chosen)
            {
                var def = c.def;
                for (int dy = -2; dy <= 2; dy++)
                    for (int dx = -2; dx <= 2; dx++)
                    {
                        if (dx * dx + dy * dy > 6) continue;
                        int x = c.tx + dx, y = c.ty + dy;
                        if (world.BuildingIndexAtTile(x, y) >= 0) continue;
                        int t = world.Tile(x, y);
                        if (t == T.VOID || t == T.FENCE || (t == T.WALL && world.BuildingIndexAtTile(x, y) < 0 && (x <= 2 || y <= 2 || x >= world.w - 3 || y >= world.h - 3))) continue;
                        world.Put(x, y, T.GRAVEL);
                    }
                for (int dy = -4; dy <= 4; dy++)
                    for (int dx = -4; dx <= 4; dx++)
                    {
                        int x = c.tx + dx, y = c.ty + dy;
                        if (world.InBounds(x, y) && ctx.reserved[y * world.w + x] == 0) ctx.reserved[y * world.w + x] = 3;
                    }
                world.extractions.Add(new Extraction
                {
                    id = def.id, name = def.name, kind = def.kind ?? "always", requires = def.requires, duration = def.duration > 0 ? def.duration : 10,
                    window = def.window, hazard = def.hazard, x = (c.tx + 0.5) * TILE, y = (c.ty + 0.5) * TILE, radius = 72,
                });
                world.props.Add(new Prop { id = "p" + (++ctx.propSeq), type = "lamp", tx = c.tx + 2, ty = c.ty - 2, w = 1, h = 1, color = "#3ddc84", extraction = def.id });
                world.lights.Add(new LightDef { x = (c.tx + 0.5) * TILE, y = (c.ty + 0.5) * TILE, radius = 150, color = "#59ff9c", extraction = def.id });
            }
        }

        private static void Generator(Ctx ctx)
        {
            var world = ctx.world; var rng = ctx.rng;
            var prefs = new List<string> { "warehouse", "factory", "hq", "garage", "storage", "workshop", "security", "office" };
            int Pref(Building b) { int p = prefs.IndexOf(b.type); return p < 0 ? 99 : p; }
            var sorted = world.buildings.Where(b => !b.hall).OrderBy(Pref).ToList();
            foreach (var b in sorted.Take(12))
            {
                var cands = new List<(int x, int y)>();
                for (int x = b.tx + 1; x < b.tx + b.w - 1; x++) { cands.Add((x, b.ty - 1)); cands.Add((x, b.ty + b.h)); }
                for (int y = b.ty + 1; y < b.ty + b.h - 1; y++) { cands.Add((b.tx - 1, y)); cands.Add((b.tx + b.w, y)); }
                rng.Shuffle(cands);
                foreach (var (x, y) in cands)
                {
                    if (!world.InBounds(x, y)) continue;
                    if (ctx.reserved[y * world.w + x] >= 2) continue;
                    if (!world.IsWalkable(x, y) || world.BuildingIndexAtTile(x, y) >= 0) continue;
                    int open = 0;
                    for (int k = 0; k < 8; k++) if (world.IsWalkable(x + DX[k], y + DY[k])) open++;
                    if (open < 5) continue;
                    if (M.Hypot(x * TILE - world.spawnX, y * TILE - world.spawnY) < 20 * TILE) continue;
                    world.Put(x, y, T.PROP_SOLID);
                    ctx.reserved[y * world.w + x] = 5;
                    world.props.Add(new Prop { id = "p" + (++ctx.propSeq), type = "generator", tx = x, ty = y, w = 1, h = 1, color = "#c49a2c", solid = true });
                    world.pois.Add(new Poi { id = "poi" + (++ctx.poiSeq), type = "generator", x = (x + 0.5) * TILE, y = (y + 0.5) * TILE, radius = 64, buildingId = b.id });
                    world.lights.Add(new LightDef { x = (x + 0.5) * TILE, y = (y + 0.5) * TILE, radius = 90, color = "#ffb347", flicker = true });
                    return;
                }
            }
            for (int k = 0; k < 400; k++)
            {
                var o = rng.Pick(ctx.outdoor);
                if (o == null) break;
                int x = o.tx + rng.Int(1, Math.Max(1, o.w - 2)), y = o.ty + rng.Int(1, Math.Max(1, o.h - 2));
                if (!world.IsWalkable(x, y) || world.BuildingIndexAtTile(x, y) >= 0 || ctx.reserved[y * world.w + x] != 0) continue;
                world.Put(x, y, T.PROP_SOLID);
                world.props.Add(new Prop { id = "p" + (++ctx.propSeq), type = "generator", tx = x, ty = y, w = 1, h = 1, color = "#c49a2c", solid = true });
                world.pois.Add(new Poi { id = "poi" + (++ctx.poiSeq), type = "generator", x = (x + 0.5) * TILE, y = (y + 0.5) * TILE, radius = 64 });
                return;
            }
        }

        // ------------------------------------------------------------------ props
        private static bool TryProp(Ctx ctx, string type, int tx, int ty, int w, int h, byte tile, bool solid, bool ignoreRing = false, string color = null)
        {
            var world = ctx.world;
            if (tx < 3 || ty < 3 || tx + w > world.w - 3 || ty + h > world.h - 3) return false;
            for (int y = ty; y < ty + h; y++)
                for (int x = tx; x < tx + w; x++)
                {
                    if (ctx.reserved[y * world.w + x] != 0) return false;
                    int t = world.Tile(x, y);
                    if (T.BlocksMove(t) || t == T.TOXIC || t == T.WATER) return false;
                    if (world.BuildingIndexAtTile(x, y) >= 0) return false;
                }
            if (!ignoreRing)
            {
                for (int y = ty - 1; y <= ty + h; y++)
                    for (int x = tx - 1; x <= tx + w; x++)
                    {
                        if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
                        int t = world.Tile(x, y);
                        if (t == T.PROP_SOLID || t == T.PROP_LOW || t == T.BARRICADE || t == T.WALL || t == T.WINDOW || T.IsDoor(t)) return false;
                    }
            }
            for (int y = ty; y < ty + h; y++) for (int x = tx; x < tx + w; x++) { world.Put(x, y, tile); ctx.reserved[y * world.w + x] = 5; }
            world.props.Add(new Prop { id = "p" + (++ctx.propSeq), type = type, tx = tx, ty = ty, w = w, h = h, rot = w > h ? Math.PI / 2 : 0, color = color, solid = solid });
            return true;
        }

        private static RectI RoadSpot(Ctx ctx, RectI r, int len, int across)
        {
            var rng = ctx.rng; var bands = ctx.layout.bands;
            for (int k = 0; k < 12; k++)
            {
                if (r.dir == "v")
                {
                    int y = r.ty + rng.Int(0, Math.Max(0, r.h - len));
                    if (WorldLayouts.InBands(y - 2, bands.y, bands.band) || WorldLayouts.InBands(y + len + 1, bands.y, bands.band)) continue;
                    int lane = rng.Chance(0.5) ? r.tx : r.tx + r.w - across;
                    return new RectI(lane, y, across, len);
                }
                int x = r.tx + rng.Int(0, Math.Max(0, r.w - len));
                if (WorldLayouts.InBands(x - 2, bands.x, bands.band) || WorldLayouts.InBands(x + len + 1, bands.x, bands.band)) continue;
                int lane2 = rng.Chance(0.5) ? r.ty : r.ty + r.h - across;
                return new RectI(x, lane2, len, across);
            }
            return null;
        }

        private static void Props(Ctx ctx)
        {
            var world = ctx.world; var rng = ctx.rng; var map = ctx.map; var layout = ctx.layout;
            var palette = map.palette ?? new MapPalette();
            var carColors = new[] { "#7a2b2b", "#2b4a7a", "#4a4a4a", "#8a8a7a", "#2f5d3a", "#6d5a2a", "#3b3b55" };
            (int tx, int ty)? OutdoorSpot()
            {
                var o = rng.Pick(ctx.outdoor);
                if (o == null) return null;
                return (o.tx + rng.Int(0, Math.Max(0, o.w - 1)), o.ty + rng.Int(0, Math.Max(0, o.h - 1)));
            }
            (int tx, int ty)? MarginSpot()
            {
                int m = layout.margin != 0 ? layout.margin : 8;
                int edge = rng.Int(0, 3);
                int a = rng.Int(4, (edge < 2 ? world.w : world.h) - 5);
                int d = rng.Int(3, m - 2);
                if (edge == 0) return (a, d);
                if (edge == 1) return (a, world.h - 1 - d);
                if (edge == 2) return (d, a);
                return (world.w - 1 - d, a);
            }
            (int tx, int ty)? AnySpot() => rng.Chance(0.7) ? OutdoorSpot() : MarginSpot();
            var roads = layout.roads ?? new List<RectI>();
            if (map.props != null)
            {
                foreach (var kv in map.props)
                {
                    string type = kv.Key;
                    int count = Math.Max(0, kv.Value);
                    int placed = 0;
                    for (int tries = 0; placed < count && tries < count * 25; tries++)
                    {
                        bool ok = false;
                        if (type == "car" || type == "truck")
                        {
                            var r = rng.Pick(roads);
                            if (r == null) break;
                            int len = type == "car" ? 4 : 5;
                            if ((r.dir == "v" ? r.w : r.h) < 3) continue;
                            var s = RoadSpot(ctx, r, len, 2);
                            if (s == null) continue;
                            ok = TryProp(ctx, type, s.tx, s.ty, s.w, s.h, T.PROP_SOLID, true, false, rng.Pick(carColors));
                        }
                        else if (type == "barricade")
                        {
                            var r = rng.Pick(roads);
                            if (r == null) break;
                            var s = RoadSpot(ctx, r, 1, 2);
                            if (s == null) continue;
                            ok = TryProp(ctx, "barricade", s.tx, s.ty, r.dir == "v" ? 2 : 1, r.dir == "v" ? 1 : 2, T.BARRICADE, true, true, "#6b5a3a");
                        }
                        else
                        {
                            var sp = AnySpot();
                            if (!sp.HasValue) continue;
                            var s = sp.Value;
                            switch (type)
                            {
                                case "tree": ok = TryProp(ctx, "tree", s.tx, s.ty, 1, 1, T.PROP_SOLID, true, false, palette.grass ?? "#2f4a2c"); break;
                                case "dumpster": ok = TryProp(ctx, "dumpster", s.tx, s.ty, 2, 1, T.PROP_SOLID, true, false, "#2f5144"); break;
                                case "bench": ok = TryProp(ctx, "bench", s.tx, s.ty, 2, 1, T.PROP_LOW, false, false, "#5a4632"); break;
                                case "barrel": ok = TryProp(ctx, "barrel", s.tx, s.ty, 1, 1, T.PROP_LOW, false, false, rng.Pick(new[] { "#7a3b22", "#3b5a7a", "#5a6a2a" })); break;
                                case "crate":
                                case "pallet": ok = TryProp(ctx, type, s.tx, s.ty, 1, 1, T.PROP_LOW, false, false, "#7a5f3a"); break;
                                case "sandbag": { bool a = rng.Chance(0.5), b2 = rng.Chance(0.5); ok = TryProp(ctx, "sandbag", s.tx, s.ty, a ? 3 : 1, b2 ? 1 : 3, T.PROP_LOW, false, false, "#8a7a55"); break; }
                                case "tank": ok = TryProp(ctx, "tank", s.tx, s.ty, 3, 3, T.PROP_SOLID, true, false, "#6a6e72"); break;
                                case "pipe": { bool v = rng.Chance(0.5); int l = rng.Int(3, 7); ok = TryProp(ctx, "pipe", s.tx, s.ty, v ? 1 : l, v ? l : 1, T.PROP_LOW, false, false, "#7a6a5a"); break; }
                                case "tower": ok = TryProp(ctx, "tower", s.tx, s.ty, 2, 2, T.PROP_SOLID, true, false, "#5a5040"); break;
                                case "antenna": ok = TryProp(ctx, "antenna", s.tx, s.ty, 1, 1, T.PROP_SOLID, true, false, "#888"); break;
                                case "generator": ok = true; break;
                                default: ok = TryProp(ctx, type, s.tx, s.ty, 1, 1, T.PROP_LOW, false, false, "#666"); break;
                            }
                        }
                        if (ok) placed++;
                    }
                }
            }
            int bodies = map.layout == "campus" ? 8 : 10;
            for (int k = 0, tries = 0; k < bodies && tries < 200; tries++)
            {
                var sp = AnySpot();
                if (!sp.HasValue) continue;
                var s = sp.Value;
                if (!world.IsWalkable(s.tx, s.ty) || world.BuildingIndexAtTile(s.tx, s.ty) >= 0 || ctx.reserved[s.ty * world.w + s.tx] != 0) continue;
                world.containers.Add(new Container
                {
                    uid = "c" + (++ctx.containerSeq), type = "body", tx = s.tx, ty = s.ty, x = (s.tx + 0.5) * TILE, y = (s.ty + 0.5) * TILE,
                    tier = M.Clamp(map.lootTierBase != 0 ? map.lootTierBase : 1, 1, 5),
                });
                ctx.reserved[s.ty * world.w + s.tx] = 5;
                k++;
            }
        }

        private static void Lights(Ctx ctx)
        {
            var world = ctx.world; var rng = ctx.rng; var map = ctx.map;
            if (map.lights != "none")
            {
                string col = map.layout == "campus" ? "#d6ecff" : "#ffd79a";
                foreach (var r in ctx.layout.roads ?? new List<RectI>())
                {
                    const int step = 10;
                    if (r.dir == "v")
                    {
                        for (int y = r.ty + 3; y < r.ty + r.h - 2; y += step)
                        {
                            int x = r.tx - 1;
                            if (!world.IsWalkable(x, y)) continue;
                            world.props.Add(new Prop { id = "p" + (++ctx.propSeq), type = "lamp", tx = x, ty = y, w = 1, h = 1, color = "#bbb" });
                            if (rng.Chance(0.75)) world.lights.Add(new LightDef { x = (x + 0.5) * TILE, y = (y + 0.5) * TILE, radius = 170, color = col, flicker = rng.Chance(0.2) });
                        }
                    }
                    else
                    {
                        for (int x = r.tx + 3; x < r.tx + r.w - 2; x += step)
                        {
                            int y = r.ty - 1;
                            if (!world.IsWalkable(x, y)) continue;
                            world.props.Add(new Prop { id = "p" + (++ctx.propSeq), type = "lamp", tx = x, ty = y, w = 1, h = 1, color = "#bbb" });
                            if (rng.Chance(0.75)) world.lights.Add(new LightDef { x = (x + 0.5) * TILE, y = (y + 0.5) * TILE, radius = 170, color = col, flicker = rng.Chance(0.2) });
                        }
                    }
                }
            }
            foreach (var z in world.toxicZones) world.lights.Add(new LightDef { x = z.x, y = z.y, radius = z.r * 1.6, color = "#7dff5a", flicker = true, toxic = true });
        }

        // ------------------------------------------------------------------ zombies
        private sealed class WEntry { public string id; public double w; }

        private static void Zombies(Ctx ctx)
        {
            var world = ctx.world; var rng = ctx.rng; var map = ctx.map;
            var zdef = map.zombies ?? new ZombieSpawnSpec { count = 60, weights = new Dictionary<string, double> { ["walker"] = 1 } };
            var weights = (zdef.weights ?? new Dictionary<string, double> { ["walker"] = 1 })
                .Where(kv => kv.Key != "boss" && DataTables.ZOMBIE_TYPES.ContainsKey(kv.Key)).Select(kv => new WEntry { id = kv.Key, w = kv.Value }).ToList();
            if (weights.Count == 0) weights.Add(new WEntry { id = "walker", w = 1 });
            double minD = 28 * TILE;
            int remaining = Math.Max(0, zdef.count);
            var floorRects = new List<RectI>();
            foreach (var b in world.buildings) if (!b.hall) floorRects.AddRange(b.rooms);
            int guard = 0;
            while (remaining > 0 && guard++ < 2000)
            {
                int n = Math.Min(remaining, rng.Int(2, 6));
                (double x, double y)? spot = null;
                bool indoor = floorRects.Count > 0 && rng.Chance(0.35);
                for (int k = 0; k < 30 && !spot.HasValue; k++)
                {
                    int tx, ty;
                    if (indoor) { var r = rng.Pick(floorRects); tx = r.tx + rng.Int(0, r.w - 1); ty = r.ty + rng.Int(0, r.h - 1); }
                    else { tx = rng.Int(4, world.w - 5); ty = rng.Int(4, world.h - 5); }
                    if (!world.IsWalkable(tx, ty) || world.Tile(tx, ty) == T.TOXIC) continue;
                    double x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
                    if (M.Hypot(x - world.spawnX, y - world.spawnY) < minD) continue;
                    if (world.extractions.Any(e => M.Hypot(e.x - x, e.y - y) < 6 * TILE)) continue;
                    int bi = world.BuildingIndexAtTile(tx, ty);
                    if (world.bossArena != null && bi >= 0 && world.buildings[bi].hall) continue;
                    spot = (x, y);
                }
                if (!spot.HasValue) continue;
                var types = new List<string>();
                for (int i = 0; i < n; i++) types.Add((rng.Weighted(weights, e => e.w) ?? weights[0]).id);
                if (indoor)
                {
                    var special = weights.Where(q => q.id == "stalker" || q.id == "screamer").ToList();
                    if (special.Count > 0 && rng.Chance(0.5)) types[0] = rng.Pick(special).id;
                }
                world.zombieSpawns.Add(new ZombieSpawn { x = spot.Value.x, y = spot.Value.y, count = n, types = types, indoor = indoor });
                remaining -= n;
            }
            if (!string.IsNullOrEmpty(map.boss) && world.bossArena != null)
                world.zombieSpawns.Add(new ZombieSpawn { x = world.bossArena.x, y = world.bossArena.y, count = 5, types = new List<string> { map.boss, "walker", "walker", "walker", "walker" }, boss = true });
        }

        // ------------------------------------------------------------------ missions (never changes tiles)
        private static void MissionPlacement(Ctx ctx, Rng mrng, List<MissionDef> missionDefs)
        {
            var world = ctx.world;
            List<Container> ByType(string[] types, int minTier) =>
                world.containers.Where(c => c.type != "body" && c.tier >= minTier && (types == null || Array.IndexOf(types, c.buildingType) >= 0)).ToList();
            bool PutInContainer(string id, int count, string[] types, int minTier)
            {
                var list = ByType(types, minTier);
                if (list.Count == 0) list = ByType(null, minTier);
                if (list.Count == 0) list = ByType(null, 1);
                if (list.Count == 0) return false;
                var c = mrng.Pick(list);
                var inst = Items.Create(id, count);
                if (inst == null) return false;
                c.preset.Add(inst);
                return true;
            }
            (double x, double y) OutdoorPoint(double minFromSpawn)
            {
                for (int k = 0; k < 200; k++)
                {
                    var o = mrng.Pick(ctx.outdoor);
                    if (o == null) break;
                    int tx = o.tx + mrng.Int(0, Math.Max(0, o.w - 1)), ty = o.ty + mrng.Int(0, Math.Max(0, o.h - 1));
                    if (!world.IsWalkable(tx, ty) || world.BuildingIndexAtTile(tx, ty) >= 0 || world.Tile(tx, ty) == T.TOXIC) continue;
                    double x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
                    if (M.Hypot(x - world.spawnX, y - world.spawnY) < minFromSpawn) continue;
                    if (world.pois.Any(p => M.Hypot(p.x - x, p.y - y) < 8 * TILE)) continue;
                    return (x, y);
                }
                for (int k = 0; k < 400; k++)
                {
                    int tx = mrng.Int(5, world.w - 6), ty = mrng.Int(5, world.h - 6);
                    if (world.IsWalkable(tx, ty) && world.BuildingIndexAtTile(tx, ty) < 0) return ((tx + 0.5) * TILE, (ty + 0.5) * TILE);
                }
                return (world.spawnX, world.spawnY);
            }
            (double x, double y, string bid)? IndoorPoint(string[] types)
            {
                var bl = world.buildings.Where(b => !b.hall && (types == null || Array.IndexOf(types, b.type) >= 0)).ToList();
                var b = bl.Count > 0 ? mrng.Pick(bl) : null;
                if (b == null || b.rooms.Count == 0) return null;
                var r = mrng.Pick(b.rooms);
                for (int k = 0; k < 20; k++)
                {
                    int tx = r.tx + mrng.Int(0, r.w - 1), ty = r.ty + mrng.Int(0, r.h - 1);
                    if (world.Tile(tx, ty) == T.FLOOR) return ((tx + 0.5) * TILE, (ty + 0.5) * TILE, b.id);
                }
                return null;
            }
            Poi AddPoi(string type)
            {
                (double x, double y, string bid)? p = null;
                if (type == "server_room") p = IndoorPoint(new[] { "server", "lab", "office", "hq" });
                else if (type == "lab_entrance") p = IndoorPoint(new[] { "lab", "medical", "bunker" });
                else if (type == "checkpoint")
                {
                    var cp = world.buildings.FirstOrDefault(b => b.type == "checkpoint");
                    if (cp != null && cp.doors.Count > 0) p = ((cp.doors[0].ox + 0.5) * TILE, (cp.doors[0].oy + 0.5) * TILE, cp.id);
                }
                else if (type == "boss_arena" && world.bossArena != null) p = (world.bossArena.x, world.bossArena.y, world.bossArena.buildingId);
                if (!p.HasValue) { var o = OutdoorPoint(30 * TILE); p = (o.x, o.y, null); }
                var poi = new Poi { id = "poi" + (++ctx.poiSeq), type = type, x = p.Value.x, y = p.Value.y, radius = 64, buildingId = p.Value.bid };
                world.pois.Add(poi);
                return poi;
            }
            bool PresetHas(string id) => world.containers.Any(c => c.preset.Any(i => i.id == id));
            foreach (var m in missionDefs)
            {
                foreach (var o in AllObjectives(m))
                {
                    if (o.type == "investigate")
                    {
                        if (!world.pois.Any(p => p.type == o.target)) AddPoi(o.target);
                    }
                    else if (o.type == "retrieve")
                    {
                        string id = o.target;
                        if (world.floorLoot.Any(f => f.inst != null && f.inst.id == id) || PresetHas(id)) continue;
                        int count = Math.Max(1, o.count);
                        if (id == "mis_supply_package" || !RetrieveHosts.ContainsKey(id))
                        {
                            var poi = world.pois.FirstOrDefault(p => p.type == "supply_drop") ?? AddPoi("supply_drop");
                            for (int k = 0; k < count; k++)
                            {
                                var inst = Items.Create(id, 1);
                                if (inst != null) inst.raidFound = true;
                                if (inst != null) world.floorLoot.Add(new FloorLoot { uid = "fl" + world.floorLoot.Count, inst = inst, x = poi.x + mrng.Float(-14, 14), y = poi.y + mrng.Float(-14, 14) });
                            }
                        }
                        else for (int k = 0; k < count; k++) PutInContainer(id, 1, RetrieveHosts[id], 1);
                    }
                    else if (o.type == "find_key")
                    {
                        if (!PresetHas(o.target)) PutInContainer(o.target, 1, new[] { "security", "hq", "office", "checkpoint", "armory", "workshop", "garage", "apartment" }, 2);
                    }
                }
            }
            foreach (var e in world.extractions)
            {
                if (e.kind != "key" || string.IsNullOrEmpty(e.requires)) continue;
                if (PresetHas(e.requires)) continue;
                PutInContainer(e.requires, 1, null, 2);
            }
            if (world.buildings.Any(b => b.locked) && !PresetHas("key_lab_card"))
            {
                if (!PutInContainer("key_lab_card", 1, new[] { "security" }, 1)) PutInContainer("key_lab_card", 1, new[] { "lab", "office", "medical" }, 2);
            }
            foreach (var e in world.extractions)
                if (e.kind == "fuel" && !string.IsNullOrEmpty(e.requires) && !PresetHas(e.requires))
                    PutInContainer(e.requires, 1, new[] { "garage", "workshop", "factory", "warehouse", "storage" }, 1);
        }
    }
}
