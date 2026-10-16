// 23_ui_grid.js — inventory widgets (SPEC §24.1): uiBuildGrid, uiEquipmentPanel, uiTooltip, uiContextMenu, drag & drop.
// Interaction: click selects, clicking a second cell moves/merges/swaps (touch friendly); pointer drag & drop between
// grids and equipment slots; Shift+click splits a stack in half; right click / long press opens the context menu.
// Move rules are supplied by the screen: opts.onMove(fromInv, fromIdx, toInv, toIdx), opts.onEquip(fromInv, fromIdx, slot),
// opts.onUnequip(slot, toInv, toIdx), opts.actions(sel) -> [{label, action, run, disabled, reason}].
// Dependencies: 23_ui.js helpers, 10_items_inventory.js.

const UIG_GLYPH = { weapon: '⌖', ammo: '⁞', medical: '✚', food: '◉', water: '💧', material: '▤', electronics: 'ϟ', tool: '⚒', armor: '⛨',
  backpack: '▣', key: '⚿', mission: '★', collectible: '◆', grenade: '●' };
const UIG_DRAG = { active: null };

function uig_short(name) {
  const s = String(name || '');
  return s.length > 14 ? s.slice(0, 13) + '…' : s;
}

function uig_cellHtml(inst) {
  if (!inst) return '';
  const d = Items.def(inst);
  if (!d) return '<span class="slot-name">?</span>';
  let html = '<span class="slot-glyph cat-' + d.cat + '">' + (UIG_GLYPH[d.cat] || '•') + '</span><span class="slot-name">' + uiEsc(uig_short(d.name)) + '</span>';
  if (inst.count > 1) html += '<span class="count">' + inst.count + '</span>';
  if (inst.durability !== undefined && d.durabilityMax) {
    const pct = clamp(inst.durability / d.durabilityMax, 0, 1);
    html += '<span class="dur"><span style="transform:scaleX(' + pct.toFixed(3) + ')" class="' + (pct < 0.3 ? 'low' : '') + '"></span></span>';
  }
  if (inst.mag !== undefined && d.weapon && d.weapon.class !== 'melee') html += '<span class="mag">' + inst.mag + '/' + d.weapon.magSize + '</span>';
  if (inst.raidFound) html += '<span class="found" title="Im Einsatz gefunden">●</span>';
  return html;
}

function uig_isSel(ui, inv, idx) { const s = ui.selected; return !!s && s.inv === inv && s.idx === idx; }

function uig_dispatch(ui, src, dst) {
  if (!src || !dst) return false;
  const o = dst.opts || {};
  let ok = false;
  try {
    if (src.slot && dst.slot) {
      if (src.slot === dst.slot) return false;
      ok = o.onEquipSwap ? !!o.onEquipSwap(src.slot, dst.slot) : false;
    } else if (src.slot && dst.inv) ok = o.onUnequip ? !!o.onUnequip(src.slot, dst.inv, dst.idx) : false;
    else if (src.inv && dst.slot) ok = o.onEquip ? !!o.onEquip(src.inv, src.idx, dst.slot) : false;
    else if (src.inv && dst.inv) {
      if (src.inv === dst.inv && src.idx === dst.idx) return false;
      if (o.onMove) ok = !!o.onMove(src.inv, src.idx, dst.inv, dst.idx);
      else ok = src.inv === dst.inv ? src.inv.move(src.idx, dst.idx) : src.inv.transfer(src.idx, dst.inv, dst.idx);
    }
  } catch (e) { Log.error('Inventory move failed: ' + (e && e.message)); }
  const a = ui.game.audio;
  if (a) a.play(ok ? 'pickup' : 'ui_error', { volume: 0.4 });
  ui.selected = null;
  ui.hideTooltip();
  ui.refresh();
  return ok;
}

function uig_selInst(sel) {
  if (!sel) return null;
  if (sel.slot) return sel.equipment ? sel.equipment[sel.slot] : null;
  if (sel.inv) return sel.inv.items ? sel.inv.items[sel.idx] || null : null;
  return null;
}

