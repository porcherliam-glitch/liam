// 23_ui_raid.js — raid screens (SPEC §24.1): inventory, loot, map, pause, result, death.
// The simulation keeps running behind inventory/loot/map (only pause stops it), so refresh() is cheap and the
// screens re-render on a short interval to reflect changes (stacks, mags, timer).
// Dependencies: 23_ui.js, 23_ui_grid.js, RaidManager container API at runtime.

function uir_raid(ui) { return ui.game.raid; }

function uir_head(title, sub) {
  const h = uiEl('header', 'screen-header');
  h.appendChild(uiEl('div', 'screen-title', '<h2>' + uiEsc(title) + '</h2>' + (sub ? '<div class="muted small">' + sub + '</div>' : '')));
  h.appendChild(uiBtn('Schließen ✕', 'close', null, { small: true }));
  return h;
}

function uir_actions(ui, sel) {
  const raid = uir_raid(ui);
  if (!raid || !raid.player) return [];
  const p = raid.player;
  const inst = uig_selInst(sel);
  if (!inst) return [];
  const d = Items.def(inst);
  const A = [];
  const after = () => { ui.selected = null; ui.refresh(); };
  if (sel.slot) {
    A.push({ label: 'Ablegen in den Rucksack', action: 'unequip', run: () => {
      if (!p.inventory.canAdd(inst)) { ui.toast('Kein Platz im Rucksack', 'warning'); return; }
      const it = p.equipment.unequip(sel.slot);
      if (raid.weapons) raid.weapons.cancelReload(it);
      p.inventory.add(it);
      if (sel.slot === 'backpack') { const over = p.inventory.setSlots(p.equipment.backpackSlots()); for (const o of over) raid.dropItem(o, p.x, p.y); }
      if (p.activeSlot <= 2 && !p.weaponInst) p.switchSlot(Math.max(0, p.equipment.weaponSlots().findIndex(Boolean)), true);
      after();
    } });
  } else {
    const inv = sel.inv;
    const slot = Equipment.slotFor(inst);
    if (slot && typeof inv.remove === 'function') A.push({ label: 'Ausrüsten', action: 'equip', run: () => { uir_equip(ui, inv, inv.indexOf(inst.uid), slot); after(); } });
    if (Items.isUsable(inst) && typeof inv.remove === 'function') A.push({ label: 'Benutzen', action: 'use', run: () => { p.useItem(inst); ui.closeScreen(); } });
    if (inst.count > 1 && typeof inv.split === 'function') A.push({ label: 'Teilen', action: 'split', run: async () => { const n = await ui.promptNumber('Wie viele abtrennen?', { max: inst.count - 1 }); if (n && !inv.split(inv.indexOf(inst.uid), n)) ui.toast('Kein freier Platz', 'warning'); after(); } });
    if (inv === p.inventory) A.push({ label: 'In sicheren Behälter', action: 'to-secure', run: () => { const it = inv.remove(inst.uid); const r = p.secure.add(it); if (r.remaining) { inv.add(r.remaining); ui.toast('Sicherer Behälter voll', 'warning'); } after(); } });
    if (inv === p.secure) A.push({ label: 'In den Rucksack', action: 'to-loadout', run: () => { const it = inv.remove(inst.uid); const r = p.inventory.add(it); if (r.remaining) { inv.add(r.remaining); ui.toast('Rucksack voll', 'warning'); } after(); } });
    if (typeof inv.remove === 'function') A.push({ label: 'Ablegen (X)', action: 'drop', run: () => { ui.selected = sel; ui.dropSelected(); } });
  }
  void d;
  return A;
}

function uir_equip(ui, inv, idx, slot) {
  const raid = uir_raid(ui);
  const p = raid.player;
  const inst = inv.items[idx];
  if (!inst || !Equipment.accepts(slot, inst)) { ui.toast('Passt nicht in diesen Platz', 'warning'); return false; }
  inv.items[idx] = null;
  const r = p.equipment.equip(inst, slot);
  if (r.replaced) {
    if (raid.weapons) raid.weapons.cancelReload(r.replaced);
    const back = inv.add(r.replaced);
    if (back.remaining) { const b2 = p.inventory.add(back.remaining); if (b2.remaining) raid.dropItem(b2.remaining, p.x, p.y); }
  }
  if (slot === 'backpack') { const over = p.inventory.setSlots(p.equipment.backpackSlots()); for (const o of over) raid.dropItem(o, p.x, p.y); }
  if (['primary', 'secondary', 'melee'].includes(slot)) p.switchSlot(['primary', 'secondary', 'melee'].indexOf(slot), true);
  const a = ui.game.audio; if (a) a.play('pickup', { volume: 0.5 });
  return true;
}

