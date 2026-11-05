// Skill tree: three branches with six tiers. Each node costs skill points earned by levelling.

import type { SkillDef } from "../core/types"

export const SKILLS: SkillDef[] = [
  // Krieger
  { id: "w1", name: "Schwertarm", branch: "warrior", tier: 1, cost: 1, description: "+8 % Nahkampfschaden.", effect: { damagePct: 0.08 } },
  { id: "w2", name: "Schildwall", branch: "warrior", tier: 2, cost: 1, requires: "w1", description: "Blocken kostet 25 % weniger Ausdauer und hält 10 % mehr ab.", effect: { blockPct: 0.1 } },
  { id: "w3", name: "Wuchtschlag", branch: "warrior", tier: 3, cost: 2, requires: "w2", description: "+25 % Schaden mit schweren Angriffen. Aktiv: Kriegsschrei – taumelt alle Gegner im Umkreis von 7 m und gibt 10 s lang +25 % Schaden (40 s Abklingzeit).", effect: { heavyPct: 0.25 }, active: { id: "warcry", name: "Kriegsschrei", cooldown: 40, description: "Gegner im Umkreis taumeln, +25 % Schaden für 10 s" } },
  { id: "w4", name: "Eiserne Haut", branch: "warrior", tier: 4, cost: 2, requires: "w3", description: "+15 % Lebenspunkte.", effect: { hpPct: 0.15 } },
  { id: "w5", name: "Blutdurst", branch: "warrior", tier: 5, cost: 3, requires: "w4", description: "Jeder Kill heilt 6 Lebenspunkte.", effect: { lifeOnKill: 6 } },
  { id: "w6", name: "Letzter Atem", branch: "warrior", tier: 6, cost: 3, requires: "w5", description: "Einmal pro Expedition überlebst du einen tödlichen Treffer mit 30 % Leben.", effect: { secondWind: true } },
  // Waldläufer
  { id: "r1", name: "Adlerauge", branch: "ranger", tier: 1, cost: 1, description: "+12 % Fernkampfschaden.", effect: { rangedDamagePct: 0.12 } },
  { id: "r2", name: "Leichtfuß", branch: "ranger", tier: 2, cost: 1, requires: "r1", description: "+8 % Bewegungstempo.", effect: { speedPct: 0.08 } },
  { id: "r3", name: "Schneller Zug", branch: "ranger", tier: 3, cost: 2, requires: "r2", description: "Bogen und Armbrust 30 % schneller spannen. Aktiv: Adrenalin – volle Ausdauer und +30 % Tempo für 8 s (35 s Abklingzeit).", effect: { drawSpeedPct: 0.3 }, active: { id: "adrenaline", name: "Adrenalin", cooldown: 35, description: "Volle Ausdauer, +30 % Tempo für 8 s" } },
  { id: "r4", name: "Ausdauernd", branch: "ranger", tier: 4, cost: 2, requires: "r3", description: "+20 % Ausdauer und +15 % Regeneration.", effect: { staminaPct: 0.2, staminaRegenPct: 0.15 } },
  { id: "r5", name: "Schattenschritt", branch: "ranger", tier: 5, cost: 3, requires: "r4", description: "Ausweichen kostet 40 % weniger Ausdauer; Zombies bemerken dich später.", effect: { dodgeStaminaPct: 0.4, stealth: 0.25 } },
  { id: "r6", name: "Todesstoß", branch: "ranger", tier: 6, cost: 3, requires: "r5", description: "+15 % kritische Trefferchance.", effect: { critChance: 0.15 } },
  // Überlebender
  { id: "s1", name: "Starker Rücken", branch: "survivor", tier: 1, cost: 1, description: "+8 kg Tragkraft.", effect: { carryKg: 8 } },
  { id: "s2", name: "Glückspilz", branch: "survivor", tier: 2, cost: 1, requires: "s1", description: "Bessere Beute aus Truhen und Gegnern.", effect: { lootLuck: 0.15 } },
  { id: "s3", name: "Feldscher", branch: "survivor", tier: 3, cost: 2, requires: "s2", description: "Heilung wirkt 25 % stärker. Aktiv: Notverband – heilt 35 % Leben über 5 s und heilt die Pest (60 s Abklingzeit).", effect: { healPct: 0.25 }, active: { id: "fieldDressing", name: "Notverband", cooldown: 60, description: "35 % Leben über 5 s, heilt die Pest" } },
  { id: "s4", name: "Pfleglich", branch: "survivor", tier: 4, cost: 2, requires: "s3", description: "Waffen verlieren 30 % weniger Haltbarkeit.", effect: { durabilityPct: 0.3 } },
  { id: "s5", name: "Plünderer", branch: "survivor", tier: 5, cost: 3, requires: "s4", description: "+25 % Gold und +15 % Erfahrung.", effect: { goldPct: 0.25, xpPct: 0.15 } },
  { id: "s6", name: "Versichert", branch: "survivor", tier: 6, cost: 3, requires: "s5", description: "Zwei zusätzliche versicherte Rucksackplätze.", effect: { insurance: 2 } },
]

/** Active abilities granted by learned skills, in branch order. */
export function activeSkills(skills: string[]): NonNullable<SkillDef["active"]>[] {
  return SKILLS.filter((s) => s.active && skills.includes(s.id)).map((s) => s.active!)
}

export function skillDef(id: string): SkillDef {
  const s = SKILLS.find((x) => x.id === id)
  if (!s) throw new Error(`unknown skill ${id}`)
  return s
}

export const BRANCH_NAMES: Record<SkillDef["branch"], string> = { warrior: "Krieger", ranger: "Waldläufer", survivor: "Überlebender" }

export type SkillBonuses = Required<NonNullable<SkillDef["effect"]>>

export function skillBonuses(skills: string[]): SkillBonuses {
  const out: SkillBonuses = {
    damagePct: 0, heavyPct: 0, critChance: 0, hpPct: 0, staminaPct: 0, staminaRegenPct: 0, speedPct: 0, carryKg: 0, lootLuck: 0,
    blockPct: 0, dodgeStaminaPct: 0, rangedDamagePct: 0, drawSpeedPct: 0, goldPct: 0, xpPct: 0, healPct: 0, durabilityPct: 0,
    stealth: 0, lifeOnKill: 0, secondWind: false, insurance: 0,
  }
  for (const id of skills) {
    const s = SKILLS.find((x) => x.id === id)
    if (!s) continue
    for (const [k, v] of Object.entries(s.effect)) {
      const key = k as keyof SkillBonuses
      const bag = out as unknown as Record<string, number | boolean>
      if (typeof v === "boolean") bag[key] = (bag[key] as boolean) || v
      else bag[key] = (bag[key] as number) + (v as number)
    }
  }
  return out
}
