/**
 * weaponData.ts — every weapon, ammunition type and attachment, plus effectiveWeapon() which applies attachments and
 * ammo to a weapon's base stats. Pure data/logic (no three.js), unit-tested.
 * Units: damage per bullet/pellet, seconds, metres, radians (spread = cone half-angle).
 */

export type WeaponId = "knife" | "machete" | "axe" | "p9" | "r44" | "vx9" | "k5" | "mk4" | "sr74" | "br10" | "kv12" | "sg8" | "dr7" | "falke" | "lm60"
  | "crowbar" | "bat" | "katana" | "sledge" | "p18" | "de50" | "v45" | "stg77" | "as12"
  | "spade" | "pickaxe" | "km45" | "u45" | "ar36" | "uh44" | "k98" | "db12" | "xbow"

export type WeaponClass = "melee" | "pistol" | "smg" | "rifle" | "battle" | "shotgun" | "dmr" | "sniper" | "lmg"
export type Caliber = "9mm" | "45" | "44" | "556" | "762" | "12g" | "338" | "bolt"
export type AmmoId = "ammo_9mm" | "ammo_45" | "ammo_44" | "ammo_556" | "ammo_556ap" | "ammo_762" | "ammo_762ap" | "ammo_12buck" | "ammo_12slug" | "ammo_338" | "ammo_bolt"
export type AttachmentSlot = "optic" | "muzzle" | "grip" | "mag" | "tactical"
export type AttachmentId = "att_reddot" | "att_holo" | "att_acog" | "att_scope4x" | "att_suppressor" | "att_comp" | "att_brake" | "att_vgrip" | "att_agrip" | "att_bipod"
  | "att_extmag" | "att_drum" | "att_laser" | "att_light" | "att_minired" | "att_scope6x" | "att_flash" | "att_bigsup" | "att_hstop" | "att_fastmag" | "att_irlaser"
export type WeaponMods = Partial<Record<AttachmentSlot, AttachmentId>>
/** Which loadout slot a weapon goes into. */
export type WeaponSlot = "primary" | "secondary" | "melee"

export interface MeleeDef {
  /** Damage per hit (head hits ×1.5). */
  damage: number
  /** Reach in metres from the eye. */
  range: number
  /** Full horizontal swing arc in degrees (targets inside are hit, up to `maxTargets`). */
  arc: number
  maxTargets: number
  /** Seconds per swing; the hit lands at 40 % of the swing. */
  swing: number
  stamina: number
  /** 0..1 chance that a killing (or limb) hit severs the struck part. */
  sever: number
}

export interface WeaponDef {
  id: WeaponId
  name: string
  short: string
  cls: WeaponClass
  slot: WeaponSlot
  description: string
  /** null for melee weapons. */
  caliber: Caliber | null
  damage: number
  pellets: number
  fireInterval: number
  auto: boolean
  /** Bolt-action / pump: the viewmodel cycles the action after every shot. */
  manualAction: boolean
  magazine: number
  reload: number
  /** Loads round by round (shotguns, revolver, bolt rifle): reload is the time per round. */
  singleLoad: boolean
  spreadHip: number
  spreadAds: number
  spreadMove: number
  spreadPerShot: number
  spreadRecovery: number
  recoilPitch: number
  recoilYaw: number
  rangeStart: number
  rangeEnd: number
  minDamageFactor: number
  headMultiplier: number
  /** FOV multiplier while aiming with iron sights (or the built-in scope). */
  adsZoom: number
  adsTime: number
  /** Built-in scope: show the scope overlay at full ADS. */
  scoped: boolean
  noise: number
  moveSpeed: number
  /** Kilograms (counts against carry weight). */
  weight: number
  /** Body armour penetration 0..1 of the default ammo. */
  penetration: number
  /** Attachment slots this weapon accepts. */
  slots: AttachmentSlot[]
  /** Crossbow: silent string release — no muzzle flash, tracer or casing. */
  bow?: boolean
  melee: MeleeDef | null
  price: number
  minLevel: number
  /** 0 common … 4 legendary (loot weighting, colours). */
  rarity: number
}

