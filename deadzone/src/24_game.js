// 24_game.js — Game: subsystem wiring, fixed-step loop, state machine (main/base/raid/result), raid start/end,
// global keys, settings, save rules, debug API (SPEC §25, §26).
// Dependencies: every module. DOM access: canvas, window listeners, #errbar.

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.rng = new RNG((Date.now() ^ 0x5bd1e995) >>> 0);
    this.events = null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
    this.save = null; this.audio = null; this.input = null; this.camera = null; this.renderer = null; this.ui = null;
    this.profileMgr = null; this.missions = null; this.raid = null;
    this.state = 'main';
    this.paused = false;
    this.auto = true;
    this.fps = 60;
    this.slowFrames = 0;
    this._slowWindow = 0;
    this._acc = 0;
    this._last = 0;
    this._fpsAcc = 0; this._fpsN = 0;
    this._playAcc = 0;
  }

  init() {
    this.events = new EventBus();
    this.save = new SaveSystem(this);
    this.settings = this.save.loadSettings();
    this.audio = new AudioManager(this);
    this.input = new InputManager(this, this.canvas);
    // first start on a touch device: medium quality
    if (!this.save._get(SaveSystem.SETTINGS_KEY) && this.input.touchMode) { this.settings.quality = 'medium'; this.save.saveSettings(this.settings); }
    this.camera = new Camera(this);
    this.renderer = new Renderer(this, this.canvas);
    this.profileMgr = new ProfileManager(this);
    this.missions = new MissionSystem(this);
    this.ui = new UIManager(this);
    this.ui.init();
    this.renderer.resize();
    this._applyAudio();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 200));
    const unlock = () => { if (this.audio) { this.audio.unlock(); this._applyAudio(); } };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'raid' && !this.paused && this.raid && !this.raid.ended) this.pauseRaid();
    });
    this.ui.showScreen('main');
    this._last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const loop = (ts) => { this.loop(ts); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  _applyAudio() {
    if (!this.audio) return;
    this.audio.setVolumes({ master: this.settings.master, sfx: this.settings.sfx, music: this.settings.music });
  }

  loop(ts) {
    const now = Number.isFinite(ts) ? ts : (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.25);
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc >= 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
    try {
      if (this.auto) {
        this._acc += dt;
        let steps = 0;
        while (this._acc >= FIXED_DT && steps < 3) { this.frame(FIXED_DT); this._acc -= FIXED_DT; steps++; }
        if (this._acc >= FIXED_DT) { this._acc = 0; this.slowFrames++; }
      }
      this.render(dt);
    } catch (e) {
      Log.error('Game loop error: ' + (e && e.stack ? e.stack : e));
      this._showError(e);
    }
  }

  frame(dt) {
    this.handleGlobalKeys();
    if (this.state === 'raid' && !this.paused && this.raid && !this.raid.ended) this.update(dt);
    if (this.ui) this.ui.updateHud(this.state === 'raid' ? this.raid : null, dt);
    if (this.audio) this.audio.update(dt);
    this.input.endFrame();
  }

  step(dt = FIXED_DT, n = 1) {
    const k = Math.max(0, Math.min(100000, Math.floor(Number(n) || 1)));
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : FIXED_DT;
    for (let i = 0; i < k; i++) this.frame(d);
    return k;
  }

  update(dt) {
    this.raid.update(dt);
    this._playAcc += dt;
    if (this._playAcc >= 1 && this.profileMgr.profile) { this.profileMgr.profile.stats.playTime += Math.floor(this._playAcc); this._playAcc -= Math.floor(this._playAcc); }
    // adaptive quality
    this._slowWindow += dt;
    if (this._slowWindow >= 5) {
      if (this.slowFrames > 30 && this.settings.quality !== 'low' && this.auto) {
        this.settings.quality = this.settings.quality === 'high' ? 'medium' : 'low';
        this.save.saveSettings(this.settings);
        this.renderer.resize();
        this.ui.toast('Grafikqualität reduziert', 'info');
      }
      this.slowFrames = 0; this._slowWindow = 0;
    }
  }

  handleGlobalKeys() {
    const inp = this.input, ui = this.ui;
    if (!inp || !ui) return;
    if (ui._modalOpen) return;
    if (this.state === 'raid' && this.raid && !this.raid.ended) {
      if (inp.pressedRaw('pause')) {
        if (ui.currentScreen && ui.currentScreen !== 'pause') ui.closeScreen();
        else this.togglePause();
      }
      if (!this.paused && inp.pressedRaw('inventory')) {
        if (ui.currentScreen === 'inventory') ui.closeScreen(); else if (!ui.currentScreen || ui.currentScreen === 'loot' || ui.currentScreen === 'map') ui.openInventory();
      }
      if (!this.paused && inp.pressedRaw('map')) {
        if (ui.currentScreen === 'map') ui.closeScreen(); else if (!ui.currentScreen || ui.currentScreen === 'inventory' || ui.currentScreen === 'loot') ui.openMap();
      }
      if (inp.pressedRaw('drop') && (ui.currentScreen === 'inventory' || ui.currentScreen === 'loot')) ui.dropSelected();
    } else if (this.state === 'base') {
      if (inp.pressedRaw('pause') && ui.currentScreen && ui.currentScreen !== 'base') ui.closeScreen();
    } else if (this.state === 'main') {
      if (inp.pressedRaw('pause') && ui.currentScreen && ui.currentScreen !== 'main') ui.closeScreen();
    }
  }

  render(dt) {
    if (!this.renderer) return;
    if (this.raid && this.state === 'raid') this.renderer.render(this.raid, dt);
    else if (this.raid && this.state === 'result') this.renderer.render(this.raid, 0);
    else this.renderer.renderMenuBackground(this.renderer.t += dt);
  }

  // ---------------- flow ----------------
  async newGame({ confirm = true } = {}) {
    if (confirm && this.save.hasSave()) {
      const ok = await this.ui.confirm('Neues Spiel starten? Der vorhandene Spielstand wird überschrieben.', { danger: true, ok: 'Überschreiben' });
      if (!ok) return false;
    }
    this.raid = null;
    this.profileMgr.newProfile();
    this.save.save(this.profileMgr.serialize());
    this.enterBase();
    this.ui.toast('Willkommen in Bunker 7. Rüste dich aus und plane deinen ersten Einsatz.', 'info', 5000);
    return true;
  }

  continueGame() {
    const r = this.save.load();
    if (!r.ok) {
      this.ui.toast('Kein gültiger Spielstand' + (r.error ? ': ' + r.error : ''), 'warning', 4000);
      return { ok: false, repaired: [], mia: false };
    }
    this.profileMgr.setProfile(r.profile);
    let mia = false;
    if (this.profileMgr.profile.raidInProgress) {
      this.profileMgr.applyMiaOnReload();
      mia = true;
      this.save.save(this.profileMgr.serialize());
      this.ui.toast('Dein letzter Einsatz wurde abgebrochen – Ausrüstung verloren.', 'danger', 6000);
    }
    if (r.repaired && r.repaired.length) this.ui.toast('Spielstand repariert: ' + r.repaired.slice(0, 2).join(', '), 'warning', 5000);
    this.enterBase();
    return { ok: true, repaired: r.repaired || [], mia };
  }

  enterBase() {
    if (!this.profileMgr.profile) { this.returnToMain(); return; }
    this.state = 'base';
    this.paused = false;
    this.raid = null;
    if (!this.profileMgr.profile.trader || !this.profileMgr.profile.trader.stock || !this.profileMgr.profile.trader.stock.length) this.profileMgr.restockTrader();
    if (this.ui) { this.ui.unbindRaid(); this.ui.showScreen('base'); }
    if (this.audio) this.audio.stopAmbient();
    this.save.save(this.profileMgr.serialize());
  }

  startRaid(mapId, opts = {}) {
    const pm = this.profileMgr;
    if (!pm.profile) { Log.warn('startRaid without profile – creating a new one'); pm.newProfile(); }
    const map = MAPS[mapId] ? mapId : 'city';
    if (!pm.isMapUnlocked(map)) { Log.warn('startRaid: map locked ' + map); this.ui.toast('Gebiet eigentlich gesperrt – Einsatz trotzdem gestartet', 'warning'); }
    const warns = pm.loadoutWarnings();
    if (warns.length) this.ui.toast(warns[0], 'warning', 3500);
    let seed = opts.seed;
    if (seed === undefined || seed === null || seed === '') seed = this.rng.int(1, 2 ** 31 - 1);
    seed = (typeof seed === 'number' && Number.isFinite(seed)) ? seed >>> 0 : hashString(String(seed));
    const missionIds = Array.isArray(opts.missionIds) ? opts.missionIds.filter(id => MISSION_BY_ID[id] && MISSION_BY_ID[id].mapId === map)
      : pm.profile.missions.active.filter(id => MISSION_BY_ID[id] && MISSION_BY_ID[id].mapId === map);
    this.save.markRaidStart(pm.profile, { mapId: map, missionIds, seed, startedAt: Date.now() });
    if (this.raid && this.raid.events) this.raid.events.clear();
    this.raid = new RaidManager(this);
    this.raid.start({ mapId: map, missionIds, seed, loadout: pm.buildLoadout() });
    this.state = 'raid';
    this.paused = false;
    this.renderer.invalidateChunks();
    this.ui.showScreen(null);
    this.ui.bindRaid(this.raid);
    this.ui.toast(MAPS[map].name + ' – finde Beute und einen Weg hinaus.', 'info', 3500);
    return { ok: true, mapId: map, seed, missionIds: missionIds.slice() };
  }

  onRaidEnded(result) {
    this.state = 'result';
    this.paused = false;
    this.ui.unbindRaid();
    this.ui.showScreen(result.outcome === 'extracted' ? 'result' : 'death', { result });
  }

  pauseRaid() {
    if (this.state !== 'raid' || !this.raid || this.raid.ended) return;
    this.paused = true;
    this.raid.pause();
    this.ui.showScreen('pause');
  }
  resumeRaid() {
    if (this.state !== 'raid') return;
    this.paused = false;
    if (this.raid) this.raid.resume();
    if (this.ui.currentScreen) this.ui.showScreen(null);
  }
  togglePause() { if (this.paused) this.resumeRaid(); else this.pauseRaid(); }

  async abortRaid() {
    if (!this.raid || this.raid.ended) return false;
    const ok = await this.ui.confirm('Abbrechen zählt wie ein Tod: Ausrüstung und Beute gehen verloren.', { danger: true, ok: 'Einsatz abbrechen' });
    if (!ok) return false;
    this.paused = false;
    this.raid.abort();
    return true;
  }

  returnToMain() {
    if (this.profileMgr.profile && this.state !== 'raid') this.save.save(this.profileMgr.serialize());
    if (this.raid && !this.raid.ended && this.state === 'raid') return;
    this.raid = null;
    this.state = 'main';
    this.paused = false;
    if (this.audio) this.audio.stopAmbient();
    this.ui.unbindRaid();
    this.ui.showScreen('main');
  }

  saveNow() {
    if (this.state === 'raid') { this.ui.toast('Im Einsatz nicht möglich', 'warning'); return false; }
    if (!this.profileMgr.profile) { this.ui.toast('Kein Spielstand geladen', 'warning'); return false; }
    const ok = this.save.save(this.profileMgr.serialize());
    this.ui.toast(ok ? 'Spielstand gespeichert' : 'Speichern fehlgeschlagen', ok ? 'success' : 'danger');
    return ok;
  }

  async resetSave() {
    const ok = await this.ui.confirm('Spielstand wirklich löschen? Das kann nicht rückgängig gemacht werden.', { danger: true, ok: 'Löschen' });
    if (!ok) return false;
    this.save.reset();
    this.profileMgr.profile = null;
    this.raid = null;
    this.state = 'main';
    this.ui.unbindRaid();
    this.ui.showScreen('main');
    this.ui.toast('Spielstand gelöscht', 'info');
    return true;
  }

  applySettings(partial) {
    if (!partial || typeof partial !== 'object') return this.settings;
    const prevQ = this.settings.quality;
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (partial[k] !== undefined) this.settings[k] = partial[k];
    this.save.saveSettings(this.settings);
    this._applyAudio();
    if (partial.touchControls !== undefined && this.input) this.input.reevaluateTouch();
    if (this.settings.quality !== prevQ) { this.renderer.resize(); this.renderer.invalidateChunks(); }
    if (this.ui) this.ui.applyTouchVisibility();
    return this.settings;
  }

  onResize() {
    if (this.renderer) this.renderer.resize();
    if (this.ui) this.ui.onResize();
  }

  _showError(e) {
    const bar = typeof document !== 'undefined' ? document.getElementById('errbar') : null;
    if (!bar) return;
    bar.hidden = false;
    bar.innerHTML = '<span>Fehler: ' + uiEsc(String(e && e.message ? e.message : e)).slice(0, 300) + '</span><button type="button" data-action="close-error">✕</button>';
    const b = bar.querySelector('button');
    if (b) b.onclick = () => { bar.hidden = true; };
  }

  // ---------------- debug API ----------------
  debugApi() {
    const g = this;
    const R = () => g.raid;
    const nearest = (kind) => {
      const raid = R();
      if (!raid || !raid.player) return null;
      const p = raid.player, w = raid.world;
      let best = null, bd = Infinity;
      const consider = (x, y, ref) => { const d = dist(p.x, p.y, x, y); if (d < bd) { bd = d; best = { x, y, dist: d, ref }; } };
      const walkNeighbour = (c) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && w.isWalkable(c.tx + dx, c.ty + dy)) return true; return false; };
      if (kind === 'container' || kind === 'container_closed') for (const c of w.containers) { if (kind === 'container_closed' && c.opened) continue; if (c.type === 'body') continue; if (walkNeighbour(c)) consider(c.x, c.y, c); }
      else if (kind === 'door') { for (let ty = 0; ty < w.h; ty++) for (let tx = 0; tx < w.w; tx++) if (tileIsDoor(w.tiles[ty * w.w + tx])) consider((tx + 0.5) * TILE, (ty + 0.5) * TILE, { tx, ty }); }
      else if (kind === 'loot') for (const fl of w.floorLoot) consider(fl.x, fl.y, fl);
      else if (kind === 'extraction' || kind === 'extraction_active') for (const e of raid.extraction.points) { if (kind === 'extraction_active' && !e.active) continue; consider(e.x, e.y, e); }
      else if (kind === 'poi') for (const poi of w.pois) consider(poi.x, poi.y, poi);
      else if (kind === 'generator') for (const poi of w.pois) { if (poi.type === 'generator') consider(poi.x, poi.y, poi); }
      else if (kind === 'zombie') for (const z of raid.zombies.zombies) { if (!z.dead) consider(z.x, z.y, z); }
      else if (kind === 'interactable') { const it = raid.findInteractable(p.x, p.y, Infinity); if (it) return { x: it.x, y: it.y, dist: it.dist, ref: it.ref }; }
      return best;
    };
    return {
      version: GAME_VERSION, game: g, errors: Log.errors, log: Log,
      Items, item: (id, count = 1) => Items.create(id, count),
      data: { ITEMS, ITEM_LIST, MISSIONS, MISSION_BY_ID, MAPS, MAP_ORDER, UPGRADES, RECIPES, TRADER_STOCK, LOOT_TABLES, ZOMBIE_TYPES, T, RARITY, CATEGORY_NAMES, ECONOMY, XP_REWARDS, DEFAULT_SETTINGS },
      lib: { RNG, Inventory, Equipment, Physics, Nav, SpatialHash, WorldGenerator, Progression, ProfileManager, SaveSystem, MissionSystem },
      state: () => g.state,
      newGame: () => g.newGame({ confirm: false }),
      continueGame: () => g.continueGame(),
      toBase: () => g.enterBase(),
      startRaid: (mapId = 'city', opts = {}) => g.startRaid(mapId, opts || {}),
      raid: () => g.raid, player: () => (g.raid ? g.raid.player : null), world: () => (g.raid ? g.raid.world : null), zombies: () => (g.raid ? g.raid.zombies.zombies : null),
      profile: () => g.profileMgr.profile,
      setAuto: (b) => { g.auto = !!b; },
      step: (dt = FIXED_DT, n = 1) => g.step(dt, n),
      key: (code, down) => g.input.debugKey(code, down),
      mouse: (x, y, down) => g.input.debugMouse(x, y, down),
      aimAt: (wx, wy) => g.input.debugAimWorld(wx, wy),
      fire: (down) => g.input.debugMouse(undefined, undefined, !!down),
      teleport: (x, y) => { const raid = R(); if (!raid || !raid.player || !Number.isFinite(x) || !Number.isFinite(y)) return; raid.player.x = x; raid.player.y = y; g.camera.snap(x, y); },
      giveItem: (id, count = 1) => { const raid = R(); if (!raid || !raid.player) return { ok: false, remaining: null }; const inst = Items.create(id, count); if (!inst) return { ok: false, remaining: null }; inst.raidFound = true; return raid.player.inventory.add(inst); },
      giveStash: (id, count = 1) => { const st = g.profileMgr.stash; const inst = Items.create(id, count); if (!st || !inst) return { ok: false, remaining: null }; const r = st.add(inst); if (g.ui) g.ui.refresh(); return r; },
      giveCredits: (n) => { const p = g.profileMgr.profile; if (p && Number.isFinite(n)) { p.credits += n; if (g.ui) g.ui.refresh(); } },
      spawnZombie: (type, x, y) => { const raid = R(); return raid ? raid.zombies.spawn(type, x, y) : null; },
      killAll: ({ remove = true } = {}) => {
        const raid = R(); if (!raid) return 0;
        let n = 0;
        for (const z of raid.zombies.zombies) if (!z.dead) { raid.zombies.kill(z, { silent: true }); n++; }
        if (remove) { raid.zombies.zombies = raid.zombies.zombies.filter(z => !z.dead); raid.zombies.boss = null; }
        return n;
      },
      alertAll: () => { const raid = R(); if (!raid || !raid.player) return; for (const z of raid.zombies.zombies) if (!z.dead) { z.state = 'chase'; z.alert = 1; z.lurking = false; z.lastSeen = { x: raid.player.x, y: raid.player.y, t: raid.time }; z.target = { x: raid.player.x, y: raid.player.y }; } },
      noise: (x, y, radius = 600, kind = 'shot') => { const raid = R(); if (raid) raid.emitNoise(x, y, radius, kind); },
      director: (on) => { const raid = R(); if (raid) raid.zombies.directorEnabled = !!on; },
      setTime: (sec) => { const raid = R(); if (raid && Number.isFinite(sec)) raid.time = sec; },
      setHour: (h) => { const raid = R(); if (raid && Number.isFinite(h)) { raid.hour = h; raid.darkness = darknessForHour(h); raid.map = Object.assign({}, raid.map, { startHour: ((h - raid.time * 10 / raid.timeLimit) % 24 + 24) % 24 }); } },
      setFlag: (name, v) => { const raid = R(); if (raid) raid.flags[name] = v; },
      god: (b) => { const raid = R(); if (raid && raid.player) raid.player.god = !!b; },
      extractNow: () => {
        const raid = R(); if (!raid || raid.ended) return null;
        const c = raid.extraction.current();
        const pt = c ? c.point : (raid.extraction.points.find(p => p.active) || raid.extraction.points[0]);
        if (!pt) return null;
        raid.onExtracted(pt);
        return pt.id;
      },
      die: () => { const raid = R(); if (raid && raid.player && !raid.player.dead) { raid.player.god = false; raid.player.causeOfDeath = 'Getötet von: Testlauf'; raid.player.die(); } },
      pathExists: (x0, y0, x1, y1) => { const raid = R(); return !!(raid && raid.nav.findPath(x0, y0, x1, y1, 20000)); },
      nearest,
      validateWorld: (mapId, seed, missionIds = []) => {
        const defs = (missionIds || []).map(id => MISSION_BY_ID[id]).filter(Boolean);
        return WorldGenerator.validate(WorldGenerator.generate(mapId, seed, defs), defs);
      },
      validateMissions: () => MissionSystem.validate(),
      save: () => g.save.save(g.profileMgr.serialize()), load: () => g.save.load(), reset: () => g.save.reset(),
      ui: g.ui, click: (selector) => { const el = document.querySelector(selector); if (el) el.click(); return !!el; },
      screen: () => g.ui.currentScreen,
    };
  }
}
