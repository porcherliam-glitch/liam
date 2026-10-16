// 23_ui_base.js — base screens (SPEC §24.1): main, base, stash, armory, medbay, workshop, radio, defense, trader,
// missionSelect, stats, credits, settings. Each: function uiScreen<Name>(ui, root, data) -> {refresh, destroy}.
// Shared helpers (uib_*): header, upgrade card, recipe list, item actions for the base context.
// Dependencies: 23_ui.js, 23_ui_grid.js, game modules at runtime.

function uib_pm(ui) { return ui.game.profileMgr; }
function uib_save(ui) { const pm = uib_pm(ui); if (pm.profile) ui.game.save.save(pm.serialize()); }

function uib_header(ui, title, subtitle) {
  const pm = uib_pm(ui);
  const p = pm.profile;
  const h = uiEl('header', 'screen-header');
  const left = uiEl('div', 'row');
  left.appendChild(uiBtn('← Zurück', 'back', null, { small: true }));
  left.appendChild(uiEl('div', 'screen-title', '<h2>' + uiEsc(title) + '</h2>' + (subtitle ? '<div class="muted">' + uiEsc(subtitle) + '</div>' : '')));
  h.appendChild(left);
  if (p) h.appendChild(uiEl('div', 'header-stats', '<span class="chip credits">' + formatCredits(p.credits) + '</span><span class="chip">Stufe ' + pm.level() + '</span>'));
  return h;
}

function uib_costHtml(ui, cost) {
  const pm = uib_pm(ui);
  const parts = [];
  if (cost.credits) parts.push('<span class="' + (pm.profile.credits >= cost.credits ? '' : 'danger') + '">' + formatCredits(cost.credits) + '</span>');
  for (const it of cost.items || []) {
    const have = pm.stash.count(it.id);
    const d = Items.def(it.id);
    parts.push('<span class="' + (have >= it.count ? '' : 'danger') + '">' + uiEsc(d ? d.name : it.id) + ' ' + have + '/' + it.count + '</span>');
  }
  return parts.join(' · ');
}

function uib_upgradeCard(ui, area, title) {
  const pm = uib_pm(ui);
  const lvl = pm._up(area);
  const card = uiEl('div', 'panel upgrade-card');
  card.appendChild(uiEl('div', 'panel-title', uiEsc(title || PM_AREA_NAMES[area]) + ' <span class="stars">' + '★'.repeat(lvl) + '☆'.repeat(3 - lvl) + '</span>'));
  const cur = lvl > 0 ? upgradeInfo(area, lvl) : null;
  if (cur) card.appendChild(uiEl('p', 'muted', 'Aktiv: ' + uiEsc(cur.desc)));
  if (lvl >= 3) { card.appendChild(uiEl('p', 'good', 'Maximale Stufe erreicht.')); return card; }
  const next = upgradeInfo(area, lvl + 1);
  if (!next) return card;
  card.appendChild(uiEl('p', '', '<b>' + uiEsc(next.name) + '</b> – ' + uiEsc(next.desc)));
  card.appendChild(uiEl('p', 'cost', 'Kosten: ' + uib_costHtml(ui, next.cost || {})));
  const c = pm.canUpgrade(area);
  card.appendChild(uiBtn('Ausbauen', 'upgrade', () => {
    const r = pm.upgrade(area);
    if (r.ok) { ui.toast(next.name + ' gebaut', 'success'); uib_save(ui); } else ui.toast(r.reason, 'warning');
    ui.refresh();
  }, { primary: true, disabled: !c.ok, reason: c.reason }));
  if (!c.ok) card.appendChild(uiEl('div', 'muted small', uiEsc(c.reason)));
  return card;
}

function uib_recipes(ui, station) {
  const pm = uib_pm(ui);
  const wrap = uiEl('div', 'panel');
  wrap.appendChild(uiEl('div', 'panel-title', 'Rezepte'));
  const list = uiEl('div', 'list');
  const rows = pm.recipesFor(station);
  if (!rows.length) list.appendChild(uiEl('div', 'muted', 'Keine Rezepte an dieser Station.'));
  for (const { recipe, unlocked } of rows) {
    const out = Items.def(recipe.output.id);
    const item = uiEl('div', 'list-item recipe' + (unlocked ? '' : ' locked'));
    const inputs = recipe.inputs.map(i => { const have = pm.stash.count(i.id); const d = Items.def(i.id); return '<span class="' + (have >= i.count ? '' : 'danger') + '">' + uiEsc(d ? d.name : i.id) + ' ' + have + '/' + i.count + '</span>'; }).join(', ');
    item.appendChild(uiEl('div', 'grow', '<div><b>' + uiEsc(recipe.name) + '</b> → <span class="rarity-' + (out ? out.rarity : 'common') + '">' + uiEsc(out ? out.name : recipe.output.id) + '</span>' + (recipe.output.count > 1 ? ' ×' + recipe.output.count : '') + '</div><div class="small muted">' + inputs + (unlocked ? '' : ' · <span class="warn">Ausbaustufe ' + recipe.requiresLevel + ' nötig</span>') + '</div>'));
    const c = pm.canCraft(recipe.id);
    item.appendChild(uiBtn('Herstellen', 'craft', () => {
      const r = pm.craft(recipe.id);
      if (r.ok) { ui.toast((out ? out.name : 'Gegenstand') + ' hergestellt', 'success'); uib_save(ui); } else ui.toast(r.reason, 'warning');
      ui.refresh();
    }, { small: true, disabled: !c.ok, reason: c.reason }));
    list.appendChild(item);
  }
  wrap.appendChild(list);
  return wrap;
}

function uib_detail(ui, sel) {
  const inst = uig_selInst(sel);
  const box = uiEl('div', 'panel detail');
  if (!inst) { box.appendChild(uiEl('div', 'muted', 'Gegenstand antippen oder anklicken, um Details und Aktionen zu sehen. Ziehen oder nacheinander zwei Felder antippen verschiebt Gegenstände. Rechtsklick/langes Drücken öffnet das Menü.')); return box; }
  const d = Items.def(inst);
  box.appendChild(uiEl('div', 'detail-name rarity-' + d.rarity, uiEsc(d.name) + (inst.count > 1 ? ' ×' + inst.count : '')));
  box.appendChild(uiEl('div', 'muted small', uiEsc(CATEGORY_NAMES[d.cat] || d.cat) + ' · ' + uiEsc(Items.rarity(inst).name) + ' · ' + formatWeight(Items.weight(inst)) + ' · ' + formatCredits(Items.value(inst))));
  const lines = Items.describe(inst);
  if (lines.length) box.appendChild(uiEl('ul', 'tt-stats', lines.map(l => '<li>' + uiEsc(l) + '</li>').join('')));
  box.appendChild(uiEl('div', 'tt-desc', uiEsc(d.desc || '')));
  return box;
}

