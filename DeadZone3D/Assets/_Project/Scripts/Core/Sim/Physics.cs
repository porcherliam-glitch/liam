using System;
using System.Collections.Generic;

namespace DeadZone.Core
{
    public struct MoveResult { public double x, y; public bool collided; }
    public struct RayHit { public bool hit; public double x, y, dist; public int tx, ty, tile; }
    public struct Vec2 { public double x, y; public Vec2(double x, double y) { this.x = x; this.y = y; } }

    /// <summary>Anything that lives in the spatial hash.</summary>
    public class Entity
    {
        public double x, y, radius;
        internal long hashKey = long.MinValue;
    }

    /// <summary>Tile collision and raycasts (port of class Physics).</summary>
    public static class Physics
    {
        private const int TILE = World.TILE;

        private static bool CircleBlocked(World world, double x, double y, double r)
        {
            int x0 = M.Floor((x - r) / TILE), x1 = M.Floor((x + r) / TILE);
            int y0 = M.Floor((y - r) / TILE), y1 = M.Floor((y + r) / TILE);
            for (int ty = y0; ty <= y1; ty++)
                for (int tx = x0; tx <= x1; tx++)
                {
                    if (!world.BlocksMove(tx, ty)) continue;
                    if (M.CircleRectOverlap(x, y, r, tx * TILE, ty * TILE, TILE, TILE)) return true;
                }
            return false;
        }

        public static MoveResult MoveCircle(World world, double x, double y, double r, double dx, double dy)
        {
            if (world == null || double.IsNaN(dx) || double.IsNaN(dy) || double.IsInfinity(dx) || double.IsInfinity(dy)) return new MoveResult { x = x, y = y };
            double dmax = Math.Max(Math.Abs(dx), Math.Abs(dy));
            int steps = Math.Min(8, Math.Max(1, M.Ceil(dmax / Math.Max(2, r * 0.45))));
            double sx = dx / steps, sy = dy / steps;
            bool collided = false;
            for (int i = 0; i < steps; i++)
            {
                if (sx != 0)
                {
                    double nx = x + sx;
                    if (!CircleBlocked(world, nx, y, r)) x = nx;
                    else
                    {
                        collided = true;
                        double part = sx * 0.5;
                        for (int k = 0; k < 2; k++) { if (!CircleBlocked(world, x + part, y, r)) x += part; part *= 0.5; }
                    }
                }
                if (sy != 0)
                {
                    double ny = y + sy;
                    if (!CircleBlocked(world, x, ny, r)) y = ny;
                    else
                    {
                        collided = true;
                        double part = sy * 0.5;
                        for (int k = 0; k < 2; k++) { if (!CircleBlocked(world, x, y + part, r)) y += part; part *= 0.5; }
                    }
                }
            }
            return new MoveResult { x = x, y = y, collided = collided };
        }

        /// <summary>Amanatides–Woo grid traversal; ignores the start tile.</summary>
        public static RayHit RaycastTiles(World world, double x0, double y0, double x1, double y1, Func<int, bool> blockFn = null)
        {
            blockFn = blockFn ?? T.BlocksBullets;
            double dx = x1 - x0, dy = y1 - y0;
            double len = M.Hypot(dx, dy);
            int tx = M.Floor(x0 / TILE), ty = M.Floor(y0 / TILE);
            int ex = M.Floor(x1 / TILE), ey = M.Floor(y1 / TILE);
            if (len < 1e-6) return new RayHit { x = x1, y = y1, tx = ex, ty = ey, tile = world.Tile(ex, ey) };
            int stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
            double tDeltaX = dx != 0 ? Math.Abs(TILE / dx) : double.PositiveInfinity;
            double tDeltaY = dy != 0 ? Math.Abs(TILE / dy) : double.PositiveInfinity;
            double tMaxX = dx != 0 ? ((stepX > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / Math.Abs(dx)) : double.PositiveInfinity;
            double tMaxY = dy != 0 ? ((stepY > 0 ? (ty + 1) * TILE - y0 : y0 - ty * TILE) / Math.Abs(dy)) : double.PositiveInfinity;
            int guard = 0;
            while ((tx != ex || ty != ey) && guard++ < 512)
            {
                double t;
                if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDeltaX; tx += stepX; }
                else { t = tMaxY; tMaxY += tDeltaY; ty += stepY; }
                if (t > 1) break;
                int tile = world.Tile(tx, ty);
                if (blockFn(tile)) return new RayHit { hit = true, x = x0 + dx * t, y = y0 + dy * t, tx = tx, ty = ty, dist = len * t, tile = tile };
            }
            return new RayHit { x = x1, y = y1, tx = ex, ty = ey, dist = len, tile = world.Tile(ex, ey) };
        }

