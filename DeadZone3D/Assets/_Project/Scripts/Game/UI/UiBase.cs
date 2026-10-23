using System.Collections.Generic;
using System.Linq;
using DeadZone.Core;
using DeadZone.Core.Data;
using UnityEngine;

namespace DeadZone.Game
{
    public sealed partial class UiRoot
    {
        private string _baseTab = "overview";
        private string _planMap;
        private Vector2 _scrollA, _scrollB;

        private static readonly (string id, string name)[] BaseTabs =
        {
            ("overview", "Übersicht"), ("plan", "Einsatz planen"), ("stash", "Lager & Ausrüstung"), ("trader", "Händler"),
            ("armory", "Waffenwerkstatt"), ("workshop", "Werkstatt"), ("medbay", "Krankenstation"), ("radio", "Funkstation"),
            ("upgrades", "Basisausbau"), ("stats", "Statistik & Erfolge"),
        };

        private void DrawBase()
        {
            var p = Prof;
            if (p == null) { game.EnterMenu(); return; }
            var pm = game.core.profileMgr;
            Fill(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.45f));
            // header
            Fill(new Rect(0, 0, W, 64), new Color(0.03f, 0.04f, 0.045f, 0.95f));
            Text(new Rect(24, 0, 400, 64), "BASIS · DEAD ZONE", 26, UiColors.Accent, TextAnchor.MiddleLeft, true);
            var prog = Progression.Progress(p.xp);
            // laid out from the right so narrow (4:3) screens do not overlap
            bool narrow = W < 1700;
            float bw = narrow ? 130 : 175;
            float bx = W - 20 - bw * 2 - 10;
            float hx = bx - 230, cx = hx - 250;
            Text(new Rect(330, 6, Mathf.Max(120, cx - 340), 26), "Stufe " + prog.level + " · " + Progression.RankTitle(prog.level), 18, UiColors.Text, TextAnchor.MiddleLeft, true);
            Bar(new Rect(330, 36, Mathf.Clamp(cx - 350, 120, 300), 16), prog.cur, prog.next, UiColors.Accent, prog.cur + " / " + prog.next + " EP", 12);
            Text(new Rect(cx, 0, 240, 64), M.FormatCredits(p.credits), 24, UiColors.Accent, TextAnchor.MiddleLeft, true);
            Bar(new Rect(hx, 12, 200, 18), (float)p.hp, pm.HpMax(), UiColors.Hp, "LP " + M.Round(p.hp) + "/" + pm.HpMax(), 12);
            Bar(new Rect(hx, 34, 96, 14), (float)p.hunger, 100, UiColors.Food, null);
            Bar(new Rect(hx + 104, 34, 96, 14), (float)p.thirst, 100, UiColors.Water, null);
            if (Btn(new Rect(bx, 12, bw, 40), "Einstellungen", true, 16)) settingsOpen = true;
            if (Btn(new Rect(bx + bw + 10, 12, bw, 40), "Hauptmenü", true, 16)) { game.core.save.Save(p); game.EnterMenu(); }
            // navigation
            float ny = 84;
            foreach (var (id, name) in BaseTabs)
            {
                bool active = _baseTab == id;
                if (Btn(new Rect(20, ny, 260, 50), name, true, 18, active ? UiColors.Good : (Color?)null)) { _baseTab = id; _selected = null; }
                if (active) Fill(new Rect(20, ny, 5, 50), UiColors.Good);
                ny += 58;
            }
            var area = new Rect(300, 84, W - 320, H - 104);
            switch (_baseTab)
            {
                case "overview": DrawOverview(area); break;
                case "plan": DrawPlan(area); break;
                case "stash": DrawStash(area, false); break;
                case "trader": DrawTrader(area); break;
                case "armory": DrawCrafting(area, "armory", "Waffenwerkstatt", "Munition, Waffen und Granaten herstellen. Reparaturen über das Lager (Gegenstand anklicken)."); break;
                case "workshop": DrawCrafting(area, "workshop", "Werkstatt", "Material verarbeiten und Ausrüstung bauen."); break;
                case "medbay": DrawMedbay(area); break;
                case "radio": DrawRadio(area); break;
                case "upgrades": DrawUpgrades(area); break;
                case "stats": DrawStats(area); break;
            }
        }