// Item actions in the base (stash screen / trader sell side). ctx: {stash, loadout, secure, equipment}
function uib_actions(ui, sel) {
  const pm = uib_pm(ui);
  const p = pm.profile;
  const inst = uig_selInst(sel);
  if (!inst || !p) return [];
  const d = Items.def(inst);
  const A = [];
  const done = (r, okMsg) => { if (r === false || (r && r.ok === false)) ui.toast((r && r.reason) || 'Nicht möglich', 'warning'); else if (okMsg) ui.toast(okMsg, 'success', 1500); ui.selected = null; uib_save(ui); ui.refresh(); };
  if (sel.slot) {
    A.push({ label: 'Ablegen ins Lager', action: 'unequip', run: () => done(pm.unequipToStash(sel.slot), null) });
  } else {
    const inv = sel.inv;
    const slot = Equipment.slotFor(inst);
    if (slot) A.push({ label: 'Ausrüsten', action: 'equip', run: () => done(inv === p.stash ? pm.equipFromStash(inst.uid) : pm._equipFrom(inv, inst.uid), null) });
    if (Items.isWeapon(inst) && d.weapon.class !== 'melee' && (d.weapon.class === 'pistol' || d.weapon.class === 'smg')) A.push({ label: 'Als Primärwaffe ausrüsten', action: 'equip', run: () => done(pm._equipFrom(inv, inst.uid, 'primary'), null) });
    if (Items.isUsable(inst)) A.push({ label: 'Benutzen', action: 'use', run: () => { if (inv !== p.stash) { const r = pm.moveLoadoutToStash(inst.uid, 1); if (!r) return done(false); const s = p.stash.all().find(i => i.id === inst.id); return done(s ? pm.useFromStash(s.uid) : false, d.name + ' benutzt'); } done(pm.useFromStash(inst.uid), d.name + ' benutzt'); } });
    if (inst.count > 1) A.push({ label: 'Teilen', action: 'split', run: async () => { const n = await ui.promptNumber('Wie viele abtrennen?', { max: inst.count - 1 }); if (n) done(inv.split(inv.indexOf(inst.uid), n) ? true : { ok: false, reason: 'Kein freier Platz' }); } });
    if (inv !== p.stash) A.push({ label: 'Ins Lager', action: 'to-stash', run: () => done(pm.moveLoadoutToStash(inst.uid), null) });
    if (inv !== p.loadout) A.push({ label: 'In den Rucksack', action: 'to-loadout', run: () => done(inv === p.stash ? pm.moveStashToLoadout(inst.uid) : (() => { const it = inv.remove(inst.uid); const r = p.loadout.add(it); if (r.remaining) inv.add(r.remaining); return !r.remaining; })(), null) });
    if (inv !== p.secure) A.push({ label: 'In sicheren Behälter', action: 'to-secure', run: () => done(pm.moveToSecure(inst.uid, inv === p.loadout), null) });
    if (inv === p.stash) A.push({ label: 'Verkaufen (' + formatCredits(pm.sellPrice(inst)) + ')', action: 'sell', run: async () => { if (Items.rarity(inst).order >= 2 && !(await ui.confirm(d.name + ' für ' + formatCredits(pm.sellPrice(inst)) + ' verkaufen?'))) return; done(pm.sell(inst.uid), 'Verkauft'); } });
    A.push({ label: 'Vernichten', action: 'drop', danger: true, run: async () => { if (await ui.confirm(d.name + ' unwiderruflich vernichten?', { danger: true, ok: 'Vernichten' })) done(inv.remove(inst.uid) ? true : false, 'Vernichtet'); } });
  }
  const rc = pm.repairCost(inst);
  if (rc > 0) A.push({ label: 'Reparieren (' + formatCredits(rc) + ')', action: 'repair', disabled: p.credits < rc, reason: 'Nicht genug Credits', run: () => done(pm.repair(inst.uid), 'Repariert') });
  return A;
}

function uib_actionBar(ui, sel) {
  const bar = uiEl('div', 'action-bar row wrap');
  for (const a of uib_actions(ui, sel)) bar.appendChild(uiBtn(uiEsc(a.label), a.action, a.run, { small: true, danger: a.danger, disabled: a.disabled, reason: a.reason }));
  return bar;
}

function uib_baseMoves(ui) {
  const pm = uib_pm(ui);
  return {
    onMove: (fromInv, fromIdx, toInv, toIdx) => {
      const ok = fromInv === toInv ? fromInv.move(fromIdx, toIdx) : fromInv.transfer(fromIdx, toInv, toIdx);
      return ok;
    },
    onEquip: (fromInv, fromIdx, slot) => {
      const inst = fromInv.items[fromIdx];
      if (!inst) return false;
      const r = pm._equipFrom(fromInv, inst.uid, slot);
      if (!r.ok) ui.toast(r.reason || 'Passt nicht in diesen Platz', 'warning');
      return r.ok;
    },
    onUnequip: (slot, toInv, toIdx) => {
      const p = pm.profile;
      const inst = p.equipment.get(slot);
      if (!inst) return false;
      if (toInv.items[toIdx]) { if (!toInv.canAdd(inst)) return false; p.equipment.unequip(slot); toInv.add(inst); }
      else { p.equipment.unequip(slot); toInv.items[toIdx] = inst; }
      if (slot === 'backpack') pm._fixLoadoutSlots();
      return true;
    },
    onEquipSwap: (a, b) => {
      const e = pm.profile.equipment;
      const ia = e[a], ib = e[b];
      if ((ia && !Equipment.accepts(b, ia)) || (ib && !Equipment.accepts(a, ib))) return false;
      e[a] = ib || null; e[b] = ia || null;
      return true;
    },
    actions: (sel) => uib_actions(ui, sel),
  };
}

// ======================= main menu =======================
function uiScreenMain(ui, root) {
  const render = () => {
    const has = ui.game.save.hasSave();
    root.innerHTML = '';
    const box = uiEl('div', 'menu-main');
    box.appendChild(uiEl('h1', 'title', 'DEAD ZONE<span>EXTRACTION</span>'));
    box.appendChild(uiEl('p', 'tagline', 'Plündern. Überleben. Rauskommen.'));
    const col = uiEl('div', 'menu-buttons');
    col.appendChild(uiBtn('Spiel fortsetzen', 'continue', () => ui.game.continueGame(), { primary: has, disabled: !has, reason: 'Kein Spielstand vorhanden' }));
    col.appendChild(uiBtn('Neues Spiel', 'new-game', () => ui.game.newGame({ confirm: true }), { primary: !has }));
    col.appendChild(uiBtn('Einstellungen', 'settings', () => ui.showScreen('settings')));
    col.appendChild(uiBtn('Statistiken', 'stats', () => ui.showScreen('stats'), { disabled: !has && !uib_pm(ui).profile, reason: 'Noch keine Statistiken' }));
    col.appendChild(uiBtn('Steuerung & Info', 'credits', () => ui.showScreen('credits')));
    box.appendChild(col);
    const storage = ui.game.save.available() ? (has ? 'Spielstand vorhanden' : 'Kein Spielstand') : 'Speichern nicht verfügbar (privater Modus?)';
    box.appendChild(uiEl('div', 'version muted', 'v' + GAME_VERSION + ' · läuft offline · ' + uiEsc(storage)));
    root.appendChild(box);
  };
  render();
  return { refresh: render, destroy() {} };
}

