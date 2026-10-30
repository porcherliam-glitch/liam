/**
 * achievements.ts — "Erfolge": milestones read off the profile (stats, base, research). Pure data and checks;
 * Company.unlockAchievements() stores the ids and the UI shows a toast for every new one plus a list page.
 */
import { RESEARCH, STRUCTURES, type StructureId } from "./baseData"
import type { Profile } from "./types"

const STRUCTURE_IDS = Object.keys(STRUCTURES) as StructureId[]

export interface Achievement {
  id: string
  name: string
  description: string
  /** Symbol shown on the card. */
  mark: string
  done(p: Profile): boolean
  /** Progress text (current / target) for the list, when meaningful. */
  progress?(p: Profile): [number, number]
}

const count = (get: (p: Profile) => number, target: number) => ({ done: (p: Profile) => get(p) >= target, progress: (p: Profile): [number, number] => [Math.min(target, get(p)), target] })

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: "first_blood", name: "Erstes Blut", description: "Einen Infizierten erledigen.", mark: "✚", ...count(p => p.stats.infectedKills, 1) },
  { id: "first_extract", name: "Zurück im Lager", description: "Zum ersten Mal lebend aus der Zone extrahieren.", mark: "↗", ...count(p => p.stats.extracts, 1) },
  { id: "survivor", name: "Überlebenskünstler", description: "10 Einsätze mit Extraktion beenden.", mark: "◎", ...count(p => p.stats.extracts, 10) },
  { id: "veteran", name: "Veteran der Zone", description: "25 Einsätze mit Extraktion beenden.", mark: "★", ...count(p => p.stats.extracts, 25) },
  { id: "hundred", name: "Hundertschaft", description: "100 Infizierte erledigen.", mark: "☠", ...count(p => p.stats.infectedKills, 100) },
  { id: "thousand", name: "Seuchenbrecher", description: "1000 Infizierte erledigen.", mark: "☠", ...count(p => p.stats.infectedKills, 1000) },
  { id: "merc_hunter", name: "Söldnerschreck", description: "25 Söldner ausschalten.", mark: "⌖", ...count(p => p.stats.mercKills, 25) },
  { id: "headhunter", name: "Kopfjäger", description: "50 Kopftreffer landen.", mark: "◉", ...count(p => p.stats.headshots, 50) },
  { id: "butcher", name: "Schlachter", description: "100 Gliedmaßen abtrennen.", mark: "✂", ...count(p => p.stats.dismembered, 100) },
  { id: "boss", name: "Kolossfäller", description: "Den Koloss im Labor besiegen.", mark: "▲", ...count(p => p.stats.bossKills, 1) },
  { id: "contractor", name: "Auftragnehmer", description: "10 Aufträge erfüllen.", mark: "✔", ...count(p => p.stats.contracts, 10) },
  { id: "defender", name: "Verteidiger", description: "3 Angriffe auf die Basis abwehren.", mark: "⛨", ...count(p => p.stats.defenses, 3) },
  { id: "rescuer", name: "Retter", description: "5 Überlebende in die Basis bringen.", mark: "☺", ...count(p => p.stats.rescued, 5) },
  { id: "rich", name: "Kriegsgewinnler", description: "100 000 $ mit Beute verdienen.", mark: "$", ...count(p => p.stats.earned, 100000) },
  { id: "big_haul", name: "Großer Fang", description: "Beute im Wert von 5000 $ aus einem Einsatz mitbringen.", mark: "◆", ...count(p => p.stats.bestRaid, 5000) },
  { id: "builder", name: "Bauherr", description: "Jedes Gebäude der Basis mindestens einmal bauen.", mark: "⌂", done: p => STRUCTURE_IDS.every(id => (p.structures[id] ?? 0) >= 1), progress: p => [STRUCTURE_IDS.filter(id => (p.structures[id] ?? 0) >= 1).length, STRUCTURE_IDS.length] },
  { id: "fortress", name: "Festung", description: "Den Schutzwall auf Stufe 3 ausbauen.", mark: "▦", done: p => (p.structures.walls ?? 0) >= 3, progress: p => [Math.min(3, p.structures.walls ?? 0), 3] },
  { id: "scientist", name: "Forschergeist", description: "Jede Forschung abschließen.", mark: "⚗", done: p => Object.keys(RESEARCH).every(id => p.research.includes(id as never)), progress: p => [p.research.length, Object.keys(RESEARCH).length] },
  { id: "level10", name: "Kommandant", description: "Stufe 10 erreichen.", mark: "⬆", ...count(p => p.level, 10) },
  { id: "hard_way", name: "Neun Leben", description: "9 Mal sterben – und trotzdem weitermachen.", mark: "✖", ...count(p => p.stats.deaths, 9) },
]

export const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map(a => a.id))

/** Ids that are earned now but not yet stored in p.achievements. */
export function newAchievements(p: Profile): Achievement[] {
  return ACHIEVEMENTS.filter(a => !p.achievements.includes(a.id) && a.done(p))
}
