using System.Linq;
using DeadZone.Core;
using DeadZone.Core.Data;
using UnityEngine;

namespace DeadZone.Game
{
    public sealed partial class UiRoot
    {
        // ------------------------------------------------------------------ main menu
        private void DrawMainMenu()
        {
            Fill(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.35f));
            Fill(new Rect(0, 0, 640, H), new Color(0.02f, 0.03f, 0.035f, 0.8f));
            Text(new Rect(70, 120, 560, 80), "DEAD ZONE", 76, UiColors.Accent, TextAnchor.MiddleLeft, true);
            Text(new Rect(74, 195, 560, 40), "E X T R A C T I O N", 28, UiColors.Text, TextAnchor.MiddleLeft, true);
            Text(new Rect(74, 240, 520, 60), "Plündern. Überleben. Rauskommen. Wer stirbt, verliert alles am Körper.", 18, UiColors.Muted, TextAnchor.UpperLeft, false, true);
            float y = 340;
            bool hasSave = HasSaveCached();
            if (Btn(new Rect(70, y, 420, 58), hasSave ? "Weiterspielen" : "Weiterspielen (kein Spielstand)", hasSave, 22)) game.ContinueGame();
            y += 72;
            if (Btn(new Rect(70, y, 420, 58), "Neues Spiel", true, 22))
            {
                if (hasSave) Confirm("Ein neues Spiel überschreibt deinen bisherigen Spielstand. Wirklich neu anfangen?", game.NewGame);
                else game.NewGame();
            }
            y += 72;
            if (Btn(new Rect(70, y, 420, 58), "Einstellungen", true, 22)) settingsOpen = true;
            y += 72;
            if (Btn(new Rect(70, y, 420, 58), "Steuerung", true, 22)) helpOpen = true;
            y += 72;
            if (Btn(new Rect(70, y, 420, 58), "Beenden", true, 22, UiColors.Bad)) game.QuitGame();
            Text(new Rect(70, H - 60, 560, 30), "Version 3D 1.0 · Unity · alle Grafiken und Töne werden im Spiel erzeugt", 14, UiColors.Muted);
        }

        // ------------------------------------------------------------------ settings
        private float Slider(Rect r, string label, float value, System.Func<float, string> format = null)
        {
            Text(new Rect(r.x, r.y, 220, r.height), label, 18);
            var track = new Rect(r.x + 230, r.y + r.height / 2 - 4, r.width - 370, 8);
            Fill(track, new Color(0, 0, 0, 0.6f));
            Fill(new Rect(track.x, track.y, track.width * value, track.height), UiColors.Accent);
            Fill(new Rect(track.x + track.width * value - 7, track.y - 8, 14, 24), Color.white);
            Text(new Rect(r.xMax - 120, r.y, 120, r.height), format != null ? format(value) : Mathf.RoundToInt(value * 100) + " %", 18, UiColors.Muted, TextAnchor.MiddleRight);
            var e = Event.current;
            var hit = new Rect(track.x - 10, r.y, track.width + 20, r.height);
            if (GUI.enabled && (e.type == EventType.MouseDown || e.type == EventType.MouseDrag) && hit.Contains(e.mousePosition))
            {
                value = Mathf.Clamp01((e.mousePosition.x - track.x) / track.width);
                e.Use();
            }
            return value;
        }

        private bool Toggle(Rect r, string label, bool value)
        {
            Text(new Rect(r.x, r.y, r.width - 140, r.height), label, 18);
            if (Btn(new Rect(r.xMax - 130, r.y + 4, 130, r.height - 8), value ? "An" : "Aus", true, 16, value ? UiColors.Good : UiColors.Muted)) value = !value;
            return value;
        }

