// 02_data_zombies.js — zombie type definitions (SPEC §3).
// Public API:
//   ZOMBIE_TYPES   { walker, runner, brute, screamer, toxic, armored, stalker, boss }
//   ZOMBIE_LIST    Object.values(ZOMBIE_TYPES)
// Dependencies: none at definition time (dropTable item ids refer to ITEMS in 01_data_items.js).
//
// Every type defines every walker key (hp, speed, damage, radius, size, attackRange, attackCooldown,
// windup, sightRange, hearingMult, xp, color, armor, lootChance, tier) plus `id`, `name`, `desc`,
// `dropTable` and its own specials from SPEC §3.
//
// Decisions where the SPEC is silent:
// - `bleedChance` (all types) is passed to player.takeDamage (SPEC §15 Attack); brute 0.5 as specified.
// - `armorArc` is 0 for every type except `armored` (frontal plate); `armor` is only meaningful
//   together with `armorArc > 0`.
// - `dropTable` entries use the LOOT_TABLES entry shape `{id|cat, w, count:[min,max]}`; never keys
//   or mission items. `dropRolls:[min,max]` = number of rolls when the lootChance roll succeeds
//   (default [1,1] when a system ignores it).
// - Boss ability numbers mirror SPEC §15 (slam every 6 s / 120 px / 45 dmg, charge every 9 s at
//   420 px/s for 0.9 s / 50 dmg, summon every 15 s 3 walkers) so systems can read them from data.
// - `doorBashTime`: seconds to bash a closed door (SPEC §15: 1.2 s, brute 0.3 s).