// ======================= base hub =======================
function uiScreenBase(ui, root) {
  const render = () => {
    const pm = uib_pm(ui);
    const p = pm.profile;
    root.innerHTML = '';
    if (!p) { root.appendChild(uiEl('p', 'panel', 'Kein Spielstand geladen.')); root.appendChild(uiBtn('Hauptmenü', 'main-menu', () => ui.game.returnToMain())); return; }
    const xp = pm.xpProgress();
    const head = uiEl('header', 'base-header');
    head.innerHTML = '<div class="base-title"><h2>Basis „Bunker 7“</h2><div class="muted">' + uiEsc(Progression.rankTitle(pm.level())) + ' · Stufe ' + pm.level() + '</div></div>';
    const stats = uiEl('div', 'base-stats');
    stats.appendChild(uiEl('span', 'chip credits', formatCredits(p.credits)));
    const xpw = uiEl('div', 'base-stat'); xpw.appendChild(uiEl('span', 'small muted', 'Erfahrung ' + Math.round(xp.cur) + ' / ' + xp.next)); xpw.appendChild(uiBar(xp.pct, 'bar-xp')); stats.appendChild(xpw);
    const hpw = uiEl('div', 'base-stat'); hpw.appendChild(uiEl('span', 'small muted', 'Gesundheit ' + Math.round(p.hp) + ' / ' + pm.hpMax())); hpw.appendChild(uiBar(p.hp / pm.hpMax(), 'bar-hp')); stats.appendChild(hpw);
    stats.appendChild(uiEl('span', 'chip' + (p.hunger < 40 ? ' warn' : ''), '🍖 ' + Math.round(p.hunger)));
    stats.appendChild(uiEl('span', 'chip' + (p.thirst < 40 ? ' warn' : ''), '💧 ' + Math.round(p.thirst)));
    head.appendChild(stats);
    root.appendChild(head);
    const damaged = [...p.stash.all(), ...p.loadout.all(), ...p.equipment.all()].filter(i => pm.repairCost(i) > 0).length;
    const craftable = RECIPES.filter(r => pm.canCraft(r.id).ok);
    const avail = ui.game.missions.availableFor(p).length, active = ui.game.missions.active(p).length;
    const cards = [
      { id: 'stash', action: 'base-stash', icon: '▣', title: 'Lager & Ausrüstung', sub: p.stash.all().length + '/' + p.stash.slots + ' Plätze belegt', lvl: pm._up('stash'), warn: pm.loadoutWarnings().length ? pm.loadoutWarnings()[0] : null },
      { id: 'armory', action: 'base-armory', icon: '⌖', title: 'Waffenwerkstatt', sub: damaged ? damaged + ' Gegenstände beschädigt' : 'Reparaturen und Waffenbau', lvl: null },
      { id: 'medbay', action: 'base-medbay', icon: '✚', title: 'Krankenstation', sub: 'Gesundheit ' + Math.round(p.hp) + '/' + pm.hpMax(), lvl: pm._up('medbay'), warn: p.hp < pm.hpMax() * 0.6 ? 'Behandlung empfohlen' : null },
      { id: 'workshop', action: 'base-workshop', icon: '⚒', title: 'Werkstatt', sub: craftable.length + ' Rezepte herstellbar', lvl: pm._up('workshop') },
      { id: 'radio', action: 'base-radio', icon: '📡', title: 'Funkstation', sub: active + '/' + ui.game.missions.maxActive(p) + ' Aufträge aktiv · ' + avail + ' neu', lvl: pm._up('radio') },
      { id: 'defense', action: 'base-defense', icon: '⛨', title: 'Verteidigungsanlage', sub: pm.secureSlots() + ' sichere Plätze · +' + 5 * pm._up('defense') + ' kg', lvl: pm._up('defense') },
      { id: 'trader', action: 'base-trader', icon: '⚖', title: 'Händler „Krähe“', sub: p.trader.stock.filter(s => s.count > 0).length + ' Angebote', lvl: pm._up('trader') },
    ];
    const grid = uiEl('div', 'card-grid');
    for (const c of cards) {
      const b = uiBtn('<span class="card-icon">' + c.icon + '</span><span class="card-title">' + uiEsc(c.title) + (c.lvl !== null && c.lvl !== undefined ? ' <span class="stars">' + '★'.repeat(c.lvl) + '☆'.repeat(3 - c.lvl) + '</span>' : '') + '</span><span class="card-sub muted">' + uiEsc(c.sub) + '</span>' + (c.warn ? '<span class="card-warn warn">' + uiEsc(c.warn) + '</span>' : ''), c.action, () => ui.showScreen(c.id), { cls: 'card' });
      grid.appendChild(b);
    }
    root.appendChild(grid);
    const plan = uiEl('div', 'row base-plan');
    plan.appendChild(uiBtn('▶ Einsatz planen', 'plan-raid', () => ui.showScreen('missionSelect'), { primary: true, cls: 'btn-big' }));
    root.appendChild(plan);
    const foot = uiEl('div', 'row wrap base-foot');
    foot.appendChild(uiBtn('Speichern', 'save', () => ui.game.saveNow()));
    foot.appendChild(uiBtn('Einstellungen', 'settings', () => ui.showScreen('settings')));
    foot.appendChild(uiBtn('Statistiken', 'stats', () => ui.showScreen('stats')));
    foot.appendChild(uiBtn('Info', 'credits', () => ui.showScreen('credits')));
    foot.appendChild(uiBtn('Hauptmenü', 'main-menu', () => ui.game.returnToMain()));
    root.appendChild(foot);
  };
  render();
  return { refresh: render, destroy() {} };
}

// ======================= stash & loadout =======================
function uiScreenStash(ui, root) {
  const moves = uib_baseMoves(ui);
  const render = () => {
    const pm = uib_pm(ui);
    const p = pm.profile;
    root.innerHTML = '';
    if (!p) return;
    root.appendChild(uib_header(ui, 'Lager & Ausrüstung', 'Packe, was du in den Einsatz mitnimmst. Alles im Rucksack und am Körper geht beim Tod verloren.'));
    const cols = uiEl('div', 'columns');
    const left = uiEl('div', 'col');
    left.appendChild(uiEquipmentPanel(ui, p.equipment, Object.assign({ title: 'Ausrüstung am Körper' }, moves)));
    const w = pm.loadoutWeight(), lim = pm.carryLimit();
    left.appendChild(uiBuildGrid(ui, p.loadout, Object.assign({ title: 'Rucksack (Einsatz)', info: formatWeight(w) + ' / ' + formatWeight(lim), columns: 6,
      headerButtons: [uiBtn('Schnell packen', 'quick-pack', () => { const n = pm.quickPack(); ui.toast(n ? 'Munition, Medizin und Verpflegung eingepackt' : 'Nichts Passendes im Lager', n ? 'success' : 'info'); uib_save(ui); ui.refresh(); }, { small: true, title: 'Packt Munition für deine Waffen, Medizin, Nahrung und Wasser ein' })] }, moves)));
    left.appendChild(uiBar(w / lim, w > lim ? 'bar-danger' : 'bar-weight', 'Gewicht ' + formatWeight(w) + ' / ' + formatWeight(lim)));
    left.appendChild(uiBuildGrid(ui, p.secure, Object.assign({ title: 'Sicherer Behälter', info: 'bleibt beim Tod erhalten', columns: 6 }, moves)));
    const warn = pm.loadoutWarnings();
    if (warn.length) left.appendChild(uiEl('div', 'panel warnings', warn.map(x => '<div class="warn">⚠ ' + uiEsc(x) + '</div>').join('')));
    const right = uiEl('div', 'col');
    right.appendChild(uiBuildGrid(ui, p.stash, Object.assign({ title: 'Lager', info: p.stash.all().length + '/' + p.stash.slots, columns: 8,
      headerButtons: [uiBtn('Sortieren', 'sort', () => { p.stash.sort(); ui.selected = null; ui.refresh(); }, { small: true })] }, moves)));
    right.appendChild(uib_detail(ui, ui.selected));
    right.appendChild(uib_actionBar(ui, ui.selected));
    right.appendChild(uib_upgradeCard(ui, 'stash'));
    cols.appendChild(left); cols.appendChild(right);
    root.appendChild(cols);
    const foot = uiEl('div', 'row');
    foot.appendChild(uiBtn('▶ Einsatz planen', 'plan-raid', () => ui.showScreen('missionSelect'), { primary: true }));
    root.appendChild(foot);
  };
  render();
  return { refresh: render, destroy() { uib_save(ui); } };
}

