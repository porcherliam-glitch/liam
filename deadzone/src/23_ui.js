// 23_ui.js — UIManager core (SPEC §24): screen registry and stack, toasts, modals (confirm/alert/promptNumber),
// raid HUD with DOM budget, mobile controls (floating sticks, fire button, action buttons), raid bindings.
// Screens live in 23_ui_base.js / 23_ui_raid.js as hoisted uiScreen<Name>(ui, root, data) -> {refresh, destroy};
// inventory widgets live in 23_ui_grid.js. Shared helpers here: uiEl, uiEsc, uiSetText, uiBtn, uiBar, uiItemName.
// Dependencies: all game modules at runtime. DOM access only inside methods.

function uiEsc(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function uiEl(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined && html !== null) e.innerHTML = html;
  return e;
}
function uiSetText(el, str) {
  if (!el) return;
  const s = String(str);
  if (el._txt !== s) { el._txt = s; el.textContent = s; }
}
function uiBtn(label, action, onClick, opts = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn' + (opts.primary ? ' btn-primary' : '') + (opts.danger ? ' btn-danger' : '') + (opts.small ? ' btn-small' : '') + (opts.cls ? ' ' + opts.cls : '');
  if (action) b.dataset.action = action;
  b.innerHTML = label;
  if (opts.disabled) { b.disabled = true; if (opts.reason) b.title = opts.reason; }
  else if (opts.title) b.title = opts.title;
  if (onClick) b.addEventListener('click', (e) => { e.stopPropagation(); if (b.disabled) return; onClick(e); });
  return b;
}
function uiBar(pct, cls, label) {
  const w = uiEl('div', 'bar ' + (cls || ''));
  const f = uiEl('div', 'bar-fill');
  f.style.transform = 'scaleX(' + clamp(pct, 0, 1).toFixed(3) + ')';
  w.appendChild(f);
  if (label) w.appendChild(uiEl('span', 'bar-label', uiEsc(label)));
  return w;
}
function uiItemName(inst) {
  const d = Items.def(inst);
  if (!d) return '?';
  return '<span class="rarity-' + d.rarity + '">' + uiEsc(d.name) + '</span>';
}
function uiSkulls(n) { let s = ''; for (let i = 0; i < 5; i++) s += '<span class="skull' + (i < n ? ' on' : '') + '">☠</span>'; return s; }

class UIManager {
  constructor(game) {
    this.game = game;
    this.screens = {};
    this.currentScreen = null;
    this.returnTo = undefined;
    this.active = null;
    this.selected = null;
    this.hudCache = {};
    this.hud = null;
    this.raidSubs = [];
    this.boss = null;
    this.frame = 0;
    this.hudTimer = 0;
    this.listTimer = 0;
    this.modalQueue = [];
    this.pointers = new Map();
  }