        private void DrawOverview(Rect a)
        {
            var p = Prof; var pm = game.core.profileMgr;
            Panel(a);
            Text(new Rect(a.x + 30, a.y + 20, a.width - 60, 40), "Willkommen zurück, " + p.name + ".", 28, UiColors.Text, TextAnchor.MiddleLeft, true);
            float y = a.y + 80;
            var warns = pm.LoadoutWarnings();
            Text(new Rect(a.x + 30, y, 600, 30), "Einsatzbereitschaft", 20, UiColors.Accent, TextAnchor.MiddleLeft, true); y += 36;
            if (warns.Count == 0) { Text(new Rect(a.x + 30, y, a.width - 60, 28), "✔ Alles bereit. Plane deinen nächsten Einsatz.", 18, UiColors.Good); y += 32; }
            foreach (var w in warns) { Text(new Rect(a.x + 30, y, a.width - 60, 28), "⚠ " + w, 18, UiColors.Warn); y += 30; }
            y += 20;
            Text(new Rect(a.x + 30, y, 600, 30), "Aktive Aufträge", 20, UiColors.Accent, TextAnchor.MiddleLeft, true); y += 36;
            var active = game.core.missions.Active(p);
            if (active.Count == 0) { Text(new Rect(a.x + 30, y, a.width - 60, 28), "Keine – nimm in der Funkstation Aufträge an.", 18, UiColors.Muted); y += 30; }
            foreach (var m in active) { Text(new Rect(a.x + 30, y, a.width - 60, 28), "• " + m.title + " (" + DataTables.MAPS[m.mapId].name + ")", 18); y += 30; }
            y += 30;
            if (Btn(new Rect(a.x + 30, y, 300, 56), "Einsatz planen", true, 20, UiColors.Good)) _baseTab = "plan";
            if (Btn(new Rect(a.x + 350, y, 300, 56), "Schnell packen", true, 20)) QuickPack();
            Text(new Rect(a.x + 30, a.yMax - 120, a.width - 60, 100),
                "Tipp: Im Einsatz verlierst du beim Tod alles am Körper und im Rucksack – nur der sichere Behälter bleibt. Wertvolles also gut überlegt mitnehmen und rechtzeitig extrahieren. " +
                "Die Krankenstation heilt dich zwischen den Einsätzen, die Funkstation schaltet weitere Aufträge und Gebiete frei.", 16, UiColors.Muted, TextAnchor.UpperLeft, false, true);
        }

