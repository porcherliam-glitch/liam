// Mission generation and progress. Missions come from the camp board; progress is tracked during expeditions.

import type { MissionDef, MissionKind } from "../core/types"
import { Rng } from "../core/rng"
import { itemDef } from "../items/itemData"
import { areaDef } from "../world/areas"
import { zombieType } from "../entities/zombieTypes"

const COLLECT_TARGETS: Record<string, string[]> = {
  village: ["cloth", "wood", "iron", "candlestick"],
  forest: ["herbs", "leather", "wood", "silver"],
  castle: ["iron", "steel", "tapestry", "chalice"],
  graveyard: ["bone", "silver", "candlestick", "saint_bones"],
  monastery: ["herbs", "book", "relic", "chalice"],
  catacombs: ["bone", "silver", "relic", "jewel_box"],
  city: ["steel", "jewel_box", "crown_fragment", "book"],
  fortress: ["steel", "iron", "silver", "relic"],
}

const PURGE_TARGETS: Record<string, string> = {
  village: "walker",
  forest: "sprinter",
  castle: "knight",
  graveyard: "brute",
  monastery: "walker_monk",
  catacombs: "sprinter_hound",
  city: "knight",
  fortress: "knight_captain",
}

let missionCounter = 1

export function generateMission(rng: Rng, areaId: string, kind: MissionKind, level: number): MissionDef {
  const area = areaDef(areaId)
  const danger = area.danger
  const id = `m_${areaId}_${kind}_${Date.now().toString(36)}_${missionCounter++}_${rng.int(0, 9999)}`
  const base = { id, kind, areaId, progress: 0, status: "offered" as const }
  const scale = 1 + danger * 0.6 + level * 0.05
  switch (kind) {
    case "collect": {
      const targetId = rng.pick(COLLECT_TARGETS[areaId])
      const def = itemDef(targetId)
      const goal = def.kind === "artifact" ? rng.int(1, 2) : rng.int(6, 12)
      return { ...base, title: `Sammeln: ${def.name}`, description: `Der Händler braucht ${goal}× ${def.name} aus ${area.name}. Bringe sie lebend ins Lager.`, goal, targetId, stars: Math.min(5, danger), reward: { gold: Math.round((40 + goal * def.value * 0.6) * scale), xp: Math.round(60 * scale), reputation: 10 + danger * 3 } }
    }
    case "bossHunt": {
      const boss = zombieType(area.bossId!)
      return { ...base, title: `Bossjagd: ${boss.name}`, description: `${boss.name}, ${boss.bossTitle}, treibt sich in ${area.name} herum. Töte ihn und bring Beweise.`, goal: 1, targetId: boss.id, stars: 5, reward: { gold: Math.round(300 * scale), xp: Math.round(400 * scale), reputation: 40 + danger * 5, items: [{ id: "relic", qty: 1 }] } }
    }
    case "rescue":
      return { ...base, title: "Rettung: Überlebender", description: `Ein Überlebender versteckt sich irgendwo in ${area.name}. Finde ihn und bring ihn zu einem Extraktionspunkt.`, goal: 1, stars: Math.min(5, danger + 1), reward: { gold: Math.round(180 * scale), xp: Math.round(220 * scale), reputation: 35 + danger * 4 } }
    case "explore": {
      const goal = 3 + Math.min(3, danger)
      return { ...base, title: `Erkundung: ${area.name}`, description: `Erkunde ${goal} markierte Orte in ${area.name}. Der Kartograph zahlt gut für jeden Eintrag.`, goal, stars: Math.min(5, danger), reward: { gold: Math.round(90 * scale), xp: Math.round(150 * scale), reputation: 15 + danger * 3 } }
    }
    case "treasure":
      return { ...base, title: "Schatzsuche", description: `Eine alte Karte zeigt ein Versteck in ${area.name}. Finde die Schatztruhe. Sie liegt nicht, wo man sie erwartet.`, goal: 1, stars: Math.min(5, danger + 1), reward: { gold: Math.round(220 * scale), xp: Math.round(200 * scale), reputation: 20 + danger * 3 } }
    case "resources": {
      const targetId = rng.pick(["wood", "iron", "herbs", "bone", "cloth"])
      const def = itemDef(targetId)
      const goal = rng.int(10, 20)
      return { ...base, title: `Nachschub: ${def.name}`, description: `Das Lager braucht ${goal}× ${def.name}. Egal woher, Hauptsache sicher zurück.`, goal, targetId, stars: Math.max(1, Math.min(5, danger - 1)), reward: { gold: Math.round(60 * scale), xp: Math.round(80 * scale), reputation: 8 + danger * 2, items: [{ id: "potion_small", qty: 2 }] } }
    }
    case "purge": {
      const targetId = PURGE_TARGETS[areaId]
      const z = zombieType(targetId)
      const goal = z.kind === "knight" || z.kind === "brute" ? rng.int(3, 5) : rng.int(8, 14)
      return { ...base, title: `Säuberung: ${z.name}`, description: `Eine Gruppe vom Typ „${z.name}“ macht ${area.name} unpassierbar. Erledige ${goal} davon.`, goal, targetId, stars: Math.min(5, danger + (z.kind === "knight" ? 1 : 0)), reward: { gold: Math.round(140 * scale), xp: Math.round(260 * scale), reputation: 25 + danger * 4 } }
    }
  }
}

const KINDS: MissionKind[] = ["collect", "bossHunt", "rescue", "explore", "treasure", "resources", "purge"]

/** Generates a board of offers for the unlocked areas. */
export function generateBoard(rng: Rng, unlockedAreas: string[], level: number, count = 6): MissionDef[] {
  const out: MissionDef[] = []
  const pool: { areaId: string; kind: MissionKind }[] = []
  for (const areaId of unlockedAreas) for (const kind of KINDS) pool.push({ areaId, kind })
  rng.shuffle(pool)
  // Prefer the newest area so the board stays interesting.
  const newest = unlockedAreas[unlockedAreas.length - 1]
  pool.sort((a, b) => (a.areaId === newest ? -1 : 0) - (b.areaId === newest ? -1 : 0) + (rng.next() - 0.5))
  const used = new Set<string>()
  for (const p of pool) {
    const key = `${p.areaId}:${p.kind}`
    if (used.has(key)) continue
    used.add(key)
    out.push(generateMission(rng, p.areaId, p.kind, level))
    if (out.length >= count) break
  }
  return out
}

export const MISSION_KIND_NAMES: Record<MissionKind, string> = {
  collect: "Sammelmission",
  bossHunt: "Bossjagd",
  rescue: "Rettungsmission",
  explore: "Erkundung",
  treasure: "Schatzsuche",
  resources: "Ressourcenbeschaffung",
  purge: "Säuberung",
}

export function missionProgressText(m: MissionDef): string {
  return `${Math.min(m.progress, m.goal)} / ${m.goal}`
}
