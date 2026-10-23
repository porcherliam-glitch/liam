using System.Collections.Generic;
using DeadZone.Core;
using UnityEngine;
#if DZ_INPUT_SYSTEM && ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace DeadZone.Game
{
    /// <summary>
    /// Keyboard/mouse and gamepad input. Uses the Input System package when it is active, otherwise the old Input Manager.
    /// Presses are buffered until the next fixed simulation step consumes them.
    /// </summary>
    public sealed class InputReader : IPlayerInput
    {
        private readonly HashSet<string> _pending = new HashSet<string>();
        private readonly HashSet<string> _ui = new HashSet<string>();
        private readonly HashSet<string> _held = new HashSet<string>();
        public bool blocked;
        public CameraRig rig;
        public Vector2 mouse;
        public float scroll;
        public bool usingGamepad;
        private Vector2 _move, _stick;
        private bool _fire;
        private int _gamepadSlot;

        private static readonly string[] SimActions = { "crouch", "slot1", "slot2", "slot3", "slot4", "slot5", "flashlight", "reload", "quickMed", "grenade", "interact" };
        private static readonly string[] UiActions = { "inventory", "map", "pause", "help", "drop" };

#if DZ_INPUT_SYSTEM && ENABLE_INPUT_SYSTEM
        private static readonly Dictionary<string, Key[]> Keys = new Dictionary<string, Key[]>
        {
            ["crouch"] = new[] { Key.C, Key.LeftCtrl }, ["sprint"] = new[] { Key.LeftShift, Key.RightShift },
            ["slot1"] = new[] { Key.Digit1 }, ["slot2"] = new[] { Key.Digit2 }, ["slot3"] = new[] { Key.Digit3 }, ["slot4"] = new[] { Key.Digit4 }, ["slot5"] = new[] { Key.Digit5 },
            ["flashlight"] = new[] { Key.F }, ["reload"] = new[] { Key.R }, ["quickMed"] = new[] { Key.Q }, ["grenade"] = new[] { Key.G }, ["interact"] = new[] { Key.E },
            ["inventory"] = new[] { Key.Tab, Key.I }, ["map"] = new[] { Key.M }, ["pause"] = new[] { Key.Escape, Key.P }, ["help"] = new[] { Key.F1 }, ["drop"] = new[] { Key.X },
            ["up"] = new[] { Key.W, Key.UpArrow }, ["down"] = new[] { Key.S, Key.DownArrow }, ["left"] = new[] { Key.A, Key.LeftArrow }, ["right"] = new[] { Key.D, Key.RightArrow },
        };

        private static bool KeyHeld(string a)
        {
            var kb = Keyboard.current;
            if (kb == null || !Keys.TryGetValue(a, out var ks)) return false;
            foreach (var k in ks) if (kb[k].isPressed) return true;
            return false;
        }

        private static bool KeyDown(string a)
        {
            var kb = Keyboard.current;
            if (kb == null || !Keys.TryGetValue(a, out var ks)) return false;
            foreach (var k in ks) if (kb[k].wasPressedThisFrame) return true;
            return false;
        }

        private void PollDevices()
        {
            var ms = Mouse.current;
            if (ms != null)
            {
                mouse = ms.position.ReadValue();
                scroll = ms.scroll.ReadValue().y;
                _fire = ms.leftButton.isPressed;
                if (ms.leftButton.wasPressedThisFrame) usingGamepad = false;
            }
            float x = (KeyHeld("right") ? 1 : 0) - (KeyHeld("left") ? 1 : 0);
            float y = (KeyHeld("up") ? 1 : 0) - (KeyHeld("down") ? 1 : 0);
            _move = new Vector2(x, y);
            _stick = Vector2.zero;
            var gp = Gamepad.current;
            if (gp != null)
            {
                var ls = gp.leftStick.ReadValue();
                if (ls.sqrMagnitude > 0.04f) { _move = ls; usingGamepad = true; }
                var rs = gp.rightStick.ReadValue();
                if (rs.sqrMagnitude > 0.12f) { _stick = rs; usingGamepad = true; }
                if (gp.rightTrigger.isPressed) { _fire = true; usingGamepad = true; }
                if (gp.leftShoulder.isPressed) _held.Add("sprint");
                if (gp.buttonEast.wasPressedThisFrame) _pending.Add("crouch");
                if (gp.buttonWest.wasPressedThisFrame) _pending.Add("reload");
                if (gp.buttonSouth.wasPressedThisFrame) _pending.Add("interact");
                if (gp.buttonSouth.isPressed) _held.Add("interact");
                if (gp.rightShoulder.wasPressedThisFrame) _pending.Add("grenade");
                if (gp.dpad.down.wasPressedThisFrame) _pending.Add("quickMed");
                if (gp.dpad.up.wasPressedThisFrame) _pending.Add("flashlight");
                if (gp.dpad.right.wasPressedThisFrame) { _gamepadSlot = (_gamepadSlot + 1) % 3; _pending.Add("slot" + (_gamepadSlot + 1)); }
                if (gp.dpad.left.wasPressedThisFrame) { _gamepadSlot = (_gamepadSlot + 2) % 3; _pending.Add("slot" + (_gamepadSlot + 1)); }
                if (gp.startButton.wasPressedThisFrame) _ui.Add("pause");
                if (gp.selectButton.wasPressedThisFrame) _ui.Add("inventory");
                if (gp.buttonNorth.wasPressedThisFrame) _ui.Add("map");
            }
        }
#elif ENABLE_LEGACY_INPUT_MANAGER
        private static readonly Dictionary<string, KeyCode[]> Keys = new Dictionary<string, KeyCode[]>
        {
            ["crouch"] = new[] { KeyCode.C, KeyCode.LeftControl }, ["sprint"] = new[] { KeyCode.LeftShift, KeyCode.RightShift },
            ["slot1"] = new[] { KeyCode.Alpha1 }, ["slot2"] = new[] { KeyCode.Alpha2 }, ["slot3"] = new[] { KeyCode.Alpha3 }, ["slot4"] = new[] { KeyCode.Alpha4 }, ["slot5"] = new[] { KeyCode.Alpha5 },
            ["flashlight"] = new[] { KeyCode.F }, ["reload"] = new[] { KeyCode.R }, ["quickMed"] = new[] { KeyCode.Q }, ["grenade"] = new[] { KeyCode.G }, ["interact"] = new[] { KeyCode.E },
            ["inventory"] = new[] { KeyCode.Tab, KeyCode.I }, ["map"] = new[] { KeyCode.M }, ["pause"] = new[] { KeyCode.Escape, KeyCode.P }, ["help"] = new[] { KeyCode.F1 }, ["drop"] = new[] { KeyCode.X },
            ["up"] = new[] { KeyCode.W, KeyCode.UpArrow }, ["down"] = new[] { KeyCode.S, KeyCode.DownArrow }, ["left"] = new[] { KeyCode.A, KeyCode.LeftArrow }, ["right"] = new[] { KeyCode.D, KeyCode.RightArrow },
        };

        private static bool KeyHeld(string a)
        {
            if (!Keys.TryGetValue(a, out var ks)) return false;
            foreach (var k in ks) if (UnityEngine.Input.GetKey(k)) return true;
            return false;
        }

        private static bool KeyDown(string a)
        {
            if (!Keys.TryGetValue(a, out var ks)) return false;
            foreach (var k in ks) if (UnityEngine.Input.GetKeyDown(k)) return true;
            return false;
        }

        private void PollDevices()
        {
            mouse = UnityEngine.Input.mousePosition;
            scroll = UnityEngine.Input.mouseScrollDelta.y;
            _fire = UnityEngine.Input.GetMouseButton(0);
            float x = (KeyHeld("right") ? 1 : 0) - (KeyHeld("left") ? 1 : 0);
            float y = (KeyHeld("up") ? 1 : 0) - (KeyHeld("down") ? 1 : 0);
            _move = new Vector2(x, y);
            _stick = Vector2.zero;
        }
#else
        private static bool KeyHeld(string a) => false;
        private static bool KeyDown(string a) => false;
        private void PollDevices() { }
#endif

        /// <summary>Call once per rendered frame before the simulation steps.</summary>
        public void Tick()
        {
            _ui.Clear();
            _held.Clear();
            PollDevices();
            foreach (var a in SimActions) if (KeyDown(a)) _pending.Add(a);
            foreach (var a in UiActions) if (KeyDown(a)) _ui.Add(a);
            if (KeyHeld("sprint")) _held.Add("sprint");
            if (KeyHeld("interact")) _held.Add("interact");
        }

        /// <summary>Drops presses that no simulation step consumed this frame.</summary>
        public void EndFrame(bool simStepped) { if (simStepped) _pending.Clear(); }

        public bool UiPressed(string action) => _ui.Contains(action);
        public void ClearPending() => _pending.Clear();

        // ---------------------------------------------------------------- IPlayerInput
        public Vec2 MoveAxis()
        {
            if (blocked) return new Vec2();
            var m = _move;
            if (m.sqrMagnitude > 1f) m.Normalize();
            // screen up (north) is -y in the simulation
            return new Vec2(m.x, -m.y);
        }

        public bool Pressed(string action) => !blocked && _pending.Remove(action);
        public bool IsDown(string action) => !blocked && _held.Contains(action);
        public bool WantsFire() => !blocked && _fire;

        public double AimAngle(double px, double py)
        {
            if (_stick.sqrMagnitude > 0.12f) return System.Math.Atan2(-_stick.y, _stick.x);
            if (usingGamepad) return double.NaN;
            if (rig == null || !rig.ScreenToGround(mouse, 1.2f, out var hit)) return double.NaN;
            var sim = Coords.ToSim(hit);
            double dx = sim.x - px, dy = sim.y - py;
            if (dx * dx + dy * dy < 4) return double.NaN;
            return System.Math.Atan2(dy, dx);
        }
    }
}