        private void DrawPlan(Rect a)
        {
            var p = Prof; var pm = game.core.profileMgr;
            var unlocked = pm.UnlockedMaps();
            if (_planMap == null || !unlocked.Contains(_planMap)) _planMap = unlocked.LastOrDefault() ?? "city";
            float cw = (a.width - 30) / 4f;
            for (int i = 0; i < DataTables.MAP_ORDER.Length; i++)
            {
                var id = DataTables.MAP_ORDER[i];
                var map = DataTables.MAPS[id];
                var r = new Rect(a.x + i * (cw + 10), a.y, cw, 250);
                bool open = unlocked.Contains(id);
                bool sel = _planMap == id;
                Panel(r, sel ? new Color(0.12f, 0.16f, 0.12f, 0.97f) : UiColors.Panel);
                if (sel) Frame(r, UiColors.Good, 2);
                var pal = Mats.Hex(map.palette?.ground, Color.grey);
                Fill(new Rect(r.x + 10, r.y + 10, r.width - 20, 70), Mats.Shade(pal, 1.4f));
                Text(new Rect(r.x + 10, r.y + 10, r.width - 20, 70), map.short_name(), 30, new Color(1, 1, 1, 0.85f), TextAnchor.MiddleCenter, true);
                Text(new Rect(r.x + 14, r.y + 86, r.width - 28, 28), map.name, 17, UiColors.Text, TextAnchor.MiddleLeft, true);
                Text(new Rect(r.x + 14, r.y + 114, r.width - 28, 24), "Gefahr " + new string('●', map.difficulty) + new string('○', 4 - map.difficulty) + " · " + M.FormatTime(map.raidDuration) + " · Start " + map.startHour + ":00", 14, UiColors.Muted);
                if (!open) Text(new Rect(r.x + 14, r.y + 140, r.width - 28, 60), "Gesperrt – ab Stufe " + map.unlockLevel + (map.radioUnlock > 0 ? " oder Funkstation " + map.radioUnlock : ""), 15, UiColors.Bad, TextAnchor.UpperLeft, false, true);
                else Text(new Rect(r.x + 14, r.y + 140, r.width - 28, 100), map.desc, 13, new Color(0.75f, 0.78f, 0.8f), TextAnchor.UpperLeft, false, true);
                if (open && GUI.Button(r, GUIContent.none, GUIStyle.none)) { _planMap = id; game.audioSys.Play("ui_click", null, 0.5f); }
            }
            var mapSel = DataTables.MAPS[_planMap];
            var info = new Rect(a.x, a.y + 265, a.width * 0.5f - 5, a.height - 265);
            Panel(info);
            float y = info.y + 14;
            Text(new Rect(info.x + 18, y, info.width - 36, 30), "Aufträge in diesem Gebiet", 20, UiColors.Accent, TextAnchor.MiddleLeft, true); y += 38;
            var mine = game.core.missions.Active(p).Where(m => m.mapId == _planMap).ToList();
            if (mine.Count == 0) { Text(new Rect(info.x + 18, y, info.width - 36, 50), "Keine aktiven Aufträge für dieses Gebiet. Du kannst trotzdem plündern gehen.", 16, UiColors.Muted, TextAnchor.UpperLeft, false, true); y += 56; }
            foreach (var m in mine)
            {
                Text(new Rect(info.x + 18, y, info.width - 36, 26), m.title, 18, UiColors.Text, TextAnchor.MiddleLeft, true); y += 28;
                foreach (var o in game.core.missions.ProgressOf(p, m.id))
                {
                    Text(new Rect(info.x + 30, y, info.width - 48, 24), (o.done ? "✔ " : "• ") + o.def.text + (o.optional ? " (optional)" : ""), 15, o.done ? UiColors.Good : o.optional ? UiColors.Muted : UiColors.Text, TextAnchor.MiddleLeft, false, true); y += 26;
                }
                y += 8;
            }
            Text(new Rect(info.x + 18, y + 10, info.width - 36, 60), "Extraktionen: " + string.Join(", ", mapSel.extractions.Select(e => e.name)), 15, UiColors.Muted, TextAnchor.UpperLeft, false, true);
            var load = new Rect(a.x + a.width * 0.5f + 5, a.y + 265, a.width * 0.5f - 5, a.height - 265);
            Panel(load);
            y = load.y + 14;
            Text(new Rect(load.x + 18, y, load.width - 36, 30), "Ausrüstung", 20, UiColors.Accent, TextAnchor.MiddleLeft, true); y += 38;
            foreach (var s in new[] { "primary", "secondary", "melee", "grenade", "armorBody", "armorHead", "backpack" })
            {
                var it = p.equipment[s];
                Text(new Rect(load.x + 18, y, 170, 24), Equipment.SlotName(s), 15, UiColors.Muted);
                Text(new Rect(load.x + 190, y, load.width - 210, 24), it != null ? Items.Def(it).name + (it.count > 1 ? " ×" + it.count : "") : "—", 15, it != null ? UiColors.Text : UiColors.Muted);
                y += 26;
            }
            Text(new Rect(load.x + 18, y + 4, load.width - 36, 24), "Rucksack: " + p.loadout.All().Count + "/" + p.loadout.slots + " · Gewicht " + M.FormatWeight(pm.LoadoutWeight()) + " / " + M.FormatWeight(pm.CarryLimit()), 15, UiColors.Text);
            y += 34;
            foreach (var w in pm.LoadoutWarnings().Take(3)) { Text(new Rect(load.x + 18, y, load.width - 36, 22), "⚠ " + w, 14, UiColors.Warn); y += 24; }
            if (Btn(new Rect(load.x + 18, load.yMax - 70, 200, 52), "Schnell packen", true, 17)) QuickPack();
            if (Btn(new Rect(load.x + 228, load.yMax - 70, load.width - 246, 52), "Einsatz starten: " + mapSel.short_name(), unlocked.Contains(_planMap), 20, UiColors.Good)) game.StartRaid(_planMap);
        }

