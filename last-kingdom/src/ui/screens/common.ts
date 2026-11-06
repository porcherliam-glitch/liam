// Shared markup helpers for item tiles, tooltips and rarity colours.

import { RARITY_INFO, type ItemInstance, type MissionDef } from "../../core/types"
import { itemDef } from "../../items/itemData"
import { describeAffixes, displayName, effectiveArmor, effectiveBlock, effectiveWeapon, itemValue, itemWeight } from "../../items/items"
import { esc } from "../ui"
import { MISSION_KIND_NAMES } from "../../meta/missions"

export function itemTile(item: ItemInstance | null, focusId: string, action: string, extraClass = ""): string {
  if (!item) return `<div class="tile empty ${extraClass}" data-focus data-focus-id="${focusId}" data-action="${action}"></div>`
  const def = itemDef(item.defId)
  const col = RARITY_INFO[item.rarity].color
  const icon = itemIcon(def.kind, def.weapon?.weaponClass)
  const dur = item.maxDurability ? (item.durability ?? 0) / item.maxDurability : null
  return `<div class="tile ${extraClass}" data-focus data-focus-id="${focusId}" data-action="${action}" data-uid="${item.uid}" style="border-color:${col}">
    <div class="tile-icon">${icon}</div>
    ${item.qty > 1 ? `<div class="tile-qty">${item.qty}</div>` : ""}
    ${dur !== null ? `<div class="tile-dur ${dur < 0.25 ? "low" : ""}" style="width:${Math.max(4, dur * 100)}%"></div>` : ""}
    ${item.upgrade ? `<div class="tile-up">+${item.upgrade}</div>` : ""}
  </div>`
}

const SVG: Record<string, string> = {
  sword: '<path d="M4 20l3-3m0 0L18 6l2 0 0 2L9 19m-2-2 2 2M17 5l2 2"/>',
  greatsword: '<path d="M3 21l4-4m0 0L20 4l1 3L9 19M7 17l2 2M5 15l4 4"/>',
  axe: '<path d="M5 19L14 10m0 0c3-3 6-2 6-2s-1 4-4 6l-2-4zM14 10l2 4"/>',
  mace: '<path d="M5 19l8-8m0 0l-2-2 4-4 2 2 2-2 2 2-2 2 2 2-4 4-2-2z"/>',
  spear: '<path d="M3 21L17 7m0 0l3-4-1 5-2-1z"/>',
  dagger: '<path d="M7 17l6-6m0 0l1-5 4 4-5 1zM7 17l-2 2"/>',
  bow: '<path d="M6 4c6 3 6 13 0 16M6 4l12 8L6 20M4 12h14"/>',
  crossbow: '<path d="M4 12h16M12 4v16M6 8c4 1 8 1 12 0M9 16h6"/>',
  armor: '<path d="M8 4l-4 3 2 4h2v9h8v-9h2l2-4-4-3-2 2h-4z"/>',
  helmet: '<path d="M6 13c0-4 3-7 6-7s6 3 6 7v5H6zM9 15h6M12 12v6"/>',
  shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
  food: '<path d="M7 20l3-3m0 0c-3-3-3-7 0-10s7-3 10 0l-10 10zM13 7l4 4"/>',
  potion: '<path d="M10 3h4v5l4 7c1 3-1 6-4 6h-4c-3 0-5-3-4-6l4-7zM8 15h8"/>',
  material: '<path d="M4 8l8-4 8 4-8 4zM4 8v8l8 4 8-4V8M12 12v8"/>',
  gold: '<circle cx="12" cy="12" r="7"/><path d="M12 8v8M9 10h6M9 14h6"/>',
  artifact: '<path d="M12 3l4 5-4 13-4-13zM8 8h8M4 8l4-5h8l4 5"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9m-3 0v3m-3-3v3"/>',
  ammo: '<path d="M4 20L18 6m0 0h-4m4 0v4M8 20l-4 0 0-4"/>',
}

export function itemIcon(kind: string, weaponClass?: string): string {
  let key = kind
  if (kind === "weapon") key = { longsword: "sword", shortsword: "sword", greatsword: "greatsword", battleaxe: "axe", mace: "mace", spear: "spear", dagger: "dagger", bow: "bow", crossbow: "crossbow" }[weaponClass ?? ""] ?? "sword"
  else if (kind === "remedy") key = "potion"
  else if (kind === "quest") key = "key"
  const path = SVG[key] ?? SVG.material
  return `${SVG_OPEN}${path}</svg>`
}

const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'

/** Lightning bolt for the active ability slot. */
export function abilityIcon(): string {
  return `${SVG_OPEN}<path d="M13 2L5 13.5h6L10 22l9-12h-6.2z"/></svg>`
}

/** Padlock for locked quick slots. */
export function lockIcon(): string {
  return `${SVG_OPEN}<rect x="5.5" y="11" width="13" height="9" rx="1.5"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2"/></svg>`
}

