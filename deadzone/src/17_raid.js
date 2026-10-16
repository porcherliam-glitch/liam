// 17_raid.js — RaidManager: owns one raid (world, nav, player, zombies, weapons, loot, extraction, fx), runs the
// fixed update order, interaction, containers, doors, hazards, POI timers, day/night and the end sequence (SPEC §18).
// Public top-level functions: darknessForHour(h), formatHour(h).
// Dependencies: everything in 00–16, 18 (ProfileManager via game), 21 (FX) at runtime.

function darknessForHour(h) {
  h = ((Number(h) || 0) % 24 + 24) % 24;
  if (h >= 8 && h < 17) return 0.08;
  if (h >= 17 && h < 20) return lerp(0.08, 0.85, (h - 17) / 3);
  if (h >= 5 && h < 8) return lerp(0.85, 0.08, (h - 5) / 3);
  return 0.85;
}

function formatHour(h) {
  h = ((Number(h) || 0) % 24 + 24) % 24;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}

const RAID_DOOR_PROMPTS = { open: 'E – Tür schließen', closed: 'E – Tür öffnen', locked: 'E – Verschlossene Tür (Laborkarte)' };

class RaidManager {
  constructor(game) {
    this.game = game;
    this.world = null; this.nav = null; this.hash = null; this.player = null; this.zombies = null; this.weapons = null;
    this.loot = null; this.extraction = null; this.fx = null; this.events = new EventBus();
    this.rng = null; this.seed = 0; this.mapId = null; this.map = null; this.missionStates = [];
    this.xp = 0; this.time = 0; this.timeLimit = 1500; this.hour = 12; this.darkness = 0;
    this.flags = { generatorOn: false, bossKilled: false };
    this.hazards = []; this.grenades = []; this.noiseMarkers = [];
    this.ended = false; this.result = null; this.paused = false;
    this.navTimer = 0;
    this.warned = { 300: false, 60: false };
    this.hazardTick = 0;
  }

  start({ mapId, missionIds = [], seed, loadout }) {
    const map = (typeof MAPS !== 'undefined' && MAPS[mapId]) || MAPS.city;
    this.mapId = map.id; this.map = map;
    this.seed = (typeof seed === 'number' && Number.isFinite(seed)) ? seed >>> 0 : hashString(String(seed));
    this.rng = new RNG(this.seed);
    const defs = (missionIds || []).map(id => MISSION_BY_ID[id]).filter(d => d && d.mapId === map.id);
    this.missionIds = defs.map(d => d.id);
    this.world = WorldGenerator.generate(map.id, this.seed, defs);
    this.nav = new Nav(this.world);
    this.hash = new SpatialHash(96);
    this.fx = new FX(this);
    this.loot = new LootSystem(this);
    this.zombies = new ZombieAI(this);
    this.weapons = new WeaponSystem(this);
    this.player = new Player(this, loadout || {});
    this.player.x = this.world.playerSpawn.x;
    this.player.y = this.world.playerSpawn.y;
    // face the map centre
    this.player.angle = angleTo(this.player.x, this.player.y, this.world.pixelW / 2, this.world.pixelH / 2);
    if (this.game && this.game.input) this.game.input.lastAim = this.player.angle;
    this.zombies.spawnInitial(this.world);
    this.extraction = new ExtractionSystem(this);
    if (this.game && this.game.missions) this.game.missions.startRaid(this, defs);
    this.time = 0;
    this.timeLimit = map.raidDuration || 1500;
    this.hour = Number.isFinite(map.startHour) ? map.startHour : 12;
    this.darkness = darknessForHour(this.hour);
    this.flags = { generatorOn: false, bossKilled: false };
    this.navTimer = 0;
    this.nav.rebuild(this.player.x, this.player.y, 60);
    const cam = this.game && this.game.camera;
    if (cam) { cam.setBounds(this.world.pixelW, this.world.pixelH); cam.snap(this.player.x, this.player.y); }
    const audio = this.game && this.game.audio;
    if (audio) { audio.startAmbient(map.id); audio.setListener(this.player.x, this.player.y); }
    return this;
  }

  get input() { return this.game && this.game.input; }

  darknessAt(x, y) {
    return clamp(this.darkness + (this.world && this.world.isIndoor(x, y) ? 0.35 : 0), 0, 0.92);
  }

