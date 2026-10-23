using System;
using System.Collections.Generic;
using System.Linq;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    public sealed class Bands { public List<int> x, y; public int band; }
    public sealed class Gate { public int tx, ty; public string dir; }
    public sealed class Pool { public int tx, ty, r; }

    public sealed class LayoutSpecial
    {
        public RectI plaza, parade, quad;
        public List<Gate> gates;
        public int fx0, fy0, fx1, fy1;
        public List<Pool> pools;
        public int railY;
    }

    public sealed class LayoutResult
    {
        public List<RectI> blocks, roads, yards;
        public RectI bossArena;
        public int margin;
        public Bands bands;
        public LayoutSpecial special = new LayoutSpecial();
    }

    /// <summary>The four map layouts (port of 08_world_layouts.js).</summary>
    public static class WorldLayouts
    {
        public static void Fill(World world, int x, int y, int w, int h, byte t)
        {
            for (int ty = y; ty < y + h; ty++) for (int tx = x; tx < x + w; tx++) world.Put(tx, ty, t);
        }

        private static (List<int> bands, List<int> sizes) BandsOf(Rng rng, int start, int end, int band, int bmin, int bmax)
        {
            int total = end - start;
            double avg = (bmin + bmax) / 2.0;
            int n = Math.Max(2, M.Floor((total - band) / (avg + band)));
            int avail = total - band * (n + 1);
            while (n > 2 && (double)avail / n < bmin) { n--; avail = total - band * (n + 1); }
            var sizes = new List<int>();
            int bas = M.Floor((double)avail / n);
            for (int i = 0; i < n; i++) sizes.Add(bas);
            int rest = avail - bas * n;
            for (int i = 0; rest > 0; i = (i + 1) % n, rest--) sizes[i]++;
            for (int i = 0; i + 1 < n; i++)
            {
                int d = rng.Int(-3, 3);
                if (sizes[i] + d >= bmin && sizes[i + 1] - d >= bmin && sizes[i] + d <= bmax + 4 && sizes[i + 1] - d <= bmax + 4)
                {
                    sizes[i] += d; sizes[i + 1] -= d;
                }
            }
            var bands = new List<int>();
            int cur = start;
            for (int i = 0; i < n; i++) { bands.Add(cur); cur += band + sizes[i]; }
            bands.Add(cur);
            return (bands, sizes);
        }

        private sealed class GridOpt
        {
            public int margin, roadW, blockMin, blockMax;
            public bool sidewalk;
            public byte roadTile, lineTile, blockTile = T.GROUND;
        }

        private static (List<RectI> roads, List<RectI> blocks, Bands bands) Grid(World world, Rng rng, GridOpt opt)
        {
            int W = world.w, H = world.h, m = opt.margin;
            int sw = opt.sidewalk ? 1 : 0;
            int band = opt.roadW + sw * 2;
            var bx = BandsOf(rng, m, W - m, band, opt.blockMin, opt.blockMax);
            var by = BandsOf(rng, m, H - m, band, opt.blockMin, opt.blockMax);
            var roads = new List<RectI>();
            var blocks = new List<RectI>();
            int lastX = bx.bands[bx.bands.Count - 1] + band, lastY = by.bands[by.bands.Count - 1] + band;
            for (int j = 0; j < by.sizes.Count; j++)
                for (int i = 0; i < bx.sizes.Count; i++)
                {
                    var b = new RectI(bx.bands[i] + band, by.bands[j] + band, bx.sizes[i], by.sizes[j]) { i = i, j = j };
                    blocks.Add(b);
                    Fill(world, b.tx, b.ty, b.w, b.h, opt.blockTile);
                }
            foreach (int x in bx.bands)
            {
                var r = new RectI(x + sw, m, opt.roadW, lastY - m) { dir = "v" };
                roads.Add(r);
                if (sw != 0) { Fill(world, x, m, 1, r.h, T.SIDEWALK); Fill(world, x + band - 1, m, 1, r.h, T.SIDEWALK); }
                Fill(world, r.tx, r.ty, r.w, r.h, opt.roadTile);
            }
            foreach (int y in by.bands)
            {
                var r = new RectI(m, y + sw, lastX - m, opt.roadW) { dir = "h" };
                roads.Add(r);
                if (sw != 0) { Fill(world, m, y, r.w, 1, T.SIDEWALK); Fill(world, m, y + band - 1, r.w, 1, T.SIDEWALK); }
                Fill(world, r.tx, r.ty, r.w, r.h, opt.roadTile);
            }
            foreach (int x in bx.bands) foreach (int y in by.bands) Fill(world, x, y, band, band, opt.roadTile);
            if (opt.lineTile != 0 && opt.roadW % 2 == 1)
            {
                int c = (opt.roadW - 1) / 2;
                foreach (var r in roads)
                {
                    if (r.dir == "v")
                    {
                        for (int y = r.ty; y < r.ty + r.h; y++)
                            if (y % 4 < 2 && !InBands(y, by.bands, band)) world.Put(r.tx + c, y, opt.lineTile);
                    }
                    else
                    {
                        for (int x = r.tx; x < r.tx + r.w; x++)
                            if (x % 4 < 2 && !InBands(x, bx.bands, band)) world.Put(x, r.ty + c, opt.lineTile);
                    }
                }
            }
            return (roads, blocks, new Bands { x = bx.bands, y = by.bands, band = band });
        }

        public static bool InBands(int v, List<int> bands, int band)
        {
            foreach (int b in bands) if (v >= b && v < b + band) return true;
            return false;
        }

        private static void Base(World world, byte ground, byte border)
        {
            Fill(world, 0, 0, world.w, world.h, T.VOID);
            Fill(world, 2, 2, world.w - 4, world.h - 4, border);
            Fill(world, 3, 3, world.w - 6, world.h - 6, ground);
        }

        public static void Blob(World world, Rng rng, int cx, int cy, int r, byte tile, byte[] onlyOn)
        {
            for (int y = cy - r - 1; y <= cy + r + 1; y++)
                for (int x = cx - r - 1; x <= cx + r + 1; x++)
                {
                    double d = M.Hypot(x - cx, y - cy) + rng.Float(-0.6, 0.6);
                    if (d <= r && (onlyOn == null || Array.IndexOf(onlyOn, (byte)world.Tile(x, y)) >= 0)) world.Put(x, y, tile);
                }
        }

        private static double CenterDist(RectI b, double cx, double cy) => M.Hypot(b.tx + b.w / 2.0 - cx, b.ty + b.h / 2.0 - cy);

        public static LayoutResult City(World world, Rng rng)
        {
            int margin = 8;
            Base(world, T.GRASS, T.FENCE);
            Fill(world, 3, 3, world.w - 6, world.h - 6, T.GROUND);
            var grid = Grid(world, rng, new GridOpt { margin = margin, roadW = 3, sidewalk = true, roadTile = T.ROAD, lineTile = T.ROAD_LINE, blockMin = 14, blockMax = 20, blockTile = T.GRASS });
            double cx = world.w / 2.0, cy = world.h / 2.0;
            double maxD = M.Hypot(cx, cy);
            int maxI = grid.blocks.Max(q => q.i), maxJ = grid.blocks.Max(q => q.j);
            var inner = grid.blocks.Where(b => b.i > 0 && b.j > 0 && b.i < maxI && b.j < maxJ).ToList();
            var plaza = rng.Pick(inner.Count > 0 ? inner : grid.blocks);
            var yards = new List<RectI>();
            foreach (var b in grid.blocks)
            {
                double d = CenterDist(b, cx, cy) / maxD;
                if (b == plaza)
                {
                    b.zone = "plaza";
                    Fill(world, b.tx, b.ty, b.w, b.h, T.SIDEWALK);
                    Fill(world, b.tx + 2, b.ty + 2, b.w - 4, b.h - 4, T.GRASS);
                    int mx = b.tx + (b.w >> 1), my = b.ty + (b.h >> 1);
                    Fill(world, mx - 1, b.ty, 2, b.h, T.SIDEWALK);
                    Fill(world, b.tx, my - 1, b.w, 2, T.SIDEWALK);
                    Fill(world, mx - 2, my - 2, 4, 4, T.SIDEWALK);
                    Fill(world, mx - 1, my - 1, 2, 2, T.WATER);
                    yards.Add(new RectI(b.tx, b.ty, b.w, b.h) { kind = "plaza" });
                }
                else
                {
                    b.zone = d < 0.36 ? "commercial" : "residential";
                    if (b.zone == "commercial") Fill(world, b.tx, b.ty, b.w, b.h, T.GROUND);
                }
            }
            var commercial = grid.blocks.Where(b => b.zone == "commercial").ToList();
            if (commercial.Count < 3)
            {
                var sorted = grid.blocks.Where(b => b.zone == "residential").OrderBy(a => M.Hypot(a.tx - cx, a.ty - cy)).ToList();
                for (int k = 0; k < 3 - commercial.Count && k < sorted.Count; k++)
                {
                    sorted[k].zone = "commercial";
                    Fill(world, sorted[k].tx, sorted[k].ty, sorted[k].w, sorted[k].h, T.GROUND);
                }
            }
            var onRoad = new[] { T.ROAD, T.ROAD_LINE, T.SIDEWALK };
            for (int k = 0; k < 18; k++)
            {
                var r = rng.Pick(grid.roads);
                int x = r.tx + rng.Int(0, Math.Max(0, r.w - 1)), y = r.ty + rng.Int(0, Math.Max(0, r.h - 1));
                Blob(world, rng, x, y, rng.Int(1, 2), T.RUBBLE, onRoad);
            }
            return new LayoutResult
            {
                blocks = grid.blocks.Where(b => b.zone != "plaza").ToList(), roads = grid.roads, yards = yards, margin = margin, bands = grid.bands,
                special = new LayoutSpecial { plaza = plaza },
            };
        }

        public static LayoutResult Compound(World world, Rng rng)
        {
            int margin = 9;
            Base(world, T.GROUND, T.FENCE);
            var grid = Grid(world, rng, new GridOpt { margin = margin, roadW = 4, sidewalk = false, roadTile = T.ROAD, blockMin = 16, blockMax = 22, blockTile = T.GRAVEL });
            int W = world.w, H = world.h;
            int f0 = margin - 2, f1x = W - margin + 1, f1y = H - margin + 1;
            for (int x = f0; x <= f1x; x++) { world.Put(x, f0, T.FENCE); world.Put(x, f1y, T.FENCE); }
            for (int y = f0; y <= f1y; y++) { world.Put(f0, y, T.FENCE); world.Put(f1x, y, T.FENCE); }
            var gates = new List<Gate>();
            int gx = grid.bands.x[grid.bands.x.Count / 2], gy = grid.bands.y[grid.bands.y.Count / 2];
            const int gateW = 4;
            for (int k = 0; k < gateW; k++)
            {
                world.Put(gx + k, f0, T.GRAVEL); world.Put(gx + k, f1y, T.GRAVEL);
                world.Put(f0, gy + k, T.GRAVEL); world.Put(f1x, gy + k, T.GRAVEL);
            }
            gates.Add(new Gate { tx = gx, ty = f0, dir = "n" }); gates.Add(new Gate { tx = gx, ty = f1y, dir = "s" });
            gates.Add(new Gate { tx = f0, ty = gy, dir = "w" }); gates.Add(new Gate { tx = f1x, ty = gy, dir = "e" });
            for (int k = 0; k < gateW; k++)
            {
                for (int y = 3; y < f0; y++) world.Put(gx + k, y, T.ROAD);
                for (int y = f1y + 1; y < H - 3; y++) world.Put(gx + k, y, T.ROAD);
                for (int x = 3; x < f0; x++) world.Put(x, gy + k, T.ROAD);
                for (int x = f1x + 1; x < W - 3; x++) world.Put(x, gy + k, T.ROAD);
            }
            double cx = W / 2.0, cy = H / 2.0;
            var parade = grid.blocks.OrderBy(b => CenterDist(b, cx, cy)).First();
            var yards = new List<RectI>();
            foreach (var b in grid.blocks) b.zone = b == parade ? "parade" : "military";
            Fill(world, parade.tx, parade.ty, parade.w, parade.h, T.GRAVEL);
            Fill(world, parade.tx + 2, parade.ty + 2, parade.w - 4, parade.h - 4, T.ROAD);
            yards.Add(new RectI(parade.tx, parade.ty, parade.w, parade.h) { kind = "parade" });
            foreach (var b in grid.blocks)
            {
                if (b == parade || !rng.Chance(0.3)) continue;
                int open = rng.Int(b.tx + 3, b.tx + b.w - 5);
                for (int x = b.tx; x < b.tx + b.w; x++)
                    if (x < open || x > open + 2) { world.Put(x, b.ty, T.FENCE); world.Put(x, b.ty + b.h - 1, T.FENCE); }
                b.fenced = true;
                b.ty += 1; b.h -= 2;
            }
            return new LayoutResult
            {
                blocks = grid.blocks.Where(b => b.zone != "parade").ToList(), roads = grid.roads, yards = yards, margin = margin, bands = grid.bands,
                special = new LayoutSpecial { gates = gates, parade = parade, fx0 = f0, fy0 = f0, fx1 = f1x, fy1 = f1y },
            };
        }

        public static LayoutResult Industrial(World world, Rng rng, MapDef map)
        {
            int margin = 9;
            Base(world, T.GRAVEL, T.FENCE);
            var grid = Grid(world, rng, new GridOpt { margin = margin, roadW = 4, sidewalk = false, roadTile = T.ROAD, blockMin = 22, blockMax = 30, blockTile = T.GRAVEL });
            int W = world.w, H = world.h;
            int railY = H - 6;
            Fill(world, 3, railY - 1, W - 6, 3, T.GRAVEL);
            world.rails.Add(new RectI(3, railY, W - 6, 1) { dir = "h" });
            var yards = new List<RectI>();
            var blocks = grid.blocks;
            foreach (var b in blocks) b.zone = "industrial";
            int yardCount = Math.Max(1, M.Round(blocks.Count / 8.0));
            var shuffled = rng.Shuffle(blocks.ToList());
            for (int k = 0; k < yardCount && k < shuffled.Count; k++)
            {
                var b = shuffled[k];
                b.zone = "yard";
                yards.Add(new RectI(b.tx, b.ty, b.w, b.h) { kind = "tankfarm" });
            }
            var pools = new List<Pool>();
            int nPools = map != null ? map.toxicZones : 4;
            for (int k = 0; k < nPools; k++)
            {
                var src = yards.Count > 0 && k < yards.Count * 2 ? yards[k % yards.Count] : rng.Pick(blocks);
                int r = rng.Int(2, 4);
                int x = src.tx + rng.Int(r + 1, Math.Max(r + 1, src.w - r - 2)), y = src.ty + rng.Int(r + 1, Math.Max(r + 1, src.h - r - 2));
                pools.Add(new Pool { tx = x, ty = y, r = r });
            }
            var gravel = new[] { T.GRAVEL };
            for (int k = 0; k < 24; k++)
            {
                var b = rng.Pick(blocks);
                Blob(world, rng, b.tx + rng.Int(0, b.w - 1), b.ty + rng.Int(0, b.h - 1), rng.Int(1, 2), T.RUBBLE, gravel);
            }
            return new LayoutResult
            {
                blocks = blocks.Where(b => b.zone != "yard").ToList(), roads = grid.roads, yards = yards, margin = margin, bands = grid.bands,
                special = new LayoutSpecial { pools = pools, railY = railY },
            };
        }

        public static LayoutResult Campus(World world, Rng rng)
        {
            int margin = 9;
            Base(world, T.GRASS, T.WALL);
            var grid = Grid(world, rng, new GridOpt { margin = margin, roadW = 2, sidewalk = true, roadTile = T.ROAD, blockMin = 19, blockMax = 25, blockTile = T.GRASS });
            var blocks = grid.blocks;
            int nx = blocks.Max(b => b.i) + 1, ny = blocks.Max(b => b.j) + 1;
            double cx = world.w / 2.0, cy = world.h / 2.0;
            var quad = blocks.OrderBy(b => CenterDist(b, cx, cy)).First();
            quad.zone = "quad";
            var yards = new List<RectI> { new RectI(quad.tx, quad.ty, quad.w, quad.h) { kind = "quad" } };
            int mx = quad.tx + (quad.w >> 1), my = quad.ty + (quad.h >> 1);
            Fill(world, mx - 1, quad.ty, 2, quad.h, T.SIDEWALK);
            Fill(world, quad.tx, my - 1, quad.w, 2, T.SIDEWALK);
            for (double a = 0; a < Math.PI * 2; a += 0.05) world.Put(M.Round(mx + Math.Cos(a) * 5), M.Round(my + Math.Sin(a) * 5), T.SIDEWALK);
            var corners = new[] { (nx - 2, ny - 1), (0, ny - 1), (nx - 2, 0), (0, 0) };
            var corner = rng.Pick(corners);
            var ca = blocks.FirstOrDefault(b => b.i == corner.Item1 && b.j == corner.Item2);
            var cb = blocks.FirstOrDefault(b => b.i == corner.Item1 + 1 && b.j == corner.Item2);
            RectI bossArena = null;
            if (ca != null && cb != null && ca != quad && cb != quad)
            {
                bossArena = new RectI(ca.tx, ca.ty, cb.tx + cb.w - ca.tx, Math.Min(ca.h, cb.h));
                ca.zone = "arena"; cb.zone = "arena";
                Fill(world, bossArena.tx, bossArena.ty, bossArena.w, bossArena.h, T.GRAVEL);
            }
            foreach (var b in blocks) if (b.zone == null) b.zone = "lab";
            var onRoad = new[] { T.ROAD, T.SIDEWALK };
            for (int k = 0; k < 10; k++)
            {
                var r = rng.Pick(grid.roads);
                Blob(world, rng, r.tx + rng.Int(0, r.w - 1), r.ty + rng.Int(0, r.h - 1), 1, T.RUBBLE, onRoad);
            }
            return new LayoutResult
            {
                blocks = blocks.Where(b => b.zone == "lab").ToList(), roads = grid.roads, yards = yards, bossArena = bossArena, margin = margin,
                bands = grid.bands, special = new LayoutSpecial { quad = quad },
            };
        }
    }
}