// ======================= armory =======================
function uiScreenArmory(ui, root) {
  const render = () => {
    const pm = uib_pm(ui);
    const p = pm.profile;
    root.innerHTML = '';
    if (!p) return;
    root.appendChild(uib_header(ui, 'Waffenwerkstatt', 'Waffen und Rüstung reparieren, Munition und Waffen bauen. Die Werkstatt-Ausbaustufe senkt die Kosten.'));
    const cols = uiEl('div', 'columns');
    const left = uiEl('div', 'col');
    const rep = uiEl('div', 'panel');
    rep.appendChild(uiEl('div', 'panel-title', 'Reparatur'));
    const list = uiEl('div', 'list');
    const items = [];
    for (const s of EQUIP_SLOTS) if (p.equipment[s]) items.push({ inst: p.equipment[s], where: 'ausgerüstet' });
    for (const it of p.loadout.all()) items.push({ inst: it, where: 'Rucksack' });
    for (const it of p.stash.all()) items.push({ inst: it, where: 'Lager' });
    const dmg = items.filter(x => x.inst.durability !== undefined && Items.def(x.inst).durabilityMax);
    if (!dmg.length) list.appendChild(uiEl('div', 'muted', 'Keine Waffen oder Rüstungen vorhanden.'));
    for (const { inst, where } of dmg) {
      const d = Items.def(inst);
      const pct = inst.durability / d.durabilityMax;
      const cost = pm.repairCost(inst);
      const row = uiEl('div', 'list-item');
      const info = uiEl('div', 'grow', uiItemName(inst) + ' <span class="muted small">(' + where + ')</span>');
      info.appendChild(uiBar(pct, pct < 0.3 ? 'bar-danger' : 'bar-dur', Math.round(pct * 100) + ' %'));
      row.appendChild(info);
      row.appendChild(uiBtn(cost > 0 ? 'Reparieren ' + formatCredits(cost) : 'Intakt', 'repair', () => {
        const r = pm.repair(inst.uid);
        if (r.ok) { ui.toast(d.name + ' repariert', 'success'); uib_save(ui); } else ui.toast(r.reason, 'warning');
        ui.refresh();
      }, { small: true, disabled: cost <= 0 || p.credits < cost, reason: cost <= 0 ? 'Nicht beschädigt' : 'Nicht genug Credits' }));
      list.appendChild(row);
    }
    rep.appendChild(list);
    left.appendChild(rep);
    const right = uiEl('div', 'col');
    right.appendChild(uib_recipes(ui, 'armory'));
    right.appendChild(uiEl('div', 'panel muted small', 'Waffenbau-Rezepte werden über die Werkstatt-Ausbaustufe freigeschaltet (aktuell Stufe ' + pm._up('workshop') + ').'));
    cols.appendChild(left); cols.appendChild(right);
    root.appendChild(cols);
  };
  render();
  return { refresh: render, destroy() {} };
}

// ======================= medbay =======================
function uiScreenMedbay(ui, root) {
  const render = () => {
    const pm = uib_pm(ui);
    const p = pm.profile;
    root.innerHTML = '';
    if (!p) return;
    root.appendChild(uib_header(ui, 'Krankenstation', 'Verletzungen behandeln und Medizin herstellen. Nach einem Tod bist du verwundet.'));
    const cols = uiEl('div', 'columns');
    const left = uiEl('div', 'col');
    const st = uiEl('div', 'panel');
    st.appendChild(uiEl('div', 'panel-title', 'Zustand'));
    st.appendChild(uiBar(p.hp / pm.hpMax(), 'bar-hp', 'Gesundheit ' + Math.round(p.hp) + ' / ' + pm.hpMax()));
    st.appendChild(uiBar(p.hunger / 100, 'bar-food', 'Nahrung ' + Math.round(p.hunger)));
    st.appendChild(uiBar(p.thirst / 100, 'bar-water', 'Wasser ' + Math.round(p.thirst)));
    const cost = pm.healCost();
    const fit = p.hp >= pm.hpMax() && p.hunger >= 100 && p.thirst >= 100;
    st.appendChild(uiBtn(fit ? 'Du bist fit' : 'Behandeln und verpflegen (' + (cost ? formatCredits(cost) : 'kostenlos') + ')', 'heal', () => {
      const r = pm.heal();
      if (r.ok) { ui.toast('Behandelt – Gesundheit, Nahrung und Wasser aufgefüllt', 'success'); uib_save(ui); } else ui.toast(r.reason, 'warning');
      ui.refresh();
    }, { primary: true, disabled: fit || p.credits < cost, reason: fit ? 'Volle Gesundheit' : 'Nicht genug Credits' }));
    left.appendChild(st);
    const use = uiEl('div', 'panel');
    use.appendChild(uiEl('div', 'panel-title', 'Vorräte im Lager benutzen'));
    const list = uiEl('div', 'list');
    const usable = p.stash.all().filter(i => Items.isUsable(i));
    if (!usable.length) list.appendChild(uiEl('div', 'muted', 'Keine Medizin, Nahrung oder Getränke im Lager.'));
    for (const it of usable) {
      const row = uiEl('div', 'list-item');
      row.appendChild(uiEl('div', 'grow', uiItemName(it) + (it.count > 1 ? ' ×' + it.count : '') + '<div class="small muted">' + uiEsc(Items.describe(it).join(' · ')) + '</div>'));
      row.appendChild(uiBtn('Benutzen', 'use', () => { const r = pm.useFromStash(it.uid); if (r.ok) uib_save(ui); else ui.toast(r.reason, 'warning'); ui.refresh(); }, { small: true }));
      list.appendChild(row);
    }
    use.appendChild(list);
    left.appendChild(use);
    const right = uiEl('div', 'col');
    right.appendChild(uib_recipes(ui, 'medbay'));
    right.appendChild(uib_upgradeCard(ui, 'medbay'));
    cols.appendChild(left); cols.appendChild(right);
    root.appendChild(cols);
  };
  render();
  return { refresh: render, destroy() {} };
}

// ======================= workshop =======================
function uiScreenWorkshop(ui, root) {
  const render = () => {
    const p = uib_pm(ui).profile;
    root.innerHTML = '';
    if (!p) return;
    root.appendChild(uib_header(ui, 'Werkstatt', 'Verwandle Schrott und Material in nützliche Dinge.'));
    const cols = uiEl('div', 'columns');
    const left = uiEl('div', 'col');
    left.appendChild(uib_recipes(ui, 'workshop'));
    const right = uiEl('div', 'col');
    right.appendChild(uib_upgradeCard(ui, 'workshop'));
    const mats = p.stash.all().filter(i => ['material', 'electronics', 'tool'].includes((Items.def(i) || {}).cat));
    right.appendChild(uiEl('div', 'panel', '<div class="panel-title">Material im Lager</div>' + (mats.length ? mats.map(i => '<div class="list-item">' + uiItemName(i) + ' <span class="muted">×' + i.count + '</span></div>').join('') : '<div class="muted">Kein Material – durchsuche Werkstätten, Fabriken und Garagen.</div>')));
    cols.appendChild(left); cols.appendChild(right);
    root.appendChild(cols);
  };
  render();
  return { refresh: render, destroy() {} };
}