const firearm = (w: Omit<WeaponDef, "slot" | "melee" | "manualAction" | "singleLoad" | "scoped" | "penetration"> & Partial<Pick<WeaponDef, "manualAction" | "singleLoad" | "scoped" | "penetration">>): WeaponDef => ({
  manualAction: false, singleLoad: false, scoped: false, penetration: 0.2, ...w,
  slot: w.cls === "pistol" || w.cls === "smg" ? "secondary" : "primary", melee: null,
})
const blade = (id: WeaponId, name: string, short: string, description: string, melee: MeleeDef, weight: number, price: number, minLevel: number, rarity: number): WeaponDef => ({
  id, name, short, cls: "melee", slot: "melee", description, caliber: null, damage: melee.damage, pellets: 1, fireInterval: melee.swing, auto: false, manualAction: false,
  magazine: 0, reload: 0, singleLoad: false, spreadHip: 0, spreadAds: 0, spreadMove: 0, spreadPerShot: 0, spreadRecovery: 1, recoilPitch: 0, recoilYaw: 0,
  rangeStart: melee.range, rangeEnd: melee.range, minDamageFactor: 1, headMultiplier: 1.5, adsZoom: 1, adsTime: 0.2, scoped: false, noise: 4, moveSpeed: 1.06,
  weight, penetration: 0, slots: [], melee, price, minLevel, rarity,
})

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  knife: blade("knife", "Kampfmesser", "MESSER", "Leise, schnell, immer dabei. Ideal gegen einzelne Infizierte.", { damage: 38, range: 1.9, arc: 60, maxTargets: 1, swing: 0.42, stamina: 6, sever: 0.15 }, 0.3, 0, 1, 0),
  machete: blade("machete", "Machete", "MACHETE", "Lange Klinge, trennt Gliedmaßen ab.", { damage: 58, range: 2.2, arc: 80, maxTargets: 2, swing: 0.58, stamina: 10, sever: 0.6 }, 0.8, 450, 2, 1),
  axe: blade("axe", "Feueraxt", "AXT", "Langsam und schwer. Spaltet Schädel mit einem Schlag.", { damage: 92, range: 2.3, arc: 60, maxTargets: 2, swing: 0.85, stamina: 16, sever: 0.85 }, 2.2, 950, 3, 2),
  crowbar: blade("crowbar", "Brecheisen", "EISEN", "Billig, schnell, unzerstörbar. Bricht Knochen statt sie zu schneiden.", { damage: 48, range: 2.0, arc: 65, maxTargets: 1, swing: 0.5, stamina: 8, sever: 0.2 }, 1.4, 150, 1, 0),
  bat: blade("bat", "Nagelkeule", "KEULE", "Baseballschläger voller Nägel. Weiter Schwung, trifft mehrere Infizierte.", { damage: 64, range: 2.25, arc: 80, maxTargets: 2, swing: 0.68, stamina: 12, sever: 0.3 }, 1.1, 350, 1, 1),
  katana: blade("katana", "Katana", "KATANA", "Rasiermesserscharfe Klinge. Schnell, weit und trennt fast immer ab.", { damage: 72, range: 2.4, arc: 85, maxTargets: 3, swing: 0.5, stamina: 11, sever: 0.9 }, 1.2, 2600, 4, 3),
  spade: blade("spade", "Klappspaten", "SPATEN", "Geschärftes Blatt am kurzen Stiel. Schneller als die Axt und trennt öfter ab, als man denkt.", { damage: 66, range: 2.1, arc: 70, maxTargets: 2, swing: 0.6, stamina: 11, sever: 0.55 }, 1.0, 400, 1, 1),
  pickaxe: blade("pickaxe", "Spitzhacke", "HACKE", "Der Dorn geht durch jeden Schädel und jeden Helm. Langsam, trifft nur einen.", { damage: 112, range: 2.3, arc: 45, maxTargets: 1, swing: 0.95, stamina: 19, sever: 0.35 }, 2.8, 700, 2, 1),
  sledge: blade("sledge", "Vorschlaghammer", "HAMMER", "Fünf Kilo Stahl. Langsam, aber jeder Treffer zerschmettert.", { damage: 128, range: 2.45, arc: 55, maxTargets: 2, swing: 1.05, stamina: 22, sever: 0.55 }, 4.5, 1300, 3, 2),
  p9: firearm({ id: "p9", name: "P9 Dienstpistole", short: "P9", cls: "pistol", description: "Zuverlässige 9-mm-Seitenwaffe.", caliber: "9mm", damage: 24, pellets: 1, fireInterval: 0.15, auto: false, magazine: 15, reload: 1.35, spreadHip: 0.02, spreadAds: 0.005, spreadMove: 0.02, spreadPerShot: 0.012, spreadRecovery: 0.12, recoilPitch: 0.02, recoilYaw: 0.006, rangeStart: 18, rangeEnd: 45, minDamageFactor: 0.6, headMultiplier: 2.1, adsZoom: 0.86, adsTime: 0.14, noise: 30, moveSpeed: 1.04, weight: 0.9, slots: ["muzzle", "mag", "tactical"], price: 350, minLevel: 1, rarity: 0, penetration: 0.1 }),
  r44: firearm({ id: "r44", name: "R-44 Revolver", short: "R-44", cls: "pistol", description: "Sechs Schuss .44 Magnum. Jeder Treffer zählt.", caliber: "44", damage: 62, pellets: 1, fireInterval: 0.34, auto: false, magazine: 6, reload: 0.42, singleLoad: true, spreadHip: 0.024, spreadAds: 0.004, spreadMove: 0.02, spreadPerShot: 0.03, spreadRecovery: 0.12, recoilPitch: 0.055, recoilYaw: 0.01, rangeStart: 25, rangeEnd: 60, minDamageFactor: 0.65, headMultiplier: 2.2, adsZoom: 0.84, adsTime: 0.18, noise: 46, moveSpeed: 1.03, weight: 1.4, slots: ["optic", "tactical"], price: 1100, minLevel: 2, rarity: 1, penetration: 0.3 }),
  p18: firearm({ id: "p18", name: "P18 Reihenfeuerpistole", short: "P18", cls: "pistol", description: "Vollautomatische 9-mm-Pistole mit Kompensator. Leert das Magazin in einer Sekunde.", caliber: "9mm", damage: 21, pellets: 1, fireInterval: 0.055, auto: true, magazine: 20, reload: 1.45, spreadHip: 0.03, spreadAds: 0.009, spreadMove: 0.02, spreadPerShot: 0.009, spreadRecovery: 0.14, recoilPitch: 0.017, recoilYaw: 0.012, rangeStart: 15, rangeEnd: 40, minDamageFactor: 0.55, headMultiplier: 2, adsZoom: 0.86, adsTime: 0.13, noise: 32, moveSpeed: 1.04, weight: 1.0, slots: ["optic", "muzzle", "mag", "tactical"], price: 1500, minLevel: 2, rarity: 1, penetration: 0.1 }),
  de50: firearm({ id: "de50", name: "DE-50 Großkaliberpistole", short: "DE-50", cls: "pistol", description: "Gasdrucklader im Kaliber .44 Magnum. Sieben Schuss, jeder ein Hammerschlag.", caliber: "44", damage: 66, pellets: 1, fireInterval: 0.28, auto: false, magazine: 7, reload: 1.6, spreadHip: 0.026, spreadAds: 0.0045, spreadMove: 0.022, spreadPerShot: 0.035, spreadRecovery: 0.12, recoilPitch: 0.06, recoilYaw: 0.012, rangeStart: 25, rangeEnd: 60, minDamageFactor: 0.65, headMultiplier: 2.2, adsZoom: 0.84, adsTime: 0.17, noise: 50, moveSpeed: 1.02, weight: 2.0, slots: ["optic", "muzzle", "mag", "tactical"], price: 1900, minLevel: 3, rarity: 2, penetration: 0.32 }),
  vx9: firearm({ id: "vx9", name: "VX-9 Maschinenpistole", short: "VX-9", cls: "smg", description: "Hohe Feuerrate auf kurze Distanz, leicht und beweglich.", caliber: "9mm", damage: 21, pellets: 1, fireInterval: 0.068, auto: true, magazine: 32, reload: 1.7, spreadHip: 0.026, spreadAds: 0.009, spreadMove: 0.012, spreadPerShot: 0.0035, spreadRecovery: 0.12, recoilPitch: 0.008, recoilYaw: 0.006, rangeStart: 15, rangeEnd: 45, minDamageFactor: 0.55, headMultiplier: 1.8, adsZoom: 0.8, adsTime: 0.15, noise: 36, moveSpeed: 1.04, weight: 2.4, slots: ["optic", "muzzle", "grip", "mag", "tactical"], price: 1650, minLevel: 2, rarity: 1, penetration: 0.1 }),
  k5: firearm({ id: "k5", name: "K5 Kompakt", short: "K5", cls: "smg", description: "Winzige Maschinenpistole mit extremer Feuerrate. Frisst Munition.", caliber: "9mm", damage: 18, pellets: 1, fireInterval: 0.052, auto: true, magazine: 40, reload: 1.9, spreadHip: 0.03, spreadAds: 0.012, spreadMove: 0.01, spreadPerShot: 0.004, spreadRecovery: 0.13, recoilPitch: 0.007, recoilYaw: 0.008, rangeStart: 12, rangeEnd: 38, minDamageFactor: 0.5, headMultiplier: 1.8, adsZoom: 0.82, adsTime: 0.12, noise: 34, moveSpeed: 1.06, weight: 1.9, slots: ["optic", "muzzle", "grip", "tactical"], price: 2200, minLevel: 3, rarity: 2, penetration: 0.1 }),
  v45: firearm({ id: "v45", name: "V-45 Vektor", short: "V-45", cls: "smg", description: "Maschinenpistole im Kaliber .45 mit Rückstoßumlenkung: 1200 Schuss pro Minute, kaum Hochschlag.", caliber: "45", damage: 27, pellets: 1, fireInterval: 0.05, auto: true, magazine: 25, reload: 1.8, spreadHip: 0.027, spreadAds: 0.008, spreadMove: 0.012, spreadPerShot: 0.0032, spreadRecovery: 0.12, recoilPitch: 0.006, recoilYaw: 0.005, rangeStart: 15, rangeEnd: 42, minDamageFactor: 0.55, headMultiplier: 1.8, adsZoom: 0.8, adsTime: 0.15, noise: 34, moveSpeed: 1.05, weight: 2.7, slots: ["optic", "muzzle", "grip", "mag", "tactical"], price: 3000, minLevel: 4, rarity: 2, penetration: 0.15 }),
  mk4: firearm({ id: "mk4", name: "MK-4 Sturmgewehr", short: "MK-4", cls: "rifle", description: "Vielseitiges 5,56-mm-Gewehr. Kontrollierbarer Rückstoß, gute Reichweite.", caliber: "556", damage: 30, pellets: 1, fireInterval: 0.1, auto: true, magazine: 30, reload: 1.9, spreadHip: 0.03, spreadAds: 0.004, spreadMove: 0.025, spreadPerShot: 0.0045, spreadRecovery: 0.09, recoilPitch: 0.011, recoilYaw: 0.005, rangeStart: 35, rangeEnd: 85, minDamageFactor: 0.7, headMultiplier: 2, adsZoom: 0.72, adsTime: 0.2, noise: 48, moveSpeed: 1, weight: 3.4, slots: ["optic", "muzzle", "grip", "mag", "tactical"], price: 1400, minLevel: 1, rarity: 0, penetration: 0.25 }),
  sr74: firearm({ id: "sr74", name: "SR-74 Sturmgewehr", short: "SR-74", cls: "rifle", description: "Robustes 7,62-mm-Gewehr. Mehr Wucht, mehr Rückstoß.", caliber: "762", damage: 38, pellets: 1, fireInterval: 0.11, auto: true, magazine: 30, reload: 2.1, spreadHip: 0.034, spreadAds: 0.005, spreadMove: 0.028, spreadPerShot: 0.006, spreadRecovery: 0.09, recoilPitch: 0.016, recoilYaw: 0.008, rangeStart: 35, rangeEnd: 90, minDamageFactor: 0.72, headMultiplier: 2, adsZoom: 0.72, adsTime: 0.22, noise: 52, moveSpeed: 0.98, weight: 3.8, slots: ["optic", "muzzle", "grip", "mag", "tactical"], price: 2600, minLevel: 3, rarity: 1, penetration: 0.35 }),
  stg77: firearm({ id: "stg77", name: "StG-77 Bullpup", short: "StG-77", cls: "rifle", description: "Kompaktes Bullpup-Gewehr: langer Lauf, kurze Waffe. Präzise und ruhig im Dauerfeuer.", caliber: "556", damage: 30, pellets: 1, fireInterval: 0.088, auto: true, magazine: 30, reload: 2.2, spreadHip: 0.028, spreadAds: 0.0035, spreadMove: 0.022, spreadPerShot: 0.004, spreadRecovery: 0.09, recoilPitch: 0.01, recoilYaw: 0.004, rangeStart: 40, rangeEnd: 95, minDamageFactor: 0.72, headMultiplier: 2, adsZoom: 0.7, adsTime: 0.19, noise: 48, moveSpeed: 1, weight: 3.6, slots: ["optic", "muzzle", "grip", "mag", "tactical"], price: 2900, minLevel: 3, rarity: 2, penetration: 0.25 }),
  br10: firearm({ id: "br10", name: "BR-10 Kampfgewehr", short: "BR-10", cls: "battle", description: "Schweres Kampfgewehr mit 20-Schuss-Magazin. Durchschlägt Panzerung.", caliber: "762", damage: 50, pellets: 1, fireInterval: 0.15, auto: true, magazine: 20, reload: 2.3, spreadHip: 0.036, spreadAds: 0.0035, spreadMove: 0.03, spreadPerShot: 0.008, spreadRecovery: 0.09, recoilPitch: 0.022, recoilYaw: 0.009, rangeStart: 45, rangeEnd: 110, minDamageFactor: 0.78, headMultiplier: 2, adsZoom: 0.7, adsTime: 0.26, noise: 56, moveSpeed: 0.96, weight: 4.4, slots: ["optic", "muzzle", "grip", "mag", "tactical"], price: 3400, minLevel: 4, rarity: 2, penetration: 0.45 }),
  kv12: firearm({ id: "kv12", name: "KV-12 Schrotflinte", short: "KV-12", cls: "shotgun", description: "Vorderschaftrepetierer mit neun Schrotkugeln. Verheerend auf kurze Distanz.", caliber: "12g", damage: 14, pellets: 9, fireInterval: 0.85, auto: false, manualAction: true, magazine: 6, reload: 0.43, singleLoad: true, spreadHip: 0.06, spreadAds: 0.045, spreadMove: 0.01, spreadPerShot: 0, spreadRecovery: 0.2, recoilPitch: 0.06, recoilYaw: 0.012, rangeStart: 8, rangeEnd: 28, minDamageFactor: 0.25, headMultiplier: 1.6, adsZoom: 0.85, adsTime: 0.2, noise: 55, moveSpeed: 0.97, weight: 3.3, slots: ["optic", "muzzle", "tactical"], price: 2300, minLevel: 2, rarity: 1, penetration: 0.05 }),
  sg8: firearm({ id: "sg8", name: "SG-8 Selbstlade-Schrotflinte", short: "SG-8", cls: "shotgun", description: "Halbautomatische Schrotflinte mit 8 Schuss. Räumt Horden.", caliber: "12g", damage: 12, pellets: 9, fireInterval: 0.26, auto: false, magazine: 8, reload: 0.4, singleLoad: true, spreadHip: 0.065, spreadAds: 0.05, spreadMove: 0.012, spreadPerShot: 0.004, spreadRecovery: 0.2, recoilPitch: 0.05, recoilYaw: 0.014, rangeStart: 8, rangeEnd: 26, minDamageFactor: 0.25, headMultiplier: 1.6, adsZoom: 0.85, adsTime: 0.22, noise: 56, moveSpeed: 0.96, weight: 3.9, slots: ["optic", "muzzle", "grip", "mag", "tactical"], price: 3600, minLevel: 4, rarity: 2, penetration: 0.05 }),
  as12: firearm({ id: "as12", name: "AS-12 Sturmflinte", short: "AS-12", cls: "shotgun", description: "Vollautomatische Schrotflinte mit Kastenmagazin. Fünf Schuss pro Sekunde – nichts bleibt stehen.", caliber: "12g", damage: 12, pellets: 9, fireInterval: 0.2, auto: true, magazine: 10, reload: 2.6, spreadHip: 0.068, spreadAds: 0.052, spreadMove: 0.012, spreadPerShot: 0.006, spreadRecovery: 0.2, recoilPitch: 0.045, recoilYaw: 0.016, rangeStart: 8, rangeEnd: 24, minDamageFactor: 0.25, headMultiplier: 1.6, adsZoom: 0.85, adsTime: 0.24, noise: 58, moveSpeed: 0.94, weight: 4.8, slots: ["optic", "muzzle", "grip", "mag", "tactical"], price: 5400, minLevel: 5, rarity: 3, penetration: 0.05 }),
  dr7: firearm({ id: "dr7", name: "DR-7 Präzisionsgewehr", short: "DR-7", cls: "dmr", description: "Halbautomatisches Präzisionsgewehr mit Zielfernrohr. Zwei Treffer genügen meist.", caliber: "762", damage: 72, pellets: 1, fireInterval: 0.33, auto: false, magazine: 10, reload: 2.2, spreadHip: 0.05, spreadAds: 0.0012, spreadMove: 0.03, spreadPerShot: 0.02, spreadRecovery: 0.1, recoilPitch: 0.04, recoilYaw: 0.008, rangeStart: 60, rangeEnd: 130, minDamageFactor: 0.85, headMultiplier: 2.2, adsZoom: 0.42, adsTime: 0.28, scoped: true, noise: 62, moveSpeed: 0.94, weight: 4.6, slots: ["muzzle", "grip", "mag", "tactical"], price: 3800, minLevel: 3, rarity: 2, penetration: 0.5 }),
  falke: firearm({ id: "falke", name: "Falke .338 Repetierer", short: "FALKE", cls: "sniper", description: "Repetier-Scharfschützengewehr. Ein Schuss, ein Treffer – auch durch Panzerung.", caliber: "338", damage: 150, pellets: 1, fireInterval: 1.25, auto: false, manualAction: true, magazine: 5, reload: 0.6, singleLoad: true, spreadHip: 0.07, spreadAds: 0.0006, spreadMove: 0.04, spreadPerShot: 0, spreadRecovery: 0.15, recoilPitch: 0.08, recoilYaw: 0.012, rangeStart: 100, rangeEnd: 250, minDamageFactor: 0.9, headMultiplier: 2.5, adsZoom: 0.25, adsTime: 0.36, scoped: true, noise: 75, moveSpeed: 0.92, weight: 6.2, slots: ["muzzle", "tactical"], price: 5200, minLevel: 5, rarity: 3, penetration: 0.9 }),
  km45: firearm({ id: "km45", name: "KM-45 Dienstpistole", short: "KM-45", cls: "pistol", description: "Klassische Stahlpistole im Kaliber .45. Acht Schuss, die einen Infizierten wirklich stoppen.", caliber: "45", damage: 34, pellets: 1, fireInterval: 0.18, auto: false, magazine: 8, reload: 1.45, spreadHip: 0.022, spreadAds: 0.0055, spreadMove: 0.02, spreadPerShot: 0.018, spreadRecovery: 0.12, recoilPitch: 0.03, recoilYaw: 0.008, rangeStart: 18, rangeEnd: 45, minDamageFactor: 0.6, headMultiplier: 2.1, adsZoom: 0.86, adsTime: 0.15, noise: 34, moveSpeed: 1.04, weight: 1.1, slots: ["optic", "muzzle", "mag", "tactical"], price: 700, minLevel: 1, rarity: 0, penetration: 0.15 }),
  u45: firearm({ id: "u45", name: "U-45 Maschinenpistole", short: "U-45", cls: "smg", description: "Polymer-MP im Kaliber .45 mit Klappschaft. Ruhige 650 Schuss pro Minute, kräftige Treffer.", caliber: "45", damage: 28, pellets: 1, fireInterval: 0.092, auto: true, magazine: 25, reload: 1.9, spreadHip: 0.026, spreadAds: 0.0075, spreadMove: 0.012, spreadPerShot: 0.0035, spreadRecovery: 0.12, recoilPitch: 0.009, recoilYaw: 0.006, rangeStart: 16, rangeEnd: 45, minDamageFactor: 0.55, headMultiplier: 1.8, adsZoom: 0.8, adsTime: 0.16, noise: 35, moveSpeed: 1.04, weight: 2.5, slots: ["optic", "muzzle", "grip", "mag", "tactical"], price: 1900, minLevel: 2, rarity: 1, penetration: 0.15 }),
  ar36: firearm({ id: "ar36", name: "AR-36 Sturmgewehr", short: "AR-36", cls: "rifle", description: "Leichtes 5,56-mm-Gewehr mit Tragegriff und Klappschaft. Sehr ruhig im Dauerfeuer.", caliber: "556", damage: 29, pellets: 1, fireInterval: 0.08, auto: true, magazine: 30, reload: 2.0, spreadHip: 0.03, spreadAds: 0.0042, spreadMove: 0.024, spreadPerShot: 0.0038, spreadRecovery: 0.095, recoilPitch: 0.0095, recoilYaw: 0.0045, rangeStart: 35, rangeEnd: 85, minDamageFactor: 0.7, headMultiplier: 2, adsZoom: 0.72, adsTime: 0.19, noise: 47, moveSpeed: 1, weight: 3.3, slots: ["optic", "muzzle", "grip", "mag", "tactical"], price: 2000, minLevel: 2, rarity: 1, penetration: 0.25 }),
  uh44: firearm({ id: "uh44", name: "UH-44 Unterhebelrepetierer", short: "UH-44", cls: "rifle", description: "Unterhebelgewehr im Kaliber .44 Magnum. Neun Schuss im Röhrenmagazin, blitzschnell repetiert.", caliber: "44", damage: 64, pellets: 1, fireInterval: 0.55, auto: false, manualAction: true, magazine: 9, reload: 0.45, singleLoad: true, spreadHip: 0.035, spreadAds: 0.0035, spreadMove: 0.025, spreadPerShot: 0, spreadRecovery: 0.12, recoilPitch: 0.04, recoilYaw: 0.008, rangeStart: 35, rangeEnd: 80, minDamageFactor: 0.7, headMultiplier: 2.2, adsZoom: 0.72, adsTime: 0.2, noise: 48, moveSpeed: 1, weight: 3.2, slots: ["optic", "muzzle", "tactical"], price: 1700, minLevel: 2, rarity: 1, penetration: 0.3 }),
  k98: firearm({ id: "k98", name: "K98 Karabiner", short: "K98", cls: "sniper", description: "Alter Repetierkarabiner im Kaliber 7,62 mm. Fünf Schuss, enorme Wucht, Kimme und Korn.", caliber: "762", damage: 92, pellets: 1, fireInterval: 1.0, auto: false, manualAction: true, magazine: 5, reload: 0.5, singleLoad: true, spreadHip: 0.06, spreadAds: 0.0012, spreadMove: 0.035, spreadPerShot: 0, spreadRecovery: 0.14, recoilPitch: 0.06, recoilYaw: 0.01, rangeStart: 70, rangeEnd: 160, minDamageFactor: 0.85, headMultiplier: 2.4, adsZoom: 0.62, adsTime: 0.28, noise: 66, moveSpeed: 0.95, weight: 4.0, slots: ["optic", "muzzle", "tactical"], price: 2400, minLevel: 2, rarity: 1, penetration: 0.6 }),
  db12: firearm({ id: "db12", name: "DB-12 Doppelflinte", short: "DB-12", cls: "shotgun", description: "Gekürzte Doppelläufige. Zwei Schuss, so schnell man abdrücken kann – dann Kipplauf auf.", caliber: "12g", damage: 15, pellets: 9, fireInterval: 0.12, auto: false, magazine: 2, reload: 0.6, singleLoad: true, spreadHip: 0.075, spreadAds: 0.06, spreadMove: 0.01, spreadPerShot: 0.004, spreadRecovery: 0.2, recoilPitch: 0.07, recoilYaw: 0.016, rangeStart: 7, rangeEnd: 22, minDamageFactor: 0.25, headMultiplier: 1.6, adsZoom: 0.88, adsTime: 0.16, noise: 58, moveSpeed: 1.02, weight: 2.6, slots: ["tactical"], price: 900, minLevel: 1, rarity: 0, penetration: 0.05 }),
  xbow: firearm({ id: "xbow", name: "Jagdarmbrust", short: "ARMBRUST", cls: "rifle", description: "Lautlose Armbrust. Ein Bolzen pro Spannen – die Infizierten hören nichts.", caliber: "bolt", damage: 96, pellets: 1, fireInterval: 0.3, auto: false, magazine: 1, reload: 2.1, singleLoad: true, bow: true, spreadHip: 0.03, spreadAds: 0.002, spreadMove: 0.03, spreadPerShot: 0, spreadRecovery: 0.15, recoilPitch: 0.015, recoilYaw: 0.004, rangeStart: 30, rangeEnd: 70, minDamageFactor: 0.6, headMultiplier: 2.5, adsZoom: 0.7, adsTime: 0.22, noise: 6, moveSpeed: 1, weight: 3.4, slots: ["optic", "tactical"], price: 2200, minLevel: 2, rarity: 2, penetration: 0.25 }),
  lm60: firearm({ id: "lm60", name: "LM-60 Maschinengewehr", short: "LM-60", cls: "lmg", description: "100-Schuss-Gurt im 7,62-mm-Kaliber. Langsames Nachladen, endloses Sperrfeuer.", caliber: "762", damage: 34, pellets: 1, fireInterval: 0.088, auto: true, magazine: 100, reload: 5.2, spreadHip: 0.045, spreadAds: 0.008, spreadMove: 0.04, spreadPerShot: 0.004, spreadRecovery: 0.08, recoilPitch: 0.013, recoilYaw: 0.01, rangeStart: 40, rangeEnd: 100, minDamageFactor: 0.72, headMultiplier: 2, adsZoom: 0.75, adsTime: 0.34, noise: 60, moveSpeed: 0.88, weight: 9.5, slots: ["optic", "muzzle", "grip", "tactical"], price: 5800, minLevel: 5, rarity: 3, penetration: 0.35 }),
}
export const WEAPON_ORDER: WeaponId[] = ["knife", "crowbar", "bat", "spade", "machete", "axe", "pickaxe", "katana", "sledge", "p9", "km45", "p18", "r44", "de50", "vx9", "k5", "u45", "v45",
  "mk4", "ar36", "stg77", "sr74", "br10", "uh44", "db12", "kv12", "sg8", "as12", "xbow", "k98", "dr7", "falke", "lm60"]
