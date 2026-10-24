using System.Linq;
using DeadZone.Core;
using DeadZone.Core.Data;
using UnityEngine;

namespace DeadZone.Game
{
    public sealed partial class UiRoot
    {
        private Texture2D _mapTex;
        private World _mapWorld;
        private int _mapVersion = -1;
        private float _fps, _fpsT;

        private void EnsureMapTexture(World w)
        {
            if (_mapWorld == w && _mapTex != null && (w.version == _mapVersion || Time.frameCount % 60 != 0)) return;
            if (_mapTex == null || _mapTex.width != w.w || _mapTex.height != w.h)
            {
                if (_mapTex != null) Destroy(_mapTex);
                _mapTex = new Texture2D(w.w, w.h, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            }
            _mapWorld = w;
            _mapVersion = w.version;
            var pal = w.map?.palette;
            Color ground = Mats.Shade(Mats.Hex(pal?.ground, new Color(0.3f, 0.3f, 0.28f)), 1.1f), road = Mats.Hex(pal?.road, new Color(0.18f, 0.18f, 0.2f));
            Color grass = Mats.Hex(pal?.grass, new Color(0.18f, 0.28f, 0.16f)), floor = Mats.Shade(Mats.Hex(pal?.floor, new Color(0.3f, 0.28f, 0.26f)), 1.3f);
            var px = new Color32[w.w * w.h];
            for (int ty = 0; ty < w.h; ty++)
                for (int tx = 0; tx < w.w; tx++)
                {
                    int t = w.Tile(tx, ty);
                    Color c;
                    switch (t)
                    {
                        case T.ROAD: case T.ROAD_LINE: c = road; break;
                        case T.SIDEWALK: c = Color.Lerp(road, Color.grey, 0.4f); break;
                        case T.GRASS: c = grass; break;
                        case T.FLOOR: c = floor; break;
                        case T.WALL: c = new Color(0.78f, 0.76f, 0.72f); break;
                        case T.WINDOW: c = new Color(0.45f, 0.6f, 0.7f); break;
                        case T.DOOR_CLOSED: c = new Color(0.65f, 0.45f, 0.25f); break;
                        case T.DOOR_OPEN: c = new Color(0.4f, 0.3f, 0.2f); break;
                        case T.DOOR_LOCKED: c = new Color(0.85f, 0.2f, 0.15f); break;
                        case T.WATER: c = new Color(0.12f, 0.25f, 0.4f); break;
                        case T.TOXIC: c = new Color(0.35f, 0.85f, 0.2f); break;
                        case T.FENCE: c = new Color(0.55f, 0.55f, 0.58f); break;
                        case T.VOID: c = Color.black; break;
                        case T.PROP_SOLID: case T.PROP_LOW: case T.BARRICADE: c = new Color(0.32f, 0.32f, 0.3f); break;
                        case T.GRAVEL: c = Color.Lerp(ground, Color.grey, 0.4f); break;
                        case T.RUBBLE: c = Mats.Shade(ground, 0.75f); break;
                        default: c = ground; break;
                    }
                    px[(w.h - 1 - ty) * w.w + tx] = c;
                }
            _mapTex.SetPixels32(px);
            _mapTex.Apply();
        }

        private Vector2 MapPoint(Rect r, double x, double y, World w) => new Vector2(r.x + (float)(x / w.PixelW) * r.width, r.y + (float)(y / w.PixelH) * r.height);

        private void DrawMapContent(Rect r, World w, Raid raid, bool full)
        {
            EnsureMapTexture(w);
            GUI.DrawTexture(r, _mapTex, ScaleMode.StretchToFill);
            foreach (var e in raid.extraction.points)
            {
                if (e.state == "done") continue;
                var p = MapPoint(r, e.x, e.y, w);
                Color c = e.active ? UiColors.Good : UiColors.Warn;
                float s = full ? 14 : 9;
                Fill(new Rect(p.x - s / 2, p.y - s / 2, s, s), c);
                if (full) Text(new Rect(p.x + 10, p.y - 12, 360, 24), e.name + (e.active ? "" : " – " + e.lockReason), 14, c, TextAnchor.MiddleLeft, true);
            }
            foreach (var poi in w.pois)
            {
                if (!PoiRelevant(raid, poi)) continue;
                var p = MapPoint(r, poi.x, poi.y, w);
                Fill(new Rect(p.x - 5, p.y - 5, 10, 10), new Color(1f, 0.85f, 0.2f));
                if (full) Text(new Rect(p.x + 8, p.y - 10, 260, 20), MissionSystem.PoiName(poi.type), 13, new Color(1f, 0.85f, 0.2f));
            }
            foreach (var m in raid.noiseMarkers)
            {
                var p = MapPoint(r, m.x, m.y, w);
                Fill(new Rect(p.x - 3, p.y - 3, 6, 6), new Color(1, 0.4f, 0.3f, Mathf.Clamp01((float)m.ttl)));
            }
            var pl = raid.player;
            var pp = MapPoint(r, pl.x, pl.y, w);
            float ang = game.FirstPerson && game.state == "raid" ? (float)game.input.yaw : (float)pl.angle;
            var tip = pp + new Vector2(Mathf.Cos(ang), Mathf.Sin(ang)) * (full ? 14f : 9f);
            Fill(new Rect(tip.x - 2.5f, tip.y - 2.5f, 5, 5), Color.white);
            Fill(new Rect(pp.x - 4, pp.y - 4, 8, 8), UiColors.Info);
            Frame(r, UiColors.Line, 2);
        }

        /// <summary>A point of interest that belongs to an open objective (shown on the maps and the compass).</summary>
        private static bool PoiRelevant(Raid raid, Poi poi) =>
            !poi.used && (raid.missionStates.Any(st => st.All.Any(o => !o.done && ((o.def.type == "investigate" && o.def.target == poi.type) || (o.def.type == "generator" && poi.type == "generator"))))
                || (poi.type == "generator" && !raid.generatorOn && raid.extraction.points.Any(e => e.kind == "power")));

        private static readonly string[] CompassNames = { "N", "NO", "O", "SO", "S", "SW", "W", "NW" };

        /// <summary>Compass strip at the top: 180° around the view direction, extraction points and objectives with distance.</summary>
        private void DrawCompass(Raid raid, Player p)
        {
            // fits between the time panel (left) and the minimap (right) down to 4:3
            float half = Mathf.Clamp(W / 2 - 520f, 140f, 300f);
            const float span = 90f;
            var r = new Rect(W / 2 - half, 12, half * 2, 38);
            Fill(r, new Color(0.02f, 0.03f, 0.035f, 0.62f));
            float heading = (float)ViewMath.HeadingDeg(game.input.yaw);
            float cx = r.x + half;
            float baseA = Mathf.Round(heading / 15f) * 15f;
            for (int k = -7; k <= 7; k++)
            {
                float a = baseA + k * 15f;
                float rel = Mathf.DeltaAngle(heading, a);
                if (Mathf.Abs(rel) > span) continue;
                float x = cx + rel / span * half;
                int deg = ((Mathf.RoundToInt(a) % 360) + 360) % 360;
                if (deg % 45 == 0)
                {
                    bool main = deg % 90 == 0;
                    Text(new Rect(x - 30, r.y + 2, 60, 22), CompassNames[deg / 45], main ? 17 : 13, main ? UiColors.Text : UiColors.Muted, TextAnchor.MiddleCenter, main);
                }
                else Fill(new Rect(x - 1, r.y + 8, 2, 8), new Color(1, 1, 1, 0.35f));
            }
            Fill(new Rect(cx - 1, r.yMax - 12, 2, 12), UiColors.Accent);
            void Marker(double mx, double my, Color col, string label)
            {
                float bearing = Coords.YawDeg(M.AngleTo(p.x, p.y, mx, my));
                float rel = Mathf.DeltaAngle(heading, bearing);
                bool edge = Mathf.Abs(rel) > span;
                float x = cx + Mathf.Clamp(rel, -span, span) / span * half;
                var c = edge ? new Color(col.r, col.g, col.b, 0.45f) : col;
                Fill(new Rect(x - 5, r.yMax - 14, 10, 10), c);
                if (!edge) Text(new Rect(x - 40, r.yMax + 2, 80, 18), label, 13, c, TextAnchor.MiddleCenter, true);
            }
            foreach (var e in raid.extraction.points)
            {
                if (e.state == "done") continue;
                Marker(e.x, e.y, e.active ? UiColors.Good : UiColors.Warn, M.Round(M.Dist(p.x, p.y, e.x, e.y) * Coords.S) + " m");
            }
            foreach (var poi in raid.world.pois)
                if (PoiRelevant(raid, poi)) Marker(poi.x, poi.y, new Color(1f, 0.85f, 0.2f), M.Round(M.Dist(p.x, p.y, poi.x, poi.y) * Coords.S) + " m");
        }

        private void DrawRaid()
        {
            var raid = game.Raid;
            if (raid == null) return;
            var p = raid.player;
            DrawWorldOverlays(raid);
            DrawHud(raid, p);
            DrawHitDirs(raid, p);
            if (inventoryOpen) DrawRaidInventory(raid, p, null);
            if (lootContainer != null) DrawRaidInventory(raid, p, lootContainer);
            if (mapOpen) DrawFullMap(raid);
            bool fp = game.FirstPerson;
            if (fp && !p.dead && game.AimAmount > 0.92f && RaidView.HeldClass(p) == "sniper" && !BlocksGameplay) DrawScope();
            if (game.paused) DrawPause();
            if (!BlocksGameplay && !game.paused && !p.dead && (fp || !game.input.usingGamepad)) DrawCrosshair(raid, p, fp);
        }

        private void DrawWorldOverlays(Raid raid)
        {
            var cam = game.rig.cam;
            foreach (var f in _floating)
            {
                var sp = cam.WorldToScreenPoint(f.pos);
                if (sp.z < 0) continue;
                var gp = new Vector2(sp.x / _scale, (Screen.height - sp.y) / _scale);
                float a = Mathf.Clamp01(f.life / 0.4f);
                int size = f.big ? 22 : 17;
                Text(new Rect(gp.x - 100 + 1, gp.y - 14 + 1, 200, 28), f.text, size, new Color(0, 0, 0, a * 0.8f), TextAnchor.MiddleCenter, true);
                Text(new Rect(gp.x - 100, gp.y - 14, 200, 28), f.text, size, new Color(f.color.r, f.color.g, f.color.b, a), TextAnchor.MiddleCenter, true);
            }
            if (_damageFlash > 0)
            {
                float a = Mathf.Clamp01(_damageFlash) * 0.45f;
                Fill(new Rect(0, 0, W, 60), new Color(0.7f, 0, 0, a)); Fill(new Rect(0, H - 60, W, 60), new Color(0.7f, 0, 0, a));
                Fill(new Rect(0, 0, 60, H), new Color(0.7f, 0, 0, a)); Fill(new Rect(W - 60, 0, 60, H), new Color(0.7f, 0, 0, a));
            }
            var pl = raid.player;
            if (pl.hp < pl.hpMax * 0.3f && !pl.dead)
            {
                float a = (0.3f - (float)(pl.hp / pl.hpMax)) * 1.2f * (0.6f + 0.4f * Mathf.Sin(Time.time * 4f));
                Fill(new Rect(0, 0, W, 40), new Color(0.5f, 0, 0, a)); Fill(new Rect(0, H - 40, W, 40), new Color(0.5f, 0, 0, a));
            }
            if (_flashBang > 0) Fill(new Rect(0, 0, W, H), new Color(1, 1, 1, Mathf.Clamp01(_flashBang)));
        }

        /// <summary>Hit markers and threat arrows, drawn above the HUD panels so the prompt and bars never hide them.</summary>
        private void DrawHitDirs(Raid raid, Player pl)
        {
            bool fp = game.FirstPerson;
            foreach (var (angle, life) in _hitDirs)
            {
                var c = new Vector2(W / 2, H / 2);
                Vector2 d;
                if (fp)
                {
                    // relative to the view: ahead = screen up, to the right (clockwise) = screen right
                    var sd = ViewMath.ScreenDirection(ViewMath.Relative(game.input.yaw, angle));
                    d = new Vector2((float)sd.x, (float)sd.y);
                }
                else d = new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)); // sim angle 0 = right, y down = screen down
                var pos = c + d * (fp ? 190 : 160);
                Fill(new Rect(pos.x - 14, pos.y - 14, 28, 28), new Color(0.9f, 0.15f, 0.1f, Mathf.Clamp01(life) * 0.8f));
            }
            if (fp && !pl.dead) DrawThreats(raid, pl);
        }

