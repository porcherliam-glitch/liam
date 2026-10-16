// 21_fx.js — FX: pooled particles, decals, floating texts, screen effects, light flashes (SPEC §22).
// Particle shape (read by rdDrawParticle): {type:'spark'|'smoke'|'blood'|'dust'|'fire'|'toxic'|'casing'|'debris'|'flash',
//   x, y, vx, vy, life, maxLife, size, color, gravity, drag, rot, vr, alpha}. Decal: {type:'blood'|'scorch'|'toxic', x, y, r, rot, alpha, color}.
// Text: {x, y, text, color, life, maxLife, vy}. Math.random is allowed here (visual only, SPEC §0).
// Dependencies: 00_util.js.

class FX {
  constructor(raid) {
    this.raid = raid || null;
    this.particles = [];
    this.pool = [];
    this.decals = [];
    this.texts = [];
    this.lightFlashes = [];
    this.screenEffects = { hitMarker: 0, damage: 0, flash: 0, hitDirs: [] };
    this.hitMarkerTimer = 0;
  }
  get settings() { return (this.raid && this.raid.game && this.raid.game.settings) || {}; }
  get cap() { const q = this.settings.quality; return q === 'low' ? 250 : q === 'medium' ? 450 : 700; }

  _p(type, x, y, vx, vy, life, size, color, gravity = 0, drag = 0) {
    if (this.particles.length >= this.cap) {
      // drop the oldest particle (index 0) — swap with last for O(1)
      const old = this.particles[0];
      this.particles[0] = this.particles[this.particles.length - 1];
      this.particles.pop();
      this.pool.push(old);
    }
    const p = this.pool.pop() || {};
    p.type = type; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.maxLife = life; p.size = size; p.color = color;
    p.gravity = gravity; p.drag = drag; p.rot = Math.random() * Math.PI * 2; p.vr = (Math.random() - 0.5) * 8; p.alpha = 1;
    this.particles.push(p);
    return p;
  }
  _decal(type, x, y, r, color, alpha = 0.8) {
    if (this.decals.length >= 250) this.decals.shift();
    this.decals.push({ type, x, y, r, rot: Math.random() * Math.PI * 2, alpha, color, seed: Math.random() });
  }

