// 06_input.js — InputManager: keyboard, mouse, virtual touch controls, debug entry points.
// Public API (SPEC §7): INPUT_ACTIONS, class InputManager { isDown, pressed, pressedRaw, released, moveAxis,
//   aimAngleFrom, lastAim, aimWorld, wantsFire, mouse, touchMode, setTouchMode, setStick, touchAction,
//   touchFire, endFrame, setEnabled, consumeAll, debugKey, debugMouse, debugAimWorld }.
// Decisions: touch 'sprint' and 'crouch' buttons are toggles — touchAction('sprint', true) flips a sticky
//   flag that isDown('sprint') honours; crouch is a press-toggle for keyboard and touch alike (Player).
// Dependencies: 00_util.js (clamp, angleTo). DOM access only inside the constructor/methods.

const INPUT_ACTIONS = {
  moveUp: ['KeyW', 'ArrowUp'], moveDown: ['KeyS', 'ArrowDown'], moveLeft: ['KeyA', 'ArrowLeft'], moveRight: ['KeyD', 'ArrowRight'],
  reload: ['KeyR'], interact: ['KeyE'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC'], flashlight: ['KeyF'],
  inventory: ['Tab'], map: ['KeyM'], grenade: ['KeyG'], slot1: ['Digit1'], slot2: ['Digit2'], slot3: ['Digit3'],
  slot4: ['Digit4'], slot5: ['Digit5'], pause: ['Escape'], quickMed: ['KeyQ'], drop: ['KeyX'],
};

class InputManager {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas || null;
    this.enabled = true;
    this.keys = new Set();            // codes held
    this.edgesDown = new Set();       // action names pressed this frame
    this.edgesUp = new Set();         // action names released this frame
    this.codeToActions = new Map();
    for (const [action, codes] of Object.entries(INPUT_ACTIONS)) {
      for (const c of codes) {
        if (!this.codeToActions.has(c)) this.codeToActions.set(c, []);
        this.codeToActions.get(c).push(action);
      }
    }
    this._mouse = { x: 0, y: 0, down: false, rightDown: false };
    this.lastAim = 0;
    this.aimWorld = null;
    this.moveStick = { x: 0, y: 0 };
    this.aimStick = { x: 0, y: 0 };
    this.touchFireHeld = false;
    this.touchHeld = new Set();       // virtual buttons currently held
    this.touchToggles = { sprint: false };
    this._touchMode = false;
    this._forcedTouch = null;
    this._evaluateTouchMode();
    this._bind();
  }

  // ---------- touch mode ----------
  _evaluateTouchMode() {
    const s = (this.game && this.game.settings) || {};
    const pref = s.touchControls || 'auto';
    let coarse = false;
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      const mm = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
      coarse = !!((nav && nav.maxTouchPoints > 0) || (mm && mm.matches));
    } catch (e) { coarse = false; }
    this._touchMode = pref === 'on' || (pref === 'auto' && coarse);
    return this._touchMode;
  }
  get touchMode() { return this._touchMode; }
  setTouchMode(b) { this._touchMode = !!b; }
  reevaluateTouch() { return this._evaluateTouchMode(); }

  // ---------- DOM binding ----------
  _bind() {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    this._onKeyDown = (e) => this._keyDown(e.code, e);
    this._onKeyUp = (e) => this._keyUp(e.code, e);
    this._onBlur = () => this.releaseAll();
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    const c = this.canvas;
    if (c && c.addEventListener) {
      c.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        this._setMouseFromEvent(e);
        this.aimWorld = null;
      });
      c.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return;
        this._setMouseFromEvent(e);
        if (e.button === 0) this._mouse.down = true;
        if (e.button === 2) this._mouse.rightDown = true;
      });
      window.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'touch') return;
        if (e.button === 0) this._mouse.down = false;
        if (e.button === 2) this._mouse.rightDown = false;
      });
      c.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    window.addEventListener('touchstart', () => {
      if (!this._touchSeen) {
        this._touchSeen = true;
        if (this._evaluateTouchMode() && this.game && this.game.ui && this.game.ui.applyTouchVisibility) this.game.ui.applyTouchVisibility();
      }
    }, { passive: true });
  }

  _setMouseFromEvent(e) {
    const c = this.canvas;
    if (!c || !c.getBoundingClientRect) { this._mouse.x = e.clientX; this._mouse.y = e.clientY; return; }
    const r = c.getBoundingClientRect();
    this._mouse.x = e.clientX - r.left;
    this._mouse.y = e.clientY - r.top;
  }

  _keyDown(code, e) {
    const actions = this.codeToActions.get(code);
    if (actions && e && e.preventDefault && this.game && this.game.state === 'raid') {
      // Do not steal keys from text inputs (seed field, import textarea).
      const t = e.target;
      const tag = t && t.tagName ? String(t.tagName).toLowerCase() : '';
      if (tag !== 'input' && tag !== 'textarea') e.preventDefault();
    }
    if (e && e.target) {
      const tag = e.target.tagName ? String(e.target.tagName).toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    }
    if (e && e.repeat) return;
    if (this.keys.has(code)) return;
    this.keys.add(code);
    if (actions) for (const a of actions) this.edgesDown.add(a);
  }

  _keyUp(code) {
    if (!this.keys.has(code)) return;
    this.keys.delete(code);
    const actions = this.codeToActions.get(code);
    if (actions) for (const a of actions) this.edgesUp.add(a);
  }

  releaseAll() {
    for (const code of Array.from(this.keys)) this._keyUp(code);
    this._mouse.down = false; this._mouse.rightDown = false;
    this.touchFireHeld = false;
    this.moveStick.x = this.moveStick.y = 0;
    this.touchHeld.clear();
  }

  // ---------- queries ----------
  _rawDown(action) {
    const codes = INPUT_ACTIONS[action];
    if (codes) for (const c of codes) if (this.keys.has(c)) return true;
    if (this.touchHeld.has(action)) return true;
    if (action === 'sprint' && this.touchToggles.sprint) return true;
    return false;
  }
  isDown(action) { return this.enabled && this._rawDown(action); }
  pressed(action) { return this.enabled && this.edgesDown.has(action); }
  pressedRaw(action) { return this.edgesDown.has(action); }
  released(action) { return this.enabled && this.edgesUp.has(action); }

  moveAxis() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this._rawDown('moveLeft')) x -= 1;
    if (this._rawDown('moveRight')) x += 1;
    if (this._rawDown('moveUp')) y -= 1;
    if (this._rawDown('moveDown')) y += 1;
    x += this.moveStick.x; y += this.moveStick.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  aimAngleFrom(sx, sy) {
    const raid = this.game && this.game.raid;
    const p = raid && raid.player;
    if (this.aimWorld && p) {
      const a = angleTo(p.x, p.y, this.aimWorld.x, this.aimWorld.y);
      if (Number.isFinite(a)) this.lastAim = a;
      return this.lastAim;
    }
    if (this._touchMode) {
      const m = Math.hypot(this.aimStick.x, this.aimStick.y);
      if (m > 0.2) this.lastAim = Math.atan2(this.aimStick.y, this.aimStick.x);
      else if (Math.hypot(this.moveStick.x, this.moveStick.y) > 0.3 && !this.touchFireHeld) {
        // Without an aim input the character faces the walking direction.
        this.lastAim = Math.atan2(this.moveStick.y, this.moveStick.x);
      }
      return this.lastAim;
    }
    const dx = this._mouse.x - sx, dy = this._mouse.y - sy;
    if (dx * dx + dy * dy < 4) return this.lastAim;
    this.lastAim = Math.atan2(dy, dx);
    return this.lastAim;
  }

  wantsFire() {
    if (!this.enabled) return false;
    if (this.touchFireHeld) return true;
    const s = (this.game && this.game.settings) || {};
    if (this._touchMode && s.aimAssist !== false && Math.hypot(this.aimStick.x, this.aimStick.y) > 0.75) return true;
    return this._mouse.down;
  }

  get mouse() { return this._mouse; }

  // ---------- virtual controls ----------
  setStick(which, x, y) {
    const s = which === 'aim' ? this.aimStick : this.moveStick;
    s.x = clamp(Number(x) || 0, -1, 1);
    s.y = clamp(Number(y) || 0, -1, 1);
    if (which === 'aim') this.aimWorld = null;
  }

  touchAction(action, down) {
    if (!INPUT_ACTIONS[action]) return;
    if (action === 'sprint') {
      if (down) { this.touchToggles.sprint = !this.touchToggles.sprint; this.edgesDown.add('sprint'); }
      return;
    }
    if (down) {
      if (!this.touchHeld.has(action)) { this.touchHeld.add(action); this.edgesDown.add(action); }
    } else if (this.touchHeld.has(action)) {
      this.touchHeld.delete(action);
      this.edgesUp.add(action);
    }
  }

  touchFire(down) { this.touchFireHeld = !!down; }

  endFrame() { this.edgesDown.clear(); this.edgesUp.clear(); }
  setEnabled(b) {
    const was = this.enabled;
    this.enabled = !!b;
    if (was && !this.enabled) { this._mouse.down = false; this.touchFireHeld = false; }
  }
  consumeAll() { this.edgesDown.clear(); }

  // ---------- debug entry points (window.DZ) ----------
  debugKey(code, down) {
    if (down) this._keyDown(String(code), null); else this._keyUp(String(code));
  }
  debugMouse(x, y, down) {
    if (typeof x === 'number' && Number.isFinite(x)) { this._mouse.x = x; this.aimWorld = null; }
    if (typeof y === 'number' && Number.isFinite(y)) { this._mouse.y = y; this.aimWorld = null; }
    if (down === true) this._mouse.down = true;
    else if (down === false) this._mouse.down = false;
  }
  debugAimWorld(wx, wy) {
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return;
    this.aimWorld = { x: wx, y: wy };
  }
}