function uir_moves(ui, container) {
  const raid = uir_raid(ui);
  return {
    onMove: (fromInv, fromIdx, toInv, toIdx) => {
      const p = raid.player;
      if (container && fromInv._container) {
        // container -> player inventory
        const c = fromInv._container;
        const inst = c.items[fromIdx];
        if (!inst) return false;
        if (toInv.items && toInv.items[toIdx] === null && toInv !== p.inventory && toInv !== p.secure) return false;
        if (toInv === p.secure) {
          // take into the secure container directly
          const r = p.secure.add(Object.assign(inst, { raidFound: true }));
          if (!r.remaining) { c.items[fromIdx] = null; raid.events.emit('itemPicked', { inst, source: 'container' }); p.stats.lootValue += Items.value(inst); return true; }
          c.items[fromIdx] = r.remaining; return false;
        }
        const r = raid.takeFromContainer(c, fromIdx);
        if (r.remaining) ui.toast('Inventar voll', 'warning');
        return (r.taken || 0) > 0;
      }
      if (container && toInv._container) {
        const inst = fromInv.items[fromIdx];
        if (!inst) return false;
        const it = fromInv.remove(inst.uid);
        if (!raid.putIntoContainer(toInv._container, it)) { fromInv.add(it); ui.toast('Behälter voll', 'warning'); return false; }
        return true;
      }
      return fromInv === toInv ? fromInv.move(fromIdx, toIdx) : fromInv.transfer(fromIdx, toInv, toIdx);
    },
    onEquip: (fromInv, fromIdx, slot) => {
      if (fromInv._container) {
        const c = fromInv._container;
        const r = raid.takeFromContainer(c, fromIdx);
        if (!(r.taken > 0)) return false;
        const p = raid.player;
        const idx = p.inventory.items.findIndex(i => i && Equipment.accepts(slot, i));
        return idx >= 0 ? uir_equip(ui, p.inventory, idx, slot) : true;
      }
      return uir_equip(ui, fromInv, fromIdx, slot);
    },
    onUnequip: (slot, toInv, toIdx) => {
      const p = raid.player;
      if (toInv._container) return false;
      const inst = p.equipment.get(slot);
      if (!inst) return false;
      if (toInv.items[toIdx] && !toInv.canAdd(inst)) return false;
      p.equipment.unequip(slot);
      if (raid.weapons) raid.weapons.cancelReload(inst);
      if (toInv.items[toIdx]) toInv.add(inst); else toInv.items[toIdx] = inst;
      if (slot === 'backpack') { const over = p.inventory.setSlots(p.equipment.backpackSlots()); for (const o of over) raid.dropItem(o, p.x, p.y); }
      if (p.activeSlot <= 2 && !p.weaponInst) p.switchSlot(Math.max(0, p.equipment.weaponSlots().findIndex(Boolean)), true);
      return true;
    },
    onEquipSwap: (a, b) => {
      const e = raid.player.equipment;
      const ia = e[a], ib = e[b];
      if ((ia && !Equipment.accepts(b, ia)) || (ib && !Equipment.accepts(a, ib))) return false;
      e[a] = ib || null; e[b] = ia || null;
      return true;
    },
    actions: (sel) => uir_actions(ui, sel),
  };
}

function uir_detail(ui) {
  const inst = uig_selInst(ui.selected);
  const box = uiEl('div', 'panel detail');
  if (!inst) { box.appendChild(uiEl('div', 'muted small', 'Gegenstand wählen für Details. Ziehen oder zwei Felder antippen zum Verschieben. Achtung: Die Zeit läuft weiter!')); return box; }
  const d = Items.def(inst);
  box.appendChild(uiEl('div', 'detail-name rarity-' + d.rarity, uiEsc(d.name) + (inst.count > 1 ? ' ×' + inst.count : '')));
  box.appendChild(uiEl('div', 'muted small', uiEsc(CATEGORY_NAMES[d.cat] || d.cat) + ' · ' + formatWeight(Items.weight(inst)) + ' · ' + formatCredits(Items.value(inst))));
  const lines = Items.describe(inst);
  if (lines.length) box.appendChild(uiEl('ul', 'tt-stats', lines.map(l => '<li>' + uiEsc(l) + '</li>').join('')));
  box.appendChild(uiEl('div', 'tt-desc small', uiEsc(d.desc || '')));
  const bar = uiEl('div', 'action-bar row wrap');
  for (const a of uir_actions(ui, ui.selected)) bar.appendChild(uiBtn(uiEsc(a.label), a.action, a.run, { small: true }));
  box.appendChild(bar);
  return box;
}

