using System;
using System.Collections.Generic;
using System.Linq;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    public sealed class ObjState { public ObjectiveDef def; public int progress; public bool done, optional; }

    public sealed class MissionState
    {
        public MissionDef def;
        public List<ObjState> objectives = new List<ObjState>(), optional = new List<ObjState>();
        public bool done, optionalDone;
        public IEnumerable<ObjState> All => objectives.Concat(optional);
    }

    public sealed class RewardSummary
    {
        public int credits, xp;
        public List<ItemCount> items = new List<ItemCount>();
    }

    public sealed class MissionFinal
    {
        public List<MissionDef> completed = new List<MissionDef>(), failed = new List<MissionDef>();
        public int objectivesDone;
        public RewardSummary rewards = new RewardSummary();
    }

    public sealed class HudLine { public string text, mission; public bool done, optional; }

    /// <summary>Missions: availability, accept, hand-in, rewards and raid tracking with the persistence rule (port of 15_missions.js).</summary>
    public sealed class MissionSystem
    {
        public static readonly Dictionary<string, MissionDef> ById = DataTables.MISSIONS.ToDictionary(m => m.id);
        private readonly GameCore _game;

        public MissionSystem(GameCore game) { _game = game; }

        public static IEnumerable<ObjectiveDef> AllObjectives(MissionDef def) => WorldGenerator.AllObjectives(def);
        private static int Count(ObjectiveDef o) => o.count > 0 ? o.count : 1;
        public static string PoiName(string type) => type != null && DataTables.MS_POI_NAMES.TryGetValue(type, out var n) ? n : type;

        private static int Level(Profile p) => Progression.LevelFromXp(p.xp);
        private static bool MapUnlocked(Profile p, string mapId) => Progression.UnlockedMapsFor(Level(p), p.Up("radio")).Contains(mapId);

        public List<MissionDef> AvailableFor(Profile p)
        {
            if (p == null) return new List<MissionDef>();
            var m = p.missions;
            var done = new HashSet<string>(m.completed);
            int lvl = Level(p);
            return DataTables.MISSIONS.Where(def =>
            {
                if (m.active.Contains(def.id)) return false;
                if (done.Contains(def.id) && !def.repeatable) return false;
                if ((def.unlockedBy ?? new string[0]).Any(id => !done.Contains(id))) return false;
                if (Math.Max(1, def.requiresLevel) > lvl) return false;
                return MapUnlocked(p, def.mapId);
            }).ToList();
        }

        public List<(MissionDef def, string reason)> LockedFor(Profile p)
        {
            var outp = new List<(MissionDef, string)>();
            if (p == null) return outp;
            var m = p.missions;
            var done = new HashSet<string>(m.completed);
            int lvl = Level(p);
            foreach (var def in DataTables.MISSIONS)
            {
                if (m.active.Contains(def.id) || (done.Contains(def.id) && !def.repeatable)) continue;
                var missing = (def.unlockedBy ?? new string[0]).Where(id => !done.Contains(id)).ToList();
                string reason = null;
                if (missing.Count > 0) reason = "Voraussetzung: " + string.Join(", ", missing.Select(id => ById.TryGetValue(id, out var d) ? d.title : id));
                else if (Math.Max(1, def.requiresLevel) > lvl) reason = "Ab Stufe " + def.requiresLevel;
                else if (!MapUnlocked(p, def.mapId)) reason = "Gebiet gesperrt";
                if (reason != null) outp.Add((def, reason));
            }
            return outp;
        }

        public List<MissionDef> Active(Profile p) => p == null ? new List<MissionDef>() : p.missions.active.Where(ById.ContainsKey).Select(id => ById[id]).ToList();
        public int MaxActive(Profile p) => 1 + (p?.Up("radio") ?? 0);

        public (bool ok, string reason) Accept(Profile p, string missionId)
        {
            if (p == null) return (false, "Kein Spielstand");
            if (!ById.ContainsKey(missionId)) return (false, "Unbekannter Auftrag");
            var m = p.missions;
            if (m.active.Contains(missionId)) return (false, "Bereits angenommen");
            if (m.active.Count >= MaxActive(p)) return (false, "Maximal " + MaxActive(p) + " aktive Aufträge (Funkstation ausbauen)");
            if (!AvailableFor(p).Any(d => d.id == missionId)) return (false, "Auftrag nicht verfügbar");
            m.active.Add(missionId);
            if (!m.progress.ContainsKey(missionId)) m.progress[missionId] = new Dictionary<string, int>();
            return (true, null);
        }

        public bool Abandon(Profile p, string missionId)
        {
            if (p == null || !p.missions.active.Remove(missionId)) return false;
            p.missions.progress.Remove(missionId);
            return true;
        }

        private static int Prog(Profile p, string missionId, string objId) =>
            p.missions.progress.TryGetValue(missionId, out var d) && d.TryGetValue(objId, out var v) ? v : 0;

        public List<ObjState> ProgressOf(Profile p, string missionId)
        {
            if (!ById.TryGetValue(missionId, out var def) || p == null) return new List<ObjState>();
            return AllObjectives(def).Select(o =>
            {
                int pr = Math.Min(Count(o), Prog(p, missionId, o.id));
                return new ObjState { def = o, progress = pr, done = pr >= Count(o), optional = def.optional != null && def.optional.Contains(o) };
            }).ToList();
        }

        public bool CanHandIn(Profile p, string missionId, string objId)
        {
            if (p == null || !ById.TryGetValue(missionId, out var def) || !p.missions.active.Contains(missionId)) return false;
            var o = AllObjectives(def).FirstOrDefault(x => x.id == objId);
            if (o == null || o.type != "collect") return false;
            int need = Count(o) - Prog(p, missionId, o.id);
            if (need <= 0) return false;
            return p.stash.Count(o.target) >= need;
        }

        public (bool ok, bool completed, RewardSummary rewards, string reason) HandIn(Profile p, string missionId, string objId)
        {
            if (!CanHandIn(p, missionId, objId)) return (false, false, null, "Gegenstände fehlen im Lager");
            var def = ById[missionId];
            var o = AllObjectives(def).First(x => x.id == objId);
            var m = p.missions;
            if (!m.progress.TryGetValue(missionId, out var prog)) m.progress[missionId] = prog = new Dictionary<string, int>();
            int need = Count(o) - (prog.TryGetValue(o.id, out var cur) ? cur : 0);
            p.stash.RemoveById(o.target, need);
            prog[o.id] = Count(o);
            _game.fb.Sfx("objective");
            if (def.objectives.All(x => (prog.TryGetValue(x.id, out var v) ? v : 0) >= Count(x)))
            {
                bool optDone = def.optional != null && def.optional.Length > 0 && def.optional.All(x => (prog.TryGetValue(x.id, out var v) ? v : 0) >= Count(x));
                return (true, true, Complete(p, def, optDone), null);
            }
            return (true, false, null, null);
        }

        private RewardSummary Complete(Profile p, MissionDef def, bool withOptional)
        {
            var m = p.missions;
            m.active.Remove(def.id);
            if (!m.completed.Contains(def.id)) m.completed.Add(def.id);
            m.progress.Remove(def.id);
            return GrantRewards(p, def, withOptional);
        }

        public RewardSummary GrantRewards(Profile p, MissionDef def, bool withOptional)
        {
            var r = def.rewards ?? new RewardDef();
            var o = withOptional ? (def.optionalRewards ?? new RewardDef()) : new RewardDef();
            var res = new RewardSummary { credits = r.credits + o.credits, xp = r.xp + o.xp };
            p.credits += res.credits;
            p.AddStat("creditsEarned", res.credits);
            foreach (var it in r.items ?? new ItemCount[0])
            {
                int c = Math.Max(1, it.count);
                var inst = Items.Create(it.id, c);
                if (inst == null) continue;
                res.items.Add(new ItemCount { id = it.id, count = c });
                var add = p.stash.Add(inst);
                if (add.remaining != null) p.credits += Math.Max(1, M.Round(Items.Value(add.remaining) * DataTables.ECONOMY.overflowSellMul));
            }
            _game.profileMgr.AddXp(res.xp);
            p.AddStat("missionsCompleted", 1);
            _game.events.Emit(new SimEvent("missionComplete") { id = def.id, text = def.title, data = res });
            _game.fb.Sfx("mission_complete");
            return res;
        }

        public static List<string> Validate()
        {
            var problems = new List<string>();
            var buildingTypes = new[] { "house", "apartment", "shop", "supermarket", "pharmacy", "garage", "barracks", "armory", "warehouse", "checkpoint", "hq", "factory", "workshop", "storage", "office", "lab", "security", "medical", "server", "bunker" };
            var containerTypes = DataTables.CONTAINER_NAMES.Keys.ToArray();
            var poiTypes = DataTables.MS_POI_NAMES.Keys.ToArray();
            foreach (var m in DataTables.MISSIONS)
            {
                DataTables.MAPS.TryGetValue(m.mapId ?? "", out var map);
                if (map == null) problems.Add(m.id + ": unbekannte Karte " + m.mapId);
                foreach (var u in m.unlockedBy ?? new string[0]) if (!ById.ContainsKey(u)) problems.Add(m.id + ": unbekannte Voraussetzung " + u);
                var oids = new HashSet<string>();
                foreach (var o in AllObjectives(m))
                {
                    if (!oids.Add(o.id)) problems.Add(m.id + ": doppelte Ziel-ID " + o.id);
                    if (o.count < 1) problems.Add(m.id + "/" + o.id + ": count < 1");
                    string t = o.target;
                    bool ok;
                    switch (o.type)
                    {
                        case "collect": case "retrieve": case "find_key": ok = Items.Def(t) != null; break;
                        case "kill": ok = t == "any" || DataTables.ZOMBIE_TYPES.ContainsKey(t ?? ""); break;
                        case "kill_boss": ok = map != null && !string.IsNullOrEmpty(map.boss); break;
                        case "search": ok = buildingTypes.Contains(t) || containerTypes.Contains(t); break;
                        case "investigate": ok = poiTypes.Contains(t); break;
                        case "generator": ok = t == "generator"; break;
                        case "extract_at": ok = map != null && (map.extractions ?? new ExtractionSpec[0]).Any(e => e.id == t); break;
                        case "rescue_medical": ok = t == "medical"; break;
                        default: ok = false; break;
                    }
                    if (!ok) problems.Add(m.id + "/" + o.id + ": ungültiges Ziel " + o.type + ":" + t);
                }
                foreach (var it in m.rewards?.items ?? new ItemCount[0]) if (Items.Def(it.id) == null) problems.Add(m.id + ": unbekannte Belohnung " + it.id);
            }
            return problems;
        }

        // ------------------------------------------------------------------ raid side
        public List<MissionState> StartRaid(Raid raid, IEnumerable<MissionDef> defs)
        {
            var p = _game.profileMgr.profile;
            raid.missionStates = defs.Where(d => d != null).Select(def =>
            {
                ObjState Mk(ObjectiveDef o, bool opt)
                {
                    int v = p != null ? Prog(p, def.id, o.id) : 0;
                    return new ObjState { def = o, progress = Math.Min(Count(o), v), done = v >= Count(o), optional = opt };
                }
                return new MissionState
                {
                    def = def,
                    objectives = (def.objectives ?? new ObjectiveDef[0]).Select(o => Mk(o, false)).ToList(),
                    optional = (def.optional ?? new ObjectiveDef[0]).Select(o => Mk(o, true)).ToList(),
                };
            }).ToList();
            foreach (var name in new[] { "kill", "containerOpened", "itemPicked", "poiReached", "generatorOn", "bossDead", "extracted" })
                raid.events.On(name, e => OnEvent(raid, e));
            return raid.missionStates;
        }

        private void Advance(Raid raid, MissionState st, ObjState o, int amount)
        {
            if (o.done) return;
            int before = o.progress;
            o.progress = Math.Min(Count(o.def), o.progress + amount);
            if (o.progress >= Count(o.def))
            {
                o.done = true;
                raid.events.Emit(new SimEvent("objectiveComplete") { id = o.def.id, text = o.def.text, data = st.def });
                raid.fb.Toast("Ziel erfüllt: " + o.def.text, "success", 3000);
                raid.fb.Sfx("objective");
                st.done = st.objectives.All(x => x.done);
                st.optionalDone = st.optional.Count > 0 && st.optional.All(x => x.done);
            }
            else if (o.progress != before && (o.def.type == "kill" || o.def.type == "search"))
                raid.fb.Toast(o.def.text + " (" + o.progress + "/" + Count(o.def) + ")", "info", 1500);
        }

        private void OnEvent(Raid raid, SimEvent e)
        {
            foreach (var st in raid.missionStates)
            {
                foreach (var o in st.All.ToList())
                {
                    if (o.done) continue;
                    var d = o.def;
                    switch (e.name)
                    {
                        case "kill":
                            if (d.type == "kill" && (d.target == "any" || d.target == e.id)) Advance(raid, st, o, 1);
                            break;
                        case "containerOpened":
                            if (d.type == "search" && e.data is Container c && (c.buildingType == d.target || c.type == d.target)) Advance(raid, st, o, 1);
                            break;
                        case "itemPicked":
                            if (d.type == "find_key" && e.data is ItemInst inst && inst.id == d.target) Advance(raid, st, o, 1);
                            break;
                        case "poiReached":
                            if (d.type == "investigate" && e.data is Poi poi && poi.type == d.target) Advance(raid, st, o, 1);
                            break;
                        case "generatorOn":
                            if (d.type == "generator") Advance(raid, st, o, 1);
                            break;
                        case "bossDead":
                            if (d.type == "kill_boss") Advance(raid, st, o, 1);
                            break;
                        case "extracted":
                            if (d.type == "extract_at" && e.id == d.target) Advance(raid, st, o, 1);
                            else if (d.type == "retrieve" || d.type == "collect" || d.type == "rescue_medical")
                            {
                                int n = 0;
                                foreach (var inv in new[] { raid.player.inventory, raid.player.secure })
                                    foreach (var it in inv.All())
                                    {
                                        if (!it.raidFound) continue;
                                        if (d.type == "rescue_medical") { if (Items.Def(it)?.cat == "medical") n += it.count; }
                                        else if (it.id == d.target) n += it.count;
                                    }
                                if (n > 0) Advance(raid, st, o, Math.Min(n, Count(d) - o.progress));
                            }
                            break;
                    }
                }
            }
        }

        private static void Consume(Inventory inv, string id, int count, bool catMedical)
        {
            int need = count;
            for (int i = inv.slots - 1; i >= 0 && need > 0; i--)
            {
                var it = inv.items[i];
                if (it == null || !it.raidFound) continue;
                if (catMedical) { if (Items.Def(it)?.cat != "medical") continue; }
                else if (it.id != id) continue;
                int take = Math.Min(need, it.count);
                it.count -= take; need -= take;
                if (it.count <= 0) inv.items[i] = null;
            }
        }

        private static readonly string[] PersistTypes = { "kill", "search", "investigate", "generator", "find_key", "kill_boss" };

        public MissionFinal FinalizeOnExtract(Raid raid, Profile p)
        {
            var res = new MissionFinal();
            if (p == null) return res;
            var m = p.missions;
            foreach (var st in raid.missionStates)
            {
                string id = st.def.id;
                if (!m.active.Contains(id)) continue;
                if (!m.progress.TryGetValue(id, out var prog)) m.progress[id] = prog = new Dictionary<string, int>();
                foreach (var o in st.All)
                {
                    int cur = prog.TryGetValue(o.def.id, out var v) ? v : 0;
                    if (PersistTypes.Contains(o.def.type)) prog[o.def.id] = Math.Max(cur, o.progress);
                    else if (o.done) prog[o.def.id] = Count(o.def);
                    if (o.done) res.objectivesDone++;
                }
                bool allDone = st.def.objectives.All(o => (prog.TryGetValue(o.id, out var v) ? v : 0) >= Count(o));
                if (!allDone) continue;
                foreach (var o in st.All)
                {
                    if (!o.done) continue;
                    if (o.def.type == "retrieve" || o.def.type == "collect") Consume(p.stash, o.def.target, Count(o.def), false);
                    else if (o.def.type == "rescue_medical") Consume(p.stash, null, Count(o.def), true);
                }
                bool optDone = st.def.optional != null && st.def.optional.Length > 0 && st.def.optional.All(o => (prog.TryGetValue(o.id, out var v) ? v : 0) >= Count(o));
                var r = Complete(p, st.def, optDone);
                res.completed.Add(st.def);
                res.rewards.credits += r.credits; res.rewards.xp += r.xp; res.rewards.items.AddRange(r.items);
            }
            return res;
        }

        public MissionFinal FinalizeOnDeath(Raid raid, Profile p)
        {
            var res = new MissionFinal();
            if (p == null) return res;
            foreach (var st in raid.missionStates) if (p.missions.active.Contains(st.def.id)) res.failed.Add(st.def);
            p.AddStat("missionsFailed", res.failed.Count);
            return res;
        }

        public List<HudLine> HudLines(Raid raid)
        {
            var outp = new List<HudLine>();
            foreach (var st in raid.missionStates)
                foreach (var o in st.All)
                    outp.Add(new HudLine { text = o.def.text + (Count(o.def) > 1 ? " (" + o.progress + "/" + o.def.count + ")" : ""), done = o.done, optional = o.optional, mission = st.def.title });
            return outp;
        }
    }
}
