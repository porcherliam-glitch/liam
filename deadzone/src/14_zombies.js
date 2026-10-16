// 14_zombies.js — ZombieAI: spawning, perception (sight/hearing), state machine, flow-field chase, budgeted A*,
// separation, door bashing, attacks with windup/cooldown, special types, boss phases, spawn director (SPEC §15).
// Decisions: separation applies its push through Physics.moveCircle (never pushes a zombie into a wall);
//   far zombies (> 1500 px) get a cheap 0.5 s update that only follows flow field / straight lines;
//   noise does not wake lurking stalkers except screams and explosions.
// Dependencies: 00_util.js, 02_data_zombies.js, 08_world.js, 09_collision.js; raid subsystems at runtime.

const ZAI_ACTIVE_RADIUS = 1500;
const ZAI_BLEED = { walker: 0.15, runner: 0.2, brute: 0.5, screamer: 0.1, toxic: 0.15, armored: 0.25, stalker: 0.35, boss: 0.5 };

class ZombieAI {
  constructor(raid) {
    this.raid = raid;
    const base = raid && raid.rng && raid.rng.fork ? raid.rng : new RNG(99);
    this.rng = base.fork('ai');
    this.directorRng = base.fork('director');
    this.zombies = [];
    this.directorEnabled = true;
    this.pathBudget = 1;
    this.boss = null;
    this.directorTimer = 8;
    this._near = [];
    this.seq = 0;
    this.screamWarned = false;
  }

  get maxAlive() {
    const m = this.raid && this.raid.map && this.raid.map.zombies;
    return (m && Number.isFinite(m.maxAlive)) ? m.maxAlive : 90;
  }
  get player() { return this.raid && this.raid.player; }
  get world() { return this.raid && this.raid.world; }
  _audio(name, opts) { const a = this.raid && this.raid.game && this.raid.game.audio; if (a) a.play(name, opts); }

  alive() { return this.zombies.filter(z => !z.dead); }
  aliveCount() { let n = 0; for (const z of this.zombies) if (!z.dead) n++; return n; }
  nearest(x, y, r) {
    let best = null, bd = r * r;
    for (const z of this.zombies) { if (z.dead) continue; const d = dist2(x, y, z.x, z.y); if (d <= bd) { bd = d; best = z; } }
    return best;
  }
  inRadius(x, y, r) {
    const out = [];
    for (const z of this.zombies) { if (z.dead) continue; const rr = r + z.radius; if (dist2(x, y, z.x, z.y) <= rr * rr) out.push(z); }
    return out;
  }