        public static bool LineOfSight(World world, double x0, double y0, double x1, double y1)
        {
            if (world == null) return false;
            return !RaycastTiles(world, x0, y0, x1, y1, T.BlocksSight).hit;
        }

        public static double SegmentCircle(double x0, double y0, double x1, double y1, double cx, double cy, double r)
        {
            double dx = x1 - x0, dy = y1 - y0;
            double fx = x0 - cx, fy = y0 - cy;
            double a = dx * dx + dy * dy;
            double c = fx * fx + fy * fy - r * r;
            if (c <= 0) return 0;
            if (a < 1e-9) return -1;
            double b = 2 * (fx * dx + fy * dy);
            double disc = b * b - 4 * a * c;
            if (disc < 0) return -1;
            double t = (-b - Math.Sqrt(disc)) / (2 * a);
            return t >= 0 && t <= 1 ? t : -1;
        }
    }

    /// <summary>Uniform-grid spatial hash for entities.</summary>
    public sealed class SpatialHash<TE> where TE : Entity
    {
        private readonly double _cell;
        private readonly Dictionary<long, List<TE>> _buckets = new Dictionary<long, List<TE>>();
        private readonly List<List<TE>> _used = new List<List<TE>>();

        public SpatialHash(double cellSize = 96) { _cell = cellSize; }
        private static long Key(long cx, long cy) => (cx + 1024) * 4096 + (cy + 1024);

        public void Clear()
        {
            foreach (var b in _used) b.Clear();
            _used.Clear();
        }

        public void Insert(TE e)
        {
            if (e == null) return;
            long k = Key(M.Floor(e.x / _cell), M.Floor(e.y / _cell));
            if (!_buckets.TryGetValue(k, out var b)) _buckets[k] = b = new List<TE>();
            if (b.Count == 0) _used.Add(b);
            b.Add(e);
            e.hashKey = k;
        }

        public List<TE> QueryRect(double x, double y, double w, double h, List<TE> outp = null)
        {
            var res = outp ?? new List<TE>();
            int cx0 = M.Floor(x / _cell), cx1 = M.Floor((x + w) / _cell);
            int cy0 = M.Floor(y / _cell), cy1 = M.Floor((y + h) / _cell);
            for (int cy = cy0; cy <= cy1; cy++)
                for (int cx = cx0; cx <= cx1; cx++)
                    if (_buckets.TryGetValue(Key(cx, cy), out var b)) res.AddRange(b);
            return res;
        }

        public List<TE> Query(double x, double y, double r, List<TE> outp = null) => QueryRect(x - r, y - r, r * 2, r * 2, outp);
    }

    /// <summary>Flow field toward the player plus budgeted A* (port of class Nav).</summary>
    public sealed class Nav
    {
        private const int TILE = World.TILE;
        private static readonly int[] DX = WorldGenerator.DX, DY = WorldGenerator.DY;
        private readonly World _world;
        private readonly int[] _dist, _touched, _cameFrom, _heap;
        private readonly byte[] _dir;
        private readonly double[] _gScore, _heapF;
        private readonly ushort[] _stamp, _closed;
        private int _touchedCount, _lastTarget = -1, _lastVersion = -1, _heapSize;
        private ushort _gen;
        private readonly List<int>[] _buckets = new List<int>[16];

        public Nav(World world)
        {
            _world = world;
            int n = world.w * world.h;
            _dist = new int[n];
            for (int i = 0; i < n; i++) _dist[i] = -1;
            _dir = new byte[n];
            _touched = new int[n];
            _gScore = new double[n];
            _cameFrom = new int[n];
            _stamp = new ushort[n];
            _closed = new ushort[n];
            _heap = new int[n + 16];
            _heapF = new double[n + 16];
            for (int i = 0; i < 16; i++) _buckets[i] = new List<int>();
        }

        private static int StepCost(int t) => t == T.DOOR_CLOSED ? 4 : (t == T.RUBBLE || t == T.TOXIC) ? 2 : 1;
        private static bool Passable(int t) => !T.BlocksMove(t) || t == T.DOOR_CLOSED;