  update(dt) {
    if (this.ended || !this.world) return;
    dt = Math.min(dt, 0.1);
    // 1. time
    this.time += dt;
    this.hour = ((this.map.startHour || 0) + this.time * 10 / this.timeLimit) % 24;
    this.darkness = darknessForHour(this.hour);
    // 2. spatial hash
    this.hash.clear();
    for (const z of this.zombies.zombies) if (!z.dead) this.hash.insert(z);
    // 3–6
    this.player.update(dt, this.input);
    if (this.ended) return;
    this.weapons.update(dt);
    if (this.ended) return;
    this.zombies.update(dt);
    if (this.ended) return;
    this.extraction.update(dt);
    if (this.ended) return;
    // 7. hazards and toxic tiles
    this._hazards(dt);
    if (this.ended) return;
    // 8. POIs and generator
    this._pois(dt);
    // 9. flow field
    if ((this.navTimer += dt) >= 0.4) { this.navTimer = 0; this.nav.rebuild(this.player.x, this.player.y, 60); }
    // 10. fx, camera, audio, noise markers
    this.fx.update(dt);
    const cam = this.game && this.game.camera;
    if (cam) {
      const la = 60;
      cam.follow(this.player.x, this.player.y, dt, Math.cos(this.player.angle) * la, Math.sin(this.player.angle) * la);
      cam.update(dt);
    }
    const audio = this.game && this.game.audio;
    if (audio) audio.setListener(this.player.x, this.player.y);
    for (let i = this.noiseMarkers.length - 1; i >= 0; i--) { this.noiseMarkers[i].ttl -= dt; if (this.noiseMarkers[i].ttl <= 0) this.noiseMarkers.splice(i, 1); }
    // 11. timer
    const left = this.timeLimit - this.time;
    const ui = this.game && this.game.ui;
    if (left <= 300 && !this.warned[300]) { this.warned[300] = true; if (ui) ui.toast('Noch 5 Minuten bis zum Ende des Einsatzes', 'warning', 4000); if (audio) audio.play('warning'); }
    if (left <= 60 && !this.warned[60]) { this.warned[60] = true; if (ui) ui.toast('Noch 60 Sekunden – sofort extrahieren!', 'danger', 4000); if (audio) audio.play('warning'); }
    if (left <= 0) this.onTimeout();
  }