  update(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); this.pool.push(p); continue; }
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.type === 'smoke' || p.type === 'toxic') p.size += dt * 14;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-2 * dt);
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.lightFlashes.length - 1; i >= 0; i--) {
      const l = this.lightFlashes[i];
      l.ttl -= dt;
      if (l.ttl <= 0) this.lightFlashes.splice(i, 1);
    }
    for (const d of this.decals) if (d.type === 'toxic') d.alpha -= dt * 0.05;
    if (this.decals.length && this.decals[0].alpha <= 0) this.decals = this.decals.filter(d => d.alpha > 0);
    const se = this.screenEffects;
    this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
    se.hitMarker = this.hitMarkerTimer;
    se.damage = Math.max(0, se.damage - dt * 1.4);
    se.flash = Math.max(0, se.flash - dt * 0.45);
    for (let i = se.hitDirs.length - 1; i >= 0; i--) { se.hitDirs[i].ttl -= dt; if (se.hitDirs[i].ttl <= 0) se.hitDirs.splice(i, 1); }
  }

  muzzleFlash(x, y, angle, scale = 1) {
    for (let i = 0; i < 4; i++) {
      const a = angle + (Math.random() - 0.5) * 0.5, s = 200 + Math.random() * 260;
      this._p('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, 0.06 + Math.random() * 0.05, 2 * scale, '#ffd27a', 0, 6);
    }
    this._p('flash', x, y, 0, 0, 0.05, 14 * scale, '#fff1b8');
    this._p('smoke', x + Math.cos(angle) * 6, y + Math.sin(angle) * 6, Math.cos(angle) * 30, Math.sin(angle) * 30, 0.5, 4, 'rgba(180,180,180,0.35)', 0, 2);
    this.lightFlashes.push({ x, y, r: 130 * scale, ttl: 0.05, color: '#ffcf70' });
  }
  impact(x, y, angle, tile) {
    const metal = tile === T.FENCE || tile === T.PROP_SOLID;
    const wood = tile === T.DOOR_CLOSED || tile === T.DOOR_LOCKED || tile === T.BARRICADE;
    const back = angle + Math.PI;
    const n = metal ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const a = back + (Math.random() - 0.5) * 1.6, s = 80 + Math.random() * 180;
      if (metal) this._p('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, 0.15 + Math.random() * 0.15, 1.6, '#ffe39a', 0, 4);
      else this._p('debris', x, y, Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6, 0.3 + Math.random() * 0.3, 2, wood ? '#7a5a36' : '#8a8580', 0, 5);
    }
    this._p('dust', x, y, Math.cos(back) * 20, Math.sin(back) * 20, 0.45, 5, 'rgba(150,140,130,0.35)', 0, 2);
  }
  blood(x, y, angle, amount = 1) {
    const n = Math.round(5 * amount);
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * 1.2, s = 40 + Math.random() * 160;
      this._p('blood', x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.35, 1.5 + Math.random() * 2, Math.random() < 0.5 ? '#7a0f12' : '#5d1a10', 0, 6);
    }
    if (Math.random() < 0.6 * amount) this._decal('blood', x + Math.cos(angle) * 10, y + Math.sin(angle) * 10, 5 + Math.random() * 8 * amount, '#4a0c0e', 0.75);
  }
  explosion(x, y, radius) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * radius * 2.5;
      this._p('fire', x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.35, 4 + Math.random() * 6, Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', 0, 4);
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 80;
      this._p('smoke', x, y, Math.cos(a) * s, Math.sin(a) * s, 1.2 + Math.random(), 8 + Math.random() * 8, 'rgba(60,60,60,0.5)', -10, 1.5);
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, s = 150 + Math.random() * 250;
      this._p('debris', x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + Math.random() * 0.4, 2, '#555', 0, 3);
    }
    this._p('flash', x, y, 0, 0, 0.12, radius * 0.9, '#fff3c4');
    this._decal('scorch', x, y, radius * 0.45, '#111', 0.7);
    this.lightFlashes.push({ x, y, r: radius * 3, ttl: 0.18, color: '#ffb347' });
  }
  smoke(x, y) { this._p('smoke', x, y, (Math.random() - 0.5) * 20, -10 - Math.random() * 20, 1.5, 6, 'rgba(90,90,90,0.4)', -5, 1); }
  fire(x, y, r) {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r;
      this._p('fire', x + Math.cos(a) * d, y + Math.sin(a) * d, (Math.random() - 0.5) * 20, -30 - Math.random() * 40, 0.4 + Math.random() * 0.4, 3 + Math.random() * 4, Math.random() < 0.5 ? '#ff9a2a' : '#ffcf4a', -20, 1);
    }
    if (Math.random() < 0.15) this.smoke(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r);
  }
  toxicCloud(x, y, r) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.8;
      this._p('toxic', x + Math.cos(a) * d, y + Math.sin(a) * d, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, 1.6 + Math.random(), 8 + Math.random() * 8, 'rgba(120,220,70,0.28)', 0, 1);
    }
    this._decal('toxic', x, y, r * 0.8, '#3d6b1d', 0.45);
  }
  casing(x, y, angle) {
    const a = angle + Math.PI / 2 + (Math.random() - 0.5) * 0.6, s = 60 + Math.random() * 60;
    this._p('casing', x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5, 1.6, '#c9a24a', 0, 5);
  }
  footDust(x, y) { this._p('dust', x, y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.4, 3, 'rgba(140,130,120,0.25)', 0, 3); }
  floatingText(x, y, text, color = '#fff', force = false) {
    if (!force && this.settings.damageNumbers === false && /^\d+$/.test(String(text))) return;
    if (this.texts.length >= 40) this.texts.shift();
    this.texts.push({ x: x + (Math.random() - 0.5) * 10, y, text: String(text), color, life: 0.9, maxLife: 0.9, vy: -60 });
  }
  hitMarker() { this.hitMarkerTimer = 0.12; this.screenEffects.hitMarker = 0.12; }
  damageFlash(strength) { this.screenEffects.damage = clamp(Math.max(this.screenEffects.damage, strength), 0, 1); }
  hitDirection(angle) {
    if (!Number.isFinite(angle)) return;
    const d = this.screenEffects.hitDirs;
    d.push({ angle, ttl: 0.8 });
    if (d.length > 6) d.shift();
  }
  flash(strength) { this.screenEffects.flash = clamp(Math.max(this.screenEffects.flash, strength), 0, 1); }
}
