using System;
using System.Collections.Generic;
using System.Linq;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    /// <summary>Levels, map unlocks and ranks (port of 19_progression.js and xpForLevel/levelFromXp).</summary>
    public static class Progression
    {
        public const int MAX_LEVEL = 30;

        public static int XpForLevel(int level)
        {
            int n = Math.Max(1, level) - 1;
            return 60 * n * n + 140 * n;
        }

        public static int LevelFromXp(double xp)
        {
            if (!(xp > 0)) return 1;
            int level = 1;
            for (int i = 0; i < MAX_LEVEL && level < MAX_LEVEL; i++)
            {
                if (xp >= XpForLevel(level + 1)) level++;
                else break;
            }
            return level;
        }

        public struct Prog { public int level, cur, next; public double pct; }

        public static Prog Progress(int xp)
        {
            int level = LevelFromXp(xp);
            int bas = XpForLevel(level);
            int nextTotal = level >= MAX_LEVEL ? bas : XpForLevel(level + 1);
            int cur = Math.Max(0, xp - bas);
            int next = Math.Max(1, nextTotal - bas);
            return new Prog { level = level, cur = cur, next = next, pct = level >= MAX_LEVEL ? 1 : M.Clamp((double)cur / next, 0, 1) };
        }

        public static List<string> UnlockedMapsFor(int level, int radioLevel)
        {
            return DataTables.MAP_ORDER.Where(id =>
            {
                var m = DataTables.MAPS[id];
                int unlock = m.unlockLevel > 0 ? m.unlockLevel : 1;
                return level >= unlock || (m.radioUnlock > 0 && radioLevel >= m.radioUnlock);
            }).ToList();
        }

        public static string RankTitle(int level)
        {
            var ranks = new (int l, string n)[] { (1, "Rekrut"), (3, "Plünderer"), (5, "Späher"), (8, "Überlebender"), (11, "Veteran"), (15, "Jäger"), (19, "Kommandant"), (24, "Legende der Zone") };
            string t = ranks[0].n;
            foreach (var r in ranks) if (level >= r.l) t = r.n;
            return t;
        }
    }

    public sealed class AchievementDef { public string id, name, desc; public Func<Profile, bool> check; }

    public static class Achievements
    {
        public static readonly AchievementDef[] List =
        {
            new AchievementDef { id = "first_extract", name = "Lebend raus", desc = "Schließe deine erste Extraktion ab.", check = p => p.Stat("extractions") >= 1 },
            new AchievementDef { id = "extract_10", name = "Routinier", desc = "Extrahiere zehnmal erfolgreich.", check = p => p.Stat("extractions") >= 10 },
            new AchievementDef { id = "kills_50", name = "Säuberung", desc = "Erledige insgesamt 50 Zombies.", check = p => p.Stat("kills") >= 50 },
            new AchievementDef { id = "kills_500", name = "Schlächter", desc = "Erledige insgesamt 500 Zombies.", check = p => p.Stat("kills") >= 500 },
            new AchievementDef { id = "boss", name = "Wirtswechsel", desc = "Besiege den Wirt in der Forschungsanlage.", check = p => p.killsByType.TryGetValue("boss", out var b) && b >= 1 },
            new AchievementDef { id = "rich", name = "Gut betucht", desc = "Besitze 20.000 CR auf einmal.", check = p => p.credits >= 20000 },
            new AchievementDef { id = "loot_big", name = "Großer Fang", desc = "Extrahiere Beute im Wert von 5.000 CR in einem Einsatz.", check = p => p.Stat("bestRaidValue") >= 5000 },
            new AchievementDef { id = "missions_5", name = "Zuverlässig", desc = "Schließe fünf Aufträge ab.", check = p => p.Stat("missionsCompleted") >= 5 },
            new AchievementDef { id = "missions_20", name = "Funkstimme", desc = "Schließe zwanzig Aufträge ab.", check = p => p.Stat("missionsCompleted") >= 20 },
            new AchievementDef { id = "crafter", name = "Tüftler", desc = "Stelle zehn Gegenstände her.", check = p => p.Stat("itemsCrafted") >= 10 },
            new AchievementDef { id = "builder", name = "Bauherr", desc = "Kaufe fünf Basisverbesserungen.", check = p => p.Stat("upgradesBought") >= 5 },
            new AchievementDef { id = "all_maps", name = "Kartograf", desc = "Schalte alle vier Gebiete frei.", check = p => p.unlockedMaps.Count >= 4 },
            new AchievementDef { id = "level_10", name = "Erfahren", desc = "Erreiche Stufe 10.", check = p => Progression.LevelFromXp(p.xp) >= 10 },
            new AchievementDef { id = "sharpshooter", name = "Scharfschütze", desc = "Erreiche über 500 Schüsse eine Trefferquote von 60 %.", check = p => p.Stat("shotsFired") >= 500 && p.Stat("shotsHit") / Math.Max(1, p.Stat("shotsFired")) >= 0.6 },
            new AchievementDef { id = "scavenger", name = "Aasgeier", desc = "Durchsuche 200 Behälter.", check = p => p.Stat("containersOpened") >= 200 },
        };

        public static List<string> Evaluate(Profile p)
        {
            var fresh = new List<string>();
            if (p == null) return fresh;
            foreach (var a in List)
            {
                bool ok;
                try { ok = a.check(p); } catch (Exception) { ok = false; }
                if (ok && !p.achievements.Contains(a.id)) { p.achievements.Add(a.id); fresh.Add(a.id); }
            }
            return fresh;
        }
    }
}