// ======================= radio =======================
function uib_missionCard(ui, def, mode, reason) {
  const pm = uib_pm(ui);
  const p = pm.profile;
  const ms = ui.game.missions;
  const card = uiEl('div', 'panel mission-card' + (mode === 'locked' ? ' locked' : ''));
  const map = MAPS[def.mapId];
  card.appendChild(uiEl('div', 'mission-head', '<b>' + uiEsc(def.title) + '</b><span class="muted small">' + uiEsc(map ? map.name : def.mapId) + ' · ' + uiSkulls(def.difficulty || 1) + (def.repeatable ? ' · wiederholbar' : '') + '</span>'));
  card.appendChild(uiEl('p', 'small', uiEsc(def.desc)));
  const prog = mode === 'active' ? ms.progressOf(p, def.id) : null;
  const objs = uiEl('ul', 'objectives');
  const all = [...(def.objectives || []).map(o => ({ o, opt: false })), ...(def.optional || []).map(o => ({ o, opt: true }))];
  for (const { o, opt } of all) {
    const st = prog ? prog.objectives.find(x => x.def.id === o.id) : null;
    const li = uiEl('li', (st && st.done ? 'done' : '') + (opt ? ' optional' : ''));
    li.innerHTML = (st && st.done ? '✓ ' : opt ? '◇ ' : '• ') + uiEsc(o.text) + ((o.count || 1) > 1 && st ? ' <span class="muted">(' + st.progress + '/' + o.count + ')</span>' : '') + (opt ? ' <span class="muted small">(optional)</span>' : '');
    if (mode === 'active' && o.type === 'collect' && !(st && st.done)) {
      const can = ms.canHandIn(p, def.id, o.id);
      li.appendChild(uiBtn('Abgeben', 'hand-in', () => {
        const r = ms.handIn(p, def.id, o.id);
        if (r.ok) { ui.toast('Abgegeben: ' + o.text, 'success'); uib_save(ui); } else ui.toast(r.reason, 'warning');
        ui.refresh();
      }, { small: true, disabled: !can, reason: 'Benötigt ' + (o.count || 1) + '× ' + ((Items.def(o.target) || {}).name || o.target) + ' im Lager (vorhanden: ' + pm.stash.count(o.target) + ')' }));
    }
    objs.appendChild(li);
  }
  card.appendChild(objs);
  const r = def.rewards || {};
  const items = (r.items || []).map(i => ((Items.def(i.id) || {}).name || i.id) + (i.count > 1 ? ' ×' + i.count : '')).join(', ');
  card.appendChild(uiEl('div', 'small reward', 'Belohnung: <b>' + formatCredits(r.credits || 0) + '</b> · ' + (r.xp || 0) + ' EP' + (items ? ' · ' + uiEsc(items) : '') + (def.optionalRewards && (def.optionalRewards.credits || def.optionalRewards.xp) ? ' <span class="muted">(+' + formatCredits(def.optionalRewards.credits || 0) + ', +' + (def.optionalRewards.xp || 0) + ' EP für Nebenziele)</span>' : '')));
  if (mode !== 'completed') card.appendChild(uiEl('div', 'small muted fail', 'Fehlschlag: ' + uiEsc(def.failText || MISSION_FAIL_TEXT)));
  const row = uiEl('div', 'row');
  if (mode === 'available') {
    const full = ms.active(p).length >= ms.maxActive(p);
    row.appendChild(uiBtn('Annehmen', 'accept-mission', () => {
      const res = ms.accept(p, def.id);
      if (res.ok) { ui.toast('Auftrag angenommen: ' + def.title, 'success'); uib_save(ui); } else ui.toast(res.reason, 'warning');
      ui.refresh();
    }, { primary: true, small: true, disabled: full, reason: 'Maximal ' + ms.maxActive(p) + ' aktive Aufträge – Funkstation ausbauen' }));
  } else if (mode === 'active') {
    row.appendChild(uiBtn('Abbrechen', 'abandon-mission', async () => {
      if (!(await ui.confirm('Auftrag „' + def.title + '“ abbrechen? Der Fortschritt geht verloren.', { danger: true, ok: 'Abbrechen' }))) return;
      ms.abandon(p, def.id); uib_save(ui); ui.refresh();
    }, { small: true, danger: true }));
    row.appendChild(uiBtn('Einsatz planen', 'plan-raid', () => { ui.missionMap = def.mapId; ui.showScreen('missionSelect'); }, { small: true }));
  } else if (mode === 'locked') {
    row.appendChild(uiEl('span', 'warn small', uiEsc(reason || 'Gesperrt')));
  }
  card.appendChild(row);
  return card;
}

function uiScreenRadio(ui, root) {
  let tab = ui.radioTab || 'available';
  const render = () => {
    const pm = uib_pm(ui);
    const p = pm.profile;
    const ms = ui.game.missions;
    root.innerHTML = '';
    if (!p) return;
    root.appendChild(uib_header(ui, 'Funkstation', 'Aufträge annehmen und abgeben. Aktive: ' + ms.active(p).length + ' / ' + ms.maxActive(p)));
    const tabs = uiEl('div', 'tabs');
    for (const [id, label] of [['available', 'Verfügbar (' + ms.availableFor(p).length + ')'], ['active', 'Aktiv (' + ms.active(p).length + ')'], ['completed', 'Abgeschlossen (' + ms.completed(p).length + ')'], ['locked', 'Gesperrt']]) {
      tabs.appendChild(uiBtn(label, 'tab-' + id, () => { tab = id; ui.radioTab = id; render(); }, { cls: 'tab' + (tab === id ? ' active' : '') }));
    }
    root.appendChild(tabs);
    const cols = uiEl('div', 'columns');
    const left = uiEl('div', 'col mission-list');
    let list = [];
    if (tab === 'available') list = ms.availableFor(p).map(d => [d, 'available']);
    else if (tab === 'active') list = ms.active(p).map(d => [d, 'active']);
    else if (tab === 'completed') list = ms.completed(p).map(id => [MISSION_BY_ID[id], 'completed']).filter(x => x[0]);
    else list = ms.lockedFor(p).map(x => [x.def, 'locked', x.reason]);
    if (!list.length) left.appendChild(uiEl('div', 'panel muted', tab === 'active' ? 'Keine aktiven Aufträge. Nimm einen unter „Verfügbar“ an.' : tab === 'available' ? 'Momentan keine neuen Aufträge. Steige im Level auf oder schließe laufende Aufträge ab.' : 'Nichts hier.'));
    for (const [d, mode, reason] of list) left.appendChild(uib_missionCard(ui, d, mode, reason));
    const right = uiEl('div', 'col');
    right.appendChild(uib_upgradeCard(ui, 'radio'));
    right.appendChild(uiEl('div', 'panel small muted', 'Sammelaufträge („beschaffen“) gibst du hier aus dem Lager ab – oder sie zählen automatisch, wenn du die Gegenstände extrahierst. Alle anderen Ziele erfüllst du im Einsatz; Fortschritt bleibt nur bei erfolgreicher Extraktion erhalten.'));
    cols.appendChild(left); cols.appendChild(right);
    root.appendChild(cols);
  };
  render();
  return { refresh: render, destroy() {} };
}

// ======================= defense =======================
function uiScreenDefense(ui, root) {
  const render = () => {
    const pm = uib_pm(ui);
    const p = pm.profile;
    root.innerHTML = '';
    if (!p) return;
    root.appendChild(uib_header(ui, 'Verteidigungsanlage', 'Langfristige Boni für jeden Einsatz.'));
    const cols = uiEl('div', 'columns');
    const left = uiEl('div', 'col');
    left.appendChild(uib_upgradeCard(ui, 'defense'));
    const lvl = pm._up('defense');
    left.appendChild(uiEl('div', 'panel', '<div class="panel-title">Aktuelle Boni</div>' +
      '<div class="list-item">Sicherer Behälter: <b>' + pm.secureSlots() + ' Plätze</b> (Inhalt bleibt beim Tod erhalten)</div>' +
      '<div class="list-item">Zusätzliche Traglast: <b>+' + 5 * lvl + ' kg</b> (gesamt ' + formatWeight(pm.carryLimit()) + ')</div>' +
      '<div class="list-item">Ausrüstungsversicherung: <b>' + (lvl >= 3 ? '50 % Chance je Gegenstand' : 'ab Stufe 3') + '</b></div>'));
    const right = uiEl('div', 'col');
    right.appendChild(uiBuildGrid(ui, p.secure, Object.assign({ title: 'Sicherer Behälter', columns: 6, readonly: false }, uib_baseMoves(ui))));
    right.appendChild(uiEl('div', 'panel small muted', 'Lege im Lager wertvolle Dinge (Schlüssel, Medizin) in den sicheren Behälter. Im Einsatz gefundene Beute kannst du dort ebenfalls sichern.'));
    right.appendChild(uiBtn('Zum Lager', 'base-stash', () => ui.showScreen('stash')));
    cols.appendChild(left); cols.appendChild(right);
    root.appendChild(cols);
  };
  render();
  return { refresh: render, destroy() {} };
}