        private void DrawSettings()
        {
            Fill(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.55f));
            // two columns so everything fits on a 4:3 screen too
            float pw = Mathf.Min(1240f, W - 40f);
            var r = new Rect(W / 2 - pw / 2, H / 2 - 330, pw, 660);
            Panel(r, UiColors.Bg);
            Text(new Rect(r.x + 30, r.y + 20, 500, 40), "Einstellungen", 30, UiColors.Accent, TextAnchor.MiddleLeft, true);
            var s = game.core.settings;
            float colW = (r.width - 120) / 2;
            float y = r.y + 90, x = r.x + 40, w = colW;
            Text(new Rect(x, y - 30, w, 26), "Ton und Anzeige", 16, UiColors.Muted, TextAnchor.MiddleLeft, true);
            s.master = Slider(new Rect(x, y, w, 40), "Gesamtlautstärke", (float)s.master); y += 52;
            s.sfx = Slider(new Rect(x, y, w, 40), "Effekte", (float)s.sfx); y += 52;
            s.music = Slider(new Rect(x, y, w, 40), "Atmosphäre", (float)s.music); y += 64;
            s.screenShake = Toggle(new Rect(x, y, w, 44), "Bildschirmwackeln", s.screenShake); y += 52;
            s.damageNumbers = Toggle(new Rect(x, y, w, 44), "Schadenszahlen", s.damageNumbers); y += 52;
            s.minimap = Toggle(new Rect(x, y, w, 44), "Minikarte", s.minimap); y += 52;
            s.showFps = Toggle(new Rect(x, y, w, 44), "Bilder pro Sekunde anzeigen", s.showFps); y += 60;
            Text(new Rect(x, y, 200, 44), "Grafikqualität", 18);
            string[] q = { "low", "medium", "high" }; string[] qn = { "Niedrig", "Mittel", "Hoch" };
            float qw = (w - 200) / 3;
            for (int i = 0; i < 3; i++)
                if (Btn(new Rect(x + 200 + i * qw, y + 2, qw - 8, 40), qn[i], true, 16, s.quality == q[i] ? UiColors.Good : UiColors.Muted)) s.quality = q[i];