function uir_playerPanel(ui, moves) {
  const raid = uir_raid(ui);
  const p = raid.player;
  const col = uiEl('div', 'col');
  col.appendChild(uiEquipmentPanel(ui, p.equipment, Object.assign({ title: 'Ausrüstung' }, moves)));
  const w = p.totalWeight(), lim = p.carryLimit();
  col.appendChild(uiBuildGrid(ui, p.inventory, Object.assign({ title: 'Rucksack', info: formatWeight(w) + ' / ' + formatWeight(lim), columns: 6,
    headerButtons: [uiBtn('Sortieren', 'sort', () => { p.inventory.sort(); ui.selected = null; ui.refresh(); }, { small: true })] }, moves)));
  col.appendChild(uiBar(w / lim, w > lim ? 'bar-danger' : 'bar-weight', 'Gewicht ' + formatWeight(w) + ' / ' + formatWeight(lim) + (w > lim ? ' – überladen!' : '')));
  col.appendChild(uiBuildGrid(ui, p.secure, Object.assign({ title: 'Sicherer Behälter', info: 'bleibt beim Tod erhalten', columns: 6 }, moves)));
  return col;
}

function uiScreenInventory(ui, root) {
  let timer = null;
  const render = () => {
    const raid = uir_raid(ui);
    root.innerHTML = '';
    if (!raid || !raid.player) return;
    const moves = uir_moves(ui, null);
    root.appendChild(uir_head('Inventar', 'Die Zeit läuft weiter – sichere die Umgebung, bevor du sortierst.'));
    const cols = uiEl('div', 'columns');
    cols.appendChild(uir_playerPanel(ui, moves));
    const right = uiEl('div', 'col');
    right.appendChild(uir_detail(ui));
    const p = raid.player;
    const st = uiEl('div', 'panel small');
    st.innerHTML = '<div class="panel-title">Zustand</div>' +
      '<div>Gesundheit ' + Math.ceil(p.hp) + ' / ' + Math.round(p.hpMax) + (p.bleeding ? ' · <span class="danger">Blutung</span>' : '') + (p.toxic > 0 ? ' · <span class="toxic">Vergiftet</span>' : '') + '</div>' +
      '<div>Nahrung ' + Math.round(p.hunger) + ' · Wasser ' + Math.round(p.thirst) + ' · Ausdauer ' + Math.round(p.stamina) + '</div>' +
      '<div class="muted">Beutewert bisher: ' + formatCredits(p.stats.lootValue) + ' · Kills: ' + p.stats.kills + '</div>';
    right.appendChild(st);
    cols.appendChild(right);
    root.appendChild(cols);
  };
  render();
  timer = setInterval(() => { if (!UIG_DRAG.active && !ui.ctxMenu && !ui._modalOpen) render(); }, 1500);
  return { refresh: render, destroy() { clearInterval(timer); ui.hideTooltip(); } };
}

