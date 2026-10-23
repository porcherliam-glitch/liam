using System.Collections.Generic;
using DeadZone.Core;
using UnityEngine;

namespace DeadZone.Game
{
    /// <summary>
    /// Immediate-mode interface (Unity IMGUI): needs no assets, fonts or canvas setup. Everything is laid out on a
    /// virtual 1080-pixel-high canvas that scales with the window.
    /// </summary>
    public sealed partial class UiRoot : MonoBehaviour
    {
        public GameRoot game;
        private float _scale = 1f;
        private float W, H;
        private Texture2D _white;
        private readonly Dictionary<long, GUIStyle> _styles = new Dictionary<long, GUIStyle>();

        private sealed class ToastMsg { public string text; public Color color; public float life, max; }
        private readonly List<ToastMsg> _toasts = new List<ToastMsg>();
        private sealed class Floating { public Vector3 pos; public string text; public Color color; public bool big; public float life; }
        private readonly List<Floating> _floating = new List<Floating>();
        private float _hitMarker, _damageFlash, _flashBang;
        private readonly List<(float angle, float life)> _hitDirs = new List<(float, float)>();

        // overlays
        public bool inventoryOpen, mapOpen, helpOpen, settingsOpen;
        public Container lootContainer;
        private string _confirm;
        private System.Action _confirmYes;

        public bool BlocksGameplay => inventoryOpen || lootContainer != null || mapOpen || helpOpen || settingsOpen || _confirm != null;

        public void ResetOverlays()
        {
            inventoryOpen = mapOpen = helpOpen = settingsOpen = false;
            lootContainer = null;
            _confirm = null;
            _selected = null;
            _drag = null;
            _floating.Clear();
        }

        // ------------------------------------------------------------------ feedback API
        public void Toast(string text, string kind, float ms)
        {
            if (string.IsNullOrEmpty(text)) return;
            foreach (var t in _toasts) if (t.text == text) { t.life = Mathf.Max(t.life, ms / 1000f); return; }
            _toasts.Add(new ToastMsg { text = text, color = UiColors.Kind(kind), life = ms / 1000f, max = ms / 1000f });
            if (_toasts.Count > 6) _toasts.RemoveAt(0);
        }

        public void HitMarker() { _hitMarker = 0.18f; }
        public void FloatingText(Vector3 pos, string text, string color, bool big) { if (_floating.Count < 60) _floating.Add(new Floating { pos = pos, text = text, color = Mats.Hex(color, Color.white), big = big, life = big ? 1.4f : 0.9f }); }
        public void DamageFlash(float a) { _damageFlash = Mathf.Max(_damageFlash, a); }
        public void FlashBang(float a) { _flashBang = Mathf.Max(_flashBang, a * 2.5f); }
        public void HitDirection(double angle) { _hitDirs.Add(((float)angle, 1.2f)); if (_hitDirs.Count > 6) _hitDirs.RemoveAt(0); }

        public void OpenLoot(Container c)
        {
            lootContainer = c;
            inventoryOpen = false;
            _selected = null;
        }

        private void Confirm(string text, System.Action yes) { _confirm = text; _confirmYes = yes; }

        // ------------------------------------------------------------------ drawing primitives
        private Texture2D White
        {
            get
            {
                if (_white != null) return _white;
                _white = new Texture2D(1, 1, TextureFormat.RGBA32, false);
                _white.SetPixel(0, 0, Color.white);
                _white.Apply();
                return _white;
            }
        }

        private void Fill(Rect r, Color c)
        {
            if (Event.current.type != EventType.Repaint) return;
            var old = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(r, White);
            GUI.color = old;
        }

        private void Frame(Rect r, Color c, float t = 1f)
        {
            Fill(new Rect(r.x, r.y, r.width, t), c);
            Fill(new Rect(r.x, r.yMax - t, r.width, t), c);
            Fill(new Rect(r.x, r.y, t, r.height), c);
            Fill(new Rect(r.xMax - t, r.y, t, r.height), c);
        }

        private void Panel(Rect r, Color? c = null)
        {
            Fill(r, c ?? UiColors.Panel);
            Frame(r, UiColors.Line);
        }