  spawn(typeId, x, y, groupId = null) {
    const type = typeof ZOMBIE_TYPES !== 'undefined' ? ZOMBIE_TYPES[typeId] : null;
    if (!type || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (typeId !== 'boss' && this.aliveCount() >= this.maxAlive) return null;
    const rng = this.rng;
    const hpMul = (this.raid && this.raid.map && this.raid.map.difficulty >= 3 && typeId !== 'boss') ? 1.1 : 1;
    const z = {
      uid: 'z' + (++this.seq), type, id: typeId, x, y, angle: rng.float(-Math.PI, Math.PI), radius: type.radius || 13,
      hp: Math.round((type.hp || 60) * hpMul), hpMax: Math.round((type.hp || 60) * hpMul), speed: (type.speed || 55) * rng.float(0.9, 1.1), damage: type.damage || 10,
      state: type.lurk ? 'lurk' : 'idle', target: null, lastSeen: null, alert: 0, attackTimer: 0, windupTimer: 0, cooldown: 0,
      path: null, pathIdx: 0, pathTimer: rng.float(0, 2), wanderTimer: rng.float(1, 5), groupId, stagger: 0, dead: false, deathTimer: 0,
      flash: 0, phase: 0, abilityTimer: 0, abilityTimers: { slam: 4, charge: 7, summon: 12 }, ability: null, lurking: !!type.lurk,
      visibleAlpha: type.lurk ? (type.alpha || 0.35) : 1, doorTimer: 0, legPhase: rng.float(0, 6), hitThisAttack: false,
      senseTimer: rng.float(0, 0.15), attackAnim: 0, lastX: x, lastY: y, stuckTimer: 0, farTimer: rng.float(0, 0.5),
      screamTimer: type.screamCooldown ? rng.float(1.5, 4) : 0, investigateTime: 0, lookTimer: 0, lostTimer: 0, stunTimer: 0,
      growlTimer: rng.float(2, 9), pathMode: 0, moveX: 0, moveY: 0,
    };
    if (typeId === 'boss') this.boss = z;
    this.zombies.push(z);
    return z;
  }

  spawnInitial(world) {
    const w = world || this.world;
    if (!w) return;
    w.zombieSpawns.forEach((s, i) => {
      const gid = 'g' + i;
      for (let k = 0; k < (s.types || []).length; k++) {
        const t = s.types[k];
        let px = s.x, py = s.y;
        for (let tries = 0; tries < 8; tries++) {
          const ox = s.x + this.rng.float(-40, 40), oy = s.y + this.rng.float(-40, 40);
          if (w.isWalkable(Math.floor(ox / TILE), Math.floor(oy / TILE))) { px = ox; py = oy; break; }
        }
        this.spawn(t, px, py, gid);
      }
    });
  }

  spawnNearPlayer(typeId, minDist = 500, maxDist = 900, count = 1, groupId = Uid.next()) {
    const p = this.player, w = this.world;
    const out = [];
    if (!p || !w) return out;
    const nav = this.raid.nav;
    for (let n = 0; n < count; n++) {
      if (this.aliveCount() >= this.maxAlive) break;
      let spot = null, lastWalk = null;
      for (let k = 0; k < 12 && !spot; k++) {
        const a = this.rng.float(0, Math.PI * 2), d = this.rng.float(minDist, maxDist);
        let x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (!w.isWalkable(Math.floor(x / TILE), Math.floor(y / TILE))) {
          const r = nav ? nav.randomWalkable(this.rng, x, y, 2) : null;
          if (!r) continue;
          x = r.x; y = r.y;
        }
        if (x < 3 * TILE || y < 3 * TILE || x > w.pixelW - 3 * TILE || y > w.pixelH - 3 * TILE) continue;
        lastWalk = { x, y };
        if (!Physics.lineOfSight(w, p.x, p.y, x, y)) spot = { x, y };
      }
      if (!spot) spot = lastWalk;
      if (!spot) continue;
      const z = this.spawn(typeId, spot.x, spot.y, groupId);
      if (z) {
        z.state = 'investigate'; z.target = { x: p.x, y: p.y }; z.alert = 0.7; z.investigateTime = 0;
        out.push(z);
      }
    }
    return out;
  }

  onNoise(x, y, radius, kind, strength = 1) {
    const w = this.world, p = this.player;
    if (!w || !(radius > 0)) return;
    const srcIndoor = w.isIndoor(x, y);
    const srcB = w.buildingAt(x, y);
    for (const z of this.zombies) {
      if (z.dead || z.state === 'stunned') continue;
      let r = radius * (z.type.hearingMult || 1) * strength;
      if (srcIndoor && w.buildingAt(z.x, z.y) !== srcB) r *= 0.6;
      const d2v = dist2(x, y, z.x, z.y);
      if (d2v > r * r) continue;
      if (z.lurking && kind !== 'scream' && kind !== 'explosion') continue;
      if (z.lurking) z.lurking = false;
      const nearPlayer = p && dist(x, y, p.x, p.y) < 80;
      const tgt = nearPlayer ? { x: p.x, y: p.y } : { x, y };
      if (z.state === 'chase' || z.state === 'attack' || z.state === 'ability') {
        if (!z.seesPlayer) z.lastSeen = { x: tgt.x, y: tgt.y, t: this.raid.time || 0 };
        continue;
      }
      if (kind === 'scream' || z.alert > 0.5) {
        z.state = 'chase'; z.alert = 1; z.lastSeen = { x: tgt.x, y: tgt.y, t: this.raid.time || 0 }; z.lostTimer = 0;
      } else {
        const d = Math.sqrt(d2v);
        const spread = Math.min(120, d * 0.15);
        z.state = 'investigate';
        z.target = { x: tgt.x + this.rng.float(-spread, spread), y: tgt.y + this.rng.float(-spread, spread) };
        z.investigateTime = 0; z.lookTimer = 0; z.path = null; z.pathTimer = 0;
        z.alert = Math.max(z.alert, 0.6);
      }
    }
  }

  alertGroup(z) {
    if (!z || !z.groupId) return;
    for (const o of this.zombies) {
      if (o === z || o.dead || o.groupId !== z.groupId) continue;
      if (o.state !== 'idle' && o.state !== 'wander') continue;
      if (dist2(o.x, o.y, z.x, z.y) > 320 * 320) continue;
      o.state = 'investigate';
      o.target = z.lastSeen ? { x: z.lastSeen.x, y: z.lastSeen.y } : { x: z.x, y: z.y };
      o.alert = Math.max(o.alert, 0.6);
      o.investigateTime = 0; o.path = null; o.pathTimer = 0;
    }
  }

  damage(z, amount, opts = {}) {
    if (!z || z.dead || !(amount > 0)) return { killed: false, dealt: 0 };
    let red = 0;
    if (z.type.armor && z.type.armorArc && Number.isFinite(opts.dirX) && Number.isFinite(opts.dirY)) {
      const from = Math.atan2(-opts.dirY, -opts.dirX);
      if (Math.abs(angleDiff(z.angle, from)) < z.type.armorArc / 2) {
        const pen = opts.pen || 1;
        red = pen >= 3 ? 0 : pen === 2 ? z.type.armor * 0.5 : z.type.armor;
        if (red > 0 && this.raid && this.raid.fx && opts.source === 'bullet') this.raid.fx.impact(z.x - opts.dirX * z.radius, z.y - opts.dirY * z.radius, Math.atan2(opts.dirY, opts.dirX), T.FENCE);
      }
    } else if (z.type.armor && !z.type.armorArc) red = z.type.armor * ((opts.pen || 1) >= 3 ? 0 : (opts.pen || 1) === 2 ? 0.5 : 1);
    const dealt = Math.min(z.hp, amount * (1 - red));
    z.hp -= dealt;
    z.flash = 0.12;
    if (dealt >= z.hpMax * 0.25 && z.id !== 'brute' && z.id !== 'boss') {
      z.stagger = 0.35; z.windupTimer = 0; z.attackAnim = 0;
    }
    const p = this.player;
    if (z.lurking) z.lurking = false;
    if (p && z.state !== 'chase' && z.state !== 'attack' && z.state !== 'ability') {
      z.state = 'chase'; z.alert = 1; z.lastSeen = { x: p.x, y: p.y, t: this.raid.time || 0 }; z.lostTimer = 0;
      this.alertGroup(z);
    }
    if (z.hp <= 0) { this.kill(z, opts); return { killed: true, dealt }; }
    return { killed: false, dealt };
  }

  kill(z, opts = {}) {
    if (!z || z.dead) return;
    z.dead = true; z.hp = 0; z.state = 'dead'; z.deathTimer = 0; z.attackAnim = 0; z.windupTimer = 0;
    if (opts.silent) return;
    const raid = this.raid;
    if (raid.loot) {
      for (const inst of raid.loot.rollZombieDrop(z)) raid.dropItem(inst, z.x, z.y);
    }
    const p = this.player;
    if (p && p.stats) {
      p.stats.kills++;
      p.stats.killsByType[z.id] = (p.stats.killsByType[z.id] || 0) + 1;
    }
    raid.addXp(z.type.xp || 10);
    if (raid.fx) { raid.fx.blood(z.x, z.y, z.angle + Math.PI, 2); raid.fx.floatingText(z.x, z.y - 24, '+' + (z.type.xp || 10) + ' EP', '#9fe870', true); }
    this._audio(z.id === 'boss' ? 'boss_roar' : 'zombie_die', { x: z.x, y: z.y });
    if (z.id === 'toxic') {
      raid.addHazard({ kind: 'toxic', x: z.x, y: z.y, r: (z.type.toxicRadius || 70) * 1.3, duration: z.type.toxicDuration || 8 });
      if (raid.fx) raid.fx.toxicCloud(z.x, z.y, (z.type.toxicRadius || 70) * 1.3);
      this._audio('toxic', { x: z.x, y: z.y });
    }
    if (raid.events) raid.events.emit('kill', { zombie: z });
    if (z.id === 'boss') {
      raid.flags.bossKilled = true;
      if (raid.events) raid.events.emit('bossDead', { zombie: z });
      if (raid.game && raid.game.ui) raid.game.ui.toast('Der Wirt ist tot!', 'success', 4000);
      if (raid.game && raid.game.camera) raid.game.camera.addShake(14);
    }
  }

  // ---------------- per-frame ----------------
  update(dt) {
    const raid = this.raid, p = this.player, w = this.world;
    if (!raid || !w) return;
    this.pathBudget = 1;
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (z.dead) {
        z.deathTimer += dt;
        if (z.deathTimer >= (z.id === 'boss' ? 60 : 25)) {
          this.zombies.splice(i, 1);
          if (this.boss === z) this.boss = null;
        }
      }
    }
    for (const z of this.zombies) {
      if (z.dead) continue;
      z.flash = Math.max(0, z.flash - dt);
      const d = p ? dist(z.x, z.y, p.x, p.y) : Infinity;
      if (d > ZAI_ACTIVE_RADIUS) { this._farUpdate(z, dt); continue; }
      this._update(z, dt, d);
    }
    if (this.boss && !this.boss.dead && raid.events) {
      const b = this.boss;
      raid.events.emit('boss', { hp: b.hp, hpMax: b.hpMax, phase: b.phase, name: b.type.name || 'Boss', near: p ? dist(b.x, b.y, p.x, p.y) < 900 : false });
    }
    this._director(dt);
  }

