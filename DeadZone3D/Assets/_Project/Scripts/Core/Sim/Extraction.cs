using System;
using System.Collections.Generic;
using System.Linq;

namespace DeadZone.Core
{
    public sealed class ExtractionPoint
    {
        public Extraction def;
        public bool active;
        public string state = "idle", lockReason = "";
        public double progress, hazardTimer, tick;
        public string id => def.id;
        public string name => def.name;
        public string kind => def.kind;
        public double x => def.x;
        public double y => def.y;
        public double radius => def.radius > 0 ? def.radius : 72;
        public double duration => def.duration;
    }

    /// <summary>Extraction rules per kind, countdown, cancel, horde hazard (port of 16_extraction.js).</summary>
    public sealed class ExtractionSystem
    {
        private const int TILE = World.TILE;
        private readonly Raid _raid;
        public readonly List<ExtractionPoint> points;
        private ExtractionPoint _current;

        public ExtractionSystem(Raid raid)
        {
            _raid = raid;
            points = raid.world.extractions.Select(e => new ExtractionPoint { def = e }).ToList();
        }

        private static string ItemName(string id) => Items.Def(id)?.name ?? id;
        private double WindowEnd(ExtractionPoint p) => p.def.window != null && p.def.window.Length >= 2 ? p.def.window[1] : double.PositiveInfinity;
        private double WindowStart(ExtractionPoint p) => p.def.window != null && p.def.window.Length >= 1 ? p.def.window[0] : 0;

        private bool Evaluate(ExtractionPoint p)
        {
            var pl = _raid.player;
            bool Has(string id) => pl != null && (pl.inventory.Has(id) || pl.secure.Has(id));
            p.lockReason = "";
            switch (p.kind)
            {
                case "always": return true;
                case "timed":
                    if (_raid.time < WindowStart(p)) { p.lockReason = "öffnet in " + M.FormatTime(WindowStart(p) - _raid.time); return false; }
                    if (_raid.time > WindowEnd(p)) { p.lockReason = "Hubschrauber abgeflogen"; return false; }
                    return true;
                case "key":
                case "fuel":
                    if (Has(p.def.requires)) return true;
                    p.lockReason = "Benötigt: " + ItemName(p.def.requires);
                    return false;
                case "power":
                    if (_raid.generatorOn) return true;
                    p.lockReason = "Strom nötig (Generator)";
                    return false;
                default: return true;
            }
        }

        public void Update(double dt)
        {
            var pl = _raid.player;
            if (pl == null || pl.dead || _raid.ended) return;
            _current = null;
            var fb = _raid.fb;
            foreach (var p in points)
            {
                if (p.state == "done") continue;
                bool wasActive = p.active;
                p.active = Evaluate(p);
                bool inside = M.Dist(pl.x, pl.y, p.x, p.y) <= p.radius;
                bool expired = p.kind == "timed" && _raid.time > WindowEnd(p);
                if (p.kind == "timed" && !p.active && expired && p.state != "locked" && wasActive) fb.Toast(p.name + ": Hubschrauber abgeflogen", "warning");
                if (p.state == "extracting")
                {
                    if (!inside || !p.active)
                    {
                        p.state = !p.active && expired ? "locked" : "idle";
                        bool left = !inside;
                        _raid.events.Emit(new SimEvent("extractionCancel") { id = p.id, text = left ? "left" : "inactive" });
                        fb.Toast(left ? "Extraktion abgebrochen – Zone verlassen" : "Extraktion abgebrochen – Fenster geschlossen", "warning");
                        fb.Sfx("ui_error");
                        continue;
                    }
                    p.progress += dt;
                    p.tick += dt;
                    if (p.tick >= 1) { p.tick -= 1; fb.Sfx("extract_tick", double.NaN, double.NaN, 0.7); }
                    if (p.def.hazard == "horde")
                    {
                        p.hazardTimer -= dt;
                        if (p.hazardTimer <= 0)
                        {
                            p.hazardTimer = 3;
                            var zr = _raid.zombies.rng;
                            int n = zr.Int(1, 2);
                            var zs = _raid.zombies.SpawnNearPlayer(zr.Chance(0.5) ? "runner" : "walker", 400, 700, n);
                            foreach (var z in zs) { z.state = "chase"; z.alert = 1; z.lastSeen = new Vec2(pl.x, pl.y); }
                        }
                    }
                    _current = p;
                    if (p.progress >= p.duration) { Complete(p); return; }
                    continue;
                }
                if (!p.active && expired) p.state = "locked";
                if (inside && p.active)
                {
                    p.state = "extracting";
                    p.tick = 0; p.hazardTimer = 1.5;
                    _raid.events.Emit(new SimEvent("extractionStart") { id = p.id, x = p.x, y = p.y });
                    fb.Sfx("extract_start");
                    fb.Toast("Extraktion läuft: " + p.name + (p.def.hazard == "horde" ? " – der Lärm lockt Zombies an!" : ""), "info", 3000);
                    if (p.def.hazard == "horde") { fb.Sfx("alarm", p.x, p.y); _raid.EmitNoise(p.x, p.y, 1200, "alarm"); }
                    _current = p;
                }
                else if (p.progress > 0) p.progress = Math.Max(0, p.progress - 2 * dt);
            }
        }

        private void Complete(ExtractionPoint p)
        {
            var pl = _raid.player;
            if ((p.kind == "key" || p.kind == "fuel") && !string.IsNullOrEmpty(p.def.requires))
                if (pl.inventory.RemoveById(p.def.requires, 1) == 0) pl.secure.RemoveById(p.def.requires, 1);
            p.state = "done";
            _raid.fb.Sfx("extract_done");
            _raid.fb.Toast("Extraktion erfolgreich: " + p.name, "success", 3000);
            _raid.events.Emit(new SimEvent("extractionDone") { id = p.id });
            _raid.OnExtracted(p);
        }

        public ExtractionPoint Current => _current;

        public (ExtractionPoint point, double dist)? NearestInfo(double x, double y)
        {
            ExtractionPoint best = null; double bd = double.PositiveInfinity;
            foreach (var p in points) { double d = M.Dist(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
            return best != null ? (best, bd) : ((ExtractionPoint, double)?)null;
        }

        public string HudText()
        {
            var c = _current;
            if (c != null) return "Extraktion: " + c.name + " " + Math.Max(0, M.Ceil(c.duration - c.progress)) + " s";
            var pl = _raid.player;
            if (pl == null) return "";
            var active = points.Where(p => p.active && p.state != "done").ToList();
            if (active.Count > 0)
            {
                var best = active.OrderBy(p => M.Dist(pl.x, pl.y, p.x, p.y)).First();
                return "Extraktion offen: " + best.name + " (" + M.Round(M.Dist(pl.x, pl.y, best.x, best.y) / TILE) + " m)";
            }
            var timed = points.FirstOrDefault(p => p.kind == "timed" && p.lockReason.StartsWith("öffnet"));
            if (timed != null) return timed.name + " " + timed.lockReason;
            var n = NearestInfo(pl.x, pl.y);
            return n.HasValue ? n.Value.point.name + ": " + (string.IsNullOrEmpty(n.Value.point.lockReason) ? "gesperrt" : n.Value.point.lockReason) : "";
        }

        public string PromptFor(ExtractionPoint p)
        {
            if (p == null) return "";
            if (p.active) return "Bleib in der Zone, um zu extrahieren";
            return p.name + " – " + (string.IsNullOrEmpty(p.lockReason) ? "gesperrt" : p.lockReason);
        }
    }
}