// ======================= trader =======================
function uiScreenTrader(ui, root) {
  let filter = 'all';
  const render = () => {
    const pm = uib_pm(ui);
    const p = pm.profile;
    root.innerHTML = '';
    if (!p) return;
    root.appendChild(uib_header(ui, 'Händler „Krähe“', 'Neue Ware nach jedem Einsatz. Verkaufspreise steigen mit der Händler-Ausbaustufe.'));
    const cols = uiEl('div', 'columns');
    const left = uiEl('div', 'col');
    const buy = uiEl('div', 'panel');
    buy.appendChild(uiEl('div', 'panel-title', 'Kaufen'));
    const tabs = uiEl('div', 'tabs small');
    for (const [id, label] of [['all', 'Alles'], ['ammo', 'Munition'], ['medical', 'Medizin'], ['weapon', 'Waffen'], ['armor', 'Rüstung'], ['other', 'Sonstiges']]) {
      tabs.appendChild(uiBtn(label, 'filter-' + id, () => { filter = id; render(); }, { cls: 'tab' + (filter === id ? ' active' : ''), small: true }));
    }
    buy.appendChild(tabs);
    const table = uiEl('div', 'list trader-list');
    p.trader.stock.forEach((line, idx) => {
      const d = Items.def(line.id);
      if (!d) return;
      const cat = d.cat;
      if (filter === 'ammo' && cat !== 'ammo') return;
      if (filter === 'medical' && cat !== 'medical') return;
      if (filter === 'weapon' && cat !== 'weapon' && cat !== 'grenade') return;
      if (filter === 'armor' && cat !== 'armor' && cat !== 'backpack') return;
      if (filter === 'other' && ['ammo', 'medical', 'weapon', 'grenade', 'armor', 'backpack'].includes(cat)) return;
      const row = uiEl('div', 'list-item' + (line.count <= 0 ? ' locked' : ''));
      const info = uiEl('div', 'grow', '<span class="rarity-' + d.rarity + '">' + uiEsc(d.name) + '</span> <span class="muted small">' + uiEsc(CATEGORY_NAMES[cat] || cat) + ' · Vorrat ' + line.count + '</span><div class="small">' + formatCredits(line.price) + (d.stack > 1 ? ' / Stück' : '') + '</div>');
      info.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') uiTooltip(ui, Items.create(d.id, 1), info); });
      info.addEventListener('pointerleave', () => ui.hideTooltip());
      row.appendChild(info);
      const amounts = d.stack > 1 ? (d.ammo ? [10, 30] : [1, 5]) : [1];
      for (const n of amounts) {
        const k = Math.min(n, line.count);
        const cost = line.price * k;
        row.appendChild(uiBtn('×' + n + ' ' + formatCredits(line.price * n), 'buy', () => {
          const r = pm.buy(idx, n);
          if (r.ok) { ui.toast('Gekauft: ' + d.name + ' ×' + Math.min(n, line.count + n), 'success', 1500); uib_save(ui); } else ui.toast(r.reason, 'warning');
          ui.refresh();
        }, { small: true, disabled: line.count <= 0 || p.credits < cost || k <= 0, reason: line.count <= 0 ? 'Ausverkauft' : 'Nicht genug Credits' }));
      }
      table.appendChild(row);
    });
    buy.appendChild(table);
    left.appendChild(buy);
    const right = uiEl('div', 'col');
    const sellMoves = Object.assign({}, uib_baseMoves(ui), { actions: (sel) => uib_actions(ui, sel).filter(a => a.action === 'sell' || a.action === 'split') });
    right.appendChild(uiBuildGrid(ui, p.stash, Object.assign({ title: 'Verkaufen (aus dem Lager)', columns: 7 }, sellMoves)));
    const inst = uig_selInst(ui.selected);
    const sp = uiEl('div', 'panel');
    if (inst && ui.selected.inv === p.stash) {
      const d = Items.def(inst);
      sp.appendChild(uiEl('div', '', uiItemName(inst) + (inst.count > 1 ? ' ×' + inst.count : '') + ' – Wert ' + formatCredits(Items.value(inst))));
      const row = uiEl('div', 'row wrap');
      if (inst.count > 1) row.appendChild(uiBtn('1 verkaufen (' + formatCredits(pm.sellPrice(inst, 1)) + ')', 'sell', () => { const r = pm.sell(inst.uid, 1); if (r.ok) { ui.toast('+' + formatCredits(r.credits), 'success', 1200); uib_save(ui); } ui.refresh(); }, { small: true }));
      row.appendChild(uiBtn('Alle verkaufen (' + formatCredits(pm.sellPrice(inst)) + ')', 'sell', async () => {
        if (Items.rarity(inst).order >= 2 && !(await ui.confirm(d.name + ' für ' + formatCredits(pm.sellPrice(inst)) + ' verkaufen?'))) return;
        const r = pm.sell(inst.uid); if (r.ok) { ui.toast('+' + formatCredits(r.credits), 'success', 1200); ui.selected = null; uib_save(ui); } ui.refresh();
      }, { small: true, primary: true }));
      sp.appendChild(row);
    } else sp.appendChild(uiEl('div', 'muted', 'Wähle links im Lager einen Gegenstand zum Verkaufen.'));
    right.appendChild(sp);
    right.appendChild(uib_upgradeCard(ui, 'trader'));
    cols.appendChild(left); cols.appendChild(right);
    root.appendChild(cols);
  };
  render();
  return { refresh: render, destroy() { ui.hideTooltip(); } };
}