  init() {
    this.root = document.getElementById('ui');
    this.hudEl = document.getElementById('hud');
    this.mobileEl = document.getElementById('mobile');
    this.toastEl = document.getElementById('toasts');
    this.modalEl = document.getElementById('modal');
    this.screens = {
      main: uiScreenMain, base: uiScreenBase, stash: uiScreenStash, armory: uiScreenArmory, medbay: uiScreenMedbay, workshop: uiScreenWorkshop,
      radio: uiScreenRadio, defense: uiScreenDefense, trader: uiScreenTrader, missionSelect: uiScreenMissionSelect, inventory: uiScreenInventory,
      loot: uiScreenLoot, map: uiScreenMap, pause: uiScreenPause, settings: uiScreenSettings, result: uiScreenResult, death: uiScreenDeath,
      stats: uiScreenStats, credits: uiScreenCredits,
    };
    this._buildHud();
    this._buildMobile();
    if (this.hudEl) this.hudEl.hidden = true;
    const ev = this.game.events;
    if (ev) {
      ev.on('missionComplete', ({ mission, rewards }) => this.toast('Auftrag abgeschlossen: ' + mission.title + (rewards ? ' (+' + formatCredits(rewards.credits) + ', +' + rewards.xp + ' EP)' : ''), 'success', 4500));
      ev.on('levelUp', ({ level, unlockedMaps }) => {
        this.toast('Stufe ' + level + ' erreicht – ' + Progression.rankTitle(level), 'success', 4000);
        for (const m of unlockedMaps || []) this.toast('Neues Gebiet freigeschaltet: ' + (MAPS[m] ? MAPS[m].name : m), 'info', 5000);
      });
    }
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest ? e.target.closest('[data-action="back"],[data-action="close"]') : null;
      if (b && !b.disabled && !b._handled) { this.closeScreen(); }
    });
    document.addEventListener('pointerdown', (e) => { if (this.ctxMenu && !this.ctxMenu.contains(e.target)) this.closeContextMenu(); }, true);
    // UI click sound
    this.root.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('button')) { const a = this.game.audio; if (a) a.play('ui_click', { volume: 0.5 }); } });
  }

  // ---------------- screens ----------------
  showScreen(name, data = {}) {
    if (this.active && this.active.destroy) { try { this.active.destroy(); } catch (e) { Log.warn('screen destroy failed', e && e.message); } }
    this.active = null;
    this.closeContextMenu();
    this.hideTooltip();
    const prev = this.currentScreen;
    if (name === 'settings' || name === 'stats' || name === 'credits') { if (prev !== name) this.returnTo = prev; }
    else this.returnTo = undefined;
    this.root.innerHTML = '';
    this.currentScreen = name || null;
    if (name && name !== 'loot' && name !== 'inventory') this.selected = null;
    if (name) {
      const fn = this.screens[name];
      const section = uiEl('section', 'screen screen-' + name);
      section.dataset.screen = name;
      this.root.appendChild(section);
      this.root.hidden = false;
      this.root.classList.toggle('overlay', this.game.state === 'raid');
      if (typeof fn === 'function') {
        try { this.active = fn(this, section, data || {}) || null; }
        catch (e) { Log.error('Screen ' + name + ' failed: ' + (e && e.stack ? e.stack : e)); section.innerHTML = '<div class="panel"><p class="danger">Fehler beim Anzeigen dieses Bildschirms.</p></div>'; section.appendChild(uiBtn('Zurück', 'back', null)); }
      }
      const a = this.game.audio; if (a && prev !== name) a.play('ui_open', { volume: 0.4 });
    } else {
      this.root.hidden = true;
      this.root.classList.remove('overlay');
    }
    if (this.game.input) this.game.input.setEnabled(name === null || name === undefined);
    if (this.hudEl) this.hudEl.hidden = this.game.state !== 'raid';
    this.applyTouchVisibility();
  }

  closeScreen() {
    const cur = this.currentScreen;
    if (this.returnTo !== undefined) {
      const r = this.returnTo;
      this.returnTo = undefined;
      this.showScreen(r);
      return;
    }
    if (this.game.state === 'raid') {
      this.showScreen(null);
      if (cur === 'pause') this.game.resumeRaid();
      return;
    }
    if (this.game.state === 'main' || !this.game.profileMgr.profile) { this.showScreen('main'); return; }
    if (this.game.state === 'result') { this.game.enterBase(); return; }
    this.showScreen('base');
  }

  refresh() {
    if (this.active && this.active.refresh) {
      try { this.active.refresh(); } catch (e) { Log.error('refresh failed: ' + (e && e.message)); }
    }
  }

  // ---------------- toasts & modals ----------------
  toast(text, kind = 'info', ms = 2600) {
    if (!this.toastEl || !text) return;
    // merge identical consecutive toasts
    const last = this.toastEl.lastElementChild;
    if (last && last._text === text) { last._count = (last._count || 1) + 1; last.querySelector('.toast-count').textContent = '×' + last._count; clearTimeout(last._t); last._t = setTimeout(() => this._removeToast(last), ms); return; }
    const t = uiEl('div', 'toast toast-' + kind, '<span class="toast-text">' + uiEsc(text) + '</span><span class="toast-count"></span>');
    t._text = text;
    this.toastEl.appendChild(t);
    while (this.toastEl.children.length > 5) this.toastEl.removeChild(this.toastEl.firstElementChild);
    t._t = setTimeout(() => this._removeToast(t), ms);
  }
  _removeToast(t) {
    if (!t.parentNode) return;
    t.classList.add('out');
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
  }

  _modal(build) {
    return new Promise(resolve => {
      const run = () => {
        const m = this.modalEl;
        m.innerHTML = '';
        m.hidden = false;
        const box = uiEl('div', 'modal-box panel');
        m.appendChild(box);
        const finish = (v) => {
          document.removeEventListener('keydown', onKey, true);
          m.hidden = true; m.innerHTML = '';
          this._modalOpen = false;
          resolve(v);
          const next = this.modalQueue.shift();
          if (next) next();
        };
        const keys = {};
        const onKey = (e) => {
          if (e.key === 'Enter' && keys.enter) { e.preventDefault(); e.stopPropagation(); keys.enter(); }
          else if (e.key === 'Escape' && keys.escape) { e.preventDefault(); e.stopPropagation(); keys.escape(); }
        };
        document.addEventListener('keydown', onKey, true);
        this._modalOpen = true;
        build(box, finish, keys);
        const f = box.querySelector('input, .btn-primary, button');
        if (f && f.focus) f.focus();
      };
      if (this._modalOpen) this.modalQueue.push(run); else run();
    });
  }
  confirm(text, opts = {}) {
    return this._modal((box, finish, keys) => {
      box.appendChild(uiEl('p', 'modal-text', uiEsc(text)));
      const row = uiEl('div', 'row modal-buttons');
      row.appendChild(uiBtn(uiEsc(opts.cancel || 'Abbrechen'), 'modal-cancel', () => finish(false)));
      row.appendChild(uiBtn(uiEsc(opts.ok || 'Ja'), 'modal-ok', () => finish(true), { primary: !opts.danger, danger: !!opts.danger }));
      box.appendChild(row);
      keys.enter = () => finish(true); keys.escape = () => finish(false);
    });
  }
  alert(text, title) {
    return this._modal((box, finish, keys) => {
      if (title) box.appendChild(uiEl('h3', 'panel-title', uiEsc(title)));
      box.appendChild(uiEl('p', 'modal-text', uiEsc(text)));
      const row = uiEl('div', 'row modal-buttons');
      row.appendChild(uiBtn('OK', 'modal-ok', () => finish(), { primary: true }));
      box.appendChild(row);
      keys.enter = () => finish(); keys.escape = () => finish();
    });
  }
  promptNumber(text, opts = {}) {
    const min = Math.max(1, opts.min || 1), max = Math.max(min, opts.max || 1);
    const val = clamp(opts.value !== undefined ? opts.value : Math.floor(max / 2), min, max);
    return this._modal((box, finish, keys) => {
      box.appendChild(uiEl('p', 'modal-text', uiEsc(text)));
      const range = uiEl('input'); range.type = 'range'; range.min = min; range.max = max; range.value = val; range.className = 'range';
      const num = uiEl('input'); num.type = 'number'; num.min = min; num.max = max; num.value = val; num.className = 'num';
      range.addEventListener('input', () => { num.value = range.value; });
      num.addEventListener('input', () => { range.value = clamp(Number(num.value) || min, min, max); });
      const row1 = uiEl('div', 'row'); row1.appendChild(range); row1.appendChild(num);
      box.appendChild(row1);
      const ok = () => finish(clamp(Math.floor(Number(num.value) || min), min, max));
      const row = uiEl('div', 'row modal-buttons');
      row.appendChild(uiBtn('Abbrechen', 'modal-cancel', () => finish(null)));
      row.appendChild(uiBtn('OK', 'modal-ok', ok, { primary: true }));
      box.appendChild(row);
      keys.enter = ok; keys.escape = () => finish(null);
    });
  }

  // ---------------- tooltip & context menu (shared) ----------------
  showTooltip(inst, anchor) { if (typeof uiTooltip === 'function') uiTooltip(this, inst, anchor); }
  hideTooltip() { if (this.tooltipEl) { this.tooltipEl.remove(); this.tooltipEl = null; } }
  closeContextMenu() { if (this.ctxMenu) { this.ctxMenu.remove(); this.ctxMenu = null; } }
  buildGrid(inventory, opts) { return uiBuildGrid(this, inventory, opts); }

  // ---------------- HUD ----------------
  _buildHud() {
    const h = this.hudEl;
    if (!h) return;
    h.innerHTML = `
      <div class="hud-tl">
        <div class="hud-bars">
          <div class="bar bar-hp"><div class="bar-fill" data-h="hp"></div><span class="bar-label" data-h="hpText"></span></div>
          <div class="bar bar-stam"><div class="bar-fill" data-h="stam"></div></div>
          <div class="hud-survival"><span data-h="hunger" title="Nahrung">🍖 100</span><span data-h="thirst" title="Wasser">💧 100</span><span data-h="weight" title="Gewicht">⚖ 0</span></div>
        </div>
        <div class="hud-armor" data-h="armor"></div>
        <div class="hud-status" data-h="status"></div>
      </div>
      <div class="hud-tc"><div class="hud-map" data-h="map"></div><div class="hud-timer" data-h="timer"></div><div class="hud-clock" data-h="clock"></div></div>
      <div class="hud-tr"><canvas id="minimap" width="180" height="180"></canvas></div>
      <div class="hud-boss" data-h="boss" hidden><div class="hud-boss-name" data-h="bossName"></div><div class="bar bar-boss"><div class="bar-fill" data-h="bossFill"></div></div></div>
      <div class="hud-bl"><div class="hud-objectives" data-h="objectives"></div><div class="hud-extract" data-h="extract"></div></div>
      <div class="hud-bc"><div class="hud-prompt" data-h="prompt" hidden></div><div class="bar bar-hold" data-h="holdBar" hidden><div class="bar-fill" data-h="hold"></div></div><div class="hud-channel" data-h="channel" hidden><span data-h="channelText"></span><div class="bar"><div class="bar-fill" data-h="channelFill"></div></div></div></div>
      <div class="hud-br"><div class="hud-weapon"><div class="hud-wname" data-h="wname"></div><div class="hud-ammo" data-h="ammo"></div><div class="hud-wsub" data-h="wsub"></div></div><div class="hud-slots" data-h="slots"></div></div>
      <div class="hud-cross" data-h="cross"></div>`;
    this.hud = {};
    h.querySelectorAll('[data-h]').forEach(e => { this.hud[e.dataset.h] = e; });
    this.minimap = h.querySelector('#minimap');
  }

  bindRaid(raid) {
    this.unbindRaid(true);
    this.boss = null;
    this.hudCache = {};
    this.listTimer = 0;
    if (!raid || !raid.events) return;
    const ev = raid.events;
    this.raidSubs.push(ev.on('boss', (b) => { this.boss = b; }));
    this.raidSubs.push(ev.on('bossDead', () => { this.boss = null; if (this.hud.boss) this.hud.boss.hidden = true; }));
    this.raidSubs.push(ev.on('objectiveComplete', () => { this.listTimer = 0; this.hudCache.obj = null; }));
    this.raidSubs.push(ev.on('extractionStart', () => { this.hudCache.extract = null; }));
    this.raidSubs.push(ev.on('extractionCancel', () => { this.hudCache.extract = null; }));
    this.raidSubs.push(ev.on('toast', (d) => { if (d && d.text) this.toast(d.text, d.kind); }));
    if (this.hudEl) this.hudEl.hidden = false;
    if (this.hud.map) uiSetText(this.hud.map, raid.map ? raid.map.name : '');
    this.applyTouchVisibility();
  }

  unbindRaid(keepHud) {
    for (const off of this.raidSubs) { try { off(); } catch (e) { /* ignore */ } }
    this.raidSubs = [];
    this.selected = null;
    this.boss = null;
    if (!keepHud) {
      if (this.hudEl) this.hudEl.hidden = true;
      this.setTouchVisible(false);
    }
  }

  updateHud(raid, dt) {
    if (!raid || !raid.player || !this.hud || !this.hudEl || this.hudEl.hidden) return;
    const h = this.hud, p = raid.player;
    this.frame++;
    // every frame: bars and crosshair
    const hpMax = p.effectiveHpMax ? p.effectiveHpMax() : p.hpMax;
    h.hp.style.transform = 'scaleX(' + clamp(p.hp / Math.max(1, p.hpMax), 0, 1).toFixed(3) + ')';
    h.stam.style.transform = 'scaleX(' + clamp(p.stamina / p.staminaMax, 0, 1).toFixed(3) + ')';
    this.hudEl.classList.toggle('low-hp', p.hp < p.hpMax * 0.3 && !p.dead);
    const input = this.game.input;
    const cross = h.cross;
    if (input && !input.touchMode && !this.currentScreen) {
      cross.hidden = false;
      const m = input.mouse;
      const inst = p.weaponInst, d = inst ? Items.def(inst) : null;
      const spread = d && d.weapon && d.weapon.class !== 'melee' ? (d.weapon.spread || 0.03) * (p.spreadMul ? p.spreadMul() : 1) * (1 + ((inst.rt && inst.rt.bloom) || 0)) : 0.02;
      const dd = Math.hypot(m.x - this.game.camera.width / 2, m.y - this.game.camera.height / 2);
      const gap = clamp(4 + Math.tan(spread) * Math.max(80, dd), 4, 40);
      cross.style.transform = 'translate(' + (m.x | 0) + 'px,' + (m.y | 0) + 'px)';
      cross.style.setProperty('--gap', gap.toFixed(1) + 'px');
    } else cross.hidden = true;
    // hold / channel bars
    const hold = p.holdProgress > 0;
    h.holdBar.hidden = !hold;
    if (hold) h.hold.style.transform = 'scaleX(' + clamp(p.holdProgress, 0, 1).toFixed(3) + ')';
    if (p.using) {
      h.channel.hidden = false;
      uiSetText(h.channelText, p.using.name + ' …');
      h.channelFill.style.transform = 'scaleX(' + clamp(1 - p.using.timer / Math.max(0.01, p.using.total), 0, 1).toFixed(3) + ')';
    } else h.channel.hidden = true;
    // boss bar
    if (this.boss && raid.zombies.boss && !raid.zombies.boss.dead && this.boss.near) {
      h.boss.hidden = false;
      uiSetText(h.bossName, this.boss.name + (this.boss.phase > 0 ? ' – Phase ' + (this.boss.phase + 1) : ''));
      h.bossFill.style.transform = 'scaleX(' + clamp(this.boss.hp / this.boss.hpMax, 0, 1).toFixed(3) + ')';
    } else h.boss.hidden = true;
    // minimap every 4th frame
    if (this.game.settings.minimap !== false) {
      if (this.minimap.hidden) this.minimap.hidden = false;
      if (this.frame % 4 === 0 && this.game.renderer) this.game.renderer.renderMinimap(raid, this.minimap, 180);
    } else this.minimap.hidden = true;
    // 10 Hz text
    this.hudTimer += dt;
    if (this.hudTimer < 0.1) return;
    this.hudTimer = 0;
    uiSetText(h.hpText, Math.ceil(p.hp) + ' / ' + Math.round(hpMax));
    uiSetText(h.hunger, '🍖 ' + Math.round(p.hunger));
    uiSetText(h.thirst, '💧 ' + Math.round(p.thirst));
    h.hunger.classList.toggle('warn', p.hunger < 25); h.thirst.classList.toggle('warn', p.thirst < 25);
    const wt = p.totalWeight(), lim = p.carryLimit();
    uiSetText(h.weight, '⚖ ' + formatWeight(wt) + ' / ' + Math.round(lim));
    h.weight.classList.toggle('danger', wt > lim);
    const left = Math.max(0, raid.timeLimit - raid.time);
    uiSetText(h.timer, formatTime(left));
    h.timer.classList.toggle('danger', left < 120);
    uiSetText(h.clock, formatHour(raid.hour) + ' Uhr');
    const it = p.interactTarget;
    const promptText = p.holdProgress > 0 && p.holdLabel ? p.holdLabel : it ? it.prompt : '';
    if (promptText) { h.prompt.hidden = false; uiSetText(h.prompt, promptText); } else h.prompt.hidden = true;
    if (this.mobileE) uiSetText(this.mobileE, it ? (it.prompt || 'E').replace(/^E (halten )?– /, '') : 'E');
    // weapon panel
    const inst = p.weaponInst;
    const d = inst ? Items.def(inst) : null;
    let wname = '—', ammo = '', wsub = '';
    if (p.activeSlot === 3) { const g = p.equipment.grenade; wname = g ? Items.def(g).name : 'Keine Granate'; ammo = g ? '×' + g.count : ''; wsub = 'Feuern: werfen'; }
    else if (p.activeSlot === 4) { const m = p.bestMedical(); wname = 'Schnellheilung'; ammo = m ? Items.def(m).name : '—'; wsub = 'Feuern: benutzen'; }
    else if (d) {
      wname = d.name;
      if (d.weapon.class === 'melee') { ammo = 'Nahkampf'; }
      else {
        ammo = raid.weapons.reserveText(inst, p.inventory);
        const ad = Items.def(inst.ammoId);
        wsub = (d.weapon.auto ? 'Automatik' : 'Einzelfeuer') + (ad ? ' · ' + ad.ammo.label : '');
        if (inst.rt && inst.rt.reloading) wsub = 'Lädt nach …';
        else if ((inst.mag || 0) === 0) wsub = 'Leer – R zum Nachladen';
      }
      if (inst.durability !== undefined) wsub += (wsub ? ' · ' : '') + 'Zustand ' + Math.round(inst.durability) + ' %';
    }
    uiSetText(h.wname, wname); uiSetText(h.ammo, ammo); uiSetText(h.wsub, wsub);
    h.ammo.classList.toggle('danger', !!(inst && inst.mag === 0 && d && d.weapon && d.weapon.class !== 'melee'));
    // extraction line
    uiSetText(h.extract, raid.extraction.hudText());
    h.extract.classList.toggle('active', !!raid.extraction.current());
    // 1 s fallback rebuilds: objectives, slots, armor, status
    this.listTimer -= 0.1;
    const slotKey = p.activeSlot + '|' + p.equipment.weaponSlots().map(x => (x ? x.id : '-')).join(',') + '|' + (p.equipment.grenade ? p.equipment.grenade.count : 0) + '|' + (p.bestMedical() ? 1 : 0);
    if (this.hudCache.slots !== slotKey) { this.hudCache.slots = slotKey; this._renderSlots(p); }
    if (this.listTimer <= 0) {
      this.listTimer = 1;
      this._renderObjectives(raid);
      this._renderArmor(p);
      this._renderStatus(p);
    }
  }

  _renderSlots(p) {
    const ws = p.equipment.weaponSlots();
    const names = ['1', '2', '3', '4', '5'];
    const labels = [ws[0] ? Items.def(ws[0]).name : 'leer', ws[1] ? Items.def(ws[1]).name : 'leer', ws[2] ? Items.def(ws[2]).name : 'leer',
      p.equipment.grenade ? Items.def(p.equipment.grenade).name + ' ×' + p.equipment.grenade.count : 'keine Granate', 'Schnellheilung'];
    const has = [!!ws[0], !!ws[1], !!ws[2], !!p.equipment.grenade, !!p.bestMedical()];
    this.hud.slots.innerHTML = names.map((n, i) => '<span class="hud-slot' + (p.activeSlot === i ? ' active' : '') + (has[i] ? '' : ' empty') + '" title="' + uiEsc(labels[i]) + '">' + n + '</span>').join('');
    if (this.mobileSlots) this.mobileSlots.querySelectorAll('.mobile-slot').forEach((b, i) => { b.classList.toggle('active', p.activeSlot === i); b.classList.toggle('empty', !has[i]); });
  }
  _renderObjectives(raid) {
    const lines = this.game.missions ? this.game.missions.hudLines(raid) : [];
    const key = lines.map(l => (l.done ? 1 : 0) + l.text).join('|');
    if (this.hudCache.obj === key) return;
    this.hudCache.obj = key;
    if (!lines.length) { this.hud.objectives.innerHTML = '<div class="hud-obj muted">Kein Auftrag – Beute sichern und extrahieren</div>'; return; }
    this.hud.objectives.innerHTML = lines.slice(0, 7).map(l => '<div class="hud-obj' + (l.done ? ' done' : '') + (l.optional ? ' optional' : '') + '">' + (l.done ? '✓' : l.optional ? '◇' : '•') + ' ' + uiEsc(l.text) + '</div>').join('');
  }
  _renderArmor(p) {
    const chip = (inst, label) => {
      if (!inst) return '<span class="hud-chip empty">' + label + ' –</span>';
      const d = Items.def(inst);
      const pct = d && d.durabilityMax ? Math.round(inst.durability / d.durabilityMax * 100) : 100;
      return '<span class="hud-chip' + (pct <= 0 ? ' danger' : pct < 30 ? ' warn' : '') + '" title="' + uiEsc(d ? d.name : '') + '">' + label + ' ' + pct + '%</span>';
    };
    const key = [p.equipment.armorBody, p.equipment.armorHead].map(a => (a ? a.id + Math.round(a.durability) : '-')).join('|');
    if (this.hudCache.armor === key) return;
    this.hudCache.armor = key;
    this.hud.armor.innerHTML = chip(p.equipment.armorBody, '🛡') + chip(p.equipment.armorHead, '⛑');
  }
  _renderStatus(p) {
    const s = [];
    if (p.bleeding) s.push('<span class="hud-status-icon danger">🩸 Blutung</span>');
    if (p.toxic > 0) s.push('<span class="hud-status-icon toxic">☣ Vergiftet</span>');
    if (p.hunger < 25) s.push('<span class="hud-status-icon warn">Hunger</span>');
    if (p.thirst < 25) s.push('<span class="hud-status-icon warn">Durst</span>');
    if (p.overweight && p.overweight()) s.push('<span class="hud-status-icon danger">Überladen</span>');
    if (p.crouching) s.push('<span class="hud-status-icon">Geduckt</span>');
    if (!p.flashlightOn) s.push('<span class="hud-status-icon muted">Lampe aus</span>');
    for (const e of p.effects) if (e.label) s.push('<span class="hud-status-icon good">' + uiEsc(e.label) + ' ' + Math.ceil(e.timer) + 's</span>');
    const html = s.join('');
    if (this.hudCache.status !== html) { this.hudCache.status = html; this.hud.status.innerHTML = html; }
  }

  // ---------------- raid entry points ----------------
  openLoot(container) { this.showScreen('loot', { container }); }
  openInventory() { this.showScreen('inventory'); }
  openMap() { this.showScreen('map'); }

  dropSelected() {
    const raid = this.game.raid;
    const sel = this.selected;
    if (!raid || !raid.player || raid.ended || !sel) return false;
    if (this.currentScreen !== 'inventory' && this.currentScreen !== 'loot') return false;
    const p = raid.player;
    let inst = null;
    if (sel.slot) {
      inst = p.equipment.unequip(sel.slot);
      if (inst && raid.weapons) raid.weapons.cancelReload(inst);
      if (sel.slot === 'backpack') { const over = p.inventory.setSlots(p.equipment.backpackSlots()); for (const it of over) raid.dropItem(it, p.x, p.y); }
      if (p.activeSlot <= 2 && !p.weaponInst) p.switchSlot(Math.max(0, p.equipment.weaponSlots().findIndex(Boolean)), true);
    } else if (sel.inv && typeof sel.inv.remove === 'function') {
      const it = sel.inv.get(sel.idx);
      if (it) inst = sel.inv.remove(it.uid);
    }
    if (!inst) return false;
    raid.dropItem(inst, p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24);
    const a = this.game.audio; if (a) a.play('drop');
    this.selected = null;
    this.refresh();
    return true;
  }

  // ---------------- mobile ----------------
  _buildMobile() {
    const m = this.mobileEl;
    if (!m) return;
    m.innerHTML = '';
    const zl = uiEl('div', 'mobile-zone mobile-zone-left');
    const zr = uiEl('div', 'mobile-zone mobile-zone-right');
    m.appendChild(zl); m.appendChild(zr);
    const mkStick = () => { const s = uiEl('div', 'mobile-stick'); s.appendChild(uiEl('div', 'mobile-knob')); s.hidden = true; m.appendChild(s); return s; };
    this.stickMove = mkStick(); this.stickAim = mkStick();
    const input = () => this.game.input;
    const startStick = (e, which) => {
      e.preventDefault();
      const st = which === 'move' ? this.stickMove : this.stickAim;
      try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.pointers.set(e.pointerId, { which, ox: e.clientX, oy: e.clientY, el: st });
      st.hidden = false;
      st.style.left = (e.clientX - 56) + 'px'; st.style.top = (e.clientY - 56) + 'px';
      st.firstChild.style.transform = 'translate(0px,0px)';
    };
    const moveStick = (e) => {
      const ptr = this.pointers.get(e.pointerId);
      if (!ptr) return;
      e.preventDefault();
      let dx = e.clientX - ptr.ox, dy = e.clientY - ptr.oy;
      const len = Math.hypot(dx, dy);
      const maxR = 56;
      if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; }
      ptr.el.firstChild.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      const v = len < 12 ? { x: 0, y: 0 } : { x: dx / maxR, y: dy / maxR };
      if (input()) input().setStick(ptr.which, v.x, v.y);
    };
    const endStick = (e) => {
      const ptr = this.pointers.get(e.pointerId);
      if (!ptr) return;
      this.pointers.delete(e.pointerId);
      ptr.el.hidden = true;
      if (input()) input().setStick(ptr.which, 0, 0);
    };
    zl.addEventListener('pointerdown', (e) => startStick(e, 'move'));
    zr.addEventListener('pointerdown', (e) => startStick(e, 'aim'));
    for (const z of [zl, zr]) {
      z.addEventListener('pointermove', moveStick);
      z.addEventListener('pointerup', endStick);
      z.addEventListener('pointercancel', endStick);
    }
    const bar = uiEl('div', 'mobile-buttons');
    m.appendChild(bar);
    const btn = (label, action, cls, toggle) => {
      const b = uiEl('button', 'mobile-btn ' + (cls || ''), label);
      b.type = 'button';
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (toggle) b.classList.toggle('active');
        else b.classList.add('active');
        if (input()) input().touchAction(action, true);
      });
      const up = (e) => { e.preventDefault(); if (!toggle) b.classList.remove('active'); if (input()) input().touchAction(action, false); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      return b;
    };
    this.mobileE = null;
    const eBtn = btn('E', 'interact', 'mbtn-e');
    this.mobileE = uiEl('span', 'mbtn-label', 'E');
    eBtn.innerHTML = ''; eBtn.appendChild(this.mobileE);
    bar.appendChild(eBtn);
    bar.appendChild(btn('R', 'reload'));
    bar.appendChild(btn('Sprint', 'sprint', 'mbtn-toggle', true));
    bar.appendChild(btn('Ducken', 'crouch', 'mbtn-toggle', true));
    bar.appendChild(btn('Lampe', 'flashlight'));
    bar.appendChild(btn('Granate', 'grenade'));
    bar.appendChild(btn('Heilen', 'quickMed'));
    const top = uiEl('div', 'mobile-top');
    m.appendChild(top);
    top.appendChild(btn('Inventar', 'inventory'));
    top.appendChild(btn('Karte', 'map'));
    top.appendChild(btn('II', 'pause'));
    const fs = uiBtn('⛶', 'fullscreen', () => {
      try { const r = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ }
      try { const o = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (o && o.catch) o.catch(() => {}); } catch (e) { /* ignore */ }
    }, { cls: 'mobile-btn mobile-fs' });
    top.appendChild(fs);
    const slots = uiEl('div', 'mobile-slots');
    for (let i = 0; i < 5; i++) slots.appendChild(btn(String(i + 1), 'slot' + (i + 1), 'mobile-slot'));
    m.appendChild(slots);
    this.mobileSlots = slots;
    const fire = uiEl('button', 'mobile-fire', 'FEUER');
    fire.type = 'button';
    fire.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { fire.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } fire.classList.add('active'); if (input()) input().touchFire(true); });
    const fup = (e) => { e.preventDefault(); fire.classList.remove('active'); if (input()) input().touchFire(false); };
    fire.addEventListener('pointerup', fup); fire.addEventListener('pointercancel', fup);
    m.appendChild(fire);
    m.appendChild(uiEl('div', 'rotate-hint', '<div>⟳</div><p>Bitte das Gerät ins Querformat drehen</p>'));
    document.addEventListener('touchstart', (e) => {
      if (this.game.state === 'raid' && !this.currentScreen && e.target && this.mobileEl.contains(e.target)) e.preventDefault();
    }, { passive: false });
  }

  setTouchVisible(b) {
    if (!this.mobileEl) return;
    this.mobileEl.hidden = !b;
    if (document.body) document.body.classList.toggle('touch-ui', !!(this.game.input && this.game.input.touchMode));
    if (!b) {
      for (const [, ptr] of this.pointers) { ptr.el.hidden = true; if (this.game.input) this.game.input.setStick(ptr.which, 0, 0); }
      this.pointers.clear();
      if (this.game.input) this.game.input.touchFire(false);
    }
  }
  applyTouchVisibility() {
    const inp = this.game.input;
    this.setTouchVisible(!!(inp && inp.touchMode && this.game.state === 'raid' && this.currentScreen === null));
    if (this.mobileEl) {
      const tg = inp && inp.touchToggles;
      const sprintBtn = this.mobileEl.querySelectorAll('.mbtn-toggle')[0];
      if (sprintBtn && tg) sprintBtn.classList.toggle('active', !!tg.sprint);
    }
  }
  onResize() { if (this.currentScreen === 'map') this.refresh(); }
}