const ZOMBIE_TYPES = {
  walker: {
    id: 'walker', name: 'Zombie',
    desc: 'Ein schlurfender Toter, der einmal Nachbar, Kollege oder Freund war. Allein harmlos, in Gruppen tödlich.',
    hp: 60, speed: 55, damage: 12, radius: 13, size: 1.0,
    attackRange: 10, attackCooldown: 1.2, windup: 0.45, sightRange: 380, hearingMult: 1.0,
    xp: 10, color: '#6f8a5a', armor: 0, armorArc: 0, lootChance: 0.25, tier: 1,
    bleedChance: 0.15, doorBashTime: 1.2, dropRolls: [1, 1],
    dropTable: [
      { id: 'ammo_9mm', w: 20, count: [5, 15] },
      { cat: 'food', w: 12, count: [1, 1] },
      { cat: 'water', w: 10, count: [1, 1] },
      { id: 'mat_cloth', w: 14, count: [1, 3] },
      { id: 'med_bandage', w: 10, count: [1, 1] },
      { id: 'col_dogtags', w: 4, count: [1, 1] },
      { id: 'col_lighter', w: 4, count: [1, 1] },
      { id: 'elec_battery', w: 6, count: [1, 2] },
    ],
  },
  runner: {
    id: 'runner', name: 'Läufer',
    desc: 'Frisch verwandelt und noch voller Kraft. Sprintet ohne Rücksicht auf sich selbst auf jedes Geräusch zu.',
    hp: 45, speed: 165, damage: 10, radius: 12, size: 0.9,
    attackRange: 10, attackCooldown: 0.8, windup: 0.35, sightRange: 460, hearingMult: 1.2,
    xp: 15, color: '#8f8a66', armor: 0, armorArc: 0, lootChance: 0.2, tier: 1,
    bleedChance: 0.2, doorBashTime: 1.2, dropRolls: [1, 1],
    dropTable: [
      { id: 'ammo_9mm', w: 18, count: [5, 15] },
      { id: 'ammo_45', w: 8, count: [5, 12] },
      { cat: 'food', w: 10, count: [1, 1] },
      { id: 'water_energy', w: 8, count: [1, 1] },
      { id: 'med_bandage', w: 10, count: [1, 1] },
      { id: 'mat_cloth', w: 10, count: [1, 2] },
      { id: 'col_watch', w: 2, count: [1, 1] },
    ],
  },
  brute: {
    id: 'brute', name: 'Koloss',
    desc: 'Ein aufgeblähter Berg aus Muskeln und Wut. Ein Schlag schleudert dich quer über die Straße.',
    hp: 420, speed: 48, damage: 35, radius: 20, size: 1.6,
    attackRange: 14, attackCooldown: 2.0, windup: 0.8, sightRange: 340, hearingMult: 0.8,
    xp: 40, color: '#5f4c44', armor: 0, armorArc: 0, lootChance: 0.6, tier: 2,
    knockback: 140, bleedChance: 0.5, doorBashTime: 0.3, dropRolls: [1, 2],
    dropTable: [
      { cat: 'ammo', w: 20, count: [10, 25] },
      { id: 'med_firstaid', w: 12, count: [1, 1] },
      { id: 'mat_steel', w: 10, count: [1, 2] },
      { cat: 'armor', w: 6, count: [1, 1] },
      { id: 'food_canned_meat', w: 10, count: [1, 2] },
      { id: 'col_medal', w: 6, count: [1, 1] },
      { id: 'grenade_molotov', w: 5, count: [1, 1] },
    ],
  },
  screamer: {
    id: 'screamer', name: 'Kreischer',
    desc: 'Ein ausgemergelter Infizierter mit aufgerissenem Kiefer. Sein Schrei ruft alles in der Umgebung herbei.',
    hp: 70, speed: 70, damage: 6, radius: 12, size: 0.95,
    attackRange: 10, attackCooldown: 1.4, windup: 0.5, sightRange: 420, hearingMult: 1.3,
    xp: 25, color: '#a07a8f', armor: 0, armorArc: 0, lootChance: 0.35, tier: 2,
    screamCooldown: 14, screamRadius: 1000, summon: [2, 4], bleedChance: 0.05, doorBashTime: 1.2, dropRolls: [1, 1],
    dropTable: [
      { id: 'med_painkillers', w: 12, count: [1, 1] },
      { cat: 'collectible', w: 12, count: [1, 1] },
      { cat: 'electronics', w: 10, count: [1, 1] },
      { cat: 'ammo', w: 14, count: [5, 15] },
      { cat: 'water', w: 8, count: [1, 1] },
    ],
  },
  toxic: {
    id: 'toxic', name: 'Giftspucker',
    desc: 'Aus seinen Geschwüren tropft grünlicher Schleim. Jeder Treffer – und sein Tod – hinterlässt eine giftige Wolke.',
    hp: 120, speed: 60, damage: 14, radius: 14, size: 1.1,
    attackRange: 12, attackCooldown: 1.3, windup: 0.5, sightRange: 380, hearingMult: 1.0,
    xp: 30, color: '#8fd14f', armor: 0, armorArc: 0, lootChance: 0.35, tier: 3,
    toxicRadius: 70, toxicDuration: 8, bleedChance: 0.1, doorBashTime: 1.2, dropRolls: [1, 1],
    dropTable: [
      { id: 'mat_chemicals', w: 22, count: [1, 2] },
      { id: 'med_antitoxin', w: 14, count: [1, 1] },
      { cat: 'medical', w: 10, count: [1, 1] },
      { id: 'water_purified', w: 8, count: [1, 1] },
      { cat: 'ammo', w: 12, count: [5, 15] },
    ],
  },
  armored: {
    id: 'armored', name: 'Gepanzerter',
    desc: 'Ein verwandelter Soldat in voller Schutzausrüstung. Von vorn prallen die meisten Kugeln einfach ab.',
    hp: 200, speed: 50, damage: 18, radius: 15, size: 1.15,
    attackRange: 10, attackCooldown: 1.3, windup: 0.5, sightRange: 380, hearingMult: 0.9,
    xp: 35, color: '#7d8790', armor: 0.7, armorArc: 1.9, lootChance: 0.45, tier: 3,
    bleedChance: 0.2, doorBashTime: 1.2, dropRolls: [1, 2],
    dropTable: [
      { id: 'ammo_556', w: 16, count: [10, 30] },
      { id: 'ammo_762', w: 12, count: [10, 25] },
      { cat: 'armor', w: 8, count: [1, 1] },
      { id: 'grenade_frag', w: 5, count: [1, 1] },
      { id: 'food_mre', w: 10, count: [1, 1] },
      { id: 'col_dogtags', w: 14, count: [1, 1] },
      { id: 'med_firstaid', w: 8, count: [1, 1] },
    ],
  },
  stalker: {
    id: 'stalker', name: 'Pirscher',
    desc: 'Lauert reglos in dunklen Ecken, kaum mehr als ein Schatten. Wer ihn bemerkt, ist meist schon zu nah.',
    hp: 90, speed: 200, damage: 22, radius: 12, size: 0.95,
    attackRange: 10, attackCooldown: 1.0, windup: 0.3, sightRange: 300, hearingMult: 1.4,
    xp: 30, color: '#3e4452', armor: 0, armorArc: 0, lootChance: 0.35, tier: 3,
    lurk: true, ambushRange: 220, alpha: 0.35, bleedChance: 0.35, doorBashTime: 1.2, dropRolls: [1, 1],
    dropTable: [
      { cat: 'collectible', w: 14, count: [1, 1] },
      { id: 'tool_lockpick', w: 6, count: [1, 1] },
      { cat: 'ammo', w: 14, count: [5, 20] },
      { id: 'med_adrenaline', w: 4, count: [1, 1] },
      { cat: 'medical', w: 10, count: [1, 1] },
    ],
  },
  boss: {
    id: 'boss', name: 'Der Wirt',
    desc: 'Ein grotesker Koloss aus verschmolzenem Fleisch, Ursprung der Seuche in der Forschungsanlage. Er wird mit jeder Wunde schneller und wütender.',
    hp: 2600, speed: 62, damage: 40, radius: 34, size: 2.6,
    attackRange: 18, attackCooldown: 1.6, windup: 0.7, sightRange: 600, hearingMult: 1.5,
    xp: 500, color: '#8a2f3c', armor: 0, armorArc: 0, lootChance: 1.0, tier: 5,
    knockback: 160, bleedChance: 0.6, doorBashTime: 0.3, dropRolls: [3, 5],
    phases: [
      { hpPct: 1.0, speedMul: 1.0, abilities: ['slam'] },
      { hpPct: 0.66, speedMul: 1.25, abilities: ['slam', 'charge'] },
      { hpPct: 0.33, speedMul: 1.4, abilities: ['slam', 'charge', 'summon'] },
    ],
    slamCooldown: 6, slamRadius: 120, slamDamage: 45,
    chargeCooldown: 9, chargeSpeed: 420, chargeDuration: 0.9, chargeDamage: 50,
    summonCooldown: 15, summonType: 'walker', summonCount: 3,
    dropTable: [
      { id: 'col_bitcoin', w: 10, count: [1, 1] },
      { id: 'col_painting', w: 4, count: [1, 1] },
      { id: 'armor_helmet_heavy', w: 6, count: [1, 1] },
      { id: 'armor_vest_heavy', w: 5, count: [1, 1] },
      { id: 'rifle_scar', w: 6, count: [1, 1] },
      { id: 'sniper_semi', w: 4, count: [1, 1] },
      { id: 'med_medkit', w: 14, count: [1, 2] },
      { id: 'ammo_762_ap', w: 14, count: [20, 30] },
      { id: 'ammo_308_ap', w: 10, count: [10, 20] },
      { id: 'elec_harddrive', w: 10, count: [1, 2] },
    ],
  },
};

const ZOMBIE_LIST = Object.values(ZOMBIE_TYPES);