function uiScreenLoot(ui, root, data) {
  const c = data && data.container;
  let timer = null;
  const render = () => {
    const raid = uir_raid(ui);
    root.innerHTML = '';
    if (!raid || !raid.player || !c) return;
    if (!Array.isArray(c.items)) c.items = [];
    const adapter = { slots: Math.max(8, Math.min(12, c.items.length + 4)), items: [], _container: c };
    for (let i = 0; i < adapter.slots; i++) adapter.items.push(c.items[i] || null);
    adapter.canAdd = () => c.items.filter(Boolean).length < 12;
    adapter.get = (i) => c.items[i] || null;
    adapter.indexOf = (uid) => c.items.findIndex(x => x && x.uid === uid);
    const moves = uir_moves(ui, c);
    const name = (typeof CONTAINER_NAMES !== 'undefined' && CONTAINER_NAMES[c.type]) || 'Behälter';
    const b = c.buildingId ? raid.world.buildings.find(x => x.id === c.buildingId) : null;
    root.appendChild(uir_head(name + ' durchsuchen', b ? uiEsc(b.name) : 'Im Freien'));
    const cols = uiEl('div', 'columns');
    const left = uiEl('div', 'col');
    const empty = !c.items.some(Boolean);
    left.appendChild(uiBuildGrid(ui, adapter, Object.assign({ title: name, info: empty ? 'leer' : c.items.filter(Boolean).length + ' Gegenstände', columns: 4, cls: 'loot-grid' }, moves)));
    const row = uiEl('div', 'row');
    row.appendChild(uiBtn('Alles nehmen', 'take-all', () => { raid.takeAll(c); ui.selected = null; render(); }, { primary: true, disabled: empty, reason: 'Leer' }));
    row.appendChild(uiBtn('Schließen', 'close', null));
    left.appendChild(row);
    left.appendChild(uir_detail(ui));
    cols.appendChild(left);
    cols.appendChild(uir_playerPanel(ui, moves));
    root.appendChild(cols);
  };
  render();
  timer = setInterval(() => {
    const raid = uir_raid(ui);
    // close automatically when the player walked away
    if (raid && raid.player && c && dist(raid.player.x, raid.player.y, c.x, c.y) > 110) { ui.showScreen(null); return; }
    if (!UIG_DRAG.active && !ui.ctxMenu && !ui._modalOpen) render();
  }, 1500);
  return { refresh: render, destroy() { clearInterval(timer); ui.hideTooltip(); } };
}

function uiScreenMap(ui, root) {
  let canvas = null, timer = null;
  const render = () => {
    const raid = uir_raid(ui);
    root.innerHTML = '';
    if (!raid) return;
    root.appendChild(uir_head('Karte – ' + uiEsc(raid.map.name), 'Einsatzzeit ' + formatTime(raid.time) + ' · noch ' + formatTime(raid.timeLimit - raid.time) + ' · ' + formatHour(raid.hour) + ' Uhr'));
    const cols = uiEl('div', 'columns map-layout');
    const left = uiEl('div', 'col map-col');
    canvas = uiEl('canvas', 'fullmap');
    left.appendChild(canvas);
    cols.appendChild(left);
    const right = uiEl('div', 'col');
    const legend = uiEl('div', 'panel small legend');
    legend.innerHTML = '<div class="panel-title">Legende</div>' +
      '<div><span class="lg lg-player"></span>Du</div><div><span class="lg lg-ex-on"></span>Extraktion offen</div><div><span class="lg lg-ex-off"></span>Extraktion gesperrt</div>' +
      '<div><span class="lg lg-mission"></span>Auftragsziel</div><div><span class="lg lg-building"></span>Gebäude</div><div><span class="lg lg-road"></span>Straße</div>';
    right.appendChild(legend);
    const ex = uiEl('div', 'panel small');
    ex.innerHTML = '<div class="panel-title">Extraktionen</div>' + raid.extraction.points.map(e => {
      const d = Math.round(dist(raid.player.x, raid.player.y, e.x, e.y) / TILE);
      return '<div class="list-item"><span class="' + (e.active ? 'good' : 'muted') + '">⬢ ' + uiEsc(e.name) + '</span><span class="muted"> ' + d + ' m · ' + uiEsc(e.active ? 'offen' : e.lockReason || 'gesperrt') + '</span></div>';
    }).join('');
    right.appendChild(ex);
    const lines = ui.game.missions.hudLines(raid);
    right.appendChild(uiEl('div', 'panel small', '<div class="panel-title">Ziele</div>' + (lines.length ? lines.map(l => '<div class="' + (l.done ? 'good' : '') + '">' + (l.done ? '✓' : l.optional ? '◇' : '•') + ' ' + uiEsc(l.text) + '</div>').join('') : '<div class="muted">Kein Auftrag aktiv.</div>')));
    cols.appendChild(right);
    root.appendChild(cols);
    requestAnimationFrame(() => { if (canvas && canvas.isConnected) ui.game.renderer.renderFullMap(raid, canvas); });
  };
  render();
  timer = setInterval(() => { const raid = uir_raid(ui); if (raid && canvas && canvas.isConnected) ui.game.renderer.renderFullMap(raid, canvas); }, 500);
  return { refresh: render, destroy() { clearInterval(timer); } };
}