        private void DrawStash(Rect a, bool trader)
        {
            var p = Prof; var pm = game.core.profileMgr;
            float leftW = a.width * 0.56f;
            DrawGrid(new Rect(a.x, a.y, leftW, a.height - 130), "Lager", "stash", p.stash, 72, p.stash.All().Count + "/" + p.stash.slots + " Plätze");
            float rx = a.x + leftW + 10, rw = a.width - leftW - 10;
            float eh = EquipmentHeight(rw);
            DrawEquipment(new Rect(rx, a.y, rw, eh), "equip", p.equipment);
            float rest = a.height - 130 - eh - 8 - 52;
            float secH = Mathf.Max(100, rest * 0.3f);
            DrawGrid(new Rect(rx, a.y + eh + 8, rw, rest - secH - 8), "Rucksack", "loadout", p.loadout, 64, M.FormatWeight(pm.LoadoutWeight()) + " / " + M.FormatWeight(pm.CarryLimit()));
            DrawGrid(new Rect(rx, a.y + eh + rest - secH + 8, rw, secH - 8), "Sicherer Behälter (bleibt beim Tod)", "secure", p.secure, 64);
            float by = a.y + eh + rest + 6;
            if (Btn(new Rect(rx, by, rw * 0.5f - 5, 44), "Schnell packen", true, 16)) QuickPack();
            if (Btn(new Rect(rx + rw * 0.5f + 5, by, rw * 0.5f - 5, 44), "Lager sortieren", true, 16)) { p.stash.Sort(); _selected = null; }
            DrawSelectionActions(new Rect(a.x, a.yMax - 120, a.width, 120));
        }

        private void QuickPack()
        {
            var p = Prof;
            int n = game.core.profileMgr.QuickPack();
            if (n > 0) Toast(n + " Stapel eingepackt", "success", 2000);
            else if (p.loadout.IsFull()) Toast("Rucksack voll", "warning", 2000);
            else Toast("Nichts Passendes im Lager", "info", 2000);
        }

        private void DrawTrader(Rect a)
        {
            var p = Prof; var pm = game.core.profileMgr;
            float leftW = a.width * 0.5f;
            var list = new Rect(a.x, a.y, leftW - 5, a.height);
            Panel(list);
            Text(new Rect(list.x + 14, list.y + 6, list.width - 28, 30), "Angebot des Händlers (Stufe " + p.Up("trader") + ")", 20, UiColors.Accent, TextAnchor.MiddleLeft, true);
            Text(new Rect(list.x + 14, list.y + 6, list.width - 28, 30), "Neues Angebot nach jedem Einsatz", 13, UiColors.Muted, TextAnchor.MiddleRight);
            float rowH = 58;
            var view = new Rect(0, 0, list.width - 40, p.traderStock.Count * rowH + 10);
            var vpT = new Rect(list.x + 8, list.y + 44, list.width - 16, list.height - 52);
            _viewport = vpT;
            _scrollA = GUI.BeginScrollView(vpT, _scrollA, view);
            for (int i = 0; i < p.traderStock.Count; i++)
            {
                var o = p.traderStock[i];
                var d = Items.Def(o.id);
                var r = new Rect(4, i * rowH, view.width - 8, rowH - 6);
                Fill(r, i % 2 == 0 ? UiColors.Panel2 : UiColors.Panel);
                var icon = new Rect(r.x + 4, r.y + 2, 48, 48);
                var tmp = Items.Create(o.id, 1);
                DrawItemIcon(icon, tmp, false);
                Text(new Rect(r.x + 62, r.y + 2, r.width - 330, 26), d.name, 16, Mats.Hex(DataTables.RARITY[d.rarity].color, Color.white), TextAnchor.MiddleLeft, true);
                Text(new Rect(r.x + 62, r.y + 26, r.width - 330, 22), M.FormatCredits(o.price) + " · Vorrat " + o.count, 14, UiColors.Muted);
                if (Btn(new Rect(r.xMax - 250, r.y + 8, 110, 36), "Kaufen", o.count > 0 && p.credits >= o.price, 14, UiColors.Good)) { var res = pm.Buy(i, 1); if (!res.ok) Toast(res.reason, "warning", 1500); }
                int n10 = Mathf.Min(o.count, d.stack > 1 ? Mathf.Max(10, d.stack) : 5);
                int nBuy = o.price > 0 ? Mathf.Min(n10, p.credits / o.price) : n10; // what the player can actually afford
                if (Btn(new Rect(r.xMax - 132, r.y + 8, 124, 36), "×" + Mathf.Max(nBuy, 2), nBuy > 1, 14, UiColors.Good)) { var res = pm.Buy(i, nBuy); if (!res.ok) Toast(res.reason, "warning", 1500); }
            }
            GUI.EndScrollView();
            _viewport = null;
            var right = new Rect(a.x + leftW + 5, a.y, a.width - leftW - 5, a.height - 130);
            DrawGrid(right, "Dein Lager – Rechtsklick verkauft sofort", "stash", p.stash, 70, M.FormatCredits(p.credits));
            DrawSelectionActions(new Rect(right.x, a.yMax - 120, right.width, 120));
        }

