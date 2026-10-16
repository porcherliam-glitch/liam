// 13_player.js — Player: movement, stamina, survival stats, status effects, armor, weapon slots, item use (SPEC §14).
// Decisions: crouch is a toggle (C / touch C); sprint is held (Shift) or toggled (touch). Holding fire repeats
//   semi-auto weapons (WeaponSystem decides the rate). Item use is channelled; firing or switching cancels it.
// Dependencies: 00_util.js, 04 data (CARRY_BASE), 09_collision.js, 10_items_inventory.js, 12_weapons.js (runtime).

class Player {
  constructor(raid, loadout = {}) {
    this.raid = raid;
    this.uid = 'player';
    this.x = 0; this.y = 0; this.angle = 0; this.radius = 12;
    this.equipment = loadout.equipment || new Equipment();
    this.inventory = loadout.inventory || new Inventory(this.equipment.backpackSlots());
    this.secure = loadout.secure || new Inventory(1);
    this.hpMax = Number.isFinite(loadout.hpMax) ? loadout.hpMax : 100;
    this.hp = clamp(Number.isFinite(loadout.hp) ? loadout.hp : this.hpMax, 1, this.hpMax);
    this.stamina = 100; this.staminaMax = 100;
    this.hunger = clamp(Number.isFinite(loadout.hunger) ? loadout.hunger : 100, 0, 100);
    this.thirst = clamp(Number.isFinite(loadout.thirst) ? loadout.thirst : 100, 0, 100);
    this.bleeding = false; this.bleedTimer = 0;
    this.toxic = 0;
    this.effects = [];
    this.crouching = false; this.sprinting = false; this.moving = false;
    this.flashlightOn = true;
    this.dead = false; this.god = false;
    const ws = this.equipment.weaponSlots();
    this.activeSlot = Math.max(0, ws.findIndex(Boolean));
    this.using = null;
    this.interactTarget = null;
    this.holdProgress = 0;
    this.causeOfDeath = null;
    this.stats = { shotsFired: 0, shotsHit: 0, kills: 0, killsByType: {}, damageDealt: 0, damageTaken: 0, lootValue: 0, containersOpened: 0, distance: 0 };
    this.staminaDelay = 0;
    this.stepTimer = 0;
    this.legPhase = 0;
    this.meleeAnim = 0;
    this.knock = null;
    this.hurtTimer = 0;
    this.lastFire = false;
    this.grenadeCooldown = 0;
    this.lowWarned = { hunger: false, thirst: false };
  }

  get weaponInst() {
    if (this.activeSlot >= 0 && this.activeSlot <= 2) return this.equipment.weaponSlots()[this.activeSlot] || null;
    return null;
  }
  get game() { return this.raid && this.raid.game; }
  _audio(name, opts) { const a = this.game && this.game.audio; if (a) a.play(name, opts || { x: this.x, y: this.y }); }
  _toast(text, kind = 'info', ms) { const ui = this.game && this.game.ui; if (ui) ui.toast(text, kind, ms); }

  effectiveHpMax() { return Math.max(20, this.hpMax - (this.thirst < 25 ? 20 : 0)); }
  hasEffect(id) { return this.effects.some(e => e.id === id); }

  carryLimit() {
    const pm = this.game && this.game.profileMgr;
    const def = pm && pm.profile && pm.profile.upgrades ? pm.profile.upgrades.defense || 0 : 0;
    return (typeof CARRY_BASE !== 'undefined' ? CARRY_BASE : 30) + this.equipment.carryBonus() + 5 * def;
  }
  totalWeight() { return this.inventory.weight() + this.equipment.weight() + this.secure.weight(); }
  weightSpeedMul() {
    const r = this.totalWeight() / Math.max(1, this.carryLimit());
    if (r <= 0.7) return 1;
    if (r <= 1) return lerp(1, 0.8, (r - 0.7) / 0.3);
    return 0.55;
  }
  overweight() { return this.totalWeight() > this.carryLimit(); }
  spreadMul() {
    let m = this.crouching ? 0.6 : this.sprinting ? 2.0 : this.moving ? 1.4 : 1.0;
    for (const e of this.effects) if (e.spreadMul) m *= e.spreadMul;
    return m;
  }
  noiseRadius() {
    if (!this.moving) return 0;
    return this.crouching ? 45 : this.sprinting ? 260 : 130;
  }
  screenPos() {
    const cam = this.game && this.game.camera;
    return cam ? cam.worldToScreen(this.x, this.y) : { x: 0, y: 0 };
  }