function uiScreenPause(ui, root) {
  const raid = uir_raid(ui);
  root.innerHTML = '';
  const box = uiEl('div', 'panel pause-box');
  box.appendChild(uiEl('h2', '', 'Pause'));
  if (raid) {
    box.appendChild(uiEl('div', 'muted', uiEsc(raid.map.name) + ' · Einsatzzeit ' + formatTime(raid.time) + ' · noch ' + formatTime(raid.timeLimit - raid.time)));
    const lines = ui.game.missions.hudLines(raid);
    if (lines.length) box.appendChild(uiEl('div', 'small', lines.map(l => '<div class="' + (l.done ? 'good' : '') + '">' + (l.done ? '✓' : '•') + ' ' + uiEsc(l.text) + '</div>').join('')));
  }
  const col = uiEl('div', 'menu-buttons');
  col.appendChild(uiBtn('Fortsetzen', 'resume', () => ui.game.resumeRaid(), { primary: true }));
  col.appendChild(uiBtn('Karte', 'open-map', () => { ui.game.paused = false; ui.openMap(); }));
  col.appendChild(uiBtn('Einstellungen', 'settings', () => ui.showScreen('settings')));
  col.appendChild(uiBtn('Steuerung', 'credits', () => ui.showScreen('credits')));
  col.appendChild(uiBtn('Einsatz abbrechen', 'abort-raid', () => ui.game.abortRaid(), { danger: true }));
  box.appendChild(col);
  root.appendChild(box);
  return { refresh() {}, destroy() {} };
}

function uir_itemList(list, empty) {
  if (!list || !list.length) return '<div class="muted small">' + uiEsc(empty) + '</div>';
  return '<div class="item-list">' + list.map(e => {
    const inst = e.inst || e;
    const d = Items.def(inst);
    if (!d) return '';
    return '<span class="item-chip rarity-' + d.rarity + '">' + uiEsc(d.name) + (inst.count > 1 ? ' ×' + inst.count : '') + (e.credits ? ' <span class="muted">(' + formatCredits(e.credits) + ')</span>' : '') + '</span>';
  }).join('') + '</div>';
}

function uir_statsBlock(r) {
  const rows = [['Dauer', formatTime(r.durationSec)], ['Kills', r.kills], ['Treffsicherheit', Math.round((r.accuracy || 0) * 100) + ' % (' + r.shotsHit + '/' + r.shotsFired + ')'],
    ['Schaden erlitten', r.damageTaken], ['Behälter durchsucht', r.containersOpened], ['Strecke', r.distance + ' m'], ['Beutewert', formatCredits(r.lootValue || 0)], ['Seed', r.seed]];
  return '<div class="stats-grid">' + rows.map(([k, v]) => '<div class="muted">' + uiEsc(k) + '</div><div>' + uiEsc(v) + '</div>').join('') + '</div>';
}

function uir_xpBlock(ui, r) {
  const pm = ui.game.profileMgr;
  const prog = pm.xpProgress();
  const box = uiEl('div', 'panel');
  box.appendChild(uiEl('div', 'panel-title', 'Erfahrung +' + (r.xpGained || 0) + ' EP' + (r.leveledUp ? ' <span class="good">– Stufe ' + r.levelAfter + ' erreicht!</span>' : '')));
  box.appendChild(uiBar(prog.pct, 'bar-xp', 'Stufe ' + pm.level() + ' · ' + Math.round(prog.cur) + ' / ' + prog.next));
  if (r.creditsGained) box.appendChild(uiEl('div', 'small', 'Credits: +' + formatCredits(r.creditsGained)));
  if (r.achievements && r.achievements.length) box.appendChild(uiEl('div', 'small good', 'Neue Erfolge: ' + r.achievements.map(id => uiEsc((ACHIEVEMENTS.find(a => a.id === id) || {}).name || id)).join(', ')));
  return box;
}

