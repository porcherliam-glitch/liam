// 07_camera.js — Camera: smooth follow, bounds, shake, world/screen conversion (SPEC §8).
// Dependencies: 00_util.js (clamp). No DOM access.

class Camera {
  constructor(game) {
    this.game = game;
    this.x = 0; this.y = 0;
    this.zoom = 1;
    this.width = 1280; this.height = 720;
    this.bounds = null;
    this.shake = 0;
    this.shakeX = 0; this.shakeY = 0;
    this._t = 0;
  }
  resize(w, h) {
    this.width = Math.max(1, w | 0);
    this.height = Math.max(1, h | 0);
    this.zoom = this.width < 900 ? 0.9 : 1.15;
    this._clamp();
  }
  setBounds(worldW, worldH) {
    this.bounds = (worldW && worldH) ? { w: worldW, h: worldH } : null;
    this._clamp();
  }
  snap(x, y) {
    if (Number.isFinite(x)) this.x = x;
    if (Number.isFinite(y)) this.y = y;
    this._clamp();
  }
  follow(tx, ty, dt, lookAheadX = 0, lookAheadY = 0) {
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
    const k = 1 - Math.exp(-6 * Math.min(dt, 0.1));
    this.x += (tx + lookAheadX - this.x) * k;
    this.y += (ty + lookAheadY - this.y) * k;
    this._clamp();
  }
  _clamp() {
    if (!this.bounds) return;
    const hw = this.width / (2 * this.zoom), hh = this.height / (2 * this.zoom);
    if (this.bounds.w <= hw * 2) this.x = this.bounds.w / 2;
    else this.x = clamp(this.x, hw, this.bounds.w - hw);
    if (this.bounds.h <= hh * 2) this.y = this.bounds.h / 2;
    else this.y = clamp(this.y, hh, this.bounds.h - hh);
  }
  addShake(strength) {
    const s = this.game && this.game.settings;
    if (s && s.screenShake === false) return;
    this.shake = Math.min(24, this.shake + Math.max(0, Number(strength) || 0));
  }
  update(dt) {
    this._t += dt;
    if (this.shake > 0.05) {
      this.shake *= Math.exp(-9 * dt);
      this.shakeX = Math.sin(this._t * 91.7) * this.shake;
      this.shakeY = Math.cos(this._t * 77.3) * this.shake;
    } else {
      this.shake = 0; this.shakeX = 0; this.shakeY = 0;
    }
  }
  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + this.width / 2 + this.shakeX,
      y: (wy - this.y) * this.zoom + this.height / 2 + this.shakeY,
    };
  }
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.width / 2 - this.shakeX) / this.zoom + this.x,
      y: (sy - this.height / 2 - this.shakeY) / this.zoom + this.y,
    };
  }
  viewBounds() {
    const hw = this.width / (2 * this.zoom), hh = this.height / (2 * this.zoom);
    return { x: this.x - hw - TILE, y: this.y - hh - TILE, w: hw * 2 + TILE * 2, h: hh * 2 + TILE * 2 };
  }
}