  _director(dt) {
    if (!this.directorEnabled || !this.player || this.player.dead) return;
    this.directorTimer -= dt;
    if (this.directorTimer > 0) return;
    this.directorTimer = 8;
    const p = this.player;
    let near = 0;
    for (const z of this.zombies) if (!z.dead && dist2(z.x, z.y, p.x, p.y) < 1200 * 1200) near++;
    if (near >= 4 || this.aliveCount() >= this.maxAlive) return;
    const weights = Object.entries((this.raid.map && this.raid.map.zombies && this.raid.map.zombies.weights) || { walker: 1 })
      .filter(([t]) => t !== 'boss' && ZOMBIE_TYPES[t]).map(([id, w]) => ({ id, w }));
    const pick = this.directorRng.weighted(weights) || { id: 'walker' };
    const z = this.spawnNearPlayer(pick.id, 700, 1100, this.directorRng.int(2, 4));
    for (const q of z) { q.state = 'wander'; q.alert = 0; }
  }

  _farUpdate(z, dt) {
    z.farTimer += dt;
    if (z.farTimer < 0.5) return;
    const fdt = z.farTimer;
    z.farTimer = 0;
    z.attackAnim = 0; z.windupTimer = 0;
    let tx = null, ty = null, spd = z.speed * 0.5;
    if ((z.state === 'chase' || z.state === 'investigate') && (z.lastSeen || z.target)) {
      const t = z.state === 'chase' ? z.lastSeen : z.target;
      tx = t.x; ty = t.y; spd = z.speed * 0.8;
      if (dist(z.x, z.y, tx, ty) < 24) { z.state = 'wander'; z.alert = 0; }
    } else {
      z.wanderTimer -= fdt;
      if (z.wanderTimer <= 0) {
        z.wanderTimer = this.rng.float(3, 8);
        const r = this.raid.nav ? this.raid.nav.randomWalkable(this.rng, z.x, z.y, 5) : null;
        z.target = r; z.state = r ? 'wander' : 'idle';
      }
      if (z.target) { tx = z.target.x; ty = z.target.y; }
    }
    if (tx === null) return;
    const dx = tx - z.x, dy = ty - z.y, l = Math.hypot(dx, dy);
    if (l < 2) return;
    const step = Math.min(l, spd * fdt);
    const m = Physics.moveCircle(this.world, z.x, z.y, z.radius, dx / l * step, dy / l * step);
    z.x = m.x; z.y = m.y;
    z.angle = Math.atan2(dy, dx);
  }