// ======================= mission select =======================
function uiScreenMissionSelect(ui, root) {
  const render = () => {
    const pm = uib_pm(ui);
    const p = pm.profile;
    root.innerHTML = '';
    if (!p) return;
    const unlocked = pm.unlockedMaps();
    if (!ui.missionMap || !MAPS[ui.missionMap]) ui.missionMap = unlocked[unlocked.length - 1] || 'city';
    const sel = ui.missionMap;
    root.appendChild(uib_header(ui, 'Einsatz planen', 'Gebiet wählen, Ausrüstung prüfen, losziehen.'));
    const cards = uiEl('div', 'map-cards');
    for (const id of MAP_ORDER) {
      const m = MAPS[id];
      const open = unlocked.includes(id);
      const reason = open ? '' : 'Ab Stufe ' + m.unlockLevel + (m.radioUnlock ? ' oder Funkstation Stufe ' + m.radioUnlock : '');
      const b = uiBtn('<span class="map-name">' + uiEsc(m.name) + '</span><span class="map-diff">' + uiSkulls(m.difficulty || 1) + '</span><span class="small muted">' + Math.round((m.raidDuration || 1500) / 60) + ' min · Start ' + formatHour(m.startHour || 12) + ' Uhr</span>' + (open ? '' : '<span class="small warn">🔒 ' + uiEsc(reason) + '</span>'),
        'select-map', () => { ui.missionMap = id; render(); }, { cls: 'map-card map-' + id + (sel === id ? ' active' : '') + (open ? '' : ' locked') });
      cards.appendChild(b);
    }
    root.appendChild(cards);
    const m = MAPS[sel];
    const open = unlocked.includes(sel);
    const cols = uiEl('div', 'columns');
    const left = uiEl('div', 'col');
    const info = uiEl('div', 'panel');
    info.appendChild(uiEl('div', 'panel-title', uiEsc(m.name)));
    info.appendChild(uiEl('p', '', uiEsc(m.desc || '')));
    const kindText = (e) => e.kind === 'always' ? 'immer offen' : e.kind === 'timed' ? 'nur von ' + formatTime(e.window[0]) + ' bis ' + formatTime(e.window[1]) + ' Einsatzzeit' : e.kind === 'key' ? 'benötigt ' + ((Items.def(e.requires) || {}).name || e.requires) : e.kind === 'fuel' ? 'benötigt ' + ((Items.def(e.requires) || {}).name || 'Treibstoff') : e.kind === 'power' ? 'benötigt Strom (Generator starten)' : e.kind;
    info.appendChild(uiEl('div', 'small', '<b>Extraktionspunkte</b>' + (m.extractions || []).map(e => '<div class="list-item">⬢ ' + uiEsc(e.name) + ' <span class="muted">– ' + uiEsc(kindText(e)) + ' · ' + e.duration + ' s' + (e.hazard === 'horde' ? ' · lockt eine Horde an' : '') + '</span></div>').join('')));
    const zt = Object.keys((m.zombies || {}).weights || {}).map(t => (ZOMBIE_TYPES[t] || {}).name || t).join(', ');
    info.appendChild(uiEl('div', 'small muted', 'Gegner: ' + uiEsc(zt) + (m.boss ? ' · Boss: ' + uiEsc((ZOMBIE_TYPES[m.boss] || {}).name || m.boss) : '')));
    left.appendChild(info);
    const act = ui.game.missions.active(p).filter(d => d.mapId === sel);
    const mp = uiEl('div', 'panel');
    mp.appendChild(uiEl('div', 'panel-title', 'Aufträge für dieses Gebiet'));
    if (!act.length) mp.appendChild(uiEl('div', 'muted small', 'Keine aktiven Aufträge hier. Du kannst trotzdem plündern – oder an der Funkstation einen annehmen.'));
    for (const d of act) mp.appendChild(uiEl('div', 'list-item', '<b>' + uiEsc(d.title) + '</b><div class="small muted">' + d.objectives.map(o => uiEsc(o.text)).join(' · ') + '</div>'));
    mp.appendChild(uiBtn('Funkstation', 'base-radio', () => ui.showScreen('radio'), { small: true }));
    left.appendChild(mp);
    const right = uiEl('div', 'col');
    const lo = uiEl('div', 'panel');
    lo.appendChild(uiEl('div', 'panel-title', 'Deine Ausrüstung'));
    const eq = p.equipment;
    lo.appendChild(uiEl('div', 'small', EQUIP_SLOTS.filter(s => eq[s]).map(s => '<div class="list-item"><span class="muted">' + uiEsc(EQUIP_SLOT_NAMES[s]) + ':</span> ' + uiItemName(eq[s]) + (eq[s].count > 1 ? ' ×' + eq[s].count : '') + '</div>').join('') || '<div class="danger">Nichts ausgerüstet!</div>'));
    lo.appendChild(uiEl('div', 'small', 'Rucksack: ' + p.loadout.all().length + '/' + p.loadout.slots + ' · Gewicht ' + formatWeight(pm.loadoutWeight()) + ' / ' + formatWeight(pm.carryLimit()) + ' · Gesundheit ' + Math.round(p.hp) + '/' + pm.hpMax()));
    const warn = pm.loadoutWarnings();
    if (warn.length) lo.appendChild(uiEl('div', 'warnings', warn.map(x => '<div class="warn small">⚠ ' + uiEsc(x) + '</div>').join('')));
    lo.appendChild(uiBtn('Ausrüstung bearbeiten', 'base-stash', () => ui.showScreen('stash'), { small: true }));
    right.appendChild(lo);
    const go = uiEl('div', 'panel');
    const seedRow = uiEl('div', 'row');
    seedRow.appendChild(uiEl('label', 'small muted', 'Seed (optional):'));
    const seed = uiEl('input'); seed.type = 'text'; seed.className = 'seed-input'; seed.placeholder = 'zufällig'; seed.maxLength = 12;
    seed.value = ui.lastSeed || '';
    seed.addEventListener('input', () => { ui.lastSeed = seed.value; });
    seedRow.appendChild(seed);
    go.appendChild(seedRow);
    go.appendChild(uiEl('div', 'small muted', 'Der Seed erzeugt die gleiche Karte erneut. Ein laufender Einsatz wird nicht gespeichert: Wer das Spiel neu lädt, gilt als vermisst und verliert die Ausrüstung.'));
    go.appendChild(uiBtn('▶ Einsatz starten', 'start-raid', () => {
      const s = seed.value.trim();
      const opts = {};
      if (s) opts.seed = /^\d+$/.test(s) ? Number(s) : s;
      ui.game.startRaid(sel, opts);
    }, { primary: true, cls: 'btn-big', disabled: !open, reason: 'Gebiet noch gesperrt' }));
    right.appendChild(go);
    cols.appendChild(left); cols.appendChild(right);
    root.appendChild(cols);
  };
  render();
  return { refresh: render, destroy() {} };
}

// ======================= stats =======================
function uiScreenStats(ui, root) {
  const render = () => {
    let p = uib_pm(ui).profile;
    if (!p) { const l = ui.game.save.load(); p = l.ok ? l.profile : null; }
    root.innerHTML = '';
    root.appendChild(uib_header(ui, 'Statistiken', ''));
    if (!p) { root.appendChild(uiEl('div', 'panel muted', 'Noch keine Statistiken vorhanden.')); return; }
    const s = p.stats || {};
    const acc = s.shotsFired ? Math.round((s.shotsHit || 0) / s.shotsFired * 100) : 0;
    const rows = [
      ['Einsätze', s.raids], ['Extraktionen', s.extractions], ['Tode', s.deaths], ['Vermisst', s.mia],
      ['Überlebensquote', s.raids ? Math.round((s.extractions || 0) / s.raids * 100) + ' %' : '–'], ['Getötete Zombies', s.kills],
      ['Schüsse / Treffer', (s.shotsFired || 0) + ' / ' + (s.shotsHit || 0) + ' (' + acc + ' %)'], ['Durchsuchte Behälter', s.containersOpened],
      ['Zurückgelegt', (s.distance || 0) + ' m'], ['Extrahierter Beutewert', formatCredits(s.lootValue || 0)], ['Bester Einsatz', formatCredits(s.bestRaidValue || 0)],
      ['Verdient / ausgegeben', formatCredits(s.creditsEarned || 0) + ' / ' + formatCredits(s.creditsSpent || 0)], ['Aufträge erledigt / gescheitert', (s.missionsCompleted || 0) + ' / ' + (s.missionsFailed || 0)],
      ['Hergestellt', s.itemsCrafted], ['Basis-Ausbauten', s.upgradesBought], ['Spielzeit', formatTime(s.playTime || 0).replace(':', ' min ') + ' s'],
    ];
    const cols = uiEl('div', 'columns');
    const left = uiEl('div', 'panel col');
    left.appendChild(uiEl('div', 'panel-title', 'Allgemein'));
    left.appendChild(uiEl('div', 'stats-grid', rows.map(([k, v]) => '<div class="muted">' + uiEsc(k) + '</div><div>' + uiEsc(v === undefined ? 0 : v) + '</div>').join('')));
    const kbt = s.killsByType || {};
    left.appendChild(uiEl('div', 'small', '<b>Nach Typ:</b> ' + (Object.keys(kbt).length ? Object.entries(kbt).map(([k, v]) => uiEsc((ZOMBIE_TYPES[k] || {}).name || k) + ' ' + v).join(' · ') : '–')));
    const right = uiEl('div', 'panel col');
    const have = new Set(s.achievements || []);
    right.appendChild(uiEl('div', 'panel-title', 'Erfolge (' + have.size + '/' + ACHIEVEMENTS.length + ')'));
    right.appendChild(uiEl('div', 'list', ACHIEVEMENTS.map(a => '<div class="list-item achievement' + (have.has(a.id) ? ' got' : '') + '"><span>' + (have.has(a.id) ? '🏆' : '🔒') + '</span><div><b>' + uiEsc(a.name) + '</b><div class="small muted">' + uiEsc(a.desc) + '</div></div></div>').join('')));
    cols.appendChild(left); cols.appendChild(right);
    root.appendChild(cols);
  };
  render();
  return { refresh: render, destroy() {} };
}