        public void Rebuild(double targetX, double targetY, int maxRadiusTiles = 60)
        {
            int w = _world.w, h = _world.h;
            int ttx = M.Clamp(M.Floor(targetX / TILE), 0, w - 1), tty = M.Clamp(M.Floor(targetY / TILE), 0, h - 1);
            int target = tty * w + ttx;
            if (target == _lastTarget && _lastVersion == _world.version) return;
            _lastTarget = target; _lastVersion = _world.version;
            for (int i = 0; i < _touchedCount; i++) { int c = _touched[i]; _dist[c] = -1; _dir[c] = 0; }
            _touchedCount = 0;
            var tiles = _world.tiles;
            int R = maxRadiusTiles;
            foreach (var b in _buckets) b.Clear();
            int NB = _buckets.Length;
            _dist[target] = 0;
            _touched[_touchedCount++] = target;
            _buckets[0].Add(target);
            int cur = 0, pending = 1, guard = 0;
            int cap = (2 * R + 1) * (2 * R + 1) * 4;
            while (pending > 0 && guard++ < cap)
            {
                var bucket = _buckets[cur % NB];
                if (bucket.Count == 0) { cur++; continue; }
                int i = bucket[bucket.Count - 1]; bucket.RemoveAt(bucket.Count - 1); pending--;
                int d = _dist[i];
                if (d != cur) continue;
                int x = i % w, y = i / w;
                for (int k = 0; k < 8; k++)
                {
                    int nx = x + DX[k], ny = y + DY[k];
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    if (Math.Abs(nx - ttx) > R || Math.Abs(ny - tty) > R) continue;
                    int j = ny * w + nx;
                    int t = tiles[j];
                    if (!Passable(t)) continue;
                    if (k >= 4)
                    {
                        if (!Passable(tiles[y * w + nx]) || !Passable(tiles[ny * w + x])) continue;
                        if (tiles[y * w + nx] == T.DOOR_CLOSED || tiles[ny * w + x] == T.DOOR_CLOSED) continue;
                    }
                    int nd = d + (k >= 4 ? 3 : 2) * StepCost(t);
                    int old = _dist[j];
                    if (old == -1 || nd < old)
                    {
                        if (old == -1) _touched[_touchedCount++] = j;
                        _dist[j] = nd;
                        _dir[j] = 0;
                        _buckets[nd % NB].Add(j);
                        pending++;
                    }
                }
            }
            for (int n = 0; n < _touchedCount; n++)
            {
                int i = _touched[n];
                int d = _dist[i];
                if (d <= 0) continue;
                int x = i % w, y = i / w;
                int best = -1, bestD = d;
                for (int k = 0; k < 8; k++)
                {
                    int nx = x + DX[k], ny = y + DY[k];
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    int j = ny * w + nx;
                    int dj = _dist[j];
                    if (dj < 0 || dj >= bestD) continue;
                    if (k >= 4)
                    {
                        if (!Passable(tiles[y * w + nx]) || !Passable(tiles[ny * w + x])) continue;
                        if (tiles[y * w + nx] == T.DOOR_CLOSED || tiles[ny * w + x] == T.DOOR_CLOSED) continue;
                    }
                    bestD = dj; best = k;
                }
                _dir[i] = (byte)(best + 1);
            }
        }

        public Vec2? DirAt(double x, double y)
        {
            int tx = M.Floor(x / TILE), ty = M.Floor(y / TILE);
            if (!_world.InBounds(tx, ty)) return null;
            int i = ty * _world.w + tx;
            if (_dist[i] < 0) return null;
            int k = _dir[i] - 1;
            if (k < 0) return null;
            double cx = (tx + DX[k] + 0.5) * TILE, cy = (ty + DY[k] + 0.5) * TILE;
            double dx = cx - x, dy = cy - y;
            double l = M.Hypot(dx, dy);
            if (l < 2) { dx = DX[k]; dy = DY[k]; l = M.Hypot(dx, dy); }
            return new Vec2(dx / l, dy / l);
        }

        public double DistAt(double x, double y)
        {
            int tx = M.Floor(x / TILE), ty = M.Floor(y / TILE);
            if (!_world.InBounds(tx, ty)) return double.PositiveInfinity;
            int d = _dist[ty * _world.w + tx];
            return d < 0 ? double.PositiveInfinity : d;
        }