export const PRIMARY_WEAPONS: WeaponId[] = WEAPON_ORDER.filter(id => WEAPONS[id].slot === "primary")
export const SECONDARY_WEAPONS: WeaponId[] = WEAPON_ORDER.filter(id => WEAPONS[id].slot === "secondary")
export const MELEE_WEAPONS: WeaponId[] = WEAPON_ORDER.filter(id => WEAPONS[id].slot === "melee")

export interface AmmoDef { id: AmmoId; caliber: Caliber; name: string; short: string; damage: number; penetration: number; pellets?: number; description: string }
export const AMMO: Record<AmmoId, AmmoDef> = {
  ammo_9mm: { id: "ammo_9mm", caliber: "9mm", name: "9-mm-Patronen", short: "9MM", damage: 1, penetration: 0.1, description: "Für P9, P18, VX-9 und K5." },
  ammo_45: { id: "ammo_45", caliber: "45", name: ".45-ACP-Patronen", short: ".45", damage: 1, penetration: 0.15, description: "Schwere, langsame Pistolenpatrone. Für KM-45, U-45 und V-45." },
  ammo_44: { id: "ammo_44", caliber: "44", name: ".44-Magnum-Patronen", short: ".44", damage: 1, penetration: 0.3, description: "Für R-44 Revolver, DE-50 und UH-44." },
  ammo_556: { id: "ammo_556", caliber: "556", name: "5,56-mm-Patronen", short: "5,56", damage: 1, penetration: 0.25, description: "Für MK-4, AR-36 und StG-77." },
  ammo_556ap: { id: "ammo_556ap", caliber: "556", name: "5,56 mm panzerbrechend", short: "5,56 AP", damage: 0.95, penetration: 0.7, description: "Durchschlägt Westen und Panzerplatten." },
  ammo_762: { id: "ammo_762", caliber: "762", name: "7,62-mm-Patronen", short: "7,62", damage: 1, penetration: 0.35, description: "Für SR-74, BR-10, K98, DR-7 und LM-60." },
  ammo_762ap: { id: "ammo_762ap", caliber: "762", name: "7,62 mm panzerbrechend", short: "7,62 AP", damage: 0.95, penetration: 0.8, description: "Durchschlägt fast jede Panzerung." },
  ammo_12buck: { id: "ammo_12buck", caliber: "12g", name: "12/70 Schrot", short: "SCHROT", damage: 1, penetration: 0.05, description: "Neun Kugeln pro Schuss. Für DB-12, KV-12, SG-8 und AS-12." },
  ammo_12slug: { id: "ammo_12slug", caliber: "12g", name: "12/70 Flintenlaufgeschoss", short: "SLUG", damage: 7.5, penetration: 0.5, pellets: 1, description: "Ein schweres Geschoss statt Schrot: mehr Reichweite, präzise." },
  ammo_338: { id: "ammo_338", caliber: "338", name: ".338-Lapua-Patronen", short: ".338", damage: 1, penetration: 0.9, description: "Für das Falke-Repetiergewehr." },
  ammo_bolt: { id: "ammo_bolt", caliber: "bolt", name: "Armbrustbolzen", short: "BOLZEN", damage: 1, penetration: 0.25, description: "Carbonbolzen mit Jagdspitze. Für die Armbrust." },
}
export const AMMO_FOR: Record<Caliber, AmmoId[]> = {
  "9mm": ["ammo_9mm"], "45": ["ammo_45"], "44": ["ammo_44"], "556": ["ammo_556", "ammo_556ap"], "762": ["ammo_762", "ammo_762ap"], "12g": ["ammo_12buck", "ammo_12slug"], "338": ["ammo_338"], bolt: ["ammo_bolt"],
}