        private GUIStyle Style(int size, bool bold, TextAnchor anchor, bool wrap)
        {
            long key = size * 1000 + (bold ? 100 : 0) + (int)anchor * 2 + (wrap ? 1 : 0);
            if (_styles.TryGetValue(key, out var s)) return s;
            s = new GUIStyle(GUI.skin.label) { fontSize = size, fontStyle = bold ? FontStyle.Bold : FontStyle.Normal, alignment = anchor, wordWrap = wrap, richText = true, clipping = TextClipping.Clip };
            s.padding = new RectOffset(0, 0, 0, 0);
            s.margin = new RectOffset(0, 0, 0, 0);
            _styles[key] = s;
            return s;
        }

        private void Text(Rect r, string text, int size = 18, Color? color = null, TextAnchor anchor = TextAnchor.MiddleLeft, bool bold = false, bool wrap = false)
        {
            var s = Style(size, bold, anchor, wrap);
            s.normal.textColor = color ?? UiColors.Text;
            GUI.Label(r, text, s);
        }

        private float TextHeight(string text, float width, int size)
        {
            var s = Style(size, false, TextAnchor.UpperLeft, true);
            return s.CalcHeight(new GUIContent(text), width);
        }

        private bool Hover(Rect r) => r.Contains(Event.current.mousePosition);

        private bool Btn(Rect r, string label, bool enabled = true, int size = 18, Color? accent = null, string tooltip = null)
        {
            bool hover = enabled && Hover(r);
            var a = accent ?? UiColors.Accent;
            Fill(r, !enabled ? new Color(0.09f, 0.1f, 0.11f, 0.9f) : hover ? new Color(a.r * 0.35f, a.g * 0.35f, a.b * 0.35f, 0.98f) : UiColors.Panel2);
            Frame(r, enabled ? (hover ? a : new Color(a.r * 0.6f, a.g * 0.6f, a.b * 0.6f)) : UiColors.Line);
            Text(r, label, size, enabled ? (hover ? Color.white : UiColors.Text) : UiColors.Muted, TextAnchor.MiddleCenter, true);
            if (hover && tooltip != null) _tooltipText = tooltip;
            bool clicked = GUI.Button(r, GUIContent.none, GUIStyle.none) && enabled;
            if (clicked) game.audioSys.Play("ui_click", null, 0.6f);
            return clicked;
        }

        private void Bar(Rect r, float value, float max, Color color, string label = null, int size = 14)
        {
            Fill(r, new Color(0, 0, 0, 0.6f));
            float k = max > 0 ? Mathf.Clamp01(value / max) : 0;
            Fill(new Rect(r.x + 1, r.y + 1, (r.width - 2) * k, r.height - 2), color);
            Frame(r, new Color(1, 1, 1, 0.12f));
            if (label != null) Text(r, label, size, Color.white, TextAnchor.MiddleCenter, true);
        }

        private string _tooltipText;

        // ------------------------------------------------------------------ main loop
        private void Update()
        {
            float dt = Time.unscaledDeltaTime;
            for (int i = _toasts.Count - 1; i >= 0; i--) { _toasts[i].life -= dt; if (_toasts[i].life <= 0) _toasts.RemoveAt(i); }
            for (int i = _floating.Count - 1; i >= 0; i--) { _floating[i].life -= dt; _floating[i].pos += Vector3.up * dt * 1.2f; if (_floating[i].life <= 0) _floating.RemoveAt(i); }
            for (int i = _hitDirs.Count - 1; i >= 0; i--) { var h = _hitDirs[i]; h.life -= dt; if (h.life <= 0) _hitDirs.RemoveAt(i); else _hitDirs[i] = h; }
            _hitMarker = Mathf.Max(0, _hitMarker - dt);
            _damageFlash = Mathf.Max(0, _damageFlash - dt * 1.8f);
            _flashBang = Mathf.Max(0, _flashBang - dt * 0.8f);
            HandleKeys();
            bool hideCursor = game.state == "raid" && !BlocksGameplay && !game.paused && !game.input.usingGamepad;
            Cursor.visible = !hideCursor;
        }

