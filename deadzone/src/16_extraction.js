// 16_extraction.js — ExtractionSystem: activation rules per kind, countdown, cancel/decay, horde hazard,
// required-item consumption, German HUD/prompt texts, events (SPEC §17).
// Dependencies: 00_util.js, 10_items_inventory.js; raid subsystems at runtime.

class ExtractionSystem {
  constructor(raid) {
    this.raid = raid;
    this.points = (raid && raid.world ? raid.world.extractions : []);
    for (const p of this.points) {
      p.active = false; p.state = 'idle'; p.progress = 0; p.hazardTimer = 0; p.lockReason = ''; p.tick = 0;
      if (!p.radius) p.radius = 72;
    }
    this._current = null;
  }
  _ui() { return this.raid && this.raid.game && this.raid.game.ui; }
  _audio(name, opts) { const a = this.raid && this.raid.game && this.raid.game.audio; if (a) a.play(name, opts); }
  _itemName(id) { const d = Items.def(id); return d ? d.name : id; }

  _evaluate(p) {
    const raid = this.raid, pl = raid.player;
    const has = (id) => !!pl && ((pl.inventory && pl.inventory.has(id)) || (pl.secure && pl.secure.has(id)));
    p.lockReason = '';
    switch (p.kind) {
      case 'always': return true;
      case 'timed': {
        const w = p.window || [0, Infinity];
        if (raid.time < w[0]) { p.lockReason = 'öffnet in ' + formatTime(w[0] - raid.time); return false; }
        if (raid.time > w[1]) { p.lockReason = 'Hubschrauber abgeflogen'; return false; }
        return true;
      }
      case 'key': case 'fuel':
        if (has(p.requires)) return true;
        p.lockReason = 'Benötigt: ' + this._itemName(p.requires);
        return false;
      case 'power':
        if (raid.flags && raid.flags.generatorOn) return true;
        p.lockReason = 'Strom nötig (Generator)';
        return false;
      default: return true;
    }
  }

  update(dt) {
    const raid = this.raid, pl = raid && raid.player;
    if (!raid || !pl || pl.dead || raid.ended) return;
    this._current = null;
    for (const p of this.points) {
      if (p.state === 'done') continue;
      const wasActive = p.active;
      p.active = this._evaluate(p);
      const inside = dist(pl.x, pl.y, p.x, p.y) <= p.radius;
      if (p.kind === 'timed' && !p.active && raid.time > (p.window || [0, Infinity])[1]) {
        if (p.state !== 'locked' && wasActive && raid.game && raid.game.ui) raid.game.ui.toast(p.name + ': Hubschrauber abgeflogen', 'warning');
      }
      if (p.state === 'extracting') {
        if (!inside || !p.active) {
          p.state = !p.active && p.kind === 'timed' && raid.time > (p.window || [0, Infinity])[1] ? 'locked' : 'idle';
          const reason = !inside ? 'left' : 'inactive';
          raid.events.emit('extractionCancel', { point: p, reason });
          const ui = this._ui();
          if (ui) ui.toast(reason === 'left' ? 'Extraktion abgebrochen – Zone verlassen' : 'Extraktion abgebrochen – Fenster geschlossen', 'warning');
          this._audio('ui_error');
          continue;
        }
        p.progress += dt;
        p.tick += dt;
        if (p.tick >= 1) { p.tick -= 1; this._audio('extract_tick', { volume: 0.7 }); }
        if (p.hazard === 'horde' && raid.zombies) {
          p.hazardTimer -= dt;
          if (p.hazardTimer <= 0) {
            p.hazardTimer = 3;
            const n = raid.zombies.rng.int(1, 2);
            const zs = raid.zombies.spawnNearPlayer(raid.zombies.rng.chance(0.5) ? 'runner' : 'walker', 400, 700, n);
            for (const z of zs) { z.state = 'chase'; z.alert = 1; z.lastSeen = { x: pl.x, y: pl.y, t: raid.time }; }
          }
        }
        this._current = p;
        if (p.progress >= p.duration) { this._complete(p); return; }
        continue;
      }
      if (!p.active && p.kind === 'timed' && raid.time > (p.window || [0, Infinity])[1]) p.state = 'locked';
      if (inside && p.active) {
        p.state = 'extracting';
        p.tick = 0; p.hazardTimer = 1.5;
        raid.events.emit('extractionStart', { point: p });
        this._audio('extract_start');
        const ui = this._ui();
        if (ui) ui.toast('Extraktion läuft: ' + p.name + (p.hazard === 'horde' ? ' – der Lärm lockt Zombies an!' : ''), 'info', 3000);
        if (p.hazard === 'horde') { this._audio('alarm', { x: p.x, y: p.y }); raid.emitNoise(p.x, p.y, 1200, 'alarm'); }
        this._current = p;
      } else if (p.progress > 0) {
        p.progress = Math.max(0, p.progress - 2 * dt);
      }
    }
  }

  _complete(p) {
    const raid = this.raid, pl = raid.player;
    if ((p.kind === 'key' || p.kind === 'fuel') && p.requires) {
      if (!pl.inventory.removeById(p.requires, 1)) pl.secure.removeById(p.requires, 1);
    }
    p.state = 'done';
    this._audio('extract_done');
    const ui = this._ui();
    if (ui) ui.toast('Extraktion erfolgreich: ' + p.name, 'success', 3000);
    raid.events.emit('extractionDone', { point: p });
    raid.onExtracted(p);
  }

  current() {
    const p = this._current;
    return p ? { point: p, progress: p.progress, duration: p.duration } : null;
  }
  nearestInfo(x, y) {
    let best = null, bd = Infinity;
    for (const p of this.points) { const d = dist(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
    return best ? { point: best, dist: bd } : null;
  }
  hudText() {
    const c = this.current();
    if (c) return 'Extraktion: ' + c.point.name + ' ' + Math.max(0, Math.ceil(c.duration - c.progress)) + ' s';
    const pl = this.raid && this.raid.player;
    if (!pl) return '';
    const active = this.points.filter(p => p.active && p.state !== 'done');
    if (active.length) {
      let best = null, bd = Infinity;
      for (const p of active) { const d = dist(pl.x, pl.y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
      return 'Extraktion offen: ' + best.name + ' (' + Math.round(bd / TILE) + ' m)';
    }
    const timed = this.points.find(p => p.kind === 'timed' && p.lockReason.startsWith('öffnet'));
    if (timed) return timed.name + ' ' + timed.lockReason;
    const n = this.nearestInfo(pl.x, pl.y);
    return n ? n.point.name + ': ' + (n.point.lockReason || 'gesperrt') : '';
  }
  promptFor(point) {
    if (!point) return '';
    if (point.active) return 'Bleib in der Zone, um zu extrahieren';
    return point.name + ' – ' + (point.lockReason || 'gesperrt');
  }
}