  _sense(z, d) {
    const p = this.player, raid = this.raid;
    if (!p || p.dead) { z.seesPlayer = false; return; }
    let lf = 1 - 0.45 * (raid.darknessAt ? raid.darknessAt(z.x, z.y) : 0);
    if (p.flashlightOn) lf = Math.max(lf, 0.9);
    const range = (z.type.sightRange || 380) * lf * (p.crouching ? 0.65 : 1);
    const close = d < 56;
    const sees = (d <= range || close) && Physics.lineOfSight(this.world, z.x, z.y, p.x, p.y);
    z.seesPlayer = sees;
    if (!sees) return;
    z.lastSeen = { x: p.x, y: p.y, t: raid.time || 0 };
    z.lostTimer = 0;
    if (z.lurking) {
      if (d > (z.type.ambushRange || 220)) return;
      z.lurking = false;
    }
    if (z.state !== 'chase' && z.state !== 'attack' && z.state !== 'ability') {
      z.state = 'chase'; z.alert = 1; z.path = null;
      this.alertGroup(z);
      this._audio(z.id === 'boss' ? 'boss_roar' : 'zombie_alert', { x: z.x, y: z.y, volume: 0.8 });
    }
  }

  _update(z, dt, d) {
    const raid = this.raid, p = this.player, w = this.world;
    const type = z.type;
    // timers
    z.legPhase += 0; // advanced by movement
    if (z.growlTimer > 0) z.growlTimer -= dt;
    else {
      z.growlTimer = this.rng.float(4, 10);
      if (d < 700) this._audio('zombie_growl', { x: z.x, y: z.y, volume: z.id === 'brute' || z.id === 'boss' ? 1 : 0.7, pitch: z.id === 'runner' ? 1.25 : z.id === 'brute' ? 0.7 : 1 });
    }
    if (z.state === 'stunned') {
      z.stunTimer -= dt;
      z.attackAnim = 0;
      if (z.stunTimer <= 0) { z.state = z.lastSeen ? 'chase' : 'idle'; }
      return;
    }
    // perception (staggered 0.15 s)
    z.senseTimer -= dt;
    if (z.senseTimer <= 0) { z.senseTimer += 0.15; this._sense(z, d); }
    // stalker visibility
    if (type.lurk) {
      const inCone = p && p.flashlightOn && d < 380 && Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, z.x, z.y))) < 0.55;
      const target = inCone || d < 90 ? 1 : (z.state === 'lurk' || z.lurking ? (type.alpha || 0.35) : 0.55);
      z.visibleAlpha += (target - z.visibleAlpha) * Math.min(1, dt * 6);
      if (z.lurking && p && d <= (type.ambushRange || 220) && Physics.lineOfSight(w, z.x, z.y, p.x, p.y)) {
        z.lurking = false; z.state = 'chase'; z.alert = 1; z.lastSeen = { x: p.x, y: p.y, t: raid.time || 0 };
        this._audio('zombie_alert', { x: z.x, y: z.y, pitch: 1.3 });
      }
    }
    if (z.stagger > 0) { z.stagger -= dt; z.attackAnim = Math.max(0, z.attackAnim - dt * 4); this._separate(z); return; }
    // boss phases
    if (z.id === 'boss') this._bossPhase(z);
    // screamer
    if (type.screamCooldown && (z.state === 'chase' || z.state === 'attack')) {
      z.screamTimer -= dt;
      if (z.screamTimer <= 0 && d < 1000) {
        z.screamTimer = type.screamCooldown;
        this._audio('screamer', { x: z.x, y: z.y });
        raid.emitNoise(z.x, z.y, type.screamRadius || 1000, 'scream');
        const s = type.summon || [2, 4];
        this.spawnNearPlayer('walker', 500, 900, this.rng.int(s[0], s[1]));
        z.attackAnim = 1;
        if (raid.game && raid.game.ui && !this.screamWarned) { this.screamWarned = true; raid.game.ui.toast('Ein Schreier ruft Verstärkung!', 'warning'); }
      }
    }
    let mvx = 0, mvy = 0, spd = 0;
    const reach = z.radius + (p ? p.radius : 12) + (type.attackRange || 10);
    switch (z.state) {
      case 'lurk':
        break;
      case 'idle':
        z.wanderTimer -= dt;
        z.attackAnim = Math.max(0, z.attackAnim - dt * 2);
        if (z.wanderTimer <= 0) { z.wanderTimer = this.rng.float(2, 6); if (!this.rng.chance(0.4)) { z.state = 'wander'; z.target = null; z.path = null; } }
        break;
      case 'wander': {
        z.wanderTimer -= dt;
        if (!z.target || z.wanderTimer <= 0) {
          z.wanderTimer = this.rng.float(2, 6);
          if (this.rng.chance(0.4)) { z.state = 'idle'; break; }
          let near = null;
          if (z.alert === 0 && z.groupId) {
            for (const o of this.zombies) if (o !== z && !o.dead && o.groupId === z.groupId && dist2(o.x, o.y, z.x, z.y) < 200 * 200) { near = o; break; }
          }
          z.target = near ? { x: near.x + this.rng.float(-96, 96), y: near.y + this.rng.float(-96, 96) } : (raid.nav ? raid.nav.randomWalkable(this.rng, z.x, z.y, 6) : null);
          z.path = null; z.pathTimer = 0;
          if (!z.target) { z.state = 'idle'; break; }
        }
        const v = this._steerTo(z, z.target, dt);
        if (v) { mvx = v.x; mvy = v.y; spd = z.speed * 0.5; } else { z.target = null; }
        break;
      }
      case 'investigate': {
        z.investigateTime += dt;
        if (!z.target || z.investigateTime > 10) { z.state = 'wander'; z.alert = Math.max(0, z.alert - 0.3); z.target = null; break; }
        if (dist(z.x, z.y, z.target.x, z.target.y) < 24) {
          z.lookTimer += dt;
          z.angle += Math.sin(z.lookTimer * 2.2) * dt * 1.6;
          if (z.lookTimer > 3) { z.state = 'wander'; z.alert = 0.3; z.target = null; }
          break;
        }
        const v = this._steerTo(z, z.target, dt);
        if (v) { mvx = v.x; mvy = v.y; spd = z.speed * 0.8; }
        break;
      }
      case 'chase': {
        if (!p || p.dead) { z.state = 'wander'; break; }
        if (!z.seesPlayer) {
          z.lostTimer += dt;
          if (z.lostTimer > 6) {
            z.state = 'investigate'; z.target = z.lastSeen ? { x: z.lastSeen.x, y: z.lastSeen.y } : null;
            z.investigateTime = 0; z.lookTimer = 0; z.path = null; break;
          }
        }
        if (d <= reach && z.seesPlayer !== false) { z.state = 'attack'; z.cooldown = Math.min(z.cooldown, 0.05); break; }
        if (z.id === 'boss' && this._bossAbilities(z, d, dt)) break;
        const v = this._chaseDir(z, d, dt);
        if (v) { mvx = v.x; mvy = v.y; spd = z.speed * (z.id === 'boss' ? this._bossSpeedMul(z) : 1); }
        // stuck detection
        z.stuckTimer += dt;
        if (z.stuckTimer >= 1.5) {
          if (dist(z.x, z.y, z.lastX, z.lastY) < 4 && this.pathBudget > 0 && raid.nav) {
            this.pathBudget--;
            const goal = z.seesPlayer ? p : (z.lastSeen || p);
            z.path = raid.nav.findPath(z.x, z.y, goal.x, goal.y);
            z.pathIdx = 0; z.pathMode = 2;
          }
          z.stuckTimer = 0; z.lastX = z.x; z.lastY = z.y;
        }
        break;
      }
      case 'attack': {
        if (!p || p.dead) { z.state = 'wander'; break; }
        z.angle = lerpAngle(z.angle, angleTo(z.x, z.y, p.x, p.y), Math.min(1, dt * 10));
        if (z.windupTimer > 0) {
          z.windupTimer -= dt;
          z.attackAnim = clamp(1 - z.windupTimer / Math.max(0.05, type.windup || 0.45), 0, 1);
          if (z.windupTimer <= 0) {
            z.windupTimer = 0;
            if (d <= reach * 1.3) this._hit(z, d);
            z.attackAnim = 1;
            z.cooldown = type.attackCooldown || 1.2;
          }
          break;
        }
        if (z.cooldown > 0) {
          z.cooldown -= dt;
          z.attackAnim = clamp(z.cooldown / (type.attackCooldown || 1.2), 0, 1) * 0.8;
          // keep pressing toward the player during the recovery
          if (d > reach * 0.8) { const v = this._chaseDir(z, d, dt); if (v) { mvx = v.x; mvy = v.y; spd = z.speed * 0.6; } }
          if (d > reach * 1.6 && z.cooldown <= 0) z.state = 'chase';
          break;
        }
        if (d <= reach) { z.windupTimer = type.windup || 0.45; z.hitThisAttack = false; }
        else { z.state = 'chase'; }
        break;
      }
      case 'ability':
        this._bossAbilityUpdate(z, d, dt);
        break;
      default:
        z.state = 'idle';
    }
    if (spd > 0 && (mvx !== 0 || mvy !== 0)) this._move(z, mvx, mvy, spd, dt);
    else z.doorTimer = 0;
    this._separate(z);
    // never overlap the player
    if (p && !p.dead) {
      const min = z.radius + p.radius;
      const dd = dist(z.x, z.y, p.x, p.y);
      if (dd < min && dd > 0.01) {
        const m = Physics.moveCircle(w, z.x, z.y, z.radius, (z.x - p.x) / dd * (min - dd), (z.y - p.y) / dd * (min - dd));
        z.x = m.x; z.y = m.y;
      }
    }
  }

  _steerTo(z, target, dt) {
    const raid = this.raid;
    if (!target) return null;
    const dx = target.x - z.x, dy = target.y - z.y;
    const l = Math.hypot(dx, dy);
    if (l < 8) return null;
    // follow a path if we have one
    z.pathTimer -= dt;
    if (z.path && z.pathIdx < z.path.length) {
      const wp = z.path[z.pathIdx];
      const wx = wp.x - z.x, wy = wp.y - z.y, wl = Math.hypot(wx, wy);
      if (wl < 10) { z.pathIdx++; return this._steerTo(z, target, 0); }
      return { x: wx / wl, y: wy / wl };
    }
    const los = Physics.lineOfSight(this.world, z.x, z.y, target.x, target.y);
    if (!los && z.pathTimer <= 0 && this.pathBudget > 0 && raid.nav) {
      this.pathBudget--;
      z.pathTimer = 2;
      z.path = raid.nav.findPath(z.x, z.y, target.x, target.y);
      z.pathIdx = 0;
      if (!z.path) return { x: dx / l, y: dy / l };
      return this._steerTo(z, target, 0);
    }
    return { x: dx / l, y: dy / l };
  }

  _chaseDir(z, d, dt) {
    const p = this.player, raid = this.raid;
    if (z.pathMode > 0 && z.path && z.pathIdx < z.path.length) {
      z.pathMode -= dt;
      const wp = z.path[z.pathIdx];
      const wx = wp.x - z.x, wy = wp.y - z.y, wl = Math.hypot(wx, wy);
      if (wl < 10) z.pathIdx++;
      if (wl > 0.01) return { x: wx / wl, y: wy / wl };
    }
    if (z.seesPlayer && d <= 48) {
      return { x: (p.x - z.x) / Math.max(1, d), y: (p.y - z.y) / Math.max(1, d) };
    }
    const fd = raid.nav ? raid.nav.dirAt(z.x, z.y) : null;
    if (fd && d > 48) {
      if (z.seesPlayer) {
        // blend with direct steering for smoother pursuit in the open
        const dx = (p.x - z.x) / d, dy = (p.y - z.y) / d;
        const bx = fd.dx * 0.6 + dx * 0.4, by = fd.dy * 0.6 + dy * 0.4, bl = Math.hypot(bx, by) || 1;
        return { x: bx / bl, y: by / bl };
      }
      return { x: fd.dx, y: fd.dy };
    }
    const t = z.seesPlayer ? p : (z.lastSeen || p);
    const dx = t.x - z.x, dy = t.y - z.y, l = Math.hypot(dx, dy);
    if (l < 4) return null;
    return { x: dx / l, y: dy / l };
  }

  _move(z, dx, dy, spd, dt) {
    const w = this.world, raid = this.raid;
    const tileMul = w.speedMul(Math.floor(z.x / TILE), Math.floor(z.y / TILE));
    const step = spd * tileMul * dt;
    // door bashing
    const px = z.x + dx * (z.radius + 6), py = z.y + dy * (z.radius + 6);
    const ptx = Math.floor(px / TILE), pty = Math.floor(py / TILE);
    if (w.tile(ptx, pty) === T.DOOR_CLOSED) {
      z.doorTimer += dt;
      z.attackAnim = 0.5 + 0.5 * Math.sin(z.doorTimer * 12);
      if (z.doorTimer >= (z.id === 'brute' || z.id === 'boss' ? 0.3 : 1.2)) {
        z.doorTimer = 0;
        if (raid.toggleDoor) raid.toggleDoor(ptx, pty, true);
      }
    } else z.doorTimer = 0;
    const ox = z.x, oy = z.y;
    const m = Physics.moveCircle(w, z.x, z.y, z.radius, dx * step, dy * step);
    z.x = m.x; z.y = m.y;
    const moved = Math.hypot(z.x - ox, z.y - oy);
    z.legPhase += moved * (z.id === 'runner' ? 0.16 : 0.1);
    z.moveX = dx; z.moveY = dy;
    if (z.state !== 'attack') z.angle = lerpAngle(z.angle, Math.atan2(dy, dx), Math.min(1, dt * 8));
  }

  _separate(z) {
    const raid = this.raid;
    if (!raid.hash) return;
    this._near.length = 0;
    raid.hash.query(z.x, z.y, 40, this._near);
    let n = 0, pxs = 0, pys = 0;
    for (const o of this._near) {
      if (o === z || o.dead) continue;
      const dx = z.x - o.x, dy = z.y - o.y;
      const r = z.radius + o.radius;
      const d2v = dx * dx + dy * dy;
      if (d2v >= r * r) continue;
      const d = Math.sqrt(d2v) || 0.01;
      const push = (r - d) * (o.id === 'boss' || o.id === 'brute' ? 0.8 : 0.5);
      pxs += dx / d * push; pys += dy / d * push;
      if (++n >= 6) break;
    }
    if (n && (pxs || pys)) {
      if (z.id === 'boss') { pxs *= 0.2; pys *= 0.2; }
      const m = Physics.moveCircle(this.world, z.x, z.y, z.radius, clamp(pxs, -8, 8), clamp(pys, -8, 8));
      z.x = m.x; z.y = m.y;
    }
  }

  _hit(z, d) {
    const p = this.player, raid = this.raid, type = z.type;
    if (!p || p.dead || z.hitThisAttack) return;
    if (!Physics.lineOfSight(this.world, z.x, z.y, p.x, p.y)) return;
    z.hitThisAttack = true;
    this._audio('zombie_attack', { x: z.x, y: z.y });
    p.takeDamage(z.damage, { source: type.name || 'Zombie', from: { x: z.x, y: z.y }, bleedChance: ZAI_BLEED[z.id] || 0.15 });
    if (z.id === 'brute') {
      const a = angleTo(z.x, z.y, p.x, p.y);
      const kb = (type.knockback || 140) / 0.2;
      p.knock = { vx: Math.cos(a) * kb, vy: Math.sin(a) * kb, t: 0.2 };
      if (raid.game && raid.game.camera) raid.game.camera.addShake(9);
    }
    if (z.id === 'toxic') {
      raid.addHazard({ kind: 'toxic', x: p.x, y: p.y, r: type.toxicRadius || 70, duration: type.toxicDuration || 8 });
      p.toxic = Math.max(p.toxic, 4);
      if (raid.fx) raid.fx.toxicCloud(p.x, p.y, type.toxicRadius || 70);
      this._audio('toxic', { x: p.x, y: p.y });
    }
  }

  // ---------------- boss ----------------
  _bossSpeedMul(z) {
    const ph = (z.type.phases || [])[z.phase];
    return ph && ph.speedMul ? ph.speedMul : 1;
  }
  _bossPhase(z) {
    const phases = z.type.phases || [];
    const pct = z.hp / z.hpMax;
    let ph = 0;
    for (let i = 0; i < phases.length; i++) if (pct <= phases[i].hpPct) ph = i;
    if (ph > z.phase) {
      z.phase = ph;
      this._audio('boss_roar', { x: z.x, y: z.y });
      const raid = this.raid;
      if (raid.game && raid.game.camera) raid.game.camera.addShake(12);
      if (raid.game && raid.game.ui) raid.game.ui.toast(ph === 1 ? 'Der Wirt wird rasend!' : 'Der Wirt ruft seine Brut!', 'danger', 3000);
      raid.emitNoise(z.x, z.y, 1200, 'scream');
    }
  }
  _bossAbilities(z, d, dt) {
    const abil = ((z.type.phases || [])[z.phase] || { abilities: ['slam'] }).abilities || ['slam'];
    const t = z.abilityTimers;
    for (const k of Object.keys(t)) t[k] -= dt;
    if (abil.includes('summon') && t.summon <= 0) {
      t.summon = 15;
      this.spawnNearPlayer('walker', 300, 500, 3);
      this._audio('screamer', { x: z.x, y: z.y, pitch: 0.7 });
    }
    if (abil.includes('slam') && t.slam <= 0 && d < 170) {
      z.state = 'ability'; z.ability = { kind: 'slam', t: 0.7, total: 0.7 };
      return true;
    }
    if (abil.includes('charge') && t.charge <= 0 && d > 180 && d < 650 && z.seesPlayer) {
      const a = angleTo(z.x, z.y, this.player.x, this.player.y);
      z.state = 'ability'; z.ability = { kind: 'charge', t: 0.5, total: 0.5, dash: 0.9, vx: Math.cos(a), vy: Math.sin(a), hit: false };
      this._audio('boss_roar', { x: z.x, y: z.y, volume: 0.7 });
      return true;
    }
    return false;
  }
  _bossAbilityUpdate(z, d, dt) {
    const ab = z.ability, p = this.player, raid = this.raid;
    if (!ab || !p) { z.state = 'chase'; return; }
    if (ab.kind === 'slam') {
      ab.t -= dt;
      z.attackAnim = clamp(1 - ab.t / ab.total, 0, 1);
      if (ab.t <= 0) {
        if (d <= 120 + p.radius) p.takeDamage(45, { source: z.type.name || 'Boss', from: { x: z.x, y: z.y }, bleedChance: 0.3 });
        if (raid.fx) { raid.fx.explosion(z.x, z.y, 60); }
        if (raid.game && raid.game.camera) raid.game.camera.addShake(12);
        this._audio('explosion', { x: z.x, y: z.y, volume: 0.6, pitch: 0.6 });
        z.abilityTimers.slam = 6;
        z.ability = null; z.state = 'chase'; z.attackAnim = 1; z.cooldown = 0.8;
      }
      return;
    }
    if (ab.kind === 'charge') {
      if (ab.t > 0) { ab.t -= dt; z.attackAnim = clamp(1 - ab.t / ab.total, 0, 1) * 0.6; z.angle = Math.atan2(ab.vy, ab.vx); return; }
      ab.dash -= dt;
      const step = 420 * dt;
      const m = Physics.moveCircle(this.world, z.x, z.y, z.radius, ab.vx * step, ab.vy * step);
      const blocked = m.collided && Math.hypot(m.x - z.x, m.y - z.y) < step * 0.3;
      z.x = m.x; z.y = m.y;
      z.legPhase += step * 0.08;
      if (!ab.hit && dist(z.x, z.y, p.x, p.y) < z.radius + p.radius + 8) {
        ab.hit = true;
        p.takeDamage(50, { source: z.type.name || 'Boss', from: { x: z.x, y: z.y }, bleedChance: 0.5 });
        p.knock = { vx: ab.vx * 900, vy: ab.vy * 900, t: 0.2 };
        if (raid.game && raid.game.camera) raid.game.camera.addShake(14);
      }
      if (ab.dash <= 0 || blocked) {
        if (blocked && raid.game && raid.game.camera) raid.game.camera.addShake(8);
        z.abilityTimers.charge = 9;
        z.ability = null; z.state = 'chase';
        if (blocked) z.stagger = 0.6;
      }
    }
  }
}