        private void DrawCrafting(Rect a, string station, string title, string hint)
        {
            var p = Prof; var pm = game.core.profileMgr;
            Panel(a);
            int lvl = pm.StationLevel(station);
            Text(new Rect(a.x + 20, a.y + 10, a.width - 40, 34), title + " · Ausbaustufe " + lvl, 24, UiColors.Accent, TextAnchor.MiddleLeft, true);
            Text(new Rect(a.x + 20, a.y + 44, a.width - 40, 26), hint, 15, UiColors.Muted);
            var recipes = pm.RecipesFor(station);
            float rowH = 74;
            var view = new Rect(0, 0, a.width - 60, recipes.Count * rowH + 10);
            var vpC = new Rect(a.x + 10, a.y + 80, a.width - 20, a.height - (station == "armory" ? 290 : 90));
            _viewport = vpC;
            _scrollA = GUI.BeginScrollView(vpC, _scrollA, view);
            for (int i = 0; i < recipes.Count; i++)
            {
                var (rc, unlocked, can) = recipes[i];
                var r = new Rect(4, i * rowH, view.width - 8, rowH - 8);
                Fill(r, unlocked ? UiColors.Panel2 : new Color(0.07f, 0.08f, 0.09f, 0.95f));
                DrawItemIcon(new Rect(r.x + 6, r.y + 5, 56, 56), Items.Create(rc.output.id, Mathf.Max(1, rc.output.count)), false);
                Text(new Rect(r.x + 74, r.y + 4, r.width - 380, 28), rc.name + (rc.output.count > 1 ? " (×" + rc.output.count + ")" : ""), 17, unlocked ? UiColors.Text : UiColors.Muted, TextAnchor.MiddleLeft, true);
                string inputs = string.Join(", ", rc.inputs.Select(x => x.count + "× " + (Items.Def(x.id)?.name ?? x.id) + " (" + p.stash.Count(x.id) + ")"));
                Text(new Rect(r.x + 74, r.y + 32, r.width - 380, 30), inputs, 13, UiColors.Muted, TextAnchor.UpperLeft, false, true);
                if (!unlocked) Text(new Rect(r.xMax - 300, r.y, 290, r.height), "Ausbaustufe " + rc.requiresLevel + " nötig", 15, UiColors.Bad, TextAnchor.MiddleRight);
                else if (Btn(new Rect(r.xMax - 180, r.y + 12, 170, 42), "Herstellen", can, 16, UiColors.Good))
                {
                    var res = pm.Craft(rc.id);
                    Toast(res.ok ? rc.name + " hergestellt" : res.reason, res.ok ? "success" : "warning", 1600);
                }
            }
            GUI.EndScrollView();
            _viewport = null;
            if (station == "armory")
            {
                var rep = new Rect(a.x + 10, a.yMax - 200, a.width - 20, 190);
                Panel(rep, UiColors.Panel2);
                Text(new Rect(rep.x + 14, rep.y + 6, rep.width - 28, 28), "Reparieren (Werkstatt-Stufe senkt die Kosten)", 18, UiColors.Accent, TextAnchor.MiddleLeft, true);
                var damaged = p.equipment.All().Concat(p.stash.All()).Concat(p.loadout.All()).Where(it => pm.RepairCost(it) > 0).Take(12).ToList();
                if (damaged.Count == 0) Text(new Rect(rep.x + 14, rep.y + 40, rep.width - 28, 30), "Nichts beschädigt.", 16, UiColors.Muted);
                for (int i = 0; i < damaged.Count; i++)
                {
                    var it = damaged[i];
                    var r = new Rect(rep.x + 14 + (i % 6) * ((rep.width - 28) / 6f), rep.y + 40 + (i / 6) * 74, (rep.width - 28) / 6f - 8, 68);
                    DrawItemIcon(new Rect(r.x, r.y, 60, 60), it, false);
                    int cost = pm.RepairCost(it);
                    if (Btn(new Rect(r.x + 64, r.y + 12, r.width - 64, 38), M.FormatCredits(cost), p.credits >= cost, 13)) { var res = pm.Repair(it.uid); Toast(res.ok ? "Repariert" : res.reason, res.ok ? "success" : "warning", 1500); }
                }
            }
        }

