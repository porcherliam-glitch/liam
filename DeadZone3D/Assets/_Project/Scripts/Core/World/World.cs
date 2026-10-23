using System;
using System.Collections.Generic;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    /// <summary>Tile codes (same numbers as the HTML version).</summary>
    public static class T
    {
        public const byte VOID = 0, GROUND = 1, ROAD = 2, FLOOR = 3, WALL = 4, DOOR_CLOSED = 5, DOOR_OPEN = 6, WINDOW = 7, WATER = 8,
            RUBBLE = 9, GRASS = 10, TOXIC = 11, FENCE = 12, BARRICADE = 13, PROP_SOLID = 14, PROP_LOW = 15,
            ROAD_LINE = 16, SIDEWALK = 17, DOOR_LOCKED = 18, GRAVEL = 19;

        private static readonly bool[] Move = new bool[32], Sight = new bool[32], Bullet = new bool[32];
        private static readonly double[] Speed = new double[32];

        static T()
        {
            foreach (var t in new[] { VOID, WALL, DOOR_CLOSED, DOOR_LOCKED, WINDOW, WATER, FENCE, BARRICADE, PROP_SOLID, PROP_LOW }) Move[t] = true;
            foreach (var t in new[] { VOID, WALL, DOOR_CLOSED, DOOR_LOCKED, BARRICADE, PROP_SOLID }) { Sight[t] = true; Bullet[t] = true; }
            for (int i = 0; i < 32; i++) Speed[i] = 1;
            Speed[RUBBLE] = 0.6; Speed[TOXIC] = 0.6;
        }

        public static bool BlocksMove(int t) => Move[t];
        public static bool BlocksSight(int t) => Sight[t];
        public static bool BlocksBullets(int t) => Bullet[t];
        public static double SpeedMul(int t) => Speed[t];
        public static bool IsDoor(int t) => t == DOOR_CLOSED || t == DOOR_OPEN || t == DOOR_LOCKED;
    }

    public sealed class RectI
    {
        public int tx, ty, w, h;
        public string zone, dir, kind;
        public int i, j;
        public bool fenced;
        public RectI() { }
        public RectI(int tx, int ty, int w, int h) { this.tx = tx; this.ty = ty; this.w = w; this.h = h; }
    }

    public sealed class Door { public int tx, ty, ox, oy; public string side; }

    public sealed class Building
    {
        public string id, type, name, zone;
        public int tx, ty, w, h, lootTier;
        public string roofColor, wallColor, floorColor;
        public readonly List<Door> doors = new List<Door>();
        public List<RectI> rooms = new List<RectI>();
        public readonly List<string> containers = new List<string>();
        public bool locked, hall;
    }

    public sealed class Prop
    {
        public string id, type, color, extraction;
        public int tx, ty, w, h;
        public double rot;
        public bool solid;
    }

    public sealed class Container
    {
        public string uid, type, buildingId, buildingType;
        public int tx, ty, tier;
        public double x, y;
        public List<ItemInst> items;          // null until rolled
        public bool opened, locked, searched;
        public List<ItemInst> preset = new List<ItemInst>();
    }

    public sealed class FloorLoot { public string uid; public ItemInst inst; public double x, y; }

    public sealed class Poi
    {
        public string id, type, buildingId;
        public double x, y, radius, timer;
        public bool used;
    }

    public sealed class LightDef
    {
        public double x, y, radius;
        public string color, extraction;
        public bool flicker, indoor, toxic;
    }

    public sealed class Extraction
    {
        public string id, name, kind, requires, hazard;
        public double duration, x, y, radius;
        public double[] window;
    }

    public sealed class ZombieSpawn
    {
        public double x, y;
        public int count;
        public List<string> types = new List<string>();
        public bool indoor, boss;
    }

    public sealed class ToxicZone { public double x, y, r; }
    public sealed class BossArena { public double x, y, r; public string buildingId; }

    /// <summary>Tile world (port of class World).</summary>
    public sealed class World
    {
        public const int TILE = 32;
        public readonly string mapId;
        public readonly MapDef map;
        public uint seed;
        public readonly int w, h;
        public readonly byte[] tiles, tileVariant;
        public readonly short[] buildingGrid;
        public readonly List<Building> buildings = new List<Building>();
        public List<Prop> props = new List<Prop>();
        public readonly List<Container> containers = new List<Container>();
        public readonly List<FloorLoot> floorLoot = new List<FloorLoot>();
        public double spawnX, spawnY;
        public int spawnEdge;
        public readonly List<ZombieSpawn> zombieSpawns = new List<ZombieSpawn>();
        public readonly List<Extraction> extractions = new List<Extraction>();
        public readonly List<Poi> pois = new List<Poi>();
        public readonly List<LightDef> lights = new List<LightDef>();
        public readonly List<ToxicZone> toxicZones = new List<ToxicZone>();
        public BossArena bossArena;
        public List<RectI> roads = new List<RectI>(), blocks = new List<RectI>(), yards = new List<RectI>();
        public readonly List<RectI> rails = new List<RectI>();
        public int version;
        public readonly HashSet<int> dirtyChunks = new HashSet<int>();

        public World(string mapId, uint seed, int w, int h)
        {
            this.mapId = mapId;
            DataTables.MAPS.TryGetValue(mapId ?? "", out map);
            this.seed = seed;
            this.w = w; this.h = h;
            tiles = new byte[w * h];
            tileVariant = new byte[w * h];
            buildingGrid = new short[w * h];
            for (int i = 0; i < buildingGrid.Length; i++) buildingGrid[i] = -1;
        }

        public double PixelW => w * TILE;
        public double PixelH => h * TILE;
        public bool InBounds(int tx, int ty) => tx >= 0 && ty >= 0 && tx < w && ty < h;
        public int Tile(int tx, int ty) => (tx < 0 || ty < 0 || tx >= w || ty >= h) ? T.VOID : tiles[ty * w + tx];

        public void SetTile(int tx, int ty, byte code)
        {
            if (!InBounds(tx, ty)) return;
            int i = ty * w + tx;
            if (tiles[i] == code) return;
            tiles[i] = code;
            version++;
            dirtyChunks.Add((ty >> 4) * 4096 + (tx >> 4));
        }

        /// <summary>Raw write without versioning (generator only).</summary>
        public void Put(int tx, int ty, byte code) { if (InBounds(tx, ty)) tiles[ty * w + tx] = code; }
        public bool BlocksMove(int tx, int ty) => T.BlocksMove(Tile(tx, ty));
        public bool BlocksSight(int tx, int ty) => T.BlocksSight(Tile(tx, ty));
        public bool BlocksBullets(int tx, int ty) => T.BlocksBullets(Tile(tx, ty));
        public double SpeedMul(int tx, int ty) => T.SpeedMul(Tile(tx, ty));
        public bool IsWalkable(int tx, int ty) => !T.BlocksMove(Tile(tx, ty));
        public int BuildingIndexAtTile(int tx, int ty) => InBounds(tx, ty) ? buildingGrid[ty * w + tx] : -1;

        public Building BuildingAt(double x, double y)
        {
            int i = BuildingIndexAtTile(M.Floor(x / TILE), M.Floor(y / TILE));
            return i >= 0 && i < buildings.Count ? buildings[i] : null;
        }

        public bool IsIndoor(double x, double y)
        {
            int tx = M.Floor(x / TILE), ty = M.Floor(y / TILE);
            return Tile(tx, ty) == T.FLOOR || BuildingIndexAtTile(tx, ty) >= 0;
        }

        public void IndexBuilding(Building b, int idx)
        {
            for (int y = b.ty; y < b.ty + b.h; y++)
                for (int x = b.tx; x < b.tx + b.w; x++)
                    if (InBounds(x, y)) buildingGrid[y * w + x] = (short)idx;
        }

        public Container ContainerAt(double x, double y, double r)
        {
            Container best = null; double bd = r * r;
            foreach (var c in containers)
            {
                double d = M.Dist2(x, y, c.x, c.y);
                if (d <= bd) { bd = d; best = c; }
            }
            return best;
        }

        public Building BuildingById(string id)
        {
            foreach (var b in buildings) if (b.id == id) return b;
            return null;
        }

        public List<int> SerializeDoors()
        {
            var outp = new List<int>();
            for (int i = 0; i < tiles.Length; i++) if (tiles[i] == T.DOOR_OPEN) outp.Add(i);
            return outp;
        }

        /// <summary>BFS over walkable tiles; closed and locked doors count as walkable.</summary>
        public byte[] Reachability(int fromTx, int fromTy)
        {
            int n = w * h;
            var seen = new byte[n];
            if (!InBounds(fromTx, fromTy)) return seen;
            var queue = new int[n];
            int head = 0, tail = 0;
            int start = fromTy * w + fromTx;
            seen[start] = 1; queue[tail++] = start;
            while (head < tail)
            {
                int i = queue[head++];
                int x = i % w, y = i / w;
                for (int k = 0; k < 4; k++)
                {
                    int nx = k == 0 ? x + 1 : k == 1 ? x - 1 : x;
                    int ny = k == 2 ? y + 1 : k == 3 ? y - 1 : y;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    int j = ny * w + nx;
                    if (seen[j] != 0) continue;
                    int t = tiles[j];
                    if (T.BlocksMove(t) && t != T.DOOR_CLOSED && t != T.DOOR_LOCKED) continue;
                    seen[j] = 1; queue[tail++] = j;
                }
            }
            return seen;
        }
    }
}
