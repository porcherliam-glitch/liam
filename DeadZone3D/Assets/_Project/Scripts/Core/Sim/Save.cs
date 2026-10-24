using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace DeadZone.Core
{
    /// <summary>Key/value storage (Unity: files in Application.persistentDataPath; tests: memory).</summary>
    public interface IStorage
    {
        string Get(string key);
        bool Set(string key, string value);
        void Delete(string key);
    }

    public sealed class MemoryStorage : IStorage
    {
        public readonly Dictionary<string, string> Data = new Dictionary<string, string>();
        public string Get(string key) => Data.TryGetValue(key, out var v) ? v : null;
        public bool Set(string key, string value) { Data[key] = value; return true; }
        public void Delete(string key) => Data.Remove(key);
    }

    public sealed class Settings
    {
        public double master = 0.8, sfx = 1.0, music = 0.6;
        public bool screenShake = true, showFps, minimap = true, damageNumbers = true;
        public string quality = "high";
        /// <summary>Camera in a raid: "fps" (first person, default) or "topdown".</summary>
        public string view = "fps";
        /// <summary>Mouse sensitivity 0..1 (mapped to degrees per mouse count by the view layer).</summary>
        public double mouseSens = 0.35;
        public bool invertY;
        /// <summary>Vertical field of view in first person, degrees (70° ≈ 102° horizontal at 16:9).</summary>
        public double fov = 70;

        public Dictionary<string, object> ToJson() => new Dictionary<string, object>
        {
            ["master"] = master, ["sfx"] = sfx, ["music"] = music, ["screenShake"] = screenShake, ["showFps"] = showFps,
            ["minimap"] = minimap, ["damageNumbers"] = damageNumbers, ["quality"] = quality,
            ["view"] = view, ["mouseSens"] = mouseSens, ["invertY"] = invertY, ["fov"] = fov,
        };

        public static Settings FromJson(object raw)
        {
            var s = new Settings();
            if (!(raw is Dictionary<string, object> o)) return s;
            s.master = M.Clamp(Json.Num(o, "master", s.master), 0, 1);
            s.sfx = M.Clamp(Json.Num(o, "sfx", s.sfx), 0, 1);
            s.music = M.Clamp(Json.Num(o, "music", s.music), 0, 1);
            s.screenShake = Json.Bool(o, "screenShake", s.screenShake);
            s.showFps = Json.Bool(o, "showFps", s.showFps);
            s.minimap = Json.Bool(o, "minimap", s.minimap);
            s.damageNumbers = Json.Bool(o, "damageNumbers", s.damageNumbers);
            string q = Json.Str(o, "quality", "high");
            s.quality = q == "low" || q == "medium" || q == "high" ? q : "high";
            string v = Json.Str(o, "view", s.view);
            s.view = v == "topdown" ? "topdown" : "fps";
            s.mouseSens = M.Clamp(Json.Num(o, "mouseSens", s.mouseSens), 0, 1);
            s.invertY = Json.Bool(o, "invertY", s.invertY);
            s.fov = M.Clamp(Json.Num(o, "fov", s.fov), 55, 90);
            return s;
        }
    }

    /// <summary>Versioned saves with backup and validation, export/import, raid marker (port of 20_save.js).</summary>
    public sealed class SaveSystem
    {
        public const string KEY = "deadzone_save_v1", SETTINGS_KEY = "deadzone_settings_v1", BACKUP_KEY = "deadzone_save_backup";
        private readonly IStorage _ls;

        public SaveSystem(IStorage storage) { _ls = storage ?? new MemoryStorage(); }

        private string Get(string k) { try { return _ls.Get(k); } catch (Exception) { return null; } }
        private bool Set(string k, string v) { try { return _ls.Set(k, v); } catch (Exception e) { Log.Warn("Speichern fehlgeschlagen: " + e.Message); return false; } }
        private void Del(string k) { try { _ls.Delete(k); } catch (Exception) { } }

        public bool HasSave() { var raw = Get(KEY); return raw != null && Json.TryParse(raw, out var o) && o is Dictionary<string, object>; }

        public bool Save(Profile profile)
        {
            if (profile == null) return false;
            profile.lastSaved = ProfileManager.NowMs();
            var plain = ProfileManager.Serialize(profile);
            var prev = Get(KEY);
            if (prev != null && Json.TryParse(prev, out var po) && po is Dictionary<string, object> pd && ProfileManager.Validate(Json.Obj(pd, "profile")).ok) Set(BACKUP_KEY, prev);
            return Set(KEY, Json.Write(new Dictionary<string, object> { ["version"] = Profile.SAVE_VERSION, ["savedAt"] = profile.lastSaved, ["profile"] = plain }));
        }

        private ProfileManager.Validation TryParse(string raw)
        {
            if (raw == null) return new ProfileManager.Validation { error = "Kein Spielstand vorhanden" };
            if (!Json.TryParse(raw, out var o) || !(o is Dictionary<string, object> d)) return new ProfileManager.Validation { error = "Spielstand beschädigt" };
            var p = Json.Obj(d, "profile") ?? d;
            var v = ProfileManager.Validate(p);
            if (!v.ok && v.error == null) v.error = "Spielstand ungültig";
            return v;
        }

        public ProfileManager.Validation Load()
        {
            var main = TryParse(Get(KEY));
            if (main.ok) return main;
            if (Get(KEY) != null) Log.Warn("Spielstand beschädigt, versuche Sicherung: " + main.error);
            var bak = TryParse(Get(BACKUP_KEY));
            if (bak.ok) { bak.repaired.Insert(0, "Spielstand war beschädigt – Sicherung geladen"); return bak; }
            return new ProfileManager.Validation { error = main.error ?? "Kein Spielstand" };
        }

        public void Reset() { Del(KEY); Del(BACKUP_KEY); }
        public bool SaveSettings(Settings s) => Set(SETTINGS_KEY, Json.Write(s.ToJson()));
        public Settings LoadSettings() { var raw = Get(SETTINGS_KEY); return raw != null && Json.TryParse(raw, out var o) ? Settings.FromJson(o) : new Settings(); }

        public string ExportString() { var raw = Get(KEY); return raw == null ? null : Convert.ToBase64String(Encoding.UTF8.GetBytes(raw)); }

        public (bool ok, string error) ImportString(string str)
        {
            if (string.IsNullOrWhiteSpace(str)) return (false, "Kein Text eingefügt");
            string raw;
            try { raw = Encoding.UTF8.GetString(Convert.FromBase64String(str.Trim())); }
            catch (Exception) { return (false, "Text ist kein gültiger Export"); }
            var t = TryParse(raw);
            if (!t.ok) return (false, t.error);
            var prev = Get(KEY);
            if (prev != null) Set(BACKUP_KEY, prev);
            Set(KEY, Json.Write(new Dictionary<string, object> { ["version"] = Profile.SAVE_VERSION, ["savedAt"] = ProfileManager.NowMs(), ["profile"] = ProfileManager.Serialize(t.profile) }));
            return (true, null);
        }

        public bool MarkRaidStart(Profile p, string mapId, List<string> missionIds, uint seed)
        {
            if (p == null) return false;
            p.raidInProgress = new RaidMarker { mapId = mapId, missionIds = missionIds.ToList(), seed = seed, startedAt = ProfileManager.NowMs() };
            return Save(p);
        }
    }

    /// <summary>Hub of the non-visual game: profile, missions, saves, events, RNG and the current raid.</summary>
    public sealed class GameCore
    {
        public readonly EventBus events = new EventBus();
        public IFeedback fb;
        public Rng rng;
        public readonly ProfileManager profileMgr;
        public readonly MissionSystem missions;
        public readonly SaveSystem save;
        public Settings settings;
        public Raid raid;

        public GameCore(IStorage storage, IFeedback feedback = null, uint? seed = null)
        {
            fb = feedback ?? new NullFeedback();
            rng = new Rng(seed ?? (uint)(DateTime.UtcNow.Ticks & 0x7fffffff));
            profileMgr = new ProfileManager(this);
            missions = new MissionSystem(this);
            save = new SaveSystem(storage);
            settings = save.LoadSettings();
        }

        public Profile Profile => profileMgr.profile;

        public void NewGame()
        {
            save.Reset();
            profileMgr.NewProfile();
            save.Save(profileMgr.profile);
        }

        public sealed class ContinueResult { public bool ok, mia; public List<string> repaired = new List<string>(); public string error; }

        /// <summary>Loads the save; a raid that was still running counts as MIA (equipment lost).</summary>
        public ContinueResult Continue()
        {
            var r = save.Load();
            if (!r.ok) return new ContinueResult { error = r.error };
            profileMgr.SetProfile(r.profile);
            bool mia = false;
            if (profileMgr.profile.raidInProgress != null)
            {
                profileMgr.ApplyMiaOnReload();
                mia = true;
                save.Save(profileMgr.profile);
            }
            return new ContinueResult { ok = true, mia = mia, repaired = r.repaired };
        }

        public Raid StartRaid(string mapId, List<string> missionIds = null, uint? seed = null, IPlayerInput input = null)
        {
            if (profileMgr.profile == null) profileMgr.NewProfile();
            string map = Data.DataTables.MAPS.ContainsKey(mapId ?? "") ? mapId : "city";
            uint s = seed ?? (uint)rng.Int(1, int.MaxValue - 1);
            var ids = (missionIds ?? profileMgr.profile.missions.active)
                .Where(id => MissionSystem.ById.TryGetValue(id, out var d) && d.mapId == map).ToList();
            save.MarkRaidStart(profileMgr.profile, map, ids, s);
            raid?.events.Clear();
            raid = new Raid(this) { input = input };
            raid.Start(map, ids, s, profileMgr.BuildLoadout());
            return raid;
        }
    }
}