        private void HandleKeys()
        {
            var inp = game.input;
            if (inp.UiPressed("help")) helpOpen = !helpOpen;
            if (game.state == "raid" && game.Raid != null && !game.Raid.ended)
            {
                if (inp.UiPressed("pause"))
                {
                    if (_confirm != null) _confirm = null;
                    else if (settingsOpen) settingsOpen = false;
                    else if (helpOpen) helpOpen = false;
                    else if (lootContainer != null) lootContainer = null;
                    else if (inventoryOpen) inventoryOpen = false;
                    else if (mapOpen) mapOpen = false;
                    else game.paused = !game.paused;
                }
                if (!game.paused && _confirm == null)
                {
                    if (inp.UiPressed("inventory")) { if (lootContainer != null) lootContainer = null; else inventoryOpen = !inventoryOpen; _selected = null; }
                    if (inp.UiPressed("map")) mapOpen = !mapOpen;
                    if (inp.UiPressed("drop") && (inventoryOpen || lootContainer != null) && _selected != null) RaidDropSelected();
                }
                if (lootContainer != null)
                {
                    var p = game.Raid.player;
                    if (M.Dist(p.x, p.y, lootContainer.x, lootContainer.y) > 90) lootContainer = null;
                }
            }
            else if (inp.UiPressed("pause"))
            {
                if (_confirm != null) _confirm = null;
                else if (settingsOpen) settingsOpen = false;
                else if (helpOpen) helpOpen = false;
                else if (game.state == "base" && _baseTab != "overview") _baseTab = "overview";
            }
        }

        private void OnGUI()
        {
            _scale = Mathf.Clamp(Screen.height / 1080f, 0.55f, 3f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(_scale, _scale, 1f));
            W = Screen.width / _scale;
            H = Screen.height / _scale;
            _tooltipText = null;
            if (Event.current.type == EventType.Repaint) _dropTargets.Clear();
            HandleDragRelease();
            _hoverItem = null;
            // modal windows disable everything drawn below them
            GUI.enabled = !(settingsOpen || helpOpen || _confirm != null);
            switch (game.state)
            {
                case "menu": DrawMainMenu(); break;
                case "base": DrawBase(); break;
                case "raid": DrawRaid(); break;
                case "result": DrawResult(); break;
            }
            GUI.enabled = !(helpOpen || _confirm != null);
            if (settingsOpen) DrawSettings();
            GUI.enabled = _confirm == null;
            if (helpOpen) DrawHelp();
            GUI.enabled = true;
            if (_confirm != null) DrawConfirm();
            DrawToasts();
            DrawDragAndTooltip();
        }

        private void DrawToasts()
        {
            float y = 70, w = 620;
            foreach (var t in _toasts)
            {
                float h = Mathf.Max(40, TextHeight(t.text, w - 30, 18) + 18);
                float a = Mathf.Clamp01(t.life / 0.3f);
                var r = new Rect(W / 2 - w / 2, y, w, h);
                Fill(r, new Color(0.04f, 0.05f, 0.06f, 0.92f * a));
                Fill(new Rect(r.x, r.y, 5, r.height), new Color(t.color.r, t.color.g, t.color.b, a));
                Text(new Rect(r.x + 18, r.y, r.width - 28, r.height), t.text, 18, new Color(1, 1, 1, a), TextAnchor.MiddleLeft, false, true);
                y += h + 6;
            }
        }

        private void DrawConfirm()
        {
            Fill(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.6f));
            var r = new Rect(W / 2 - 330, H / 2 - 120, 660, 240);
            Panel(r, UiColors.Bg);
            Text(new Rect(r.x + 30, r.y + 20, r.width - 60, 130), _confirm, 22, UiColors.Text, TextAnchor.MiddleCenter, false, true);
            if (Btn(new Rect(r.x + 60, r.yMax - 70, 240, 48), "Ja", true, 20, UiColors.Bad)) { var a = _confirmYes; _confirm = null; a?.Invoke(); }
            if (Btn(new Rect(r.xMax - 300, r.yMax - 70, 240, 48), "Abbrechen")) _confirm = null;
        }
    }
}