        private void DrawMedbay(Rect a)
        {
            var p = Prof; var pm = game.core.profileMgr;
            var top = new Rect(a.x, a.y, a.width, 170);
            Panel(top);
            Text(new Rect(top.x + 20, top.y + 10, 600, 34), "Krankenstation · Stufe " + p.Up("medbay"), 24, UiColors.Accent, TextAnchor.MiddleLeft, true);
            Bar(new Rect(top.x + 20, top.y + 56, 420, 26), (float)p.hp, pm.HpMax(), UiColors.Hp, "Lebenspunkte " + M.Round(p.hp) + " / " + pm.HpMax());
            Bar(new Rect(top.x + 20, top.y + 90, 205, 20), (float)p.hunger, 100, UiColors.Food, "Hunger " + M.Round(p.hunger));
            Bar(new Rect(top.x + 235, top.y + 90, 205, 20), (float)p.thirst, 100, UiColors.Water, "Durst " + M.Round(p.thirst));
            int cost = pm.HealCost();
            if (Btn(new Rect(top.x + 480, top.y + 56, 340, 54), cost > 0 ? "Behandeln (" + M.FormatCredits(cost) + ")" : "Behandeln (kostenlos)", true, 18, UiColors.Good))
            {
                var r = pm.Heal();
                Toast(r.ok ? "Vollständig versorgt" : r.reason, r.ok ? "success" : "info", 2000);
            }
            Text(new Rect(top.x + 480, top.y + 118, top.width - 500, 40), "Füllt Lebenspunkte, Hunger und Durst auf. Ab Stufe 3 kostenlos.", 14, UiColors.Muted, TextAnchor.UpperLeft, false, true);
            DrawCrafting(new Rect(a.x, a.y + 180, a.width, a.height - 180), "medbay", "Medizin herstellen", "Verbände, Schmerzmittel und Medkits aus Material.");
        }

        private void DrawRadio(Rect a)
        {
            var p = Prof; var ms = game.core.missions;
            float half = a.width * 0.5f - 5;
            var left = new Rect(a.x, a.y, half, a.height);
            Panel(left);
            Text(new Rect(left.x + 16, left.y + 8, half - 32, 30), "Aktive Aufträge (" + p.missions.active.Count + "/" + ms.MaxActive(p) + ")", 20, UiColors.Accent, TextAnchor.MiddleLeft, true);
            float y = left.y + 48;
            foreach (var m in ms.Active(p))
            {
                Fill(new Rect(left.x + 10, y, half - 20, 2), UiColors.Line);
                Text(new Rect(left.x + 16, y + 6, half - 160, 26), m.title + " · " + DataTables.MAPS[m.mapId].short_name(), 17, UiColors.Text, TextAnchor.MiddleLeft, true);
                if (Btn(new Rect(left.xMax - 140, y + 6, 124, 30), "Abbrechen", true, 13, UiColors.Bad)) { var id = m.id; Confirm("Auftrag „" + m.title + "“ abbrechen? Der Fortschritt geht verloren.", () => ms.Abandon(p, id)); }
                y += 38;
                foreach (var o in ms.ProgressOf(p, m.id))
                {
                    Text(new Rect(left.x + 28, y, half - 200, 24), (o.done ? "✔ " : "• ") + o.def.text + " (" + o.progress + "/" + o.def.count + ")" + (o.optional ? " · optional" : ""), 14, o.done ? UiColors.Good : UiColors.Text, TextAnchor.MiddleLeft, false, true);
                    if (o.def.type == "collect" && !o.done && Btn(new Rect(left.xMax - 160, y, 144, 26), "Abgeben", ms.CanHandIn(p, m.id, o.def.id), 13, UiColors.Good))
                    {
                        var r = ms.HandIn(p, m.id, o.def.id);
                        if (!r.ok) Toast(r.reason, "warning", 1600);
                        else if (r.completed) Toast("Auftrag abgeschlossen: +" + M.FormatCredits(r.rewards.credits) + ", +" + r.rewards.xp + " EP", "success", 3500);
                    }
                    y += 26;
                }
                Text(new Rect(left.x + 28, y, half - 56, 22), "Belohnung: " + M.FormatCredits(m.rewards?.credits ?? 0) + ", " + (m.rewards?.xp ?? 0) + " EP" + (m.rewards?.items != null && m.rewards.items.Length > 0 ? ", " + string.Join(", ", m.rewards.items.Select(i => i.count + "× " + Items.Def(i.id)?.name)) : ""), 13, UiColors.Accent);
                y += 34;
                if (y > left.yMax - 40) break;
            }
            var right = new Rect(a.x + half + 10, a.y, half, a.height);
            Panel(right);
            Text(new Rect(right.x + 16, right.y + 8, half - 32, 30), "Verfügbare Aufträge", 20, UiColors.Accent, TextAnchor.MiddleLeft, true);
            var avail = ms.AvailableFor(p);
            var locked = ms.LockedFor(p);
            float rowH = 122;
            var view = new Rect(0, 0, half - 40, avail.Count * rowH + locked.Count * 40 + 60);
            _scrollB = GUI.BeginScrollView(new Rect(right.x + 6, right.y + 44, half - 12, right.height - 50), _scrollB, view);
            y = 0;
            foreach (var m in avail)
            {
                var r = new Rect(4, y, view.width - 8, rowH - 8);
                Fill(r, UiColors.Panel2);
                Text(new Rect(r.x + 12, r.y + 4, r.width - 170, 26), m.title, 17, UiColors.Text, TextAnchor.MiddleLeft, true);
                Text(new Rect(r.x + 12, r.y + 28, r.width - 170, 20), DataTables.MAPS[m.mapId].name + " · Gefahr " + m.difficulty + (m.repeatable ? " · wiederholbar" : ""), 13, UiColors.Muted);
                Text(new Rect(r.x + 12, r.y + 48, r.width - 24, 44), m.desc, 13, new Color(0.75f, 0.78f, 0.8f), TextAnchor.UpperLeft, false, true);
                Text(new Rect(r.x + 12, r.y + 92, r.width - 24, 20), "Belohnung: " + M.FormatCredits(m.rewards?.credits ?? 0) + ", " + (m.rewards?.xp ?? 0) + " EP", 13, UiColors.Accent);
                if (Btn(new Rect(r.xMax - 150, r.y + 8, 140, 36), "Annehmen", p.missions.active.Count < ms.MaxActive(p), 14, UiColors.Good))
                {
                    var res = ms.Accept(p, m.id);
                    Toast(res.ok ? "Auftrag angenommen: " + m.title : res.reason, res.ok ? "success" : "warning", 2000);
                }
                y += rowH;
            }
            if (locked.Count > 0) { Text(new Rect(8, y + 6, view.width, 26), "Gesperrt", 16, UiColors.Muted, TextAnchor.MiddleLeft, true); y += 34; }
            foreach (var (def, reason) in locked) { Text(new Rect(12, y, view.width - 16, 34), def.title + " – " + reason, 13, UiColors.Muted, TextAnchor.MiddleLeft, false, true); y += 40; }
            GUI.EndScrollView();
        }

