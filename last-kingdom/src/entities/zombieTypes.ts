// Zombie roster. Bosses are listed with a title and abilities; areas reference them by id.

import type { ZombieTypeDef } from "../core/types"

export const ZOMBIE_TYPES: ZombieTypeDef[] = [
  { id: "walker", name: "Verseuchter Bauer", kind: "walker", hp: 60, damage: 12, speed: 1.6, wanderSpeed: 0.7, attackRange: 1.5, attackCooldown: 1.6, attackWindup: 0.55, sight: 22, hearing: 18, poise: 0.1, armor: 0, xp: 12, scale: 1, color: "#6b7a5a", lootTable: "walker" },
  { id: "walker_villager", name: "Verseuchte Magd", kind: "walker", hp: 50, damage: 10, speed: 1.7, wanderSpeed: 0.7, attackRange: 1.5, attackCooldown: 1.5, attackWindup: 0.5, sight: 22, hearing: 18, poise: 0.05, armor: 0, xp: 10, scale: 0.95, color: "#7a6e5a", lootTable: "walker" },
  { id: "walker_monk", name: "Verseuchter Mönch", kind: "walker", hp: 70, damage: 13, speed: 1.6, wanderSpeed: 0.6, attackRange: 1.5, attackCooldown: 1.6, attackWindup: 0.55, sight: 20, hearing: 22, poise: 0.15, armor: 1, xp: 14, scale: 1, color: "#5a4a3a", lootTable: "monk" },
  { id: "walker_soldier", name: "Verseuchter Soldat", kind: "walker", hp: 90, damage: 15, speed: 1.7, wanderSpeed: 0.7, attackRange: 1.6, attackCooldown: 1.6, attackWindup: 0.55, sight: 24, hearing: 18, poise: 0.3, armor: 5, xp: 20, scale: 1.02, color: "#5c5c58", lootTable: "soldier" },
  { id: "sprinter", name: "Sprinter", kind: "sprinter", hp: 45, damage: 14, speed: 5.2, wanderSpeed: 1.2, attackRange: 1.5, attackCooldown: 1.1, attackWindup: 0.35, sight: 30, hearing: 28, poise: 0.0, armor: 0, xp: 18, scale: 0.95, color: "#8a5a4a", lootTable: "walker" },
  { id: "sprinter_hound", name: "Pestläufer", kind: "sprinter", hp: 65, damage: 18, speed: 5.8, wanderSpeed: 1.4, attackRange: 1.6, attackCooldown: 1.0, attackWindup: 0.32, sight: 34, hearing: 30, poise: 0.05, armor: 1, xp: 28, scale: 1, color: "#8a3a3a", lootTable: "walker" },
  { id: "brute", name: "Brutaler", kind: "brute", hp: 320, damage: 38, speed: 1.9, wanderSpeed: 0.8, attackRange: 2.4, attackCooldown: 2.6, attackWindup: 0.9, sight: 20, hearing: 16, poise: 0.85, armor: 6, xp: 70, scale: 1.35, color: "#55604a", lootTable: "brute", abilities: ["slam"] },
  { id: "brute_butcher", name: "Der Schlächter", kind: "brute", hp: 420, damage: 46, speed: 2.1, wanderSpeed: 0.8, attackRange: 2.5, attackCooldown: 2.4, attackWindup: 0.85, sight: 22, hearing: 18, poise: 0.9, armor: 8, xp: 95, scale: 1.4, color: "#6a4a4a", lootTable: "brute", abilities: ["slam", "charge"] },
  { id: "knight", name: "Verseuchter Ritter", kind: "knight", hp: 220, damage: 30, speed: 2.6, wanderSpeed: 0.9, attackRange: 2.2, attackCooldown: 1.9, attackWindup: 0.6, sight: 26, hearing: 18, poise: 0.7, armor: 18, xp: 80, scale: 1.08, color: "#8a8a90", lootTable: "knight", abilities: ["block", "sword"] },
  { id: "knight_captain", name: "Verseuchter Hauptmann", kind: "knight", hp: 300, damage: 36, speed: 2.8, wanderSpeed: 0.9, attackRange: 2.3, attackCooldown: 1.7, attackWindup: 0.55, sight: 28, hearing: 20, poise: 0.8, armor: 24, xp: 120, scale: 1.12, color: "#7a7a88", lootTable: "knight", abilities: ["block", "sword", "charge"] },
  // Bosses (one per area)
  { id: "boss_elder", name: "Der Dorfälteste", kind: "boss", bossTitle: "Herr des Verlassenen Dorfs", hp: 900, damage: 42, speed: 2.4, wanderSpeed: 1, attackRange: 2.6, attackCooldown: 2.0, attackWindup: 0.8, sight: 40, hearing: 40, poise: 0.95, armor: 10, xp: 400, scale: 1.5, color: "#4a5a3a", lootTable: "boss", abilities: ["slam", "summon"] },
  { id: "boss_huntsman", name: "Der Pestjäger", kind: "boss", bossTitle: "Schrecken des Verseuchten Walds", hp: 1100, damage: 36, speed: 5.5, wanderSpeed: 1.5, attackRange: 2.0, attackCooldown: 1.2, attackWindup: 0.4, sight: 45, hearing: 45, poise: 0.7, armor: 6, xp: 520, scale: 1.2, color: "#6a3a2a", lootTable: "boss", abilities: ["charge", "summon", "leap"] },
  { id: "boss_castellan", name: "Der Kastellan", kind: "boss", bossTitle: "Wächter der Alten Burg", hp: 1600, damage: 55, speed: 2.6, wanderSpeed: 1, attackRange: 2.8, attackCooldown: 1.8, attackWindup: 0.65, sight: 40, hearing: 30, poise: 0.95, armor: 30, xp: 800, scale: 1.45, color: "#6a6a74", lootTable: "boss", abilities: ["block", "sword", "slam", "charge"] },
  { id: "boss_gravedigger", name: "Der Totengräber", kind: "boss", bossTitle: "Hüter des Friedhofs", hp: 1300, damage: 48, speed: 2.2, wanderSpeed: 1, attackRange: 3.0, attackCooldown: 2.2, attackWindup: 0.85, sight: 40, hearing: 40, poise: 0.9, armor: 12, xp: 650, scale: 1.55, color: "#3f4a3a", lootTable: "boss", abilities: ["slam", "summon", "plague"] },
  { id: "boss_abbot", name: "Der Abt", kind: "boss", bossTitle: "Stimme des Klosters", hp: 1400, damage: 44, speed: 2.5, wanderSpeed: 1, attackRange: 2.4, attackCooldown: 1.6, attackWindup: 0.6, sight: 45, hearing: 50, poise: 0.85, armor: 14, xp: 720, scale: 1.3, color: "#4a3a2a", lootTable: "boss", abilities: ["summon", "plague", "leap"] },
  { id: "boss_bonelord", name: "Der Knochenfürst", kind: "boss", bossTitle: "König der Katakomben", hp: 2000, damage: 60, speed: 2.8, wanderSpeed: 1, attackRange: 2.8, attackCooldown: 1.6, attackWindup: 0.6, sight: 40, hearing: 40, poise: 0.95, armor: 26, xp: 1100, scale: 1.5, color: "#8a8070", lootTable: "boss", abilities: ["sword", "summon", "plague", "charge"] },
  { id: "boss_queen", name: "Die Pestkönigin", kind: "boss", bossTitle: "Herrin der Toten Stadt", hp: 2400, damage: 62, speed: 3.0, wanderSpeed: 1.2, attackRange: 2.6, attackCooldown: 1.4, attackWindup: 0.5, sight: 50, hearing: 50, poise: 0.95, armor: 22, xp: 1400, scale: 1.4, color: "#5a2a4a", lootTable: "boss", abilities: ["summon", "plague", "leap", "slam"] },
  { id: "boss_marshal", name: "Der Marschall", kind: "boss", bossTitle: "Kommandant der Festung", hp: 3200, damage: 70, speed: 2.9, wanderSpeed: 1, attackRange: 3.0, attackCooldown: 1.5, attackWindup: 0.55, sight: 50, hearing: 40, poise: 1, armor: 40, xp: 2000, scale: 1.6, color: "#4a4a58", lootTable: "boss", abilities: ["block", "sword", "slam", "charge", "summon"] },
]

const byId = new Map(ZOMBIE_TYPES.map((z) => [z.id, z]))

export function zombieType(id: string): ZombieTypeDef {
  const def = byId.get(id)
  if (!def) throw new Error(`unknown zombie type ${id}`)
  return def
}