function uig_bindCell(ui, cell, getRef, getInst, opts) {
  let down = null, longT = null;
  const clearLong = () => { if (longT) { clearTimeout(longT); longT = null; } };
  cell.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;
    const inst = getInst();
    down = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, type: e.pointerType };
    if (inst && opts.draggable !== false && !opts.readonly) {
      try { cell.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    if (e.pointerType !== 'mouse' && inst) {
      longT = setTimeout(() => { longT = null; if (down && !down.moved) { down.long = true; uig_openCtx(ui, getRef(), opts, e.clientX, e.clientY); } }, 520);
    }
  });
  cell.addEventListener('pointermove', (e) => {
    if (!down || down.id !== e.pointerId) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 7 && getInst() && !opts.readonly && opts.draggable !== false) {
      down.moved = true; clearLong();
      const g = uiEl('div', 'drag-ghost slot ' + (getInst() ? 'rarity-' + (Items.def(getInst()) || {}).rarity : ''), uig_cellHtml(getInst()));
      document.body.appendChild(g);
      UIG_DRAG.active = { ghost: g, src: getRef() };
      ui.hideTooltip();
    }
    if (down.moved && UIG_DRAG.active) {
      UIG_DRAG.active.ghost.style.transform = 'translate(' + (e.clientX - 30) + 'px,' + (e.clientY - 30) + 'px)';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tgt = el && el.closest ? el.closest('.slot') : null;
      document.querySelectorAll('.slot.drag-over').forEach(n => { if (n !== tgt) n.classList.remove('drag-over'); });
      if (tgt && tgt._ref) tgt.classList.add('drag-over');
    }
  });
  const finish = (e) => {
    clearLong();
    if (!down || down.id !== e.pointerId) return;
    const wasDrag = down.moved, wasLong = down.long;
    down = null;
    if (wasDrag && UIG_DRAG.active) {
      const d = UIG_DRAG.active;
      UIG_DRAG.active = null;
      d.ghost.remove();
      document.querySelectorAll('.slot.drag-over').forEach(n => n.classList.remove('drag-over'));
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tgt = el && el.closest ? el.closest('.slot') : null;
      if (tgt && tgt._ref) uig_dispatch(ui, d.src, tgt._ref());
      return;
    }
    if (wasLong || e.type === 'pointercancel') return;
    // click
    const ref = getRef();
    const inst = getInst();
    if (e.shiftKey && ref.inv && inst && inst.count > 1 && typeof ref.inv.split === 'function' && !opts.readonly) {
      if (ref.inv.split(ref.idx, Math.floor(inst.count / 2))) { ui.refresh(); } else ui.toast('Kein freier Platz zum Teilen', 'warning');
      return;
    }
    const sel = ui.selected;
    if (sel && !(sel.inv === ref.inv && sel.idx === ref.idx && sel.slot === ref.slot) && uig_selInst(sel)) {
      uig_dispatch(ui, sel, ref);
      return;
    }
    if (sel && sel.inv === ref.inv && sel.idx === ref.idx && sel.slot === ref.slot) ui.selected = null;
    else ui.selected = inst ? Object.assign({}, ref) : null;
    if (opts.onSelect) opts.onSelect(ui.selected);
    ui.refresh();
  };
  cell.addEventListener('pointerup', finish);
  cell.addEventListener('pointercancel', (e) => { clearLong(); if (UIG_DRAG.active) { UIG_DRAG.active.ghost.remove(); UIG_DRAG.active = null; } down = null; void e; });
  cell.addEventListener('contextmenu', (e) => { e.preventDefault(); if (getInst()) uig_openCtx(ui, getRef(), opts, e.clientX, e.clientY); });
  cell.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && getInst() && !UIG_DRAG.active) uiTooltip(ui, getInst(), cell); });
  cell.addEventListener('pointerleave', () => ui.hideTooltip());
}

function uig_openCtx(ui, ref, opts, x, y) {
  if (!opts.actions) return;
  ui.selected = Object.assign({}, ref);
  const items = opts.actions(ui.selected) || [];
  if (!items.length) return;
  ui.refresh();
  uiContextMenu(ui, items, x, y);
}

function uiBuildGrid(ui, inventory, opts = {}) {
  const wrap = uiEl('div', 'grid-wrap' + (opts.cls ? ' ' + opts.cls : ''));
  if (opts.title) {
    const head = uiEl('div', 'grid-head');
    head.appendChild(uiEl('span', 'panel-title', uiEsc(opts.title)));
    if (opts.info) head.appendChild(uiEl('span', 'muted grid-info', opts.info));
    if (opts.headerButtons) for (const b of opts.headerButtons) head.appendChild(b);
    wrap.appendChild(head);
  }
  const grid = uiEl('div', 'grid');
  if (opts.columns) grid.style.setProperty('--cols', opts.columns);
  wrap.appendChild(grid);
  const slots = inventory ? inventory.slots : 0;
  for (let i = 0; i < slots; i++) {
    const inst = inventory.items[i] || null;
    const d = inst ? Items.def(inst) : null;
    const cell = uiEl('div', 'slot' + (inst ? ' filled rarity-' + (d ? d.rarity : 'common') : '') + (uig_isSel(ui, inventory, i) ? ' sel' : '') + (opts.highlightCat && d && d.cat === opts.highlightCat ? ' hl' : ''));
    cell.innerHTML = uig_cellHtml(inst);
    const ref = () => ({ inv: inventory, idx: i, opts });
    cell._ref = ref;
    uig_bindCell(ui, cell, ref, () => inventory.items[i] || null, opts);
    grid.appendChild(cell);
  }
  return wrap;
}