        private readonly System.Collections.Generic.List<(double d, Zombie z)> _threats = new System.Collections.Generic.List<(double, Zombie)>();

        /// <summary>
        /// First person sees only what is ahead: zombies that hunt the player from the side or behind get an orange
        /// arrow at the screen edge (nearest four, closer = stronger).
        /// </summary>
        private void DrawThreats(Raid raid, Player pl)
        {
            _threats.Clear();
            foreach (var z in raid.zombies.zombies)
            {
                if (z.dead || (z.state != "chase" && z.state != "attack")) continue;
                if (z.type.lurk && z.visibleAlpha < 0.5) continue;
                double d = M.Dist(pl.x, pl.y, z.x, z.y);
                if (d > 260) continue;
                if (System.Math.Abs(ViewMath.Relative(game.input.yaw, M.AngleTo(pl.x, pl.y, z.x, z.y))) < 0.85) continue;
                _threats.Add((d, z));
            }
            _threats.Sort((a, b) => a.d.CompareTo(b.d));
            var c = new Vector2(W / 2, H / 2);
            for (int i = 0; i < _threats.Count && i < 4; i++)
            {
                var (d, z) = _threats[i];
                var sd = ViewMath.ScreenDirection(ViewMath.Relative(game.input.yaw, M.AngleTo(pl.x, pl.y, z.x, z.y)));
                var dir = new Vector2((float)sd.x, (float)sd.y);
                var pos = c + dir * 250f;
                float a = Mathf.Lerp(0.95f, 0.3f, (float)(d / 260));
                var col = new Color(1f, 0.55f, 0.1f, a);
                // a chevron: three squares pointing outwards
                for (int k = 0; k < 3; k++)
                {
                    var side = new Vector2(-dir.y, dir.x) * (k - 1) * 9f;
                    var q = pos + side - dir * Mathf.Abs(k - 1) * 8f;
                    Fill(new Rect(q.x - 5, q.y - 5, 10, 10), col);
                }
            }
        }