        private void DrawUpgrades(Rect a)
        {
            var p = Prof; var pm = game.core.profileMgr;
            float cw = (a.width - 20) / 3f, ch = (a.height - 10) / 2f;
            for (int i = 0; i < Profile.UpgradeAreas.Length; i++)
            {
                string area = Profile.UpgradeAreas[i];
                var r = new Rect(a.x + (i % 3) * (cw + 10), a.y + (i / 3) * (ch + 10), cw, ch);
                Panel(r);
                int lvl = p.Up(area);
                Text(new Rect(r.x + 16, r.y + 10, r.width - 32, 32), ProfileManager.AreaNames[area], 22, UiColors.Accent, TextAnchor.MiddleLeft, true);
                Text(new Rect(r.x + 16, r.y + 10, r.width - 32, 32), "Stufe " + lvl + "/3", 16, UiColors.Text, TextAnchor.MiddleRight, true);
                for (int k = 0; k < 3; k++) Fill(new Rect(r.x + 16 + k * ((r.width - 40) / 3f + 4), r.y + 48, (r.width - 40) / 3f, 8), k < lvl ? UiColors.Good : new Color(0.15f, 0.17f, 0.19f));
                float y = r.y + 70;
                if (lvl > 0)
                {
                    var cur = ProfileManager.UpgradeInfo(area, lvl);
                    Text(new Rect(r.x + 16, y, r.width - 32, 50), "Aktuell: " + cur.desc, 14, UiColors.Muted, TextAnchor.UpperLeft, false, true);
                    y += 52;
                }
                var c = pm.CanUpgrade(area);
                if (lvl >= 3) { Text(new Rect(r.x + 16, y, r.width - 32, 30), "Voll ausgebaut", 18, UiColors.Good, TextAnchor.MiddleLeft, true); continue; }
                var next = ProfileManager.UpgradeInfo(area, lvl + 1);
                Text(new Rect(r.x + 16, y, r.width - 32, 26), next.name, 17, UiColors.Text, TextAnchor.MiddleLeft, true); y += 28;
                Text(new Rect(r.x + 16, y, r.width - 32, 60), next.desc, 14, new Color(0.78f, 0.8f, 0.82f), TextAnchor.UpperLeft, false, true); y += 62;
                string cost = M.FormatCredits(next.cost?.credits ?? 0);
                if (next.cost?.items != null) cost += ", " + string.Join(", ", next.cost.items.Select(it => it.count + "× " + Items.Def(it.id)?.name + " (" + p.stash.Count(it.id) + ")"));
                Text(new Rect(r.x + 16, y, r.width - 32, 50), "Kosten: " + cost, 14, UiColors.Accent, TextAnchor.UpperLeft, false, true);
                if (Btn(new Rect(r.x + 16, r.yMax - 58, r.width - 32, 44), c.ok ? "Ausbauen" : c.reason, c.ok, 15, UiColors.Good))
                {
                    var res = pm.Upgrade(area);
                    Toast(res.ok ? ProfileManager.AreaNames[area] + " ausgebaut" : res.reason, res.ok ? "success" : "warning", 2000);
                }
            }
        }