export interface AttachmentDef {
  id: AttachmentId
  slot: AttachmentSlot
  name: string
  description: string
  /** Weapon classes it fits (and the weapon must list the slot). */
  fits: WeaponClass[]
  /** Multipliers applied to the weapon (1 = unchanged). */
  mods: Partial<Record<"spreadHip" | "spreadAds" | "spreadMove" | "recoil" | "adsTime" | "reload" | "noise" | "damage" | "moveSpeed", number>> & {
    /** Replaces the ADS zoom (optics). */
    adsZoom?: number
    /** Multiplies the magazine size (rounded). */
    magazine?: number
    /** Optic shows the scope overlay at full ADS. */
    scoped?: boolean
  }
  /** Workshop level needed to install it. */
  armory: number
  /** Weapons it does not fit despite class and slot (e.g. a drum on a tube-fed shotgun). */
  not?: WeaponId[]
}
const ALL_GUNS: WeaponClass[] = ["pistol", "smg", "rifle", "battle", "shotgun", "dmr", "sniper", "lmg"]
export const ATTACHMENTS: Record<AttachmentId, AttachmentDef> = {
  att_reddot: { id: "att_reddot", slot: "optic", name: "Rotpunktvisier", description: "Freie Sicht, schnelleres Zielen.", fits: ["pistol", "smg", "rifle", "battle", "shotgun", "lmg"], mods: { adsZoom: 0.78, adsTime: 0.85, spreadAds: 0.9 }, armory: 2 },
  att_holo: { id: "att_holo", slot: "optic", name: "Holografisches Visier", description: "Großes Sichtfenster, ruhigeres Zielen.", fits: ["smg", "rifle", "battle", "shotgun", "lmg"], mods: { adsZoom: 0.75, adsTime: 0.9, spreadAds: 0.8 }, armory: 2 },
  att_acog: { id: "att_acog", slot: "optic", name: "2,5×-Prismenvisier", description: "Kompakte Vergrößerung mit beleuchtetem Absehen. Gut auf mittlere Distanz.", fits: ["smg", "rifle", "battle", "shotgun", "lmg"], mods: { adsZoom: 0.5, adsTime: 1.15, spreadAds: 0.65 }, armory: 2 },
  att_scope4x: { id: "att_scope4x", slot: "optic", name: "4×-Zielfernrohr", description: "Vierfache Vergrößerung für weite Schüsse.", fits: ["rifle", "battle", "lmg"], mods: { adsZoom: 0.32, adsTime: 1.4, spreadAds: 0.5, scoped: true }, armory: 2 },
  att_suppressor: { id: "att_suppressor", slot: "muzzle", name: "Schalldämpfer", description: "Schüsse sind nur noch ein Drittel so weit zu hören.", fits: ALL_GUNS, mods: { noise: 0.35, damage: 0.95 }, armory: 1 },
  att_comp: { id: "att_comp", slot: "muzzle", name: "Kompensator", description: "Weniger Rückstoß, aber lauter.", fits: ["pistol", "smg", "rifle", "battle", "dmr", "lmg"], mods: { recoil: 0.72, noise: 1.1 }, armory: 1 },
  att_brake: { id: "att_brake", slot: "muzzle", name: "Mündungsbremse", description: "Lenkt die Gase zur Seite: viel weniger Rückstoß, aber sehr laut.", fits: ["rifle", "battle", "shotgun", "dmr", "sniper", "lmg"], mods: { recoil: 0.6, noise: 1.25 }, armory: 2 },
  att_vgrip: { id: "att_vgrip", slot: "grip", name: "Vertikalgriff", description: "Weniger Rückstoß und Streuung in Bewegung.", fits: ["smg", "rifle", "battle", "shotgun", "dmr", "lmg"], mods: { recoil: 0.8, spreadMove: 0.85 }, armory: 1 },
  att_agrip: { id: "att_agrip", slot: "grip", name: "Winkelgriff", description: "Schneller im Anschlag.", fits: ["smg", "rifle", "battle", "shotgun", "dmr", "lmg"], mods: { adsTime: 0.8, recoil: 0.92 }, armory: 1 },
  att_bipod: { id: "att_bipod", slot: "grip", name: "Zweibein", description: "Klappbare Stützen: deutlich weniger Rückstoß, aber träger im Anschlag.", fits: ["rifle", "battle", "dmr", "lmg"], mods: { recoil: 0.62, spreadAds: 0.85, adsTime: 1.2, moveSpeed: 0.97 }, armory: 1 },
  att_extmag: { id: "att_extmag", slot: "mag", name: "Erweitertes Magazin", description: "50 % mehr Patronen, etwas langsameres Nachladen.", fits: ["pistol", "smg", "rifle", "battle", "shotgun", "dmr"], mods: { magazine: 1.5, reload: 1.12 }, armory: 2 },
  att_drum: { id: "att_drum", slot: "mag", name: "Trommelmagazin", description: "Doppelt so viele Patronen. Schwer und langsam nachzuladen.", fits: ["smg", "rifle", "shotgun"], mods: { magazine: 2, reload: 1.45, moveSpeed: 0.95 }, armory: 3, not: ["sg8"] },
  att_laser: { id: "att_laser", slot: "tactical", name: "Laser-Licht-Modul", description: "Präziser aus der Hüfte. Der Laser verrät Ihre Position.", fits: ALL_GUNS, mods: { spreadHip: 0.65, noise: 1 }, armory: 1 },
  att_light: { id: "att_light", slot: "tactical", name: "Waffenlicht", description: "Starker Lichtkegel, der doppelt so weit reicht wie die Taschenlampe. Etwas ruhiger aus der Hüfte.", fits: ALL_GUNS, mods: { spreadHip: 0.88 }, armory: 1 },
  att_minired: { id: "att_minired", slot: "optic", name: "Mini-Rotpunkt", description: "Winziges offenes Visier für Pistolen und MPs. Sehr schnell im Anschlag.", fits: ["pistol", "smg"], mods: { adsZoom: 0.82, adsTime: 0.78, spreadAds: 0.92 }, armory: 1 },
  att_scope6x: { id: "att_scope6x", slot: "optic", name: "6×-Zielfernrohr", description: "Starke Vergrößerung für Repetierer und Gewehre. Langsam im Anschlag.", fits: ["rifle", "battle", "sniper"], mods: { adsZoom: 0.2, adsTime: 1.55, spreadAds: 0.4, scoped: true }, armory: 3 },
  att_flash: { id: "att_flash", slot: "muzzle", name: "Mündungsfeuerdämpfer", description: "Kaum Mündungsfeuer, etwas weniger Rückstoß.", fits: ["smg", "rifle", "battle", "dmr", "sniper", "lmg"], mods: { recoil: 0.9, noise: 0.95 }, armory: 1 },
  att_bigsup: { id: "att_bigsup", slot: "muzzle", name: "Schwerer Schalldämpfer", description: "Großes Gehäuse: Schüsse sind fast nicht mehr zu hören. Schwer und vorderlastig.", fits: ["rifle", "battle", "dmr", "sniper", "lmg"], mods: { noise: 0.22, damage: 0.93, adsTime: 1.1, moveSpeed: 0.98 }, armory: 3 },
  att_hstop: { id: "att_hstop", slot: "grip", name: "Handstopp", description: "Flacher Anschlag für die vordere Hand. Schneller im Anschlag, ruhiger in Bewegung.", fits: ["smg", "rifle", "battle", "shotgun", "dmr"], mods: { adsTime: 0.9, spreadMove: 0.9, recoil: 0.95 }, armory: 1 },
  att_fastmag: { id: "att_fastmag", slot: "mag", name: "Magazinkoppler", description: "Zwei Magazine nebeneinander geklemmt: viel schnelleres Nachladen.", fits: ["smg", "rifle", "battle", "dmr"], mods: { reload: 0.7, moveSpeed: 0.99 }, armory: 2 },
  att_irlaser: { id: "att_irlaser", slot: "tactical", name: "IR-Laser", description: "Unsichtbarer Laser: präziser aus der Hüfte, ohne die eigene Position zu verraten.", fits: ALL_GUNS, mods: { spreadHip: 0.72 }, armory: 2 },
}
export const ATTACHMENT_ORDER: AttachmentId[] = ["att_minired", "att_reddot", "att_holo", "att_acog", "att_scope4x", "att_scope6x", "att_suppressor", "att_bigsup", "att_flash", "att_comp", "att_brake",
  "att_vgrip", "att_agrip", "att_hstop", "att_bipod", "att_extmag", "att_fastmag", "att_drum", "att_laser", "att_irlaser", "att_light"]