  update(dt, input) {
    if (this.dead) return;
    const raid = this.raid;
    const world = raid && raid.world;
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.meleeAnim = Math.max(0, this.meleeAnim - dt * 4);
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);

    // ---- effects ----
    let speedMul = 1;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.timer -= dt;
      if (e.speedMul) speedMul *= e.speedMul;
      if (e.hps) this.heal(e.hps * dt, true);
      if (e.timer <= 0) this.effects.splice(i, 1);
    }

    // ---- movement ----
    const ax = input ? input.moveAxis() : { x: 0, y: 0 };
    if (input && input.pressed('crouch')) { this.crouching = !this.crouching; }
    const wantSprint = input ? input.isDown('sprint') : false;
    const mag = Math.hypot(ax.x, ax.y);
    this.moving = mag > 0.05;
    const canSprint = wantSprint && this.moving && this.stamina > 1 && !this.overweight() && !this.crouching && !this.using;
    this.sprinting = canSprint;
    let speed = this.crouching ? 85 : canSprint ? 250 : 150;
    speed *= this.weightSpeedMul() * speedMul * this.equipment.speedMul();
    if (this.using) speed *= 0.55;
    if (world) speed *= world.speedMul(Math.floor(this.x / TILE), Math.floor(this.y / TILE));
    let dx = ax.x * speed * dt, dy = ax.y * speed * dt;
    if (this.knock) {
      const k = this.knock;
      const f = Math.min(dt, k.t);
      dx += k.vx * f; dy += k.vy * f;
      k.t -= dt;
      if (k.t <= 0) this.knock = null;
    }
    if (dx !== 0 || dy !== 0) {
      const ox = this.x, oy = this.y;
      if (world) {
        const r = Physics.moveCircle(world, this.x, this.y, this.radius, dx, dy);
        this.x = r.x; this.y = r.y;
      } else { this.x += dx; this.y += dy; }
      const moved = Math.hypot(this.x - ox, this.y - oy);
      this.stats.distance += moved;
      this.legPhase += moved * 0.12;
    }
    // stamina
    if (this.sprinting) { this.stamina = Math.max(0, this.stamina - 22 * dt); this.staminaDelay = 1; }
    else {
      this.staminaDelay = Math.max(0, this.staminaDelay - dt);
      if (this.staminaDelay <= 0) this.stamina = Math.min(this.staminaMax, this.stamina + 18 * dt * (this.hunger < 25 ? 0.5 : 1));
    }
    // footsteps
    if (this.moving) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = this.sprinting ? 0.3 : 0.38;
        const nr = this.noiseRadius();
        if (raid && raid.emitNoise && nr > 0) raid.emitNoise(this.x, this.y, nr, 'step');
        if (!this.crouching) this._audio(this.sprinting ? 'footstep_run' : 'footstep', { x: this.x, y: this.y, volume: 0.5 });
        if (this.sprinting && raid && raid.fx) raid.fx.footDust(this.x, this.y + 6);
      }
    } else this.stepTimer = 0.1;

    // ---- aim ----
    if (input) {
      const sp = this.screenPos();
      const a = input.aimAngleFrom(sp.x, sp.y);
      if (Number.isFinite(a)) this.angle = a;
    }

    // ---- slots / actions ----
    if (input) {
      for (let i = 0; i < 5; i++) if (input.pressed('slot' + (i + 1))) this.switchSlot(i);
      if (input.pressed('flashlight')) { this.flashlightOn = !this.flashlightOn; this._audio('flashlight', { volume: 0.5 }); }
      if (input.pressed('reload')) this.reload();
      if (input.pressed('quickMed')) this.quickMed();
      if (input.pressed('grenade')) this.throwGrenade();
      const fire = input.wantsFire();
      const edge = fire && !this.lastFire;
      if (fire) this._fire(edge);
      this.lastFire = fire;
    }

    // ---- item use channel ----
    if (this.using) {
      this.using.timer -= dt;
      if (this.using.timer <= 0) this._finishUse();
    }

    // ---- interaction ----
    if (raid && raid.findInteractable) this.interactTarget = raid.findInteractable(this.x, this.y);
    if (input && input.pressed('interact') && this.interactTarget && raid.interact) raid.interact(this.interactTarget);

    // ---- survival ----
    this.hunger = Math.max(0, this.hunger - (2.0 / 60) * dt);
    this.thirst = Math.max(0, this.thirst - (3.0 / 60) * dt);
    if (this.hunger < 25 && !this.lowWarned.hunger) { this.lowWarned.hunger = true; this._toast('Du hast Hunger – iss etwas.', 'warning'); }
    if (this.thirst < 25 && !this.lowWarned.thirst) { this.lowWarned.thirst = true; this._toast('Du hast Durst – trink etwas.', 'warning'); }
    if (this.hunger > 30) this.lowWarned.hunger = false;
    if (this.thirst > 30) this.lowWarned.thirst = false;
    const cap = this.effectiveHpMax();
    if (this.hp > cap) this.hp = cap;
    if (this.hunger <= 0 || this.thirst <= 0) this._drain(0.5 * dt, this.thirst <= 0 ? 'Verdurstet' : 'Verhungert');
    if (this.bleeding) {
      this.bleedTimer += dt;
      this._drain(1.5 * dt, 'Verblutet');
      if (this.bleedTimer >= 45) { this.bleeding = false; this.bleedTimer = 0; }
      this.bleedFx = (this.bleedFx || 0) + dt;
      if (raid && raid.fx && this.bleedFx > 0.5) { this.bleedFx = 0; raid.fx.blood(this.x, this.y, this.angle + Math.PI, 0.3); }
    }
    if (this.toxic > 0) {
      this.toxic = Math.max(0, this.toxic - dt);
      this._drain(2 * dt, 'Vergiftung');
    }
  }

  _drain(amount, cause) {
    if (this.god || this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) { this.hp = 0; this.causeOfDeath = cause; this.die(); }
  }

  _fire(edge) {
    const raid = this.raid;
    if (!raid || !raid.weapons) return;
    if (this.activeSlot === 3) { if (edge) this.throwGrenade(); return; }
    if (this.activeSlot === 4) { if (edge) this.quickMed(); return; }
    const inst = this.weaponInst;
    if (!inst) return;
    if (this.using) { this._toast('Anwendung abgebrochen', 'info', 1000); this.using = null; }
    const def = Items.def(inst);
    if (def && def.weapon && def.weapon.class === 'melee') {
      raid.weapons.melee(inst, this, this.angle);
      return;
    }
    const r = raid.weapons.tryFire(inst, this, this.angle, true, !edge);
    if (r.reason === 'empty' && edge) {
      // auto-reload when trying to fire an empty gun
      const rr = raid.weapons.startReload(inst, this.inventory);
      if (!rr.ok && rr.reason === 'no_ammo') this._toast('Keine passende Munition', 'warning', 1500);
    }
  }

  reload() {
    const inst = this.weaponInst;
    if (!inst || !this.raid || !this.raid.weapons) return;
    if (this.using) this.using = null;
    const r = this.raid.weapons.startReload(inst, this.inventory);
    if (!r.ok && r.reason === 'no_ammo') this._toast('Keine passende Munition', 'warning', 1500);
  }

  throwGrenade() {
    const g = this.equipment.grenade;
    if (!g || g.count < 1 || this.grenadeCooldown > 0 || !this.raid || !this.raid.weapons) {
      if (!g) this._toast('Keine Granate ausgerüstet', 'info', 1200);
      return false;
    }
    this.grenadeCooldown = 0.8;
    const ok = this.raid.weapons.throwGrenade(g, this, this.angle, 1);
    if (ok && g.count <= 0) {
      this.equipment.grenade = null;
      if (this.activeSlot === 3) this.switchSlot(Math.max(0, this.equipment.weaponSlots().findIndex(Boolean)), true);
    }
    return ok;
  }

  quickMed() {
    const m = this.bestMedical();
    if (!m) { this._toast('Keine passende Medizin', 'info', 1200); return; }
    this.useItem(m);
  }

  switchSlot(idx, silent = false) {
    idx = Math.floor(idx);
    if (idx < 0 || idx > 4) return;
    let ok = false;
    if (idx <= 2) ok = !!this.equipment.weaponSlots()[idx];
    else if (idx === 3) ok = !!this.equipment.grenade;
    else ok = !!this.bestMedical();
    if (!ok) {
      if (!silent) { this._audio('ui_error', {}); this._toast('Leer', 'info', 900); }
      return;
    }
    if (idx === this.activeSlot) return;
    const cur = this.weaponInst;
    if (cur && this.raid && this.raid.weapons) this.raid.weapons.cancelReload(cur);
    this.activeSlot = idx;
    this.using = null;
    if (!silent) this._audio('ui_click', { volume: 0.4 });
  }

  bestMedical() {
    const items = [...this.inventory.all(), ...this.secure.all()].filter(i => { const d = Items.def(i); return d && d.medical; });
    if (!items.length) return null;
    if (this.bleeding) {
      const stop = items.filter(i => Items.def(i).medical.stopBleed).sort((a, b) => (Items.def(a).medical.useTime || 2) - (Items.def(b).medical.useTime || 2));
      if (stop.length) return stop[0];
    }
    if (this.toxic > 0) {
      const anti = items.find(i => Items.def(i).medical.cureToxic);
      if (anti) return anti;
    }
    const missing = this.effectiveHpMax() - this.hp;
    if (missing <= 1) return null;
    const heal = items.filter(i => { const m = Items.def(i).medical; return (m.heal || 0) + (m.overTime || 0) > 0; });
    if (!heal.length) return null;
    // smallest kit that covers the missing hp, else the biggest
    heal.sort((a, b) => { const ma = Items.def(a).medical, mb = Items.def(b).medical; return ((ma.heal || 0) + (ma.overTime || 0)) - ((mb.heal || 0) + (mb.overTime || 0)); });
    const enough = heal.find(i => { const m = Items.def(i).medical; return (m.heal || 0) + (m.overTime || 0) >= missing; });
    return enough || heal[heal.length - 1];
  }

  useItem(inst) {
    const d = Items.def(inst);
    if (!d || this.dead) return false;
    const spec = d.medical || d.food || d.water;
    if (!spec) return false;
    const t = spec.useTime || (d.medical ? 2 : 1.5);
    this.using = { inst, timer: t, total: t, name: d.name };
    this._audio(d.medical ? 'heal' : 'eat', { volume: 0.5 });
    return true;
  }

  _finishUse() {
    const u = this.using;
    this.using = null;
    if (!u) return;
    const d = Items.def(u.inst);
    if (!d) return;
    // consume one from wherever the item lives
    let src = null;
    if (this.inventory.indexOf(u.inst.uid) >= 0) src = this.inventory;
    else if (this.secure.indexOf(u.inst.uid) >= 0) src = this.secure;
    if (!src) return;
    src.remove(u.inst.uid, 1);
    if (d.medical) {
      const m = d.medical;
      if (m.heal) this.heal(m.heal);
      if (m.overTime) this.applyEffect({ id: 'regen', timer: m.duration || 20, hps: m.overTime / (m.duration || 20), label: 'Schmerzmittel' });
      if (m.stopBleed) this.cureBleeding();
      if (m.cureToxic) this.cureToxic();
      if (m.stamina) { this.stamina = this.staminaMax; this.applyEffect({ id: 'adrenaline', timer: 20, speedMul: 1.2, label: 'Adrenalin' }); }
      if (d.id === 'med_splint') this.effects = this.effects.filter(e => e.id !== 'fracture');
      this._audio('heal', { volume: 0.6 });
    }
    if (d.food) { this.hunger = clamp(this.hunger + (d.food.hunger || 0), 0, 100); this._audio('eat', { volume: 0.6 }); }
    if (d.water) { this.thirst = clamp(this.thirst + (d.water.thirst || 0), 0, 100); this._audio('eat', { volume: 0.6 }); }
    this._toast(d.name + ' benutzt', 'success', 1200);
    if (this.activeSlot === 4 && !this.bestMedical()) this.switchSlot(Math.max(0, this.equipment.weaponSlots().findIndex(Boolean)), true);
  }

  heal(amount, silent = false) {
    if (this.dead || !(amount > 0)) return;
    const before = this.hp;
    this.hp = Math.min(this.effectiveHpMax(), this.hp + amount);
    if (!silent && this.raid && this.raid.fx && this.hp > before) this.raid.fx.floatingText(this.x, this.y - 20, '+' + Math.round(this.hp - before), '#6cff8a', true);
  }
  applyEffect(effect) {
    if (!effect || !effect.id) return;
    const ex = this.effects.find(e => e.id === effect.id);
    if (ex) Object.assign(ex, effect); else this.effects.push(Object.assign({}, effect));
  }
  cureBleeding() { this.bleeding = false; this.bleedTimer = 0; }
  cureToxic() { this.toxic = 0; }

  takeDamage(amount, opts = {}) {
    if (this.dead || this.god || !(amount > 0)) return 0;
    const raid = this.raid;
    const raw = amount;
    const prot = this.equipment.protection();
    const p = clamp(prot.body * 0.75 + prot.head * 0.25, 0, 0.85);
    let dealt = raw * (1 - p);
    if (this.equipment.armorBody && this.equipment.armorBody.durability !== undefined) this.equipment.armorBody.durability = Math.max(0, this.equipment.armorBody.durability - raw * 0.5);
    if (this.equipment.armorHead && this.equipment.armorHead.durability !== undefined) this.equipment.armorHead.durability = Math.max(0, this.equipment.armorHead.durability - raw * 0.2);
    this.hp -= dealt;
    this.hurtTimer = 0.25;
    this.stats.damageTaken += dealt;
    if (opts.bleedChance && raid && raid.rng && raid.rng.chance(opts.bleedChance * (1 - p * 0.6))) {
      if (!this.bleeding) this._toast('Du blutest! (Q oder Verband)', 'danger', 2000);
      this.bleeding = true; this.bleedTimer = 0;
    }
    if (opts.toxic) this.toxic = Math.max(this.toxic, opts.toxic);
    if (this.using && dealt > 8) { this.using = null; }
    if (raid) {
      if (raid.fx) {
        raid.fx.damageFlash(clamp(dealt / 30, 0.25, 1));
        if (opts.from) raid.fx.hitDirection(angleTo(this.x, this.y, opts.from.x, opts.from.y));
        raid.fx.blood(this.x, this.y, opts.from ? angleTo(opts.from.x, opts.from.y, this.x, this.y) : 0, 0.6);
      }
      if (raid.game && raid.game.camera) raid.game.camera.addShake(clamp(dealt / 4, 2, 10));
      this._audio('player_hurt', { volume: 0.8 });
      if (raid.events) raid.events.emit('playerHit', { amount: dealt });
    }
    if (this.hp <= 0) {
      this.hp = 0;
      const src = opts.source || 'Unbekannt';
      this.causeOfDeath = ['Vergiftung', 'Feuer', 'Verblutet', 'Explosion', 'Verhungert', 'Verdurstet'].includes(src) ? src : 'Getötet von: ' + src;
      this.die();
    }
    return dealt;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    if (!this.causeOfDeath) this.causeOfDeath = 'Unbekannt';
    if (this.raid && this.raid.onPlayerDeath) this.raid.onPlayerDeath();
  }

  serializeState() {
    return { equipment: this.equipment.serialize(), inventory: this.inventory.serialize(), secure: this.secure.serialize(), hp: this.hp };
  }
}