            // right column: camera and controls
            x = r.x + 80 + colW; y = r.y + 90;
            Text(new Rect(x, y - 30, w, 26), "Kamera und Steuerung", 16, UiColors.Muted, TextAnchor.MiddleLeft, true);
            Text(new Rect(x, y, 200, 44), "Ansicht", 18);
            float vw = (w - 200) / 2;
            if (Btn(new Rect(x + 200, y + 2, vw - 8, 40), "Ego-Perspektive", true, 15, s.view != "topdown" ? UiColors.Good : UiColors.Muted)) s.view = "fps";
            if (Btn(new Rect(x + 200 + vw, y + 2, vw - 8, 40), "Von oben", true, 15, s.view == "topdown" ? UiColors.Good : UiColors.Muted)) s.view = "topdown";
            y += 60;
            s.mouseSens = Slider(new Rect(x, y, w, 40), "Mausempfindlichkeit", (float)s.mouseSens); y += 52;
            // stored as the vertical angle (Unity's camera); the label also shows the width on a 16:9 screen
            float fov01 = Slider(new Rect(x, y, w, 40), "Sichtfeld", (float)((s.fov - 55) / 35), v => Mathf.RoundToInt(55 + 35 * v) + "° / " + Mathf.RoundToInt(Camera.VerticalToHorizontalFieldOfView(55 + 35 * v, 16f / 9f)) + "°");
            s.fov = Mathf.Round(55 + 35 * fov01); y += 52;
            s.invertY = Toggle(new Rect(x, y, w, 44), "Maus hoch/runter umkehren", s.invertY); y += 52;
            s.headBob = Toggle(new Rect(x, y, w, 44), "Kopfwippen beim Laufen", s.headBob); y += 60;
            Text(new Rect(x, y, w, 120), "Ego-Perspektive: Maus = umsehen, rechte Maustaste = zoomen, Mausrad = Waffe wechseln. Mit V wechselst du im Einsatz jederzeit die Ansicht. Esc gibt die Maus frei.", 15, UiColors.Muted, TextAnchor.UpperLeft, false, true);
            game.ApplySettings();
            if (Btn(new Rect(r.xMax - 260, r.yMax - 70, 220, 48), "Fertig", true, 20)) { settingsOpen = false; game.SaveSettings(); }
        }

        // ------------------------------------------------------------------ help
        private void DrawHelp()
        {
            Fill(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.55f));
            var r = new Rect(W / 2 - 480, H / 2 - 440, 960, 880);
            Panel(r, UiColors.Bg);
            Text(new Rect(r.x + 30, r.y + 18, 600, 44), "Steuerung", 30, UiColors.Accent, TextAnchor.MiddleLeft, true);
            string[,] rows =
            {
                { "W A S D", "Bewegen (in Blickrichtung)" }, { "Maus", "Umsehen und zielen (Ego-Perspektive) – von oben: auf das Ziel zeigen" },
                { "Linke Maustaste", "Schießen (gedrückt halten = Dauerfeuer)" }, { "Rechte Maustaste", "Heranzoomen (Ego-Perspektive)" }, { "R", "Nachladen" },
                { "E", "Benutzen: Kisten, Türen, Beute (hinschauen) – Generator: gedrückt halten" }, { "Shift", "Sprinten" }, { "C / Strg", "Ducken (leiser, ruhiger zielen)" },
                { "F", "Taschenlampe" }, { "Tab / I", "Inventar" }, { "M", "Karte" }, { "G", "Granate werfen (nach oben schauen = weiter)" }, { "Q", "Schnellheilung" },
                { "1 – 5", "Primär, Sekundär, Nahkampf, Granate, Medizin" }, { "Mausrad", "Waffe wechseln 1–3 (Ego-Perspektive) / Kamera zoomen (von oben)" },
                { "X", "Ausgewählten Gegenstand ablegen (im Inventar)" },
                { "V", "Ansicht wechseln: Ego-Perspektive oder von oben" }, { "Esc", "Pause / Fenster schließen (gibt die Maus frei)" }, { "F1", "Diese Hilfe" },
                { "Gamepad", "Linker Stick bewegen, rechter Stick umsehen, RT schießen, LT zoomen, A benutzen, X nachladen, B ducken, LB sprinten, RB Granate, R3 Ansicht" },
            };
            float y = r.y + 76;
            for (int i = 0; i < rows.GetLength(0); i++)
            {
                float h = i == rows.GetLength(0) - 1 ? 80 : 34;
                Fill(new Rect(r.x + 30, y, 250, h - 4), UiColors.Panel2);
                Text(new Rect(r.x + 40, y, 240, h - 4), rows[i, 0], 17, UiColors.Accent, TextAnchor.MiddleLeft, true);
                Text(new Rect(r.x + 300, y, r.width - 330, h - 4), rows[i, 1], 16, UiColors.Text, TextAnchor.MiddleLeft, false, true);
                y += h;
            }
            Text(new Rect(r.x + 30, r.yMax - 70, r.width - 300, 50), "Ziel: Beute finden, Aufträge erfüllen und an einem Extraktionspunkt (grüner Lichtstrahl) lebend raus. Neu laden während eines Einsatzes zählt als vermisst.", 15, UiColors.Muted, TextAnchor.MiddleLeft, false, true);
            if (Btn(new Rect(r.xMax - 230, r.yMax - 66, 200, 46), "Schließen")) helpOpen = false;
        }

        // ------------------------------------------------------------------ result
        private Vector2 _resultScroll;

        private void DrawResult()
        {
            var res = game.lastResult;
            if (res == null) { game.LeaveResult(); return; }
            if (res.outcome == "death" && game.FirstPerson)
            {
                // first person: let the death camera play before the summary covers it
                float k = Mathf.Clamp01((Time.unscaledTime - resultAt - 0.9f) / 0.6f);
                if (k < 1f)
                {
                    Fill(new Rect(0, 0, W, H), new Color(0.15f, 0, 0, 0.35f + 0.37f * k));
                    Text(new Rect(0, H / 2 - 50, W, 100), "GETÖTET", 64, new Color(UiColors.Bad.r, UiColors.Bad.g, UiColors.Bad.b, Mathf.Clamp01(k * 2f + 0.2f)), TextAnchor.MiddleCenter, true);
                    return;
                }
            }
            Fill(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.72f));
            bool ok = res.outcome == "extracted";
            string title = ok ? "EXTRAKTION ERFOLGREICH" : res.outcome == "mia" ? "VERMISST" : res.outcome == "abort" ? "EINSATZ ABGEBROCHEN" : "GETÖTET";
            var r = new Rect(W / 2 - 600, 60, 1200, H - 120);
            Panel(r, UiColors.Bg);
            Text(new Rect(r.x, r.y + 20, r.width, 60), title, 48, ok ? UiColors.Good : UiColors.Bad, TextAnchor.MiddleCenter, true);
            string sub = ok ? res.mapName + " · " + res.extractionName : res.mapName + " · " + (res.causeOfDeath ?? "");
            Text(new Rect(r.x, r.y + 80, r.width, 30), sub, 20, UiColors.Muted, TextAnchor.MiddleCenter);
            float x = r.x + 40, y = r.y + 130, colW = 360;
            void Row(string a, string b) { Text(new Rect(x, y, 220, 30), a, 18, UiColors.Muted); Text(new Rect(x + 210, y, colW - 210, 30), b, 18, UiColors.Text, TextAnchor.MiddleRight, true); y += 32; }
            Row("Dauer", M.FormatTime(res.durationSec));
            Row("Erledigte Infizierte", res.kills.ToString());
            Row("Trefferquote", M.Pct(res.accuracy));
            Row("Behälter durchsucht", res.containersOpened.ToString());
            Row("Strecke", res.distance + " m");
            Row("Schaden erhalten", res.damageTaken.ToString());
            Row("Beutewert", M.FormatCredits(res.lootValue));
            Row("Erfahrung", "+" + res.xpGained + " EP");
            Row("Credits", "+" + M.FormatCredits(res.creditsGained));
            Row("Stufe", res.levelBefore + (res.leveledUp ? " → " + res.levelAfter : ""));
            y += 10;
            foreach (var m in res.missionsCompleted) { Text(new Rect(x, y, colW, 28), "✔ " + m.title, 17, UiColors.Good); y += 28; }
            foreach (var m in res.missionsFailed) { Text(new Rect(x, y, colW, 28), "✘ " + m.title, 17, UiColors.Bad); y += 28; }
            foreach (var a in res.achievements)
            {
                var def = Achievements.List.FirstOrDefault(q => q.id == a);
                if (def != null) { Text(new Rect(x, y, colW, 28), "★ Erfolg: " + def.name, 17, UiColors.Accent); y += 28; }
            }
            // item lists
            var listRect = new Rect(r.x + 440, r.y + 130, r.width - 480, r.height - 230);
            Panel(listRect, UiColors.Panel);
            var items = ok ? res.itemsKept : res.itemsLost;
            Text(new Rect(listRect.x + 16, listRect.y + 8, 600, 30), ok ? "Gesichert (" + items.Count + ")" : "Verloren (" + items.Count + ")", 20, ok ? UiColors.Good : UiColors.Bad, TextAnchor.MiddleLeft, true);
            float cell = 76;
            int cols = Mathf.Max(1, (int)((listRect.width - 32) / cell));
            var extra = ok ? res.itemsSold.Select(s => (s.inst, "Verkauft +" + s.credits)).ToList() : res.itemsKept.Select(s => (s.inst, "Gerettet (sicherer Behälter)")).ToList();
            int total = items.Count + extra.Count + res.insuranceReturned.Count;
            var view = new Rect(0, 0, listRect.width - 40, Mathf.Ceil(total / (float)cols) * cell + 40);
            var vp = new Rect(listRect.x + 10, listRect.y + 44, listRect.width - 20, listRect.height - 54);
            _viewport = vp;
            _resultScroll = GUI.BeginScrollView(vp, _resultScroll, view);
            int i = 0;
            foreach (var it in items) { DrawItemIcon(new Rect((i % cols) * cell, (i / cols) * cell, cell - 6, cell - 6), it.inst, false, it.equipped ? "Ausgerüstet" : null); i++; }
            foreach (var (inst, label) in extra) { DrawItemIcon(new Rect((i % cols) * cell, (i / cols) * cell, cell - 6, cell - 6), inst, false, label); i++; }
            foreach (var inst in res.insuranceReturned) { DrawItemIcon(new Rect((i % cols) * cell, (i / cols) * cell, cell - 6, cell - 6), inst, false, "Versichert"); i++; }
            GUI.EndScrollView();
            _viewport = null;
            if (Btn(new Rect(r.x + r.width / 2 - 170, r.yMax - 80, 340, 56), "Zur Basis", true, 22)) game.LeaveResult();
            Text(new Rect(r.x + r.width / 2 + 180, r.yMax - 80, 300, 56), game.input.usingGamepad ? "oder A" : "oder Enter", 15, UiColors.Muted);
        }
    }
}