export function canAttach(weapon: WeaponId, att: AttachmentId): boolean {
  const w = WEAPONS[weapon], a = ATTACHMENTS[att]
  return w.slots.includes(a.slot) && a.fits.includes(w.cls) && !a.not?.includes(weapon)
}

/** Base stats with attachments and ammunition applied (a new object; the base table is never modified). */
export function effectiveWeapon(id: WeaponId, mods: WeaponMods = {}, ammo?: AmmoId): WeaponDef {
  const w: WeaponDef = { ...WEAPONS[id] }
  for (const slot of Object.keys(mods) as AttachmentSlot[]) {
    const att = mods[slot]; if (!att || !canAttach(id, att)) continue
    const m = ATTACHMENTS[att].mods
    if (m.spreadHip) w.spreadHip *= m.spreadHip
    if (m.spreadAds) w.spreadAds *= m.spreadAds
    if (m.spreadMove) w.spreadMove *= m.spreadMove
    if (m.recoil) { w.recoilPitch *= m.recoil; w.recoilYaw *= m.recoil }
    if (m.adsTime) w.adsTime *= m.adsTime
    if (m.reload) w.reload *= m.reload
    if (m.noise) w.noise *= m.noise
    if (m.damage) w.damage *= m.damage
    if (m.moveSpeed) w.moveSpeed *= m.moveSpeed
    if (m.adsZoom !== undefined) { w.adsZoom = Math.min(w.adsZoom, m.adsZoom) }
    if (m.magazine) w.magazine = Math.round(w.magazine * m.magazine)
    if (m.scoped) w.scoped = true
  }
  if (ammo && w.caliber && AMMO[ammo].caliber === w.caliber) {
    const a = AMMO[ammo]
    w.damage *= a.damage; w.penetration = a.penetration
    if (a.pellets) { w.pellets = a.pellets; w.spreadHip *= 0.5; w.spreadAds *= 0.2; w.rangeStart *= 2.5; w.rangeEnd *= 2.5 }
  }
  return w
}