        private void DrawStats(Rect a)
        {
            var p = Prof;
            var left = new Rect(a.x, a.y, a.width * 0.45f, a.height);
            Panel(left);
            Text(new Rect(left.x + 16, left.y + 8, left.width - 32, 30), "Statistik", 20, UiColors.Accent, TextAnchor.MiddleLeft, true);
            float y = left.y + 48;
            void Row(string k, string v) { Text(new Rect(left.x + 20, y, left.width * 0.6f, 26), k, 16, UiColors.Muted); Text(new Rect(left.x + 20, y, left.width - 40, 26), v, 16, UiColors.Text, TextAnchor.MiddleRight, true); y += 28; }
            Row("Einsätze", M.Round(p.Stat("raids")).ToString());
            Row("Extraktionen", M.Round(p.Stat("extractions")).ToString());
            Row("Gestorben", M.Round(p.Stat("deaths")).ToString());
            Row("Vermisst", M.Round(p.Stat("mia")).ToString());
            Row("Erledigte Infizierte", M.Round(p.Stat("kills")).ToString());
            Row("Trefferquote", p.Stat("shotsFired") > 0 ? M.Pct(p.Stat("shotsHit") / p.Stat("shotsFired")) : "–");
            Row("Behälter durchsucht", M.Round(p.Stat("containersOpened")).ToString());
            Row("Aufträge erledigt", M.Round(p.Stat("missionsCompleted")).ToString());
            Row("Gegenstände hergestellt", M.Round(p.Stat("itemsCrafted")).ToString());
            Row("Bester Einsatz (Beutewert)", M.FormatCredits(p.Stat("bestRaidValue")));
            Row("Verdiente Credits", M.FormatCredits(p.Stat("creditsEarned")));
            Row("Zurückgelegte Strecke", M.Round(p.Stat("distance")) + " m");
            Row("Spielzeit", M.FormatTime(p.Stat("playTime")));
            y += 10;
            foreach (var kv in p.killsByType.OrderByDescending(k => k.Value))
                if (DataTables.ZOMBIE_TYPES.TryGetValue(kv.Key, out var zt)) Row("  " + zt.name, kv.Value.ToString());
            var right = new Rect(a.x + a.width * 0.45f + 10, a.y, a.width * 0.55f - 10, a.height);
            Panel(right);
            Text(new Rect(right.x + 16, right.y + 8, right.width - 32, 30), "Erfolge (" + p.achievements.Count + "/" + Achievements.List.Length + ")", 20, UiColors.Accent, TextAnchor.MiddleLeft, true);
            y = right.y + 48;
            foreach (var ach in Achievements.List)
            {
                bool have = p.achievements.Contains(ach.id);
                Fill(new Rect(right.x + 14, y, right.width - 28, 50), have ? new Color(0.12f, 0.18f, 0.12f, 0.95f) : UiColors.Panel2);
                Text(new Rect(right.x + 26, y + 2, right.width - 52, 24), (have ? "★ " : "☆ ") + ach.name, 16, have ? UiColors.Accent : UiColors.Muted, TextAnchor.MiddleLeft, true);
                Text(new Rect(right.x + 26, y + 25, right.width - 52, 22), ach.desc, 13, UiColors.Muted);
                y += 56;
            }
        }
    }

    internal static class MapDefExtensions
    {
        public static string short_name(this MapDef m) => m.@short ?? m.name;
    }
}