export function itemDetails(item: ItemInstance | null, compare?: ItemInstance | null, opts: { sellPrice?: number; buyPrice?: number } = {}): string {
  if (!item) return `<div class="details empty">Kein Gegenstand ausgewählt.</div>`
  const def = itemDef(item.defId)
  const col = RARITY_INFO[item.rarity].color
  const lines: string[] = []
  const w = effectiveWeapon(item)
  if (w) {
    const cw = compare ? effectiveWeapon(compare) : null
    lines.push(stat("Schaden", w.damage, cw?.damage))
    lines.push(stat("Tempo", w.speed, cw?.speed, 2))
    lines.push(stat("Reichweite", w.range, cw?.range, 1, " m"))
    lines.push(stat("Kritisch", Math.round(w.critChance * 100), cw ? Math.round(cw.critChance * 100) : undefined, 0, " %"))
    lines.push(stat("Wucht", Math.round(w.impact * 100), cw ? Math.round(cw.impact * 100) : undefined, 0, " %"))
    lines.push(stat("Ausdauer", w.staminaCost, cw?.staminaCost, 0, "", true))
    if (w.twoHanded) lines.push(`<div class="stat">Zweihändig</div>`)
    if (w.ranged) lines.push(`<div class="stat">Munition: ${itemDef(w.ranged.ammoId).name}</div>`)
  }
  if (def.armor) {
    const a = effectiveArmor(item)
    const ca = compare ? effectiveArmor(compare) : undefined
    lines.push(stat("Rüstung", a, ca))
    if (def.armor.speedMultiplier < 1) lines.push(`<div class="stat">Tempo ${Math.round((def.armor.speedMultiplier - 1) * 100)} %</div>`)
  }
  const b = effectiveBlock(item)
  if (b) {
    const cb = compare ? effectiveBlock(compare) : null
    lines.push(stat("Blockt", Math.round(b.reduction * 100), cb ? Math.round(cb.reduction * 100) : undefined, 0, " %"))
    lines.push(stat("Ausdauer je Block", b.staminaCost, cb?.staminaCost, 0, "", true))
  }
  if (def.consumable) {
    const c = def.consumable
    if (c.heal) lines.push(`<div class="stat">Heilt ${c.heal}</div>`)
    if (c.healOverTime) lines.push(`<div class="stat">Heilt ${c.healOverTime.amount} über ${c.healOverTime.seconds} s</div>`)
    if (c.stamina) lines.push(`<div class="stat">+${c.stamina} Ausdauer</div>`)
    if (c.cure) lines.push(`<div class="stat">Heilt die Pest</div>`)
    if (c.buff) lines.push(`<div class="stat">${c.buff.stat === "damage" ? "+" + Math.round(c.buff.value * 100) + " % Schaden" : c.buff.stat === "armor" ? "+" + c.buff.value + " Rüstung" : c.buff.stat === "speed" ? "+" + Math.round(c.buff.value * 100) + " % Tempo" : "+" + Math.round(c.buff.value * 100) + " % Ausdauerregeneration"} für ${c.buff.seconds} s</div>`)
  }
  if (item.maxDurability) lines.push(`<div class="stat ${(item.durability ?? 0) <= 0 ? "bad" : ""}">Haltbarkeit ${Math.round(item.durability ?? 0)} / ${item.maxDurability}${(item.durability ?? 0) <= 0 ? " (zerbrochen)" : ""}</div>`)
  for (const a of describeAffixes(item)) lines.push(`<div class="stat affix">${esc(a)}</div>`)
  lines.push(`<div class="stat dim">Gewicht ${itemWeight(item).toFixed(1)} kg · Wert ${itemValue(item)} Gold${opts.sellPrice !== undefined ? ` · Verkauf ${opts.sellPrice} Gold` : ""}${opts.buyPrice !== undefined ? ` · Preis ${opts.buyPrice} Gold` : ""}</div>`)
  return `<div class="details"><div class="dname" style="color:${col}">${esc(displayName(item))}${item.qty > 1 ? ` ×${item.qty}` : ""}</div><div class="dkind">${RARITY_INFO[item.rarity].name} · ${kindName(def.kind)}</div><div class="ddesc">${esc(def.description)}</div>${lines.join("")}</div>`
}

function stat(label: string, v: number, c: number | undefined, digits = 0, unit = "", lowerBetter = false): string {
  let cmp = ""
  if (c !== undefined && Math.abs(c - v) > 0.001) {
    const better = lowerBetter ? v < c : v > c
    const diff = v - c
    cmp = `<span class="${better ? "up" : "down"}">(${diff > 0 ? "+" : ""}${diff.toFixed(digits)})</span>`
  }
  return `<div class="stat"><span>${label}</span><b>${v.toFixed(digits)}${unit} ${cmp}</b></div>`
}

export function kindName(kind: string): string {
  return { weapon: "Waffe", armor: "Rüstung", helmet: "Helm", shield: "Schild", food: "Nahrung", remedy: "Heilmittel", material: "Material", gold: "Gold", artifact: "Artefakt", quest: "Questgegenstand", ammo: "Munition" }[kind] ?? kind
}

export function missionCard(m: MissionDef, action: string, extra = ""): string {
  const stars = "★".repeat(m.stars) + "☆".repeat(5 - m.stars)
  const rewards = [`${m.reward.gold} Gold`, `${m.reward.xp} EP`, `${m.reward.reputation} Ruf`, ...(m.reward.items ?? []).map((i) => `${i.qty}× ${itemDef(i.id).name}`)]
  return `<div class="mission ${m.status}" data-focus data-focus-id="${m.id}" data-action="${action}" data-id="${m.id}">
    <div class="mhead"><b>${esc(m.title)}</b><span class="stars">${stars}</span></div>
    <div class="mkind">${MISSION_KIND_NAMES[m.kind]} · ${m.status === "active" ? `${Math.min(m.progress, m.goal)} / ${m.goal}` : m.status === "completed" ? "Abgeschlossen" : "Angebot"}</div>
    <div class="mdesc">${esc(m.description)}</div>
    <div class="mreward">Belohnung: ${rewards.join(", ")}</div>${extra}
  </div>`
}

export function panel(title: string, body: string, cls = ""): string {
  return `<section class="panel ${cls}"><h2>${title}</h2>${body}</section>`
}