function uiScreenResult(ui, root, data) {
  const r = (data && data.result) || (ui.game.raid && ui.game.raid.result);
  root.innerHTML = '';
  if (!r) { root.appendChild(uiBtn('Zur Basis', 'to-base', () => ui.game.enterBase(), { primary: true })); return { refresh() {}, destroy() {} }; }
  const head = uiEl('header', 'result-head good-bg');
  head.innerHTML = '<h1>Extraktion erfolgreich</h1><div class="muted">' + uiEsc(r.mapName) + ' · über ' + uiEsc(r.extractionName || 'Extraktion') + '</div>';
  root.appendChild(head);
  const cols = uiEl('div', 'columns');
  const left = uiEl('div', 'col');
  left.appendChild(uiEl('div', 'panel', '<div class="panel-title">Einsatz</div>' + uir_statsBlock(r)));
  left.appendChild(uir_xpBlock(ui, r));
  const right = uiEl('div', 'col');
  right.appendChild(uiEl('div', 'panel', '<div class="panel-title">Gesichert (' + (r.itemsKept || []).length + ')</div>' + uir_itemList(r.itemsKept, 'Nichts mitgebracht.') +
    ((r.itemsSold || []).length ? '<div class="panel-title">Lager voll – automatisch verkauft</div>' + uir_itemList(r.itemsSold, '') : '')));
  const mc = r.missionsCompleted || [];
  right.appendChild(uiEl('div', 'panel', '<div class="panel-title">Aufträge</div>' + (mc.length ? mc.map(m => '<div class="good">✓ ' + uiEsc(m.title) + '</div>').join('') + '<div class="small">Belohnung: ' + formatCredits(r.rewards.credits) + ', ' + r.rewards.xp + ' EP' + (r.rewards.items.length ? ', ' + r.rewards.items.map(i => uiEsc((Items.def(i.id) || {}).name || i.id) + ' ×' + i.count).join(', ') : '') + '</div>' : '<div class="muted small">Kein Auftrag abgeschlossen' + (r.objectivesDone ? ' – ' + r.objectivesDone + ' Ziele erfüllt, Fortschritt gespeichert' : '') + '.</div>')));
  cols.appendChild(left); cols.appendChild(right);
  root.appendChild(cols);
  const row = uiEl('div', 'row center');
  row.appendChild(uiBtn('Zur Basis', 'to-base', () => ui.game.enterBase(), { primary: true, cls: 'btn-big' }));
  root.appendChild(row);
  return { refresh() {}, destroy() {} };
}

function uiScreenDeath(ui, root, data) {
  const r = (data && data.result) || (ui.game.raid && ui.game.raid.result);
  root.innerHTML = '';
  if (!r) { root.appendChild(uiBtn('Zur Basis', 'to-base', () => ui.game.enterBase(), { primary: true })); return { refresh() {}, destroy() {} }; }
  const title = r.outcome === 'mia' ? 'Vermisst' : r.outcome === 'abort' ? 'Einsatz abgebrochen' : 'Du bist gestorben';
  const head = uiEl('header', 'result-head danger-bg');
  head.innerHTML = '<h1>' + uiEsc(title) + '</h1><div>' + uiEsc(r.causeOfDeath || '') + '</div><div class="muted small">' + uiEsc(r.mapName) + ' · nach ' + formatTime(r.durationSec) + '</div>';
  root.appendChild(head);
  const cols = uiEl('div', 'columns');
  const left = uiEl('div', 'col');
  left.appendChild(uiEl('div', 'panel', '<div class="panel-title">Einsatz</div>' + uir_statsBlock(r)));
  left.appendChild(uir_xpBlock(ui, r));
  const right = uiEl('div', 'col');
  right.appendChild(uiEl('div', 'panel', '<div class="panel-title">Verloren (' + (r.itemsLost || []).length + ')</div>' + uir_itemList(r.itemsLost, 'Nichts verloren.')));
  if ((r.insuranceReturned || []).length) right.appendChild(uiEl('div', 'panel', '<div class="panel-title good">Versicherung – zurückerhalten</div>' + uir_itemList(r.insuranceReturned, '')));
  right.appendChild(uiEl('div', 'panel', '<div class="panel-title">Sicherer Behälter – behalten</div>' + uir_itemList(r.itemsKept, 'Der sichere Behälter war leer.')));
  const mf = r.missionsFailed || [];
  if (mf.length) right.appendChild(uiEl('div', 'panel', '<div class="panel-title warn">Fehlgeschlagen – Fortschritt dieses Einsatzes verloren</div>' + mf.map(m => '<div>✗ ' + uiEsc(m.title) + '</div>').join('') + '<div class="small muted">Die Aufträge bleiben aktiv – versuche es erneut.</div>'));
  right.appendChild(uiEl('div', 'panel small muted', 'Du bist verwundet zurück in der Basis. Besuche die Krankenstation, rüste dich neu aus und versuche es noch einmal.'));
  cols.appendChild(left); cols.appendChild(right);
  root.appendChild(cols);
  const row = uiEl('div', 'row center');
  row.appendChild(uiBtn('Zur Basis', 'to-base', () => ui.game.enterBase(), { primary: true, cls: 'btn-big' }));
  root.appendChild(row);
  return { refresh() {}, destroy() {} };
}