// ======================= credits / controls =======================
function uiScreenCredits(ui, root) {
  root.innerHTML = '';
  root.appendChild(uib_header(ui, 'Steuerung & Info', ''));
  const cols = uiEl('div', 'columns');
  const keys = [['W A S D', 'Bewegen'], ['Maus', 'Zielen'], ['Linke Maustaste', 'Schießen / Zuschlagen'], ['R', 'Nachladen'], ['E', 'Interagieren, Türen, Beute (Generator: halten)'],
    ['Shift', 'Sprinten'], ['C', 'Ducken (leiser, ruhiger zielen)'], ['F', 'Taschenlampe'], ['Tab', 'Inventar'], ['M', 'Karte'], ['G', 'Granate werfen'], ['Q', 'Schnellheilung'],
    ['1 – 5', 'Waffenplätze: Primär, Sekundär, Nahkampf, Granate, Medizin'], ['X', 'Ausgewählten Gegenstand ablegen (im Inventar)'], ['Esc', 'Pause / Fenster schließen']];
  cols.appendChild(uiEl('div', 'panel col', '<div class="panel-title">Tastatur & Maus</div><div class="stats-grid">' + keys.map(([k, v]) => '<div><kbd>' + uiEsc(k) + '</kbd></div><div>' + uiEsc(v) + '</div>').join('') + '</div>'));
  cols.appendChild(uiEl('div', 'panel col', '<div class="panel-title">Touch</div><p class="small">Linke Bildschirmhälfte: Bewegungsstick. Rechte Hälfte: Zielstick (feuert bei vollem Ausschlag, wenn „Automatisch feuern“ aktiv ist). Der FEUER-Knopf schießt immer. Knöpfe für Interaktion, Nachladen, Sprint, Ducken, Lampe, Granate, Heilen, Inventar, Karte und Pause.</p>' +
    '<div class="panel-title">So funktioniert es</div><p class="small">Starte aus der Basis in ein Gebiet, plündere Gebäude, erfülle Aufträge und erreiche einen Extraktionspunkt. Wer stirbt, verliert alles, was er am Körper und im Rucksack trägt – nur der sichere Behälter bleibt. Verkaufe Beute, baue die Basis aus und schalte gefährlichere Gebiete frei.</p>' +
    '<div class="panel-title">Über</div><p class="small muted">DEAD ZONE: EXTRACTION v' + GAME_VERSION + ' – ein Top-down-Extraction-Shooter in einer einzigen HTML-Datei. Grafik, Karten und Sound werden vollständig im Browser erzeugt; es werden keine externen Dateien geladen.</p>'));
  root.appendChild(cols);
  return { refresh() {}, destroy() {} };
}

// ======================= settings =======================
function uiScreenSettings(ui, root) {
  let exportText = null;
  const render = () => {
    const g = ui.game;
    const s = g.settings;
    root.innerHTML = '';
    root.appendChild(uib_header(ui, 'Einstellungen', ''));
    const cols = uiEl('div', 'columns');
    const left = uiEl('div', 'panel col');
    left.appendChild(uiEl('div', 'panel-title', 'Ton'));
    for (const [key, label] of [['master', 'Gesamtlautstärke'], ['sfx', 'Effekte'], ['music', 'Atmosphäre']]) {
      const row = uiEl('label', 'setting-row');
      row.appendChild(uiEl('span', '', label));
      const r = uiEl('input'); r.type = 'range'; r.min = 0; r.max = 100; r.value = Math.round((s[key] ?? 1) * 100); r.dataset.setting = key;
      const val = uiEl('span', 'muted small', r.value + ' %');
      r.addEventListener('input', () => { val.textContent = r.value + ' %'; g.applySettings({ [key]: Number(r.value) / 100 }); });
      row.appendChild(r); row.appendChild(val);
      left.appendChild(row);
    }
    left.appendChild(uiEl('div', 'panel-title', 'Darstellung & Steuerung'));
    const check = (key, label) => {
      const row = uiEl('label', 'setting-row');
      const c = uiEl('input'); c.type = 'checkbox'; c.checked = !!s[key]; c.dataset.setting = key;
      c.addEventListener('change', () => g.applySettings({ [key]: c.checked }));
      row.appendChild(c); row.appendChild(uiEl('span', '', label));
      left.appendChild(row);
    };
    check('screenShake', 'Bildschirmwackeln');
    check('damageNumbers', 'Schadenszahlen anzeigen');
    check('minimap', 'Minikarte anzeigen');
    check('showFps', 'FPS und Debug-Infos anzeigen');
    check('aimAssist', 'Touch: Automatisch feuern mit dem Zielstick');
    const select = (key, label, opts) => {
      const row = uiEl('label', 'setting-row');
      row.appendChild(uiEl('span', '', label));
      const sel = uiEl('select'); sel.dataset.setting = key;
      for (const [v, t] of opts) { const o = uiEl('option', '', uiEsc(t)); o.value = v; if (s[key] === v) o.selected = true; sel.appendChild(o); }
      sel.addEventListener('change', () => g.applySettings({ [key]: sel.value }));
      row.appendChild(sel);
      left.appendChild(row);
    };
    select('quality', 'Grafikqualität', [['high', 'Hoch'], ['medium', 'Mittel'], ['low', 'Niedrig']]);
    select('touchControls', 'Touch-Steuerung', [['auto', 'Automatisch'], ['on', 'Immer an'], ['off', 'Aus']]);
    cols.appendChild(left);
    const right = uiEl('div', 'col');
    if (g.state !== 'raid') {
      const sv = uiEl('div', 'panel save-block');
      sv.appendChild(uiEl('div', 'panel-title', 'Spielstand'));
      const has = g.save.hasSave();
      sv.appendChild(uiEl('div', 'small muted', g.save.available() ? (has ? 'Gespeichert im Browser (localStorage). Automatisch nach jedem Einsatz, Handel und Ausbau.' : 'Noch kein Spielstand gespeichert.') : 'Der Browser erlaubt kein Speichern (privater Modus?).'));
      const row = uiEl('div', 'row wrap');
      row.appendChild(uiBtn('Jetzt speichern', 'save', () => { g.saveNow(); render(); }, { disabled: !g.profileMgr.profile, reason: 'Kein Spiel geladen' }));
      row.appendChild(uiBtn('Exportieren', 'export-save', () => { exportText = g.save.exportString(); if (!exportText) ui.toast('Kein Spielstand zum Exportieren', 'warning'); else { try { if (navigator.clipboard) navigator.clipboard.writeText(exportText).catch(() => {}); } catch (e) { /* ignore */ } ui.toast('Exportiert – Text kopieren und sicher aufbewahren', 'success'); } render(); }, { disabled: !has, reason: 'Kein Spielstand' }));
      row.appendChild(uiBtn('Zurücksetzen', 'reset-save', () => g.resetSave(), { danger: true, disabled: !has, reason: 'Kein Spielstand' }));
      sv.appendChild(row);
      if (exportText) {
        const ta = uiEl('textarea', 'export-area'); ta.readOnly = true; ta.value = exportText;
        ta.addEventListener('focus', () => ta.select());
        sv.appendChild(ta);
      }
      sv.appendChild(uiEl('div', 'small muted', 'Importieren: exportierten Text einfügen.'));
      const ta2 = uiEl('textarea', 'import-area'); ta2.placeholder = 'Export-Text hier einfügen …';
      sv.appendChild(ta2);
      sv.appendChild(uiBtn('Importieren', 'import-save', async () => {
        if (!ta2.value.trim()) { ui.toast('Bitte zuerst Text einfügen', 'warning'); return; }
        if (has && !(await ui.confirm('Aktuellen Spielstand durch den Import ersetzen?', { danger: true, ok: 'Ersetzen' }))) return;
        const r = g.save.importString(ta2.value);
        if (!r.ok) { ui.toast('Import fehlgeschlagen: ' + r.error, 'danger', 4000); return; }
        ui.toast('Spielstand importiert', 'success');
        g.continueGame();
      }));
      right.appendChild(sv);
    } else right.appendChild(uiEl('div', 'panel small muted', 'Spielstand-Optionen sind während eines Einsatzes gesperrt.'));
    right.appendChild(uiEl('div', 'panel small muted', 'Tastenbelegung: siehe „Steuerung & Info“. Ton startet nach dem ersten Klick oder Tastendruck (Browser-Regel).'));
    cols.appendChild(right);
    root.appendChild(cols);
  };
  render();
  return { refresh: render, destroy() {} };
}
