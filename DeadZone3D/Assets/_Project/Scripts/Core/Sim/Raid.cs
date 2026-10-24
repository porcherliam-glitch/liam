using System;
using System.Collections.Generic;
using System.Linq;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    public sealed class ItemLine { public ItemInst inst; public bool equipped, secure; public int credits; }

    public sealed class RaidResult
    {
        public string outcome, mapId, mapName, extractionName, causeOfDeath;
        public uint seed;
        public int durationSec, kills, shotsFired, shotsHit, containersOpened, distance, damageTaken;
        /// <summary>Trigger pulls that hit a head (first person only).</summary>
        public int headShots;
        public double accuracy;
        public Dictionary<string, int> killsByType = new Dictionary<string, int>();
        public int xpGained, creditsGained, levelBefore, levelAfter, xpBefore, xpAfter, xpToNext, lootValue, objectivesDone;
        public bool leveledUp;
        public List<ItemLine> itemsKept = new List<ItemLine>(), itemsLost = new List<ItemLine>(), itemsSold = new List<ItemLine>();
        public List<ItemInst> insuranceReturned = new List<ItemInst>();
        public List<MissionDef> missionsCompleted = new List<MissionDef>(), missionsFailed = new List<MissionDef>();
        public RewardSummary rewards = new RewardSummary();
        public List<string> achievements = new List<string>();
    }

    /// <summary>One raid: world, nav, player, zombies, weapons, loot, extraction; fixed update order (port of 17_raid.js).</summary>
    public sealed class Raid
    {
        private const int TILE = World.TILE;
        private static readonly Dictionary<string, int> Prio = new Dictionary<string, int> { ["container"] = 0, ["loot"] = 1, ["body"] = 2, ["door"] = 3, ["poi"] = 4, ["extraction"] = 5 };

        public readonly GameCore game;
        public IFeedback fb;
        public World world;
        public Nav nav;
        public SpatialHash<Zombie> hash;
        public Player player;
        public ZombieAI zombies;
        public WeaponSystem weapons;
        public LootSystem loot;
        public ExtractionSystem extraction;
        public readonly EventBus events = new EventBus();
        public Rng rng;
        public uint seed;
        public string mapId;
        public MapDef map;
        public List<MissionState> missionStates = new List<MissionState>();
        public List<string> missionIds = new List<string>();
        public int xp;
        public double time, timeLimit = 1500, hour = 12, darkness;
        public bool generatorOn, bossKilled, ended, paused;
        public readonly List<Hazard> hazards = new List<Hazard>();
        public readonly List<Grenade> grenades = new List<Grenade>();
        public readonly List<NoiseMarker> noiseMarkers = new List<NoiseMarker>();
        public RaidResult result;
        public IPlayerInput input;
        /// <summary>Scales how fast the player and all zombies walk (first person: calmer tempo). Projectiles, grenades, knockback and timers stay as they are.</summary>
        public double moveScale = 1;
        private double _navTimer, _hazardTick;
        private bool _warned300, _warned60;

        public Raid(GameCore game) { this.game = game; fb = game?.fb ?? new NullFeedback(); }

        public static double DarknessForHour(double h)
        {
            h = ((h % 24) + 24) % 24;
            if (h >= 8 && h < 17) return 0.08;
            if (h >= 17 && h < 20) return M.Lerp(0.08, 0.85, (h - 17) / 3);
            if (h >= 5 && h < 8) return M.Lerp(0.85, 0.08, (h - 5) / 3);
            return 0.85;
        }

        public static string FormatHour(double h)
        {
            h = ((h % 24) + 24) % 24;
            int hh = (int)Math.Floor(h), mm = (int)Math.Floor((h - hh) * 60);
            return hh.ToString("00") + ":" + mm.ToString("00");
        }

        public Raid Start(string mapIdArg, IEnumerable<string> missionIdsArg, uint seedArg, Loadout loadout)
        {
            if (!DataTables.MAPS.TryGetValue(mapIdArg ?? "", out map)) map = DataTables.MAPS["city"];
            mapId = map.id;
            seed = seedArg;
            rng = new Rng(seed);
            var defs = (missionIdsArg ?? new string[0]).Where(MissionSystem.ById.ContainsKey).Select(id => MissionSystem.ById[id]).Where(d => d.mapId == map.id).ToList();
            missionIds = defs.Select(d => d.id).ToList();
            world = WorldGenerator.Generate(map.id, seed, defs);
            nav = new Nav(world);
            hash = new SpatialHash<Zombie>(96);
            loot = new LootSystem(rng, mapId);
            zombies = new ZombieAI(this);
            weapons = new WeaponSystem(this);
            player = new Player(this, loadout ?? new Loadout()) { x = world.spawnX, y = world.spawnY };
            player.angle = M.AngleTo(player.x, player.y, world.PixelW / 2, world.PixelH / 2);
            zombies.SpawnInitial();
            extraction = new ExtractionSystem(this);
            if (game != null) game.missions.StartRaid(this, defs);
            time = 0;
            timeLimit = map.raidDuration > 0 ? map.raidDuration : 1500;
            hour = map.startHour;
            darkness = DarknessForHour(hour);
            generatorOn = false; bossKilled = false;
            nav.Rebuild(player.x, player.y, 60);
            return this;
        }

        public double DarknessAt(double x, double y) => M.Clamp(darkness + (world != null && world.IsIndoor(x, y) ? 0.35 : 0), 0, 0.92);

        public void Update(double dt)
        {
            if (ended || world == null) return;
            dt = Math.Min(dt, 0.1);
            time += dt;
            hour = (map.startHour + time * 10 / timeLimit) % 24;
            darkness = DarknessForHour(hour);
            hash.Clear();
            foreach (var z in zombies.zombies) if (!z.dead) hash.Insert(z);
            player.Update(dt, input);
            if (ended) return;
            weapons.Update(dt);
            if (ended) return;
            zombies.Update(dt);
            if (ended) return;
            // first person: zombies are solid, step back out of any the player still overlaps
            if (player.blockedByZombies) player.PushOutOfZombies();
            extraction.Update(dt);
            if (ended) return;
            Hazards(dt);
            if (ended) return;
            Pois(dt);
            if ((_navTimer += dt) >= 0.4) { _navTimer = 0; nav.Rebuild(player.x, player.y, 60); }
            for (int i = noiseMarkers.Count - 1; i >= 0; i--) { noiseMarkers[i].ttl -= dt; if (noiseMarkers[i].ttl <= 0) noiseMarkers.RemoveAt(i); }
            double left = timeLimit - time;
            if (left <= 300 && !_warned300) { _warned300 = true; fb.Toast("Noch 5 Minuten bis zum Ende des Einsatzes", "warning", 4000); fb.Sfx("warning"); }
            if (left <= 60 && !_warned60) { _warned60 = true; fb.Toast("Noch 60 Sekunden – sofort extrahieren!", "danger", 4000); fb.Sfx("warning"); }
            if (left <= 0) OnTimeout();
        }

        private void Hazards(double dt)
        {
            var p = player;
            for (int i = hazards.Count - 1; i >= 0; i--)
            {
                var h = hazards[i];
                h.timer += dt;
                if (h.timer >= h.duration) { hazards.RemoveAt(i); continue; }
                if (h.kind == "fire") fb.Effect(Fx.Fire, h.x, h.y, h.r);
                if (h.kind == "toxic" && Math.Floor(h.timer * 3) != Math.Floor((h.timer - dt) * 3)) fb.Effect(Fx.ToxicCloud, h.x, h.y, h.r * 0.5);
                bool inside = M.Dist(p.x, p.y, h.x, h.y) <= h.r;
                if (inside && !p.dead)
                {
                    if (h.kind == "toxic") { p.toxic = Math.Max(p.toxic, 3); DamageOverTime(p, 3 * dt, "Vergiftung"); }
                    else if (h.kind == "fire") DamageOverTime(p, 8 * dt, "Feuer");
                }
                if (h.kind == "fire") foreach (var z in zombies.InRadius(h.x, h.y, h.r)) zombies.Damage(z, 18 * dt, 3, double.NaN, double.NaN, "fire");
            }
            if (!p.dead && world.Tile(M.Floor(p.x / TILE), M.Floor(p.y / TILE)) == T.TOXIC)
            {
                p.toxic = Math.Max(p.toxic, 2);
                DamageOverTime(p, 2 * dt, "Vergiftung");
                _hazardTick += dt;
                if (_hazardTick > 1.2) { _hazardTick = 0; fb.Sfx("toxic", double.NaN, double.NaN, 0.5); }
            }
        }

        private void DamageOverTime(Player p, double amount, string source)
        {
            if (p.god || p.dead) return;
            p.hp -= amount;
            p.stats.damageTaken += amount;
            fb.Effect(Fx.DamageFlash, p.x, p.y, 0.15);
            if (p.hp <= 0) { p.hp = 0; p.causeOfDeath = source; p.Die(); }
        }

        private void Pois(double dt)
        {
            var p = player;
            bool shownHold = false;
            foreach (var poi in world.pois)
            {
                if (poi.used || poi.type == "generator") continue;
                bool inside = M.Dist(p.x, p.y, poi.x, poi.y) <= (poi.radius > 0 ? poi.radius : 64);
                bool relevant = missionStates.Any(st => st.All.Any(o => !o.done && o.def.type == "investigate" && o.def.target == poi.type));
                if (!relevant) continue;
                if (inside)
                {
                    poi.timer += dt;
                    p.holdProgress = M.Clamp(poi.timer / 5, 0, 1);
                    p.holdLabel = "Gebiet untersuchen …";
                    shownHold = true;
                    if (poi.timer >= 5)
                    {
                        poi.used = true;
                        p.holdProgress = 0;
                        events.Emit(new SimEvent("poiReached") { x = poi.x, y = poi.y, id = poi.type, data = poi });
                    }
                }
                else poi.timer = Math.Max(0, poi.timer - dt);
            }
            var it = p.interactTarget;
            if (it != null && it.kind == "poi" && it.reference is Poi gen && gen.type == "generator" && !generatorOn && input != null && input.IsDown("interact"))
            {
                p.holdProgress += dt / 4;
                p.holdLabel = "Generator starten …";
                shownHold = true;
                if (p.holdProgress >= 1)
                {
                    p.holdProgress = 0;
                    generatorOn = true;
                    gen.used = true;
                    events.Emit(new SimEvent("generatorOn") { x = gen.x, y = gen.y });
                    fb.Toast("Generator läuft – Strom ist wieder da", "success", 3000);
                    fb.Sfx("alarm", gen.x, gen.y);
                    EmitNoise(gen.x, gen.y, 500, "alarm");
                    foreach (var l in world.lights) if (l.indoor) l.flicker = false;
                }
            }
            else if (!shownHold) { p.holdProgress = 0; p.holdLabel = null; }
        }

        public void EmitNoise(double x, double y, double radius, string kind = "shot")
        {
            if (!(radius > 0)) return;
            zombies?.OnNoise(x, y, radius, kind);
            if (kind != "step")
            {
                noiseMarkers.Add(new NoiseMarker { x = x, y = y, radius = radius, kind = kind, ttl = 1.2 });
                if (noiseMarkers.Count > 40) noiseMarkers.RemoveAt(0);
            }
            events.Emit(new SimEvent("noise") { x = x, y = y, value = radius, id = kind });
        }

        public void AddHazard(string kind, double x, double y, double r, double duration)
        {
            hazards.Add(new Hazard { kind = kind ?? "toxic", x = x, y = y, r = r > 0 ? r : 60, duration = duration > 0 ? duration : 6 });
            if (hazards.Count > 40) hazards.RemoveAt(0);
        }

        // ------------------------------------------------------------------ interaction
        public static string ContainerName(string type) => type != null && DataTables.CONTAINER_NAMES.TryGetValue(type, out var n) ? n : "Behälter";

        /// <param name="facing">Optional view angle (first person): things the player looks at win, things behind are skipped.</param>
        /// <summary>First person: half width of the cone in which things can be used (about the visible screen).</summary>
        public const double LookConeHalf = 1.0;

        public Interactable FindInteractable(double x, double y, double maxDist = 56, double facing = double.NaN)
        {
            var w = world;
            var cands = new List<Interactable>();
            foreach (var c in w.containers)
            {
                double d = M.Dist(x, y, c.x, c.y);
                if (d > maxDist) continue;
                if (!Physics.LineOfSight(w, x, y, c.x, c.y)) continue;
                string verb = c.type == "body" ? "durchsuchen" : (c.opened ? "öffnen" : "durchsuchen");
                bool empty = c.opened && c.items != null && !c.items.Any(i => i != null);
                cands.Add(new Interactable { kind = c.type == "body" ? "body" : "container", reference = c, x = c.x, y = c.y, dist = d, prompt = "E – " + ContainerName(c.type) + " " + verb + (empty ? " (leer)" : "") });
            }
            foreach (var fl in w.floorLoot)
            {
                double d = M.Dist(x, y, fl.x, fl.y);
                if (d > maxDist) continue;
                if (!Physics.LineOfSight(w, x, y, fl.x, fl.y)) continue;
                var def = Items.Def(fl.inst);
                cands.Add(new Interactable { kind = "loot", reference = fl, x = fl.x, y = fl.y, dist = d, prompt = "E – " + (def?.name ?? "Gegenstand") + (fl.inst.count > 1 ? " ×" + fl.inst.count : "") + " aufheben" });
            }
            int tx = M.Floor(x / TILE), ty = M.Floor(y / TILE);
            for (int dy = -1; dy <= 1; dy++)
                for (int dx = -1; dx <= 1; dx++)
                {
                    int t = w.Tile(tx + dx, ty + dy);
                    if (!T.IsDoor(t)) continue;
                    double cx = (tx + dx + 0.5) * TILE, cy = (ty + dy + 0.5) * TILE;
                    double d = M.Dist(x, y, cx, cy);
                    if (d > maxDist) continue;
                    string prompt = t == T.DOOR_OPEN ? "E – Tür schließen" : t == T.DOOR_LOCKED ? "E – Verschlossene Tür (Laborkarte)" : "E – Tür öffnen";
                    cands.Add(new Interactable { kind = "door", tx = tx + dx, ty = ty + dy, x = cx, y = cy, dist = d, prompt = prompt });
                }
            foreach (var poi in w.pois)
            {
                if (poi.type != "generator") continue;
                double d = M.Dist(x, y, poi.x, poi.y);
                if (d > maxDist) continue;
                cands.Add(new Interactable { kind = "poi", reference = poi, x = poi.x, y = poi.y, dist = d, prompt = generatorOn ? "Generator läuft" : "E halten – Generator starten", hold = !generatorOn });
            }
            if (extraction != null)
                foreach (var p in extraction.points)
                {
                    double d = M.Dist(x, y, p.x, p.y);
                    if (d > p.radius || p.active || p.state == "done") continue;
                    cands.Add(new Interactable { kind = "extraction", reference = p, x = p.x, y = p.y, dist = d + 40, prompt = extraction.PromptFor(p) });
                }
            if (!double.IsNaN(facing))
            {
                // first person: drop what is behind the player (unless it is right at the feet), prefer what is in view
                cands.RemoveAll(c => c.kind != "extraction" && c.dist > 22 && Math.Abs(M.AngleDiff(facing, M.AngleTo(x, y, c.x, c.y))) > LookConeHalf);
            }
            if (cands.Count == 0) return null;
            double Score(Interactable c) => double.IsNaN(facing) || c.kind == "extraction" ? c.dist : c.dist + Math.Abs(M.AngleDiff(facing, M.AngleTo(x, y, c.x, c.y))) * 26;
            // JS: cands.sort((a, b) => |a.dist - b.dist| <= 8 ? prio[a] - prio[b] : a.dist - b.dist)[0]
            var best = cands[0];
            double bestScore = Score(best);
            for (int i = 1; i < cands.Count; i++)
            {
                var c = cands[i];
                double sc = Score(c);
                double cmp = Math.Abs(sc - bestScore) <= 8 ? Prio[c.kind] - Prio[best.kind] : sc - bestScore;
                if (cmp < 0) { best = c; bestScore = sc; }
            }
            return best;
        }

        public void Interact(Interactable it)
        {
            if (it == null || ended) return;
            switch (it.kind)
            {
                case "container":
                case "body": OpenContainer((Container)it.reference); break;
                case "door":
                    {
                        int t = world.Tile(it.tx, it.ty);
                        if (t == T.DOOR_LOCKED)
                        {
                            if (player.inventory.Has("key_lab_card") || player.secure.Has("key_lab_card"))
                            {
                                world.SetTile(it.tx, it.ty, T.DOOR_OPEN);
                                var b = world.BuildingAt((it.tx + 0.5) * TILE, (it.ty + 0.5) * TILE);
                                if (b != null) b.locked = false;
                                fb.Toast("Laborkarte akzeptiert – Tür entriegelt", "success");
                                fb.Sfx("door_open", it.x, it.y);
                                events.Emit(new SimEvent("doorToggled") { x = it.tx, y = it.ty, value = 1 });
                                EmitNoise(it.x, it.y, 300, "door");
                            }
                            else { fb.Toast("Verschlossen – Laborkarte nötig", "warning"); fb.Sfx("ui_error"); }
                        }
                        else ToggleDoor(it.tx, it.ty, false);
                        break;
                    }
                case "loot": PickFloorLoot((FloorLoot)it.reference); break;
                case "extraction": fb.Toast(extraction.PromptFor((ExtractionPoint)it.reference), "info"); break;
            }
        }

        /// <summary>Set by the UI layer: called when a container should be shown.</summary>
        public Action<Container> OnOpenLoot;

        public void OpenContainer(Container c)
        {
            if (c == null) return;
            if (c.items == null) loot.RollContainer(c);
            if (!c.opened)
            {
                c.opened = true;
                player.stats.containersOpened++;
                events.Emit(new SimEvent("containerOpened") { x = c.x, y = c.y, id = c.type, data = c });
            }
            fb.Sfx("loot_open", c.x, c.y);
            EmitNoise(c.x, c.y, 70, "step");
            OnOpenLoot?.Invoke(c);
        }

        public (bool ok, ItemInst remaining, int taken) TakeFromContainer(Container c, int idx, int count = int.MaxValue, Inventory into = null)
        {
            if (c?.items == null || idx < 0 || idx >= c.items.Count) return (false, null, 0);
            var inst = c.items[idx];
            if (inst == null) return (false, null, 0);
            var part = inst;
            bool takeAll = count >= inst.count;
            if (!takeAll) { part = Items.Clone(inst); part.count = Math.Max(1, count); }
            int before = part.count;
            var r = (into ?? player.inventory).Add(part);
            int taken = before - (r.remaining?.count ?? 0);
            if (taken > 0)
            {
                var takenPart = Items.Clone(part); takenPart.count = taken;
                if (takenPart.raidFound) player.stats.lootValue += Items.Value(takenPart);
                if (takeAll) c.items[idx] = r.remaining;
                else { inst.count -= taken; if (inst.count <= 0) c.items[idx] = null; }
                if (takenPart.raidFound) events.Emit(new SimEvent("itemPicked") { id = takenPart.id, data = takenPart, text = "container" });
                fb.Sfx("pickup", double.NaN, double.NaN, 0.6);
            }
            return (taken > 0 && r.remaining == null, r.remaining, taken);
        }

        public int TakeAll(Container c)
        {
            if (c?.items == null) return 0;
            int n = 0; bool left = false;
            for (int i = 0; i < c.items.Count; i++)
            {
                if (c.items[i] == null) continue;
                var r = TakeFromContainer(c, i);
                if (r.taken > 0) n++;
                if (r.remaining != null) left = true;
            }
            c.items = c.items.Where(i => i != null).ToList();
            if (left) { fb.Toast("Inventar voll", "warning"); fb.Sfx("ui_error"); }
            return n;
        }

        public bool PutIntoContainer(Container c, ItemInst inst)
        {
            if (c == null || inst == null) return false;
            if (c.items == null) c.items = new List<ItemInst>();
            foreach (var it in c.items)
            {
                if (it != null && Items.CanStack(it, inst) && it.count < Items.StackMax(it))
                {
                    int mv = Math.Min(inst.count, Items.StackMax(it) - it.count);
                    it.count += mv; inst.count -= mv;
                    if (inst.count <= 0) return true;
                }
            }
            if (c.items.Count(i => i != null) >= 12) return false;
            int free = c.items.IndexOf(null);
            if (free >= 0) c.items[free] = inst; else c.items.Add(inst);
            return true;
        }

        public bool ToggleDoor(int tx, int ty, bool byZombie = false)
        {
            int t = world.Tile(tx, ty);
            if (t != T.DOOR_CLOSED && t != T.DOOR_OPEN) return false;
            bool open = t == T.DOOR_CLOSED;
            double x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
            if (!open && !byZombie)
            {
                if (M.Dist(player.x, player.y, x, y) < player.radius + 14) { fb.Toast("Tür blockiert – geh aus der Tür", "info", 1200); return false; }
                if (zombies.InRadius(x, y, 14).Count > 0) { fb.Toast("Tür blockiert", "info", 1200); return false; }
            }
            world.SetTile(tx, ty, open ? T.DOOR_OPEN : T.DOOR_CLOSED);
            fb.Sfx(byZombie ? "melee_hit" : (open ? "door_open" : "door_close"), x, y);
            if (byZombie) fb.Effect(Fx.Impact, x, y, 0, T.DOOR_CLOSED);
            EmitNoise(x, y, byZombie ? 350 : 200, "door");
            events.Emit(new SimEvent("doorToggled") { x = tx, y = ty, value = open ? 1 : 0 });
            return true;
        }

        public FloorLoot DropItem(ItemInst inst, double x, double y)
        {
            if (inst == null) return null;
            var w = world;
            double px = x, py = y;
            for (int k = 0; k < 6; k++)
            {
                double a = rng.Float(0, Math.PI * 2), r = rng.Float(0, 20);
                double nx = x + Math.Cos(a) * r, ny = y + Math.Sin(a) * r;
                if (w.IsWalkable(M.Floor(nx / TILE), M.Floor(ny / TILE))) { px = nx; py = ny; break; }
            }
            if (!w.IsWalkable(M.Floor(px / TILE), M.Floor(py / TILE)) && player != null) { px = player.x; py = player.y; }
            var fl = new FloorLoot { uid = Uid.Next(), inst = inst, x = px, y = py };
            w.floorLoot.Add(fl);
            if (w.floorLoot.Count > 300) w.floorLoot.RemoveAt(0);
            return fl;
        }

        public (int picked, int remaining) PickFloorLoot(FloorLoot fl)
        {
            var w = world;
            if (fl == null || !w.floorLoot.Contains(fl)) return (0, 0);
            var inst = fl.inst;
            int before = inst.count;
            var r = player.inventory.Add(inst);
            int picked = before - (r.remaining?.count ?? 0);
            if (r.remaining == null) w.floorLoot.Remove(fl);
            else { fl.inst = r.remaining; fb.Toast("Inventar voll", "warning"); fb.Sfx("ui_error"); }
            if (picked > 0)
            {
                var part = Items.Clone(inst); part.count = picked;
                if (part.raidFound)
                {
                    player.stats.lootValue += Items.Value(part);
                    events.Emit(new SimEvent("itemPicked") { id = part.id, data = part, text = "floor" });
                }
                fb.Sfx("pickup", double.NaN, double.NaN, 0.7);
                fb.Toast("+" + picked + " " + (Items.Def(inst)?.name ?? ""), "success", 1400);
            }
            return (picked, r.remaining?.count ?? 0);
        }

        public void AddXp(int n) { if (n > 0) xp += n; }

        public void OnPlayerDeath() { if (!ended) End("death"); }

        public void OnTimeout()
        {
            if (ended) return;
            fb.Toast("Zeit abgelaufen – Als vermisst gemeldet", "danger", 5000);
            player.causeOfDeath = "Zeit abgelaufen";
            End("mia");
        }

        public void OnExtracted(ExtractionPoint point)
        {
            if (ended) return;
            events.Emit(new SimEvent("extracted") { id = point?.id });
            End("extracted", point);
        }

        public void Abort() { if (!ended) { player.causeOfDeath = "Einsatz abgebrochen"; End("abort"); } }

        /// <summary>Called when the raid has ended and the result is ready (Unity shows the summary).</summary>
        public Action<RaidResult> OnEnded;

        public void End(string outcome, ExtractionPoint point = null)
        {
            if (ended) return;
            ended = true;
            var pm = game?.profileMgr;
            var p = player;
            var st = p.stats;
            var res = new RaidResult
            {
                outcome = outcome, mapId = mapId, mapName = map.name, seed = seed, extractionName = point?.name,
                causeOfDeath = outcome == "extracted" ? null : p.causeOfDeath,
                durationSec = M.Round(time), kills = st.kills, killsByType = new Dictionary<string, int>(st.killsByType), shotsFired = st.shotsFired, shotsHit = st.shotsHit,
                accuracy = st.shotsFired > 0 ? M.Clamp((double)st.shotsHit / st.shotsFired, 0, 1) : 0, damageTaken = M.Round(st.damageTaken), containersOpened = st.containersOpened,
                headShots = st.headShots,
                distance = M.Round(st.distance / TILE * World.MetersPerTile), levelBefore = pm?.Level() ?? 1, xpBefore = pm?.Xp() ?? 0,
            };
            if (pm?.profile != null)
            {
                pm.ApplyRaidResult(res, p, this);
                var m = outcome == "extracted" ? game.missions.FinalizeOnExtract(this, pm.profile) : game.missions.FinalizeOnDeath(this, pm.profile);
                res.missionsCompleted = m.completed; res.missionsFailed = m.failed; res.objectivesDone = m.objectivesDone; res.rewards = m.rewards;
                res.xpGained += m.rewards.xp; res.creditsGained += m.rewards.credits;
                res.levelAfter = pm.Level(); res.leveledUp = res.levelAfter > res.levelBefore;
                res.xpAfter = pm.Xp(); res.xpToNext = Progression.Progress(pm.Xp()).next;
                res.achievements = Achievements.Evaluate(pm.profile);
            }
            result = res;
            events.Emit(new SimEvent("raidEnd") { data = res });
            events.Clear();
            if (pm?.profile != null)
            {
                // once home, nothing is "found in raid" any more (missions already consumed what they needed)
                var pr = pm.profile;
                foreach (var inv in new[] { pr.stash, pr.loadout, pr.secure }) foreach (var it in inv.items) if (it != null) it.raidFound = false;
                foreach (var it in pr.equipment.All()) it.raidFound = false;
                pr.stash.MergeStacks();
            }
            if (game != null && pm?.profile != null) game.save.Save(pm.profile);
            OnEnded?.Invoke(res);
        }
    }
}