function uiEquipmentPanel(ui, equipment, opts = {}) {
  const wrap = uiEl('div', 'equip-panel');
  if (opts.title !== false) wrap.appendChild(uiEl('div', 'panel-title', uiEsc(opts.title || 'Ausrüstung')));
  const grid = uiEl('div', 'equip-grid');
  wrap.appendChild(grid);
  for (const slot of EQUIP_SLOTS) {
    const inst = equipment ? equipment[slot] : null;
    const d = inst ? Items.def(inst) : null;
    const cell = uiEl('div', 'slot equip-slot equip-' + slot + (inst ? ' filled rarity-' + (d ? d.rarity : 'common') : '') + (ui.selected && ui.selected.slot === slot && ui.selected.equipment === equipment ? ' sel' : ''));
    cell.innerHTML = '<span class="equip-label">' + uiEsc(EQUIP_SLOT_NAMES[slot]) + '</span>' + uig_cellHtml(inst);
    const ref = () => ({ slot, equipment, opts });
    cell._ref = ref;
    uig_bindCell(ui, cell, ref, () => (equipment ? equipment[slot] : null), opts);
    grid.appendChild(cell);
  }
  return wrap;
}

function uiTooltip(ui, inst, anchorEl) {
  ui.hideTooltip();
  const d = Items.def(inst);
  if (!d || !anchorEl) return;
  const rar = Items.rarity(inst);
  const tip = uiEl('div', 'tooltip');
  let html = '<div class="tt-name rarity-' + d.rarity + '">' + uiEsc(d.name) + (inst.count > 1 ? ' ×' + inst.count : '') + '</div>';
  html += '<div class="tt-sub muted">' + uiEsc(CATEGORY_NAMES[d.cat] || d.cat) + ' · ' + uiEsc(rar.name) + '</div>';
  html += '<div class="tt-row"><span>Gewicht</span><span>' + formatWeight(Items.weight(inst)) + '</span></div>';
  html += '<div class="tt-row"><span>Wert</span><span>' + formatCredits(Items.value(inst)) + '</span></div>';
  if (inst.durability !== undefined && d.durabilityMax) {
    const pct = clamp(inst.durability / d.durabilityMax, 0, 1);
    html += '<div class="tt-dur"><span style="transform:scaleX(' + pct.toFixed(3) + ')"></span></div>';
  }
  const lines = Items.describe(inst);
  if (lines.length) html += '<ul class="tt-stats">' + lines.map(l => '<li>' + uiEsc(l) + '</li>').join('') + '</ul>';
  html += '<div class="tt-desc">' + uiEsc(d.desc || '') + '</div>';
  if (inst.raidFound) html += '<div class="tt-found">Im Einsatz gefunden</div>';
  tip.innerHTML = html;
  document.body.appendChild(tip);
  const r = anchorEl.getBoundingClientRect();
  const tw = tip.offsetWidth || 240, th = tip.offsetHeight || 160;
  let x = r.right + 8, y = r.top;
  if (x + tw > window.innerWidth - 8) x = r.left - tw - 8;
  if (x < 8) x = 8;
  if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  ui.tooltipEl = tip;
}

function uiContextMenu(ui, items, x, y) {
  ui.closeContextMenu();
  ui.hideTooltip();
  const m = uiEl('div', 'ctxmenu');
  for (const it of items) {
    const b = uiBtn(uiEsc(it.label), it.action || null, () => { ui.closeContextMenu(); if (it.run) it.run(); }, { disabled: !!it.disabled, reason: it.reason, cls: 'ctx-item' + (it.danger ? ' btn-danger' : '') });
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const w = m.offsetWidth || 180, h = m.offsetHeight || 200;
  m.style.left = clamp(x, 6, window.innerWidth - w - 6) + 'px';
  m.style.top = clamp(y, 6, window.innerHeight - h - 6) + 'px';
  ui.ctxMenu = m;
  return m;
}