        private Texture2D _scopeTex;

        /// <summary>Black screen with a round see-through lens (sniper zoom).</summary>
        private void DrawScope()
        {
            if (_scopeTex == null)
            {
                const int n = 256;
                _scopeTex = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
                var px = new Color32[n * n];
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        float r = Mathf.Sqrt((x - n / 2f + 0.5f) * (x - n / 2f + 0.5f) + (y - n / 2f + 0.5f) * (y - n / 2f + 0.5f)) / (n / 2f);
                        byte a = (byte)(Mathf.Clamp01((r - 0.94f) / 0.05f) * 255);
                        px[y * n + x] = new Color32(0, 0, 0, a);
                    }
                _scopeTex.SetPixels32(px);
                _scopeTex.Apply();
            }
            if (Event.current.type != EventType.Repaint) return;
            float s = H;
            var r0 = new Rect(W / 2 - s / 2, 0, s, s);
            GUI.DrawTexture(r0, _scopeTex);
            Fill(new Rect(0, 0, r0.x, H), Color.black);
            Fill(new Rect(r0.xMax, 0, W - r0.xMax, H), Color.black);
            // thin cross hairs of the scope
            var line = new Color(0, 0, 0, 0.85f);
            Fill(new Rect(r0.x, H / 2 - 1, s, 2), line);
            Fill(new Rect(W / 2 - 1, 0, 2, H), line);
        }

        private void DrawCrosshair(Raid raid, Player p, bool fp)
        {
            // first person: always the screen centre (the cursor is captured)
            var m = fp ? new Vector2(W / 2, H / 2) : Event.current.mousePosition;
            var c = _hitMarker > 0 ? UiColors.Bad : Color.white;
            float spread = (fp ? 6f : 10f) + (float)p.SpreadMul() * 6f;
            if (fp)
            {
                // the gap is the real cone a shot can leave in (stance, bloom, zoom), projected with the current field of view
                double cone = WeaponSystem.CurrentSpread(p.WeaponInst, p);
                float tanHalfFov = Mathf.Tan(game.rig.cam.fieldOfView * 0.5f * Mathf.Deg2Rad);
                spread = cone > 0 ? Mathf.Clamp(Mathf.Tan(Mathf.Min((float)cone, 1.4f)) / tanHalfFov * (H / 2f), 3f, H * 0.22f) : 6f;
                // fully zoomed with the sniper rifle: only the centre dot
                if (game.AimAmount > 0.9f && RaidView.HeldClass(p) == "sniper")
                {
                    Fill(new Rect(m.x - 2, m.y - 2, 4, 4), new Color(0, 0, 0, 0.6f));
                    Fill(new Rect(m.x - 1, m.y - 1, 2, 2), c);
                    return;
                }
            }
            // a dark outline keeps the white cross readable on bright walls
            if (fp) Fill(new Rect(m.x - 2, m.y - 2, 4, 4), new Color(0, 0, 0, 0.5f));
            Fill(new Rect(m.x - 1, m.y - spread - 8, 2, 8), c);
            Fill(new Rect(m.x - 1, m.y + spread, 2, 8), c);
            Fill(new Rect(m.x - spread - 8, m.y - 1, 8, 2), c);
            Fill(new Rect(m.x + spread, m.y - 1, 8, 2), c);
            Fill(new Rect(m.x - 1, m.y - 1, 2, 2), c);
            if (_hitMarker > 0) Text(new Rect(m.x - 20, m.y - 20, 40, 40), "✕", 24, UiColors.Bad, TextAnchor.MiddleCenter, true);
        }

        private void DrawHud(Raid raid, Player p)
        {
            // vitals (bottom left)
            var v = new Rect(20, H - 170, 420, 150);
            Fill(v, new Color(0.02f, 0.03f, 0.035f, 0.72f));
            Bar(new Rect(v.x + 14, v.y + 14, 392, 26), (float)p.hp, (float)p.EffectiveHpMax(), UiColors.Hp, "Lebenspunkte " + M.Round(p.hp) + " / " + M.Round(p.EffectiveHpMax()), 15);
            Bar(new Rect(v.x + 14, v.y + 46, 392, 14), (float)p.stamina, (float)p.staminaMax, UiColors.Stamina, null);
            Bar(new Rect(v.x + 14, v.y + 66, 192, 14), (float)p.hunger, 100, UiColors.Food, null);
            Bar(new Rect(v.x + 214, v.y + 66, 192, 14), (float)p.thirst, 100, UiColors.Water, null);
            Text(new Rect(v.x + 14, v.y + 82, 192, 18), "Hunger", 12, UiColors.Muted); Text(new Rect(v.x + 214, v.y + 82, 192, 18), "Durst", 12, UiColors.Muted);
            string status = "";
            if (p.bleeding) status += "<color=#ff6b6b>Blutung</color>  ";
            if (p.toxic > 0) status += "<color=#8dff6b>Vergiftet</color>  ";
            if (p.crouching) status += "Geduckt  ";
            if (p.Overweight()) status += "<color=#ffb347>Überladen</color>  ";
            foreach (var e in p.effects) status += "<color=#9fd0ff>" + e.label + " " + M.Round(e.timer) + "s</color>  ";
            Text(new Rect(v.x + 14, v.y + 104, 392, 22), status, 15);
            Text(new Rect(v.x + 14, v.y + 124, 392, 20), "Gewicht " + M.FormatWeight(p.TotalWeight()) + " / " + M.FormatWeight(p.CarryLimit()), 13, UiColors.Muted);

            // weapon (bottom right)
            var wr = new Rect(W - 440, H - 170, 420, 150);
            Fill(wr, new Color(0.02f, 0.03f, 0.035f, 0.72f));
            var inst = p.WeaponInst;
            string wname = p.activeSlot == 3 ? (p.equipment.grenade != null ? Items.Def(p.equipment.grenade).name + " ×" + p.equipment.grenade.count : "Keine Granate")
                : p.activeSlot == 4 ? "Medizin" : inst != null ? Items.Def(inst).name : "Unbewaffnet";
            Text(new Rect(wr.x + 16, wr.y + 10, 390, 28), wname, 20, UiColors.Text, TextAnchor.MiddleLeft, true);
            if (inst != null && p.activeSlot <= 2)
            {
                var rt = inst.rt;
                string ammo = raid.weapons.ReserveText(inst, p.inventory);
                Text(new Rect(wr.x + 16, wr.y + 40, 390, 46), ammo, 38, UiColors.Accent, TextAnchor.MiddleLeft, true);
                var ad = Items.Def(inst.ammoId);
                if (ad != null) Text(new Rect(wr.x + 16, wr.y + 86, 390, 20), ad.name, 14, UiColors.Muted);
                if (rt != null && rt.reloading) Text(new Rect(wr.x + 200, wr.y + 40, 200, 46), "Lädt nach …", 20, UiColors.Warn, TextAnchor.MiddleRight, true);
            }
            string[] slotNames = { "1 Primär", "2 Sekundär", "3 Nahkampf", "4 Granate", "5 Medizin" };
            for (int i = 0; i < 5; i++)
            {
                var r = new Rect(wr.x + 14 + i * 80, wr.y + 112, 76, 28);
                bool has = i <= 2 ? p.WeaponSlots()[i] != null : i == 3 ? p.equipment.grenade != null : p.BestMedical() != null;
                Fill(r, i == p.activeSlot ? new Color(0.5f, 0.38f, 0.16f, 0.95f) : new Color(0.08f, 0.1f, 0.11f, 0.9f));
                Text(r, slotNames[i], 12, has ? UiColors.Text : UiColors.Muted, TextAnchor.MiddleCenter, i == p.activeSlot);
            }

            // top left: time, objectives
            var tl = new Rect(20, 20, 470, 52);
            Fill(tl, new Color(0.02f, 0.03f, 0.035f, 0.72f));
            double left = raid.timeLimit - raid.time;
            Text(new Rect(tl.x + 14, tl.y, 200, 52), M.FormatTime(left), 30, left < 120 ? UiColors.Bad : UiColors.Text, TextAnchor.MiddleLeft, true);
            Text(new Rect(tl.x + 150, tl.y, 300, 52), raid.map.@short + " · " + Raid.FormatHour(raid.hour) + " Uhr" + (raid.darkness > 0.5 ? " · Nacht" : ""), 17, UiColors.Muted, TextAnchor.MiddleLeft);
            float oy = 82;
            var lines = game.core.missions.HudLines(raid);
            if (lines.Count > 0)
            {
                // long objectives wrap instead of losing their progress count at the end
                var txts = new string[lines.Count];
                var hs = new float[lines.Count];
                float h = 16;
                for (int i = 0; i < lines.Count; i++)
                {
                    var l = lines[i];
                    txts[i] = (l.done ? "✔ " : l.optional ? "○ " : "● ") + l.text;
                    hs[i] = Mathf.Max(24, TextHeight(txts[i], 450, 15) + 4);
                    h += hs[i];
                }
                Fill(new Rect(20, oy, 470, h), new Color(0.02f, 0.03f, 0.035f, 0.6f));
                float y = oy + 8;
                for (int i = 0; i < lines.Count; i++)
                {
                    var l = lines[i];
                    Text(new Rect(34, y, 450, hs[i]), txts[i], 15, l.done ? UiColors.Good : l.optional ? UiColors.Muted : UiColors.Text, TextAnchor.UpperLeft, false, true);
                    y += hs[i];
                }
                oy += h + 8;
            }
            string ext = raid.extraction.HudText();
            if (!string.IsNullOrEmpty(ext))
            {
                Fill(new Rect(20, oy, 470, 34), new Color(0.02f, 0.06f, 0.035f, 0.7f));
                Text(new Rect(34, oy, 450, 34), ext, 16, UiColors.Good, TextAnchor.MiddleLeft, true);
                oy += 42;
            }
            var cur = raid.extraction.Current;
            if (cur != null)
            {
                var br = new Rect(W / 2 - 260, H * 0.22f, 520, 34);
                // leaving the zone cancels: warn when the player is close to its edge (the ring is out of view in first person)
                bool edge = cur.radius - M.Dist(p.x, p.y, cur.x, cur.y) < 16;
                Bar(br, (float)cur.progress, (float)cur.duration, edge ? UiColors.Bad : UiColors.Good, "Extraktion " + Mathf.CeilToInt((float)(cur.duration - cur.progress)) + " s – " + (edge ? "RAND DER ZONE!" : "in der Zone bleiben!"), 16);
            }

            // minimap (top right)
            if (game.core.settings.minimap)
            {
                var w = raid.world;
                float size = 260;
                var mr = new Rect(W - size - 20, 20, size, size);
                Fill(new Rect(mr.x - 4, mr.y - 4, size + 8, size + 8), new Color(0, 0, 0, 0.6f));
                // zoomed view around the player: draw the full texture larger and clip
                float zoom = 3.2f;
                float full = size * zoom;
                var pp = new Vector2((float)(p.x / w.PixelW) * full, (float)(p.y / w.PixelH) * full);
                GUI.BeginGroup(mr);
                var big = new Rect(size / 2 - pp.x, size / 2 - pp.y, full, full * w.h / (float)w.w);
                DrawMapContent(big, w, raid, false);
                GUI.EndGroup();
                Frame(mr, UiColors.Line, 2);
                Text(new Rect(mr.x, mr.yMax + 2, size, 20), "M – Karte", 12, UiColors.Muted, TextAnchor.MiddleRight);
            }

            // first person: compass strip with the directions of open extractions and objectives
            if (game.FirstPerson) DrawCompass(raid, p);

            // interact prompt / hold bar
            var it = p.interactTarget;
            if (it != null && !BlocksGameplay)
            {
                var pr = game.FirstPerson ? new Rect(W / 2 - 320, H / 2 + 70, 640, 40) : new Rect(W / 2 - 320, H - 250, 640, 40);
                Fill(pr, new Color(0.02f, 0.03f, 0.035f, 0.8f));
                string prompt = game.input.usingGamepad && it.prompt.StartsWith("E ") ? "A" + it.prompt.Substring(1) : it.prompt;
                Text(pr, prompt, 19, UiColors.Text, TextAnchor.MiddleCenter, true);
            }
            var hb = game.FirstPerson ? new Rect(W / 2 - 220, H / 2 + 118, 440, 26) : new Rect(W / 2 - 220, H - 200, 440, 28);
            if (p.holdProgress > 0 && p.holdLabel != null)
                Bar(hb, (float)p.holdProgress, 1f, UiColors.Accent, p.holdLabel, 14);
            if (p.usingItem != null)
                Bar(hb, (float)(1 - p.usingItem.timer / p.usingItem.total), 1f, UiColors.Info, p.usingItem.name + " …", 14);

            // boss bar
            var boss = raid.zombies.boss;
            if (boss != null && !boss.dead && M.Dist(boss.x, boss.y, p.x, p.y) < 900)
            {
                // narrower on 4:3 so it stays clear of the objectives panel on the left
                float bw = Mathf.Clamp(W - 1040f, 240f, 720f);
                var br = new Rect(W / 2 - bw / 2, game.FirstPerson ? 96 : 28, bw, 30);
                Text(new Rect(br.x, br.y - 26, br.width, 24), boss.type.name + (boss.phase > 0 ? " – Phase " + (boss.phase + 1) : ""), 18, UiColors.Bad, TextAnchor.MiddleCenter, true);
                Bar(br, (float)boss.hp, (float)boss.hpMax, new Color(0.7f, 0.12f, 0.15f), M.Round(boss.hp) + " / " + M.Round(boss.hpMax), 14);
            }
            if (game.core.settings.showFps)
            {
                _fpsT += Time.unscaledDeltaTime;
                if (_fpsT > 0.5f) { _fps = 1f / Mathf.Max(0.0001f, Time.unscaledDeltaTime); _fpsT = 0; }
                Text(new Rect(W - 300, H - 200, 280, 24), Mathf.RoundToInt(_fps) + " FPS · " + raid.zombies.AliveCount() + " Infizierte", 14, UiColors.Muted, TextAnchor.MiddleRight);
            }
        }

        private void DrawRaidInventory(Raid raid, Player p, Container c)
        {
            Fill(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.55f));
            float pw = Mathf.Min(1640, W - 40);
            var r = new Rect(W / 2 - pw / 2, 70, pw, H - 140);
            Panel(r, UiColors.Bg);
            Text(new Rect(r.x + 20, r.y + 10, 800, 36), c != null ? Raid.ContainerName(c.type) : "Inventar", 26, UiColors.Accent, TextAnchor.MiddleLeft, true);
            Text(new Rect(r.x + 20, r.y + 10, r.width - 40, 36), "Tab/Esc schließen · Spiel läuft weiter!", 15, UiColors.Warn, TextAnchor.MiddleRight);
            float colW = c != null ? Mathf.Min(520, pw * 0.34f) : 0;
            if (c != null)
            {
                var cr = new Rect(r.x + 16, r.y + 56, colW, r.height - 200);
                Panel(cr);
                Text(new Rect(cr.x + 12, cr.y + 6, cr.width - 24, 28), "Inhalt", 18, UiColors.Accent, TextAnchor.MiddleLeft, true);
                if (Btn(new Rect(cr.xMax - 170, cr.y + 4, 160, 32), "Alles nehmen", c.items != null && c.items.Any(i => i != null), 14, UiColors.Good)) { raid.TakeAll(c); _selected = null; }
                int count = c.items?.Count ?? 0;
                if (count == 0) Text(new Rect(cr.x + 12, cr.y + 50, cr.width - 24, 30), "Leer.", 16, UiColors.Muted);
                int ccols = Mathf.Max(2, (int)((cr.width - 24) / 82));
                float cc = Mathf.Min(82, (cr.width - 24) / ccols);
                for (int i = 0; i < Mathf.Max(12, count); i++)
                {
                    var sr = new Rect(cr.x + 12 + (i % ccols) * cc, cr.y + 44 + (i / ccols) * cc, cc - 6, cc - 6);
                    if (sr.yMax > cr.yMax) break;
                    if (i < count) DrawSlot(sr, new SlotRef { kind = "container", index = i });
                    else { Fill(sr, new Color(0.05f, 0.06f, 0.07f, 1f)); Frame(sr, new Color(0.15f, 0.17f, 0.19f)); if (Event.current.type == EventType.Repaint) _dropTargets.Add((new SlotRef { kind = "container", index = i }, sr)); }
                }
            }
            float x0 = r.x + 16 + (c != null ? colW + 12 : 0);
            float rw = r.xMax - 16 - x0;
            DrawGrid(new Rect(x0, r.y + 56, rw * 0.58f, r.height - 200), "Rucksack", "pinv", p.inventory, 74, p.inventory.All().Count + "/" + p.inventory.slots);
            var er = new Rect(x0 + rw * 0.58f + 10, r.y + 56, rw * 0.42f - 10, 0);
            er.height = EquipmentHeight(er.width);
            DrawEquipment(er, "pequip", p.equipment);
            DrawGrid(new Rect(er.x, er.yMax + 10, er.width, 130), "Sicherer Behälter", "psecure", p.secure, 70);
            DrawSelectionActions(new Rect(r.x + 16, r.yMax - 134, r.width - 32, 118));
        }

        private void DrawFullMap(Raid raid)
        {
            Fill(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.7f));
            var w = raid.world;
            float size = Mathf.Min(H - 160, W - 500);
            var r = new Rect(W / 2 - size / 2 - 120, 80, size, size * w.h / (float)w.w);
            DrawMapContent(r, w, raid, true);
            Text(new Rect(r.x, r.y - 50, size, 40), raid.map.name, 28, UiColors.Accent, TextAnchor.MiddleLeft, true);
            var legend = new Rect(r.xMax + 30, r.y, 300, 300);
            Panel(legend, UiColors.Bg);
            float y = legend.y + 14;
            void L(Color c, string t) { Fill(new Rect(legend.x + 16, y + 6, 14, 14), c); Text(new Rect(legend.x + 40, y, 250, 26), t, 15); y += 30; }
            L(UiColors.Info, "Du");
            L(UiColors.Good, "Extraktion offen");
            L(UiColors.Warn, "Extraktion gesperrt");
            L(new Color(1f, 0.85f, 0.2f), "Auftragsziel");
            L(new Color(1, 0.4f, 0.3f), "Lärm (Schüsse, Türen)");
            L(new Color(0.85f, 0.2f, 0.15f), "Verschlossene Tür");
            L(new Color(0.35f, 0.85f, 0.2f), "Giftzone");
            Text(new Rect(legend.x + 16, legend.yMax - 40, 270, 30), "M oder Esc schließen", 14, UiColors.Muted);
        }

        private void DrawPause()
        {
            Fill(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.6f));
            var r = new Rect(W / 2 - 260, H / 2 - 230, 520, 460);
            Panel(r, UiColors.Bg);
            Text(new Rect(r.x, r.y + 20, r.width, 50), "PAUSE", 40, UiColors.Accent, TextAnchor.MiddleCenter, true);
            float y = r.y + 100;
            if (Btn(new Rect(r.x + 60, y, 400, 54), "Weiter", true, 20, UiColors.Good)) { game.paused = false; game.input.ClearPending(); }
            y += 66;
            if (Btn(new Rect(r.x + 60, y, 400, 54), "Einstellungen", true, 20)) settingsOpen = true;
            y += 66;
            if (Btn(new Rect(r.x + 60, y, 400, 54), "Steuerung", true, 20)) helpOpen = true;
            y += 66;
            if (Btn(new Rect(r.x + 60, y, 400, 54), "Einsatz abbrechen", true, 20, UiColors.Bad))
                Confirm("Einsatz abbrechen? Das zählt wie ein Tod: Ausrüstung und Rucksack sind verloren, nur der sichere Behälter bleibt.", () => { game.paused = false; game.AbortRaid(); });
            Text(new Rect(r.x + 20, r.yMax - 50, r.width - 40, 40), "Hinweis: Wer das Spiel während eines Einsatzes beendet, gilt beim nächsten Start als vermisst.", 13, UiColors.Muted, TextAnchor.MiddleCenter, false, true);
        }
    }
}
