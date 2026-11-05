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

export function itemIcon(kind: string, weaponClass?: string): string {
  switch (kind) {
    case "weapon":
      return { longsword: "🗡", shortsword: "🗡", greatsword: "⚔", battleaxe: "🪓", mace: "🔨", spear: "🔱", dagger: "🔪", bow: "🏹", crossbow: "🏹" }[weaponClass ?? ""] ?? "🗡"
    case "armor":
      return "🥋"
    case "helmet":
      return "⛑"
    case "shield":
      return "🛡"
    case "food":
      return "🍖"
    case "remedy":
      return "🧪"
    case "material":
      return "🪵"
    case "gold":
      return "🪙"
    case "artifact":
      return "💎"
    case "quest":
      return "🗝"
    case "ammo":
      return "➶"
    default:
      return "▪"
  }
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
