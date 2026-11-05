// Achievements derived from profile statistics. Checked when the player returns to camp.

import type { Profile } from "../core/types"
import { RARITIES } from "../core/types"
import { AREAS } from "../world/areas"

export interface AchievementDef {
  id: string
  name: string
  description: string
  done: (p: Profile) => boolean
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_extraction", name: "Lebend zurück", description: "Erste erfolgreiche Extraktion.", done: (p) => p.stats.extractions >= 1 },
  { id: "kills_100", name: "Hundert Untote", description: "100 Gegner erledigt.", done: (p) => p.stats.kills >= 100 },
  { id: "kills_1000", name: "Totengräber", description: "1000 Gegner erledigt.", done: (p) => p.stats.kills >= 1000 },
  { id: "boss_first", name: "Bosstöter", description: "Einen Boss besiegt.", done: (p) => p.stats.bossKills >= 1 },
  { id: "boss_all", name: "Das letzte Königreich", description: "Alle acht Bosse besiegt.", done: (p) => AREAS.every((a) => p.clearedBosses.includes(a.id)) },
  { id: "legendary", name: "Legendenjäger", description: "Einen legendären Gegenstand gefunden.", done: (p) => RARITIES.indexOf(p.stats.bestLoot) >= RARITIES.indexOf("legendary") },
  { id: "rich", name: "Goldschatz", description: "10.000 Gold verdient.", done: (p) => p.stats.goldEarned >= 10000 },
  { id: "level_20", name: "Veteran", description: "Stufe 20 erreicht.", done: (p) => p.level >= 20 },
  { id: "camp_full", name: "Burgherr", description: "Alle Gebäude vollständig ausgebaut.", done: (p) => ["smithy", "armory", "storage", "infirmary", "merchant", "workshop", "alchemy", "defense"].every((b) => (p.camp[b] ?? 0) >= 3) },
  { id: "missions_25", name: "Verlässlich", description: "25 Missionen abgeschlossen.", done: (p) => p.missionsCompleted >= 25 },
  { id: "night_5", name: "Nachtwandler", description: "5 Nacht-Expeditionen überlebt.", done: (p) => (p.stats.nightExtractions ?? 0) >= 5 },
  { id: "survivor", name: "Unverwundbar", description: "10 Extraktionen ohne einen einzigen Tod.", done: (p) => p.stats.extractions >= 10 && p.stats.deaths === 0 },
]

/** Returns newly completed achievements and records them in the profile. */
export function checkAchievements(p: Profile): AchievementDef[] {
  p.achievements ??= []
  const fresh: AchievementDef[] = []
  for (const a of ACHIEVEMENTS) {
    if (p.achievements.includes(a.id)) continue
    if (a.done(p)) {
      p.achievements.push(a.id)
      fresh.push(a)
    }
  }
  return fresh
}