  _hazards(dt) {
    const p = this.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.timer += dt;
      if (h.timer >= h.duration) { this.hazards.splice(i, 1); continue; }
      if (h.kind === 'fire' && this.fx) this.fx.fire(h.x, h.y, h.r);
      if (h.kind === 'toxic' && this.fx && Math.floor(h.timer * 3) !== Math.floor((h.timer - dt) * 3)) this.fx.toxicCloud(h.x, h.y, h.r * 0.5);
      const inside = dist(p.x, p.y, h.x, h.y) <= h.r;
      if (inside && !p.dead) {
        if (h.kind === 'toxic') {
          p._drainTick = (p._drainTick || 0) + dt;
          p.toxic = Math.max(p.toxic, 3);
          this._damageOverTime(p, 3 * dt, 'Vergiftung');
        } else if (h.kind === 'fire') {
          this._damageOverTime(p, 8 * dt, 'Feuer');
        }
      }
      if (h.kind === 'fire') {
        for (const z of this.zombies.inRadius(h.x, h.y, h.r)) this.zombies.damage(z, 18 * dt, { pen: 3, source: 'fire' });
      }
    }
    // toxic floor tiles
    if (!p.dead && this.world.tile(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) === T.TOXIC) {
      p.toxic = Math.max(p.toxic, 2);
      this._damageOverTime(p, 2 * dt, 'Vergiftung');
      this.hazardTick += dt;
      if (this.hazardTick > 1.2) { this.hazardTick = 0; const a = this.game && this.game.audio; if (a) a.play('toxic', { volume: 0.5 }); }
    }
  }

  _damageOverTime(p, amount, source) {
    if (p.god || p.dead) return;
    p.hp -= amount;
    p.stats.damageTaken += amount;
    if (this.fx) this.fx.damageFlash(0.15);
    if (p.hp <= 0) { p.hp = 0; p.causeOfDeath = source; p.die(); }
  }

  _pois(dt) {
    const p = this.player;
    let shownHold = false;
    for (const poi of this.world.pois) {
      if (poi.used || poi.type === 'generator') continue;
      const inside = dist(p.x, p.y, poi.x, poi.y) <= (poi.radius || 64);
      // only POIs relevant to an active objective run the timer
      const relevant = (this.missionStates || []).some(st => [...st.objectives, ...st.optional].some(o => !o.done && o.def.type === 'investigate' && o.def.target === poi.type));
      if (!relevant) continue;
      if (inside) {
        poi.timer += dt;
        p.holdProgress = clamp(poi.timer / 5, 0, 1);
        p.holdLabel = 'Gebiet untersuchen …';
        shownHold = true;
        if (poi.timer >= 5) {
          poi.used = true;
          p.holdProgress = 0;
          this.events.emit('poiReached', { poi });
        }
      } else poi.timer = Math.max(0, poi.timer - dt);
    }
    // generator hold
    const it = p.interactTarget;
    const input = this.input;
    if (it && it.kind === 'poi' && it.ref && it.ref.type === 'generator' && !this.flags.generatorOn && input && input.isDown('interact')) {
      p.holdProgress += dt / 4;
      p.holdLabel = 'Generator starten …';
      shownHold = true;
      if (p.holdProgress >= 1) {
        p.holdProgress = 0;
        this.flags.generatorOn = true;
        it.ref.used = true;
        this.events.emit('generatorOn');
        const ui = this.game && this.game.ui;
        if (ui) ui.toast('Generator läuft – Strom ist wieder da', 'success', 3000);
        const audio = this.game && this.game.audio;
        if (audio) audio.play('alarm', { x: it.ref.x, y: it.ref.y });
        this.emitNoise(it.ref.x, it.ref.y, 500, 'alarm');
        // power brings the lights back on
        for (const l of this.world.lights) if (l.indoor) l.flicker = false;
      }
    } else if (!shownHold) {
      p.holdProgress = 0;
      p.holdLabel = null;
    }
  }

  emitNoise(x, y, radius, kind = 'shot') {
    if (!(radius > 0)) return;
    if (this.zombies) this.zombies.onNoise(x, y, radius, kind);
    if (kind !== 'step') {
      this.noiseMarkers.push({ x, y, radius, kind, ttl: 1.2 });
      if (this.noiseMarkers.length > 40) this.noiseMarkers.shift();
    }
    this.events.emit('noise', { x, y, radius, kind });
  }

  addHazard(h) {
    if (!h) return;
    this.hazards.push({ kind: h.kind || 'toxic', x: h.x, y: h.y, r: h.r || 60, duration: h.duration || 6, timer: 0 });
    if (this.hazards.length > 40) this.hazards.shift();
  }

  // ---------------- interaction ----------------
  findInteractable(x, y, maxDist = 56) {
    const w = this.world;
    const cands = [];
    const prio = { container: 0, loot: 1, body: 2, door: 3, poi: 4, extraction: 5 };
    for (const c of w.containers) {
      const d = dist(x, y, c.x, c.y);
      if (d > maxDist) continue;
      if (!Physics.lineOfSight(w, x, y, c.x, c.y)) continue;
      const name = (typeof CONTAINER_NAMES !== 'undefined' && CONTAINER_NAMES[c.type]) || 'Behälter';
      const kind = c.type === 'body' ? 'body' : 'container';
      const verb = c.type === 'body' ? 'durchsuchen' : (c.opened ? 'öffnen' : 'durchsuchen');
      cands.push({ kind, ref: c, x: c.x, y: c.y, dist: d, prompt: 'E – ' + name + ' ' + verb + (c.opened && c.items && !c.items.some(Boolean) ? ' (leer)' : ''), hold: false });
    }
    for (const fl of w.floorLoot) {
      const d = dist(x, y, fl.x, fl.y);
      if (d > maxDist) continue;
      const def = Items.def(fl.inst);
      cands.push({ kind: 'loot', ref: fl, x: fl.x, y: fl.y, dist: d, prompt: 'E – ' + (def ? def.name : 'Gegenstand') + (fl.inst.count > 1 ? ' ×' + fl.inst.count : '') + ' aufheben', hold: false });
    }
    // doors in the 3×3 tiles around
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = w.tile(tx + dx, ty + dy);
      if (!tileIsDoor(t)) continue;
      const cx = (tx + dx + 0.5) * TILE, cy = (ty + dy + 0.5) * TILE;
      const d = dist(x, y, cx, cy);
      if (d > maxDist) continue;
      const prompt = t === T.DOOR_OPEN ? RAID_DOOR_PROMPTS.open : t === T.DOOR_LOCKED ? RAID_DOOR_PROMPTS.locked : RAID_DOOR_PROMPTS.closed;
      cands.push({ kind: 'door', ref: { tx: tx + dx, ty: ty + dy }, x: cx, y: cy, dist: d, prompt, hold: false });
    }
    for (const poi of w.pois) {
      if (poi.type !== 'generator') continue;
      const d = dist(x, y, poi.x, poi.y);
      if (d > maxDist) continue;
      cands.push({ kind: 'poi', ref: poi, x: poi.x, y: poi.y, dist: d, prompt: this.flags.generatorOn ? 'Generator läuft' : 'E halten – Generator starten', hold: !this.flags.generatorOn });
    }
    if (this.extraction) {
      for (const p of this.extraction.points) {
        const d = dist(x, y, p.x, p.y);
        if (d > p.radius || p.active || p.state === 'done') continue;
        cands.push({ kind: 'extraction', ref: p, x: p.x, y: p.y, dist: d + 40, prompt: this.extraction.promptFor(p), hold: false });
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => (Math.abs(a.dist - b.dist) <= 8 ? prio[a.kind] - prio[b.kind] : a.dist - b.dist));
    return cands[0];
  }

  interact(it) {
    if (!it || this.ended) return;
    const ui = this.game && this.game.ui;
    switch (it.kind) {
      case 'container': case 'body': this.openContainer(it.ref); break;
      case 'door': {
        const t = this.world.tile(it.ref.tx, it.ref.ty);
        if (t === T.DOOR_LOCKED) {
          const p = this.player;
          if (p.inventory.has('key_lab_card') || p.secure.has('key_lab_card')) {
            this.world.setTile(it.ref.tx, it.ref.ty, T.DOOR_OPEN);
            const b = this.world.buildingAt((it.ref.tx + 0.5) * TILE, (it.ref.ty + 0.5) * TILE);
            if (b) b.locked = false;
            if (ui) ui.toast('Laborkarte akzeptiert – Tür entriegelt', 'success');
            const a = this.game.audio; if (a) a.play('door_open', { x: it.x, y: it.y });
            this.events.emit('doorToggled', { tx: it.ref.tx, ty: it.ref.ty, open: true });
            this.emitNoise(it.x, it.y, 300, 'door');
          } else {
            if (ui) ui.toast('Verschlossen – Laborkarte nötig', 'warning');
            const a = this.game && this.game.audio; if (a) a.play('ui_error');
          }
        } else this.toggleDoor(it.ref.tx, it.ref.ty, false);
        break;
      }
      case 'loot': this.pickFloorLoot(it.ref); break;
      case 'extraction': if (ui) ui.toast(this.extraction.promptFor(it.ref), 'info'); break;
      default: break;
    }
  }

  openContainer(c) {
    if (!c) return;
    if (c.items === null || c.items === undefined) this.loot.rollContainer(c, this.world);
    if (!c.opened) {
      c.opened = true;
      this.player.stats.containersOpened++;
      this.events.emit('containerOpened', { container: c });
    }
    const a = this.game && this.game.audio;
    if (a) a.play('loot_open', { x: c.x, y: c.y });
    this.emitNoise(c.x, c.y, 70, 'step');
    if (this.game && this.game.ui) this.game.ui.openLoot(c);
  }

  takeFromContainer(c, idx, count = Infinity) {
    if (!c || !Array.isArray(c.items)) return { ok: false, remaining: null };
    const inst = c.items[idx];
    if (!inst) return { ok: false, remaining: null };
    const p = this.player;
    let part = inst;
    const takeAll = !(count < inst.count);
    if (!takeAll) { part = Items.clone(inst); part.count = Math.max(1, Math.floor(count)); }
    const before = part.count;
    part.raidFound = true;
    const r = p.inventory.add(part);
    const taken = before - (r.remaining ? r.remaining.count : 0);
    if (taken > 0) {
      const takenPart = Items.clone(part); takenPart.count = taken;
      p.stats.lootValue += Items.value(takenPart);
      if (takeAll) {
        if (r.remaining) c.items[idx] = r.remaining; else c.items[idx] = null;
      } else {
        inst.count -= taken;
        if (inst.count <= 0) c.items[idx] = null;
      }
      this.events.emit('itemPicked', { inst: takenPart, source: 'container' });
      const a = this.game && this.game.audio; if (a) a.play('pickup', { volume: 0.6 });
    }
    return { ok: taken > 0 && !r.remaining, remaining: r.remaining || null, taken };
  }

  takeAll(c) {
    if (!c || !Array.isArray(c.items)) return 0;
    let n = 0, left = false;
    for (let i = 0; i < c.items.length; i++) {
      if (!c.items[i]) continue;
      const r = this.takeFromContainer(c, i);
      if (r.taken > 0) n++;
      if (r.remaining) left = true;
    }
    c.items = c.items.filter(Boolean);
    if (left) {
      const ui = this.game && this.game.ui; if (ui) ui.toast('Inventar voll', 'warning');
      const a = this.game && this.game.audio; if (a) a.play('ui_error');
    }
    return n;
  }

  putIntoContainer(c, inst) {
    if (!c || !inst) return false;
    if (!Array.isArray(c.items)) c.items = [];
    for (const it of c.items) {
      if (it && Items.canStack(it, inst) && it.count < Items.stackMax(it)) {
        const mv = Math.min(inst.count, Items.stackMax(it) - it.count);
        it.count += mv; inst.count -= mv;
        if (inst.count <= 0) return true;
      }
    }
    if (c.items.filter(Boolean).length >= 12) return false;
    c.items.push(inst);
    return true;
  }

  toggleDoor(tx, ty, byZombie = false) {
    const t = this.world.tile(tx, ty);
    if (t !== T.DOOR_CLOSED && t !== T.DOOR_OPEN) return false;
    const open = t === T.DOOR_CLOSED;
    if (!open && !byZombie) {
      // do not close a door on someone standing in it
      const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
      if (dist(this.player.x, this.player.y, cx, cy) < this.player.radius + 14) return false;
      if (this.zombies.inRadius(cx, cy, 14).length) return false;
    }
    this.world.setTile(tx, ty, open ? T.DOOR_OPEN : T.DOOR_CLOSED);
    const a = this.game && this.game.audio;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (a) a.play(byZombie ? 'melee_hit' : (open ? 'door_open' : 'door_close'), { x, y });
    if (byZombie && this.fx) this.fx.impact(x, y, 0, T.DOOR_CLOSED);
    this.emitNoise(x, y, byZombie ? 350 : 200, 'door');
    this.events.emit('doorToggled', { tx, ty, open });
    return true;
  }

  dropItem(inst, x, y) {
    if (!inst) return null;
    const w = this.world;
    let px = x, py = y;
    for (let k = 0; k < 6; k++) {
      const a = this.rng.float(0, Math.PI * 2), r = this.rng.float(0, 20);
      const nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r;
      if (w.isWalkable(Math.floor(nx / TILE), Math.floor(ny / TILE))) { px = nx; py = ny; break; }
    }
    if (!w.isWalkable(Math.floor(px / TILE), Math.floor(py / TILE)) && this.player) { px = this.player.x; py = this.player.y; }
    const fl = { uid: Uid.next(), inst, x: px, y: py };
    w.floorLoot.push(fl);
    if (w.floorLoot.length > 300) w.floorLoot.shift();
    return fl;
  }

  pickFloorLoot(fl) {
    const w = this.world;
    if (!fl || !w.floorLoot.includes(fl)) return { picked: 0, remaining: 0 };
    const p = this.player;
    const inst = fl.inst;
    const before = inst.count;
    inst.raidFound = true;
    const r = p.inventory.add(inst);
    const picked = before - (r.remaining ? r.remaining.count : 0);
    const ui = this.game && this.game.ui;
    const a = this.game && this.game.audio;
    if (!r.remaining) w.floorLoot.splice(w.floorLoot.indexOf(fl), 1);
    else {
      fl.inst = r.remaining;
      if (ui) ui.toast('Inventar voll', 'warning');
      if (a) a.play('ui_error');
    }
    if (picked > 0) {
      const part = Items.clone(inst); part.count = picked;
      p.stats.lootValue += Items.value(part);
      this.events.emit('itemPicked', { inst: part, source: 'floor' });
      if (a) a.play('pickup', { volume: 0.7 });
      const def = Items.def(inst);
      if (ui) ui.toast('+' + picked + ' ' + (def ? def.name : ''), 'success', 1400);
    }
    return { picked, remaining: r.remaining ? r.remaining.count : 0 };
  }

  addXp(n) { if (Number.isFinite(n) && n > 0) this.xp += n; }

  onPlayerDeath() { if (!this.ended) this.end('death'); }
  onTimeout() {
    if (this.ended) return;
    const ui = this.game && this.game.ui;
    if (ui) ui.toast('Zeit abgelaufen – Als vermisst gemeldet', 'danger', 5000);
    this.player.causeOfDeath = 'Zeit abgelaufen';
    this.end('mia');
  }
  onExtracted(point) {
    if (this.ended) return;
    this.events.emit('extracted', { extractionId: point ? point.id : null, inventory: this.player.inventory, secure: this.player.secure });
    this.end('extracted', point);
  }
  abort() { if (!this.ended) { this.player.causeOfDeath = 'Einsatz abgebrochen'; this.end('abort'); } }
  pause() { this.paused = true; }
  resume() { this.paused = false; }

  end(outcome, point = null) {
    if (this.ended) return;
    this.ended = true;
    const game = this.game;
    const pm = game && game.profileMgr;
    const p = this.player;
    const st = p.stats;
    const result = {
      outcome, mapId: this.mapId, mapName: this.map.name, seed: this.seed, extractionName: point ? point.name : null,
      causeOfDeath: outcome === 'extracted' ? null : (p.causeOfDeath || null),
      durationSec: Math.round(this.time), kills: st.kills, killsByType: Object.assign({}, st.killsByType), shotsFired: st.shotsFired, shotsHit: st.shotsHit,
      accuracy: st.shotsFired ? clamp(st.shotsHit / st.shotsFired, 0, 1) : 0, damageTaken: Math.round(st.damageTaken), containersOpened: st.containersOpened,
      distance: Math.round(st.distance / TILE), xpGained: 0, creditsGained: 0, levelBefore: pm ? pm.level() : 1, levelAfter: 1, leveledUp: false,
      xpBefore: pm ? pm.xp() : 0, xpAfter: 0, xpToNext: 0, itemsKept: [], itemsLost: [], itemsSold: [], lootValue: 0,
      missionsCompleted: [], missionsFailed: [], objectivesDone: 0, rewards: { credits: 0, xp: 0, items: [] }, insuranceReturned: [],
    };
    if (pm && pm.profile) {
      pm.applyRaidResult(result, p, this);
      const m = outcome === 'extracted' ? game.missions.finalizeOnExtract(this, pm.profile) : game.missions.finalizeOnDeath(this, pm.profile);
      result.missionsCompleted = m.completed; result.missionsFailed = m.failed; result.objectivesDone = m.objectivesDone; result.rewards = m.rewards;
      result.xpGained += m.rewards.xp; result.creditsGained += m.rewards.credits;
      result.levelAfter = pm.level(); result.leveledUp = result.levelAfter > result.levelBefore;
      result.xpAfter = pm.xp(); result.xpToNext = pm.xpProgress().next;
      if (typeof evaluateAchievements === 'function') result.achievements = evaluateAchievements(pm.profile);
    }
    this.result = result;
    this.events.emit('raidEnd', { result });
    this.events.clear();
    if (game && game.save && pm && pm.profile) game.save.save(pm.serialize());
    if (game && game.audio) game.audio.stopAmbient();
    if (game && game.onRaidEnded) game.onRaidEnded(result);
  }

  debugState() {
    return {
      mapId: this.mapId, seed: this.seed, time: Math.round(this.time), hour: formatHour(this.hour), darkness: Math.round(this.darkness * 100) / 100,
      player: this.player ? { x: Math.round(this.player.x), y: Math.round(this.player.y), hp: Math.round(this.player.hp) } : null,
      zombies: this.zombies ? this.zombies.aliveCount() : 0, projectiles: this.weapons ? this.weapons.projectiles.length : 0,
      particles: this.fx ? this.fx.particles.length : 0, flags: Object.assign({}, this.flags), ended: this.ended,
    };
  }
}