        private void HeapPush(int i, double f)
        {
            int n = _heapSize++;
            _heap[n] = i; _heapF[n] = f;
            while (n > 0)
            {
                int p = (n - 1) >> 1;
                if (_heapF[p] <= _heapF[n]) break;
                (_heap[p], _heap[n]) = (_heap[n], _heap[p]);
                (_heapF[p], _heapF[n]) = (_heapF[n], _heapF[p]);
                n = p;
            }
        }

        private int HeapPop()
        {
            int top = _heap[0];
            int last = --_heapSize;
            if (last > 0)
            {
                _heap[0] = _heap[last]; _heapF[0] = _heapF[last];
                int n = 0;
                for (; ; )
                {
                    int l = 2 * n + 1, r = l + 1, m = n;
                    if (l < last && _heapF[l] < _heapF[m]) m = l;
                    if (r < last && _heapF[r] < _heapF[m]) m = r;
                    if (m == n) break;
                    (_heap[m], _heap[n]) = (_heap[n], _heap[m]);
                    (_heapF[m], _heapF[n]) = (_heapF[n], _heapF[m]);
                    n = m;
                }
            }
            return top;
        }

        public List<Vec2> FindPath(double x0, double y0, double x1, double y1, int maxNodes = 4000)
        {
            int w = _world.w, h = _world.h;
            int sx = M.Floor(x0 / TILE), sy = M.Floor(y0 / TILE);
            int gx = M.Floor(x1 / TILE), gy = M.Floor(y1 / TILE);
            if (!_world.InBounds(sx, sy) || !_world.InBounds(gx, gy)) return null;
            var tiles = _world.tiles;
            int goal = gy * w + gx;
            if (!Passable(tiles[goal]) && tiles[goal] != T.DOOR_LOCKED) return null;
            _gen++;
            if (_gen == 0) { Array.Clear(_stamp, 0, _stamp.Length); Array.Clear(_closed, 0, _closed.Length); _gen = 1; }
            ushort gen = _gen;
            int start = sy * w + sx;
            _heapSize = 0;
            _stamp[start] = gen; _gScore[start] = 0; _cameFrom[start] = -1;
            double H(int x, int y) { int dx = Math.Abs(x - gx), dy = Math.Abs(y - gy); return dx + dy + (1.4142 - 2) * Math.Min(dx, dy); }
            HeapPush(start, H(sx, sy));
            int expanded = 0;
            while (_heapSize > 0)
            {
                int i = HeapPop();
                if (_closed[i] == gen) continue;
                _closed[i] = gen;
                if (i == goal)
                {
                    var outp = new List<Vec2>();
                    int c = i, guard = 0;
                    while (c != start && c >= 0 && guard++ < 100000)
                    {
                        int cx = c % w, cy = c / w;
                        outp.Add(new Vec2((cx + 0.5) * TILE, (cy + 0.5) * TILE));
                        c = _cameFrom[c];
                    }
                    outp.Reverse();
                    return outp;
                }
                if (++expanded > maxNodes) return null;
                int x = i % w, y = i / w;
                double g = _gScore[i];
                for (int k = 0; k < 8; k++)
                {
                    int nx = x + DX[k], ny = y + DY[k];
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    int j = ny * w + nx;
                    int t = tiles[j];
                    if (!Passable(t) && !(j == goal && t == T.DOOR_LOCKED)) continue;
                    if (k >= 4 && (T.BlocksMove(tiles[y * w + nx]) || T.BlocksMove(tiles[ny * w + x]))) continue;
                    double step = (k >= 4 ? 1.4142 : 1) * (t == T.DOOR_CLOSED ? 3 : (t == T.RUBBLE || t == T.TOXIC) ? 2 : 1);
                    double ng = g + step;
                    if (_stamp[j] != gen || ng < _gScore[j])
                    {
                        _stamp[j] = gen; _gScore[j] = ng; _cameFrom[j] = i;
                        HeapPush(j, ng + H(nx, ny));
                    }
                }
            }
            return null;
        }

        public Vec2? RandomWalkable(Rng rng, double nearX, double nearY, int radiusTiles)
        {
            int cx = M.Floor(nearX / TILE), cy = M.Floor(nearY / TILE);
            for (int i = 0; i < 20; i++)
            {
                int tx = cx + rng.Int(-radiusTiles, radiusTiles), ty = cy + rng.Int(-radiusTiles, radiusTiles);
                if (_world.IsWalkable(tx, ty)) return new Vec2((tx + 0.5) * TILE, (ty + 0.5) * TILE);
            }
            return null;
        }
    }
}
