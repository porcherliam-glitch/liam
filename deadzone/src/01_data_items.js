// 01_data_items.js — item definitions (SPEC §2).
// Public API:
//   AMMO_CALIBERS            caliber key -> German display label
//   ITEMS                    { [id]: ItemDef } (98 definitions)
//   ITEM_LIST                Object.values(ITEMS)
//   itemsByCat(cat)          -> ItemDef[] of that category (empty array for unknown categories)
// Dependencies: none at definition time (RARITY / CATEGORY_NAMES keys from 00_util.js are used as plain strings).
//
// Decisions where the SPEC is silent (documented per SPEC header rule):
// - `value` is the base value of ONE unit in CR (ammo: per round). `weight` is kg per unit.
// - Every caliber has exactly one ammo item with label 'Standard' (ammo_9mm, ammo_45, ammo_556,
//   ammo_762, ammo_12g, ammo_308). The 12-gauge buckshot is the Standard round; the slug uses the
//   label 'Flintenlaufgeschoss'. The label 'Schrot' is not used.
// - revolver_357 has no own caliber in AMMO_CALIBERS; it is chambered for .45 ACP (pistol45).
// - Melee weapons: magSize 0, reloadTime 0, ammo null, range === meleeRange, fireRate = swings/s.
// - Shotgun pellets: pump 8, auto 8, sawed-off 9 (wider spread 0.22, short range).
// - Grenades have no `weapon` block (cat 'grenade'); flash damage is 0 (stun only), molotov
//   damage is the burst damage on impact (the fire hazard itself does 8 hp/s, SPEC §18).
// - Extra optional keys (ignored by systems that do not know them): medical.speedMul on
//   adrenaline (speed buff for `duration` s), water.stamina on the energy drink.
// - Four additional collectibles (col_dogtags, col_lighter, col_figurine, col_vinyl) bring the
//   total above the required 90; they are pure value items.

const AMMO_CALIBERS = {
  pistol9: '9 mm', pistol45: '.45 ACP', rifle556: '5,56 mm', rifle762: '7,62 mm',
  shot12: '12/70', sniper308: '.308',
};

const ITEMS = {
  // ───────────────────────────── Weapons: pistols ─────────────────────────────
  pistol_m9: {
    id: 'pistol_m9', name: 'M9-Dienstpistole', cat: 'weapon', rarity: 'common', value: 250, weight: 1.0, stack: 1,
    desc: 'Die alte Dienstwaffe eines Streifenpolizisten. Zuverlässig, leicht und das Erste, worauf man sich da draußen verlassen kann.',
    durabilityMax: 100,
    weapon: { class: 'pistol', damage: 24, fireRate: 4.0, magSize: 15, reloadTime: 1.4, range: 650, spread: 0.05, recoil: 0.25,
      ammo: 'pistol9', noise: 650, pellets: 1, auto: false, penetration: 1, tier: 1 },
  },
  pistol_p45: {
    id: 'pistol_p45', name: 'P45-Kompaktpistole', cat: 'weapon', rarity: 'uncommon', value: 420, weight: 1.1, stack: 1,
    desc: 'Kurz, schwer und laut. Die .45er stoppt einen Beißer zuverlässiger als jede 9 mm.',
    durabilityMax: 100,
    weapon: { class: 'pistol', damage: 30, fireRate: 3.5, magSize: 10, reloadTime: 1.5, range: 650, spread: 0.045, recoil: 0.35,
      ammo: 'pistol45', noise: 700, pellets: 1, auto: false, penetration: 1, tier: 2 },
  },
  revolver_357: {
    id: 'revolver_357', name: 'Magnum-Revolver', cat: 'weapon', rarity: 'rare', value: 780, weight: 1.4, stack: 1,
    desc: 'Ein umgebauter Trommelrevolver für .45 ACP. Langsam nachzuladen, aber jeder Schuss sitzt wie ein Hammerschlag.',
    durabilityMax: 100,
    weapon: { class: 'pistol', damage: 35, fireRate: 3.0, magSize: 8, reloadTime: 2.6, range: 720, spread: 0.035, recoil: 0.5,
      ammo: 'pistol45', noise: 800, pellets: 1, auto: false, penetration: 2, tier: 3 },
  },

  // ───────────────────────────── Weapons: SMGs ─────────────────────────────
  smg_mp5: {
    id: 'smg_mp5', name: 'MP5-Maschinenpistole', cat: 'weapon', rarity: 'uncommon', value: 950, weight: 2.5, stack: 1,
    desc: 'Präzise und kontrollierbar – die Lieblingswaffe der Spezialeinheiten, die die Stadt am Ende doch nicht halten konnten.',
    durabilityMax: 100,
    weapon: { class: 'smg', damage: 20, fireRate: 11, magSize: 30, reloadTime: 2.0, range: 600, spread: 0.06, recoil: 0.2,
      ammo: 'pistol9', noise: 650, pellets: 1, auto: true, penetration: 1, tier: 2 },
  },
  smg_uzi: {
    id: 'smg_uzi', name: 'Uzi', cat: 'weapon', rarity: 'uncommon', value: 750, weight: 2.2, stack: 1,
    desc: 'Spuckt Blei schneller, als man nachdenken kann. Treffen ist Nebensache, solange genug Magazine im Rucksack sind.',
    durabilityMax: 100,
    weapon: { class: 'smg', damage: 18, fireRate: 13, magSize: 32, reloadTime: 1.9, range: 520, spread: 0.09, recoil: 0.3,
      ammo: 'pistol9', noise: 650, pellets: 1, auto: true, penetration: 1, tier: 2 },
  },
  smg_vector: {
    id: 'smg_vector', name: 'Vector .45', cat: 'weapon', rarity: 'rare', value: 1800, weight: 2.7, stack: 1,
    desc: 'Ein ausgeklügelter Rückstoßdämpfer macht die .45er zur Kreissäge. Selten und heiß begehrt.',
    durabilityMax: 100,
    weapon: { class: 'smg', damage: 24, fireRate: 12, magSize: 25, reloadTime: 2.1, range: 600, spread: 0.05, recoil: 0.28,
      ammo: 'pistol45', noise: 700, pellets: 1, auto: true, penetration: 1, tier: 3 },
  },

  // ───────────────────────────── Weapons: rifles ─────────────────────────────
  rifle_ak: {
    id: 'rifle_ak', name: 'AKM-Sturmgewehr', cat: 'weapon', rarity: 'uncommon', value: 2200, weight: 3.6, stack: 1,
    desc: 'Verzeiht Dreck, Rost und Nachlässigkeit. Die 7,62 mm schlägt durch Fleisch und dünne Wände.',
    durabilityMax: 100,
    weapon: { class: 'rifle', damage: 38, fireRate: 8, magSize: 30, reloadTime: 2.5, range: 950, spread: 0.05, recoil: 0.42,
      ammo: 'rifle762', noise: 1000, pellets: 1, auto: true, penetration: 2, tier: 3 },
  },
  rifle_m4: {
    id: 'rifle_m4', name: 'M4-Karabiner', cat: 'weapon', rarity: 'rare', value: 2600, weight: 3.2, stack: 1,
    desc: 'Leicht, modular und präzise. Aus den Beständen einer Armee, die es nicht mehr gibt.',
    durabilityMax: 100,
    weapon: { class: 'rifle', damage: 33, fireRate: 10, magSize: 30, reloadTime: 2.2, range: 1000, spread: 0.035, recoil: 0.28,
      ammo: 'rifle556', noise: 950, pellets: 1, auto: true, penetration: 2, tier: 3 },
  },
  rifle_scar: {
    id: 'rifle_scar', name: 'SCAR-H-Kampfgewehr', cat: 'weapon', rarity: 'epic', value: 4200, weight: 3.8, stack: 1,
    desc: 'Schweres Kaliber in einem modernen Gehäuse. Wer eins findet, hat entweder Glück gehabt oder einen toten Spezialisten.',
    durabilityMax: 100,
    weapon: { class: 'rifle', damage: 42, fireRate: 7, magSize: 30, reloadTime: 2.6, range: 1100, spread: 0.03, recoil: 0.45,
      ammo: 'rifle762', noise: 1050, pellets: 1, auto: true, penetration: 2, tier: 4 },
  },
  rifle_g36: {
    id: 'rifle_g36', name: 'G36-Sturmgewehr', cat: 'weapon', rarity: 'rare', value: 2500, weight: 3.4, stack: 1,
    desc: 'Das Standardgewehr der Bundeswehr – leicht, mit gutem Visier und angenehm sanftem Rückstoß.',
    durabilityMax: 100,
    weapon: { class: 'rifle', damage: 34, fireRate: 9, magSize: 30, reloadTime: 2.3, range: 1000, spread: 0.035, recoil: 0.25,
      ammo: 'rifle556', noise: 950, pellets: 1, auto: true, penetration: 2, tier: 3 },
  },

  // ───────────────────────────── Weapons: shotguns ─────────────────────────────
  shotgun_pump: {
    id: 'shotgun_pump', name: 'Pumpgun', cat: 'weapon', rarity: 'uncommon', value: 950, weight: 3.4, stack: 1,
    desc: 'Klack-klack, Bumm. Auf kurze Distanz die ehrlichste Antwort auf eine Horde.',
    durabilityMax: 100,
    weapon: { class: 'shotgun', damage: 14, fireRate: 1.3, magSize: 6, reloadTime: 3.2, range: 420, spread: 0.18, recoil: 0.6,
      ammo: 'shot12', noise: 950, pellets: 8, auto: false, penetration: 1, tier: 2 },
  },
  shotgun_sawed: {
    id: 'shotgun_sawed', name: 'Abgesägte Schrotflinte', cat: 'weapon', rarity: 'common', value: 600, weight: 2.4, stack: 1,
    desc: 'Läufe gekürzt, Streuung riesig. Laut, brutal und nur auf Armlänge wirklich tödlich.',
    durabilityMax: 100,
    weapon: { class: 'shotgun', damage: 13, fireRate: 2.0, magSize: 5, reloadTime: 2.8, range: 300, spread: 0.22, recoil: 0.7,
      ammo: 'shot12', noise: 1000, pellets: 9, auto: false, penetration: 1, tier: 1 },
  },
  shotgun_auto: {
    id: 'shotgun_auto', name: 'Automatische Schrotflinte', cat: 'weapon', rarity: 'epic', value: 3800, weight: 4.2, stack: 1,
    desc: 'Ein Magazin voller Schrot, das so schnell leer ist, wie man abdrücken kann. Räumt ganze Flure.',
    durabilityMax: 100,
    weapon: { class: 'shotgun', damage: 12, fireRate: 2.5, magSize: 8, reloadTime: 3.0, range: 400, spread: 0.18, recoil: 0.55,
      ammo: 'shot12', noise: 950, pellets: 8, auto: true, penetration: 1, tier: 4 },
  },

  // ───────────────────────────── Weapons: snipers ─────────────────────────────
  sniper_bolt: {
    id: 'sniper_bolt', name: 'Repetier-Scharfschützengewehr', cat: 'weapon', rarity: 'rare', value: 3500, weight: 5.0, stack: 1,
    desc: 'Ein Schuss, ein Treffer, danach Stille. Für Ziele, die man nie aus der Nähe sehen will.',
    durabilityMax: 100,
    weapon: { class: 'sniper', damage: 150, fireRate: 0.8, magSize: 5, reloadTime: 3.4, range: 1400, spread: 0.008, recoil: 0.85,
      ammo: 'sniper308', noise: 1300, pellets: 1, auto: false, penetration: 3, tier: 4 },
  },
  sniper_semi: {
    id: 'sniper_semi', name: 'Selbstlade-Präzisionsgewehr', cat: 'weapon', rarity: 'epic', value: 5600, weight: 5.2, stack: 1,
    desc: 'Halbautomatisch und mit großem Magazin – ein Präzisionsgewehr, das auch mit einem ganzen Rudel fertig wird.',
    durabilityMax: 100,
    weapon: { class: 'sniper', damage: 110, fireRate: 1.5, magSize: 10, reloadTime: 3.0, range: 1400, spread: 0.012, recoil: 0.6,
      ammo: 'sniper308', noise: 1250, pellets: 1, auto: false, penetration: 3, tier: 5 },
  },

  // ───────────────────────────── Weapons: LMGs ─────────────────────────────
  lmg_pkm: {
    id: 'lmg_pkm', name: 'PKM-Maschinengewehr', cat: 'weapon', rarity: 'epic', value: 5200, weight: 8.5, stack: 1,
    desc: 'Hundert Schuss am Gurt und ein Gewicht, das man in den Schultern spürt. Hält jede Stellung.',
    durabilityMax: 100,
    weapon: { class: 'lmg', damage: 34, fireRate: 10, magSize: 100, reloadTime: 6.0, range: 1000, spread: 0.06, recoil: 0.5,
      ammo: 'rifle762', noise: 1150, pellets: 1, auto: true, penetration: 2, tier: 4 },
  },
  lmg_m249: {
    id: 'lmg_m249', name: 'M249-Maschinengewehr', cat: 'weapon', rarity: 'legendary', value: 7000, weight: 8.0, stack: 1,
    desc: 'Auf 7,62 mm umgerüstet und mit 100-Schuss-Kasten. Wenn es spricht, hört die ganze Stadt zu.',
    durabilityMax: 100,
    weapon: { class: 'lmg', damage: 30, fireRate: 12, magSize: 100, reloadTime: 6.0, range: 1000, spread: 0.065, recoil: 0.45,
      ammo: 'rifle762', noise: 1100, pellets: 1, auto: true, penetration: 2, tier: 5 },
  },

  // ───────────────────────────── Weapons: melee ─────────────────────────────
  melee_knife: {
    id: 'melee_knife', name: 'Kampfmesser', cat: 'weapon', rarity: 'common', value: 80, weight: 0.3, stack: 1,
    desc: 'Lautlos und immer griffbereit. Für alles, was zu nah gekommen ist.',
    durabilityMax: 100,
    weapon: { class: 'melee', damage: 35, fireRate: 2.2, magSize: 0, reloadTime: 0, range: 42, spread: 0, recoil: 0,
      ammo: null, noise: 60, pellets: 1, auto: false, penetration: 1, meleeRange: 42, meleeArc: 1.0, swingTime: 0.35, tier: 1 },
  },
  melee_bat: {
    id: 'melee_bat', name: 'Baseballschläger', cat: 'weapon', rarity: 'common', value: 120, weight: 1.0, stack: 1,
    desc: 'Mit Nägeln gespickt und mit Klebeband umwickelt. Ein Klassiker der Apokalypse.',
    durabilityMax: 100,
    weapon: { class: 'melee', damage: 45, fireRate: 1.4, magSize: 0, reloadTime: 0, range: 56, spread: 0, recoil: 0,
      ammo: null, noise: 90, pellets: 1, auto: false, penetration: 1, meleeRange: 56, meleeArc: 1.6, swingTime: 0.55, tier: 1 },
  },
  melee_machete: {
    id: 'melee_machete', name: 'Machete', cat: 'weapon', rarity: 'uncommon', value: 260, weight: 0.8, stack: 1,
    desc: 'Eine breite, schwere Klinge – für Gestrüpp und Hälse gleichermaßen.',
    durabilityMax: 100,
    weapon: { class: 'melee', damage: 55, fireRate: 1.6, magSize: 0, reloadTime: 0, range: 58, spread: 0, recoil: 0,
      ammo: null, noise: 70, pellets: 1, auto: false, penetration: 1, meleeRange: 58, meleeArc: 1.5, swingTime: 0.45, tier: 2 },
  },
  melee_fireaxe: {
    id: 'melee_fireaxe', name: 'Feuerwehraxt', cat: 'weapon', rarity: 'rare', value: 420, weight: 2.4, stack: 1,
    desc: 'Schwer, langsam und vernichtend. Öffnet Türen und Schädel gleichermaßen.',
    durabilityMax: 100,
    weapon: { class: 'melee', damage: 70, fireRate: 0.9, magSize: 0, reloadTime: 0, range: 62, spread: 0, recoil: 0,
      ammo: null, noise: 110, pellets: 1, auto: false, penetration: 2, meleeRange: 62, meleeArc: 1.4, swingTime: 0.8, tier: 3 },
  },
  melee_crowbar: {
    id: 'melee_crowbar', name: 'Brechstange', cat: 'weapon', rarity: 'common', value: 150, weight: 1.5, stack: 1,
    desc: 'Werkzeug und Schlagwaffe zugleich. Hebelt Kisten auf und streckt Beißer nieder.',
    durabilityMax: 100,
    weapon: { class: 'melee', damage: 48, fireRate: 1.3, magSize: 0, reloadTime: 0, range: 54, spread: 0, recoil: 0,
      ammo: null, noise: 90, pellets: 1, auto: false, penetration: 2, meleeRange: 54, meleeArc: 1.3, swingTime: 0.6, tier: 2 },
  },

  // ───────────────────────────── Grenades ─────────────────────────────
  grenade_frag: {
    id: 'grenade_frag', name: 'Splittergranate', cat: 'grenade', rarity: 'uncommon', value: 300, weight: 0.4, stack: 3,
    desc: 'Stift ziehen, zählen, werfen. Zerreißt alles im Umkreis – und lockt alles im Viertel an.',
    grenade: { damage: 160, radius: 150, fuse: 2.5, noise: 1400, kind: 'frag' },
  },
  grenade_molotov: {
    id: 'grenade_molotov', name: 'Molotowcocktail', cat: 'grenade', rarity: 'common', value: 90, weight: 0.6, stack: 3,
    desc: 'Eine Flasche Benzin mit brennendem Lappen. Setzt eine Fläche in Brand, durch die kein Zombie unbeschadet läuft.',
    grenade: { damage: 30, radius: 110, fuse: 1.2, noise: 600, kind: 'molotov' },
  },
  grenade_flash: {
    id: 'grenade_flash', name: 'Blendgranate', cat: 'grenade', rarity: 'uncommon', value: 180, weight: 0.35, stack: 3,
    desc: 'Ein greller Blitz und ein ohrenbetäubender Knall. Lässt Infizierte für Sekunden orientierungslos taumeln.',
    grenade: { damage: 0, radius: 220, fuse: 1.8, noise: 1200, kind: 'flash' },
  },

  // ───────────────────────────── Ammo ─────────────────────────────
  ammo_9mm: {
    id: 'ammo_9mm', name: '9-mm-Patronen', cat: 'ammo', rarity: 'common', value: 3, weight: 0.01, stack: 60,
    desc: 'Die häufigste Pistolenmunition der Welt. Man findet sie überall – meistens in den Taschen der Toten.',
    ammo: { caliber: 'pistol9', dmgMul: 1.0, penMul: 1.0, noiseMul: 1.0, label: 'Standard' },
  },
  ammo_9mm_hp: {
    id: 'ammo_9mm_hp', name: '9 mm Hohlspitz', cat: 'ammo', rarity: 'uncommon', value: 6, weight: 0.01, stack: 60,
    desc: 'Pilzt beim Aufprall auf und richtet verheerenden Schaden an, durchdringt aber kaum Panzerung.',
    ammo: { caliber: 'pistol9', dmgMul: 1.25, penMul: 0.7, noiseMul: 1.0, label: 'Hohlspitz' },
  },
  ammo_45: {
    id: 'ammo_45', name: '.45-ACP-Patronen', cat: 'ammo', rarity: 'common', value: 4, weight: 0.015, stack: 60,
    desc: 'Dicke, langsame Geschosse mit enormer Stoppwirkung.',
    ammo: { caliber: 'pistol45', dmgMul: 1.0, penMul: 1.0, noiseMul: 1.0, label: 'Standard' },
  },
  ammo_45_hp: {
    id: 'ammo_45_hp', name: '.45 ACP Hohlspitz', cat: 'ammo', rarity: 'uncommon', value: 8, weight: 0.015, stack: 60,
    desc: 'Mehr Wucht geht kaum aus einer Pistole. Gegen Schutzplatten nahezu wirkungslos.',
    ammo: { caliber: 'pistol45', dmgMul: 1.25, penMul: 0.7, noiseMul: 1.0, label: 'Hohlspitz' },
  },
  ammo_556: {
    id: 'ammo_556', name: '5,56-mm-Patronen', cat: 'ammo', rarity: 'common', value: 6, weight: 0.012, stack: 60,
    desc: 'NATO-Standardmunition für Sturmgewehre. Flache Flugbahn, hohe Präzision.',
    ammo: { caliber: 'rifle556', dmgMul: 1.0, penMul: 1.0, noiseMul: 1.0, label: 'Standard' },
  },
  ammo_556_ap: {
    id: 'ammo_556_ap', name: '5,56 mm Panzerbrechend', cat: 'ammo', rarity: 'rare', value: 12, weight: 0.012, stack: 60,
    desc: 'Stahlkern-Geschosse, die durch die Plattenpanzerung gepanzerter Infizierter schlagen.',
    ammo: { caliber: 'rifle556', dmgMul: 0.95, penMul: 1.6, noiseMul: 1.0, label: 'Panzerbrechend' },
  },
  ammo_762: {
    id: 'ammo_762', name: '7,62-mm-Patronen', cat: 'ammo', rarity: 'common', value: 7, weight: 0.017, stack: 60,
    desc: 'Schweres Gewehrkaliber für AK und Maschinengewehre. Laut und durchschlagskräftig.',
    ammo: { caliber: 'rifle762', dmgMul: 1.0, penMul: 1.0, noiseMul: 1.0, label: 'Standard' },
  },
  ammo_762_ap: {
    id: 'ammo_762_ap', name: '7,62 mm Panzerbrechend', cat: 'ammo', rarity: 'rare', value: 14, weight: 0.017, stack: 60,
    desc: 'Wolframkern-Munition aus Militärbeständen. Durchschlägt fast alles, was noch steht.',
    ammo: { caliber: 'rifle762', dmgMul: 0.95, penMul: 1.6, noiseMul: 1.0, label: 'Panzerbrechend' },
  },
  ammo_12g: {
    id: 'ammo_12g', name: 'Schrotpatronen 12/70', cat: 'ammo', rarity: 'common', value: 8, weight: 0.04, stack: 30,
    desc: 'Neun Bleikugeln pro Patrone. Auf kurze Distanz die zuverlässigste Medizin gegen Beißer.',
    ammo: { caliber: 'shot12', dmgMul: 1.0, penMul: 1.0, noiseMul: 1.0, label: 'Standard' },
  },
  ammo_12g_slug: {
    id: 'ammo_12g_slug', name: 'Flintenlaufgeschosse 12/70', cat: 'ammo', rarity: 'uncommon', value: 12, weight: 0.045, stack: 30,
    desc: 'Massive Bleigeschosse statt Schrot. Schlagen deutlich besser durch Panzerung und Knochen.',
    ammo: { caliber: 'shot12', dmgMul: 1.15, penMul: 2.0, noiseMul: 1.05, label: 'Flintenlaufgeschoss' },
  },
  ammo_308: {
    id: 'ammo_308', name: '.308-Patronen', cat: 'ammo', rarity: 'uncommon', value: 14, weight: 0.025, stack: 20,
    desc: 'Präzisionsmunition für Scharfschützengewehre. Selten – und jeden einzelnen Schuss wert.',
    ammo: { caliber: 'sniper308', dmgMul: 1.0, penMul: 1.0, noiseMul: 1.0, label: 'Standard' },
  },
  ammo_308_ap: {
    id: 'ammo_308_ap', name: '.308 Panzerbrechend', cat: 'ammo', rarity: 'rare', value: 26, weight: 0.025, stack: 20,
    desc: 'Match-Munition mit gehärtetem Kern. Für Ziele, die keinen zweiten Schuss erlauben.',
    ammo: { caliber: 'sniper308', dmgMul: 1.0, penMul: 1.5, noiseMul: 1.0, label: 'Panzerbrechend' },
  },

  // ───────────────────────────── Medical ─────────────────────────────
  med_bandage: {
    id: 'med_bandage', name: 'Verband', cat: 'medical', rarity: 'common', value: 40, weight: 0.1, stack: 5,
    desc: 'Ein steriler Verband. Stoppt Blutungen und schließt die schlimmsten Wunden.',
    medical: { heal: 10, overTime: 0, duration: 0, stopBleed: true, cureToxic: false, useTime: 2 },
  },
  med_firstaid: {
    id: 'med_firstaid', name: 'Erste-Hilfe-Set', cat: 'medical', rarity: 'common', value: 150, weight: 0.5, stack: 3,
    desc: 'Kompressen, Desinfektion, Pflaster. Flickt einen zusammen, wenn man drei Sekunden Ruhe hat.',
    medical: { heal: 40, overTime: 0, duration: 0, stopBleed: false, cureToxic: false, useTime: 3 },
  },
  med_medkit: {
    id: 'med_medkit', name: 'Sanitätstasche', cat: 'medical', rarity: 'rare', value: 450, weight: 1.2, stack: 2,
    desc: 'Eine prall gefüllte Sanitätstasche aus Militärbeständen. Heilt schwere Verletzungen und stillt jede Blutung.',
    medical: { heal: 80, overTime: 0, duration: 0, stopBleed: true, cureToxic: false, useTime: 5 },
  },
  med_painkillers: {
    id: 'med_painkillers', name: 'Schmerzmittel', cat: 'medical', rarity: 'uncommon', value: 120, weight: 0.1, stack: 5,
    desc: 'Starke Tabletten, die den Körper nach und nach wieder auf die Beine bringen.',
    medical: { heal: 0, overTime: 30, duration: 20, stopBleed: false, cureToxic: false, useTime: 1.5 },
  },
  med_antitoxin: {
    id: 'med_antitoxin', name: 'Gegengift', cat: 'medical', rarity: 'uncommon', value: 200, weight: 0.1, stack: 3,
    desc: 'Ein experimentelles Serum gegen die Gifte der Verseuchten. Neutralisiert jede Vergiftung sofort.',
    medical: { heal: 5, overTime: 0, duration: 0, stopBleed: false, cureToxic: true, useTime: 2 },
  },
  med_adrenaline: {
    id: 'med_adrenaline', name: 'Adrenalinspritze', cat: 'medical', rarity: 'rare', value: 350, weight: 0.1, stack: 3,
    desc: 'Direkt in den Oberschenkel. Füllt die Ausdauer schlagartig auf und lässt einen kurz schneller laufen als die Läufer.',
    medical: { heal: 0, overTime: 0, duration: 15, stopBleed: false, cureToxic: false, useTime: 1, stamina: 100, speedMul: 1.2 },
  },
  med_splint: {
    id: 'med_splint', name: 'Schiene', cat: 'medical', rarity: 'common', value: 60, weight: 0.4, stack: 3,
    desc: 'Holz, Stoff und Klebeband. Stabilisiert Verletzungen und lindert den Schmerz über eine Weile.',
    medical: { heal: 5, overTime: 15, duration: 10, stopBleed: false, cureToxic: false, useTime: 4 },
  },

  // ───────────────────────────── Food ─────────────────────────────
  food_beans: {
    id: 'food_beans', name: 'Dosenbohnen', cat: 'food', rarity: 'common', value: 25, weight: 0.4, stack: 5,
    desc: 'Kalt aus der Dose gelöffelt. Schmeckt nach Blech und nach Überleben.',
    food: { hunger: 30, useTime: 3 },
  },
  food_bar: {
    id: 'food_bar', name: 'Müsliriegel', cat: 'food', rarity: 'common', value: 12, weight: 0.1, stack: 10,
    desc: 'Klein, süß, schnell gegessen. Hält einen bis zur nächsten Extraktion bei Laune.',
    food: { hunger: 15, useTime: 1.5 },
  },
  food_mre: {
    id: 'food_mre', name: 'Einmannpackung', cat: 'food', rarity: 'uncommon', value: 90, weight: 0.7, stack: 3,
    desc: 'Militärische Feldration mit Hauptgericht, Keksen und Heizbeutel. Ein Festmahl im Sperrgebiet.',
    food: { hunger: 60, useTime: 5 },
  },
  food_chips: {
    id: 'food_chips', name: 'Tüte Chips', cat: 'food', rarity: 'common', value: 8, weight: 0.15, stack: 8,
    desc: 'Salzig, laut beim Öffnen und kaum sättigend. Aber es ist Essen.',
    food: { hunger: 10, useTime: 1.5 },
  },
  food_canned_meat: {
    id: 'food_canned_meat', name: 'Dosenfleisch', cat: 'food', rarity: 'uncommon', value: 45, weight: 0.45, stack: 5,
    desc: 'Undefinierbares Fleisch in Aspik. Reich an Kalorien, arm an Würde.',
    food: { hunger: 40, useTime: 3.5 },
  },

  // ───────────────────────────── Water ─────────────────────────────
  water_bottle: {
    id: 'water_bottle', name: 'Wasserflasche', cat: 'water', rarity: 'common', value: 20, weight: 0.5, stack: 5,
    desc: 'Ein halber Liter sauberes Wasser. Manchmal kostbarer als Munition.',
    water: { thirst: 35, useTime: 2 },
  },
  water_can: {
    id: 'water_can', name: 'Limonadendose', cat: 'water', rarity: 'common', value: 12, weight: 0.35, stack: 6,
    desc: 'Warm, klebrig und süß. Löscht den Durst – irgendwie.',
    water: { thirst: 20, useTime: 1.5 },
  },
  water_purified: {
    id: 'water_purified', name: 'Gereinigtes Wasser', cat: 'water', rarity: 'uncommon', value: 55, weight: 1.0, stack: 3,
    desc: 'Ein Liter abgekochtes und gefiltertes Wasser im Feldkanister.',
    water: { thirst: 60, useTime: 3 },
  },
  water_energy: {
    id: 'water_energy', name: 'Energydrink', cat: 'water', rarity: 'uncommon', value: 35, weight: 0.35, stack: 6,
    desc: 'Zucker, Koffein und Taurin. Löscht den Durst und weckt die Lebensgeister.',
    water: { thirst: 25, useTime: 1.5, stamina: 40 },
  },

  // ───────────────────────────── Materials ─────────────────────────────
  mat_scrap: {
    id: 'mat_scrap', name: 'Altmetall', cat: 'material', rarity: 'common', value: 15, weight: 0.5, stack: 20,
    desc: 'Verbogene Bleche, Schrauben und Rohrstücke. Die Werkstatt macht daraus fast alles.',
  },
  mat_wood: {
    id: 'mat_wood', name: 'Holzbretter', cat: 'material', rarity: 'common', value: 10, weight: 0.8, stack: 20,
    desc: 'Abgerissene Bretter von Zäunen und Möbeln. Gut zum Bauen und Verbarrikadieren.',
  },
  mat_cloth: {
    id: 'mat_cloth', name: 'Stoffreste', cat: 'material', rarity: 'common', value: 8, weight: 0.2, stack: 20,
    desc: 'Zerrissene Kleidung und Bettlaken. Wird zu Verbänden, Taschen und Polstern.',
  },
  mat_chemicals: {
    id: 'mat_chemicals', name: 'Chemikalien', cat: 'material', rarity: 'uncommon', value: 45, weight: 0.6, stack: 10,
    desc: 'Lösungsmittel, Reiniger und Laborreagenzien. Grundstoff für Medizin und Brandsätze.',
  },
  mat_fuel: {
    id: 'mat_fuel', name: 'Treibstoffkanister', cat: 'material', rarity: 'uncommon', value: 120, weight: 4.0, stack: 2,
    desc: 'Zwanzig Liter Diesel in einem verbeulten Kanister. Bringt Fahrzeuge wieder zum Laufen.',
  },
  mat_gunpowder: {
    id: 'mat_gunpowder', name: 'Schießpulver', cat: 'material', rarity: 'uncommon', value: 35, weight: 0.2, stack: 20,
    desc: 'Sorgfältig aus Blindgängern und alten Patronen gekratzt. Die Basis jeder selbstgebauten Munition.',
  },
  mat_steel: {
    id: 'mat_steel', name: 'Stahlplatten', cat: 'material', rarity: 'uncommon', value: 40, weight: 1.2, stack: 10,
    desc: 'Massive Stahlstücke für Panzerung und Verstärkungen.',
  },

  // ───────────────────────────── Electronics ─────────────────────────────
  elec_wires: {
    id: 'elec_wires', name: 'Kabelbündel', cat: 'electronics', rarity: 'common', value: 20, weight: 0.3, stack: 10,
    desc: 'Kupferkabel, aus Wänden und Autos gerissen. Unscheinbar, aber in jeder Reparatur gefragt.',
  },
  elec_circuit: {
    id: 'elec_circuit', name: 'Platine', cat: 'electronics', rarity: 'uncommon', value: 70, weight: 0.2, stack: 10,
    desc: 'Eine intakte Leiterplatte. In der neuen Welt seltener als Gold.',
  },
  elec_battery: {
    id: 'elec_battery', name: 'Batterien', cat: 'electronics', rarity: 'common', value: 30, weight: 0.3, stack: 10,
    desc: 'Ein Satz Batterien mit Restladung. Hält Taschenlampen und Funkgeräte am Leben.',
  },
  elec_radio: {
    id: 'elec_radio', name: 'Funkgerät', cat: 'electronics', rarity: 'rare', value: 260, weight: 1.0, stack: 2,
    desc: 'Ein robustes Handfunkgerät. Hält die Verbindung zur Basis – oder zu anderen Überlebenden.',
  },
  elec_harddrive: {
    id: 'elec_harddrive', name: 'Festplatte', cat: 'electronics', rarity: 'rare', value: 320, weight: 0.4, stack: 5,
    desc: 'Daten aus der Zeit davor. Irgendjemand zahlt immer gut für Informationen.',
  },

  // ───────────────────────────── Tools ─────────────────────────────
  tool_wrench: {
    id: 'tool_wrench', name: 'Schraubenschlüssel', cat: 'tool', rarity: 'common', value: 60, weight: 0.8, stack: 2,
    desc: 'Rostig, aber griffig. Unverzichtbar für jede Reparatur.',
  },
  tool_toolbox: {
    id: 'tool_toolbox', name: 'Werkzeugkoffer', cat: 'tool', rarity: 'uncommon', value: 220, weight: 3.0, stack: 1,
    desc: 'Ein vollständiger Satz Werkzeuge in einem verbeulten Metallkoffer.',
  },
  tool_ducttape: {
    id: 'tool_ducttape', name: 'Panzerband', cat: 'tool', rarity: 'common', value: 30, weight: 0.2, stack: 5,
    desc: 'Hält eine Welt zusammen, die sonst längst auseinandergefallen wäre.',
  },
  tool_lockpick: {
    id: 'tool_lockpick', name: 'Dietrich-Set', cat: 'tool', rarity: 'uncommon', value: 150, weight: 0.1, stack: 3,
    desc: 'Feine Haken und Spanner für Schlösser, die nicht nachgeben wollen.',
  },
  tool_drill: {
    id: 'tool_drill', name: 'Akkubohrer', cat: 'tool', rarity: 'rare', value: 380, weight: 2.0, stack: 1,
    desc: 'Ein schwerer Akkubohrer mit Ersatzakku. Für die anspruchsvollen Arbeiten in der Werkstatt.',
  },

  // ───────────────────────────── Armor ─────────────────────────────
  armor_vest_light: {
    id: 'armor_vest_light', name: 'Leichte Schutzweste', cat: 'armor', rarity: 'common', value: 400, weight: 2.5, stack: 1,
    desc: 'Eine dünne Stichschutzweste. Besser als nichts, wenn Zähne und Klauen kommen.',
    durabilityMax: 100,
    armor: { slot: 'body', protection: 0.15, speedMul: 0.98 },
  },
  armor_vest_police: {
    id: 'armor_vest_police', name: 'Polizei-Schutzweste', cat: 'armor', rarity: 'uncommon', value: 900, weight: 4.0, stack: 1,
    desc: 'Ballistische Weste mit der Aufschrift POLIZEI. Ihr letzter Träger hatte weniger Glück.',
    durabilityMax: 100,
    armor: { slot: 'body', protection: 0.25, speedMul: 0.96 },
  },
  armor_vest_military: {
    id: 'armor_vest_military', name: 'Militär-Plattenträger', cat: 'armor', rarity: 'rare', value: 2200, weight: 7.0, stack: 1,
    desc: 'Keramikplatten vorne und hinten. Hält schwere Treffer ab, kostet aber Beweglichkeit.',
    durabilityMax: 100,
    armor: { slot: 'body', protection: 0.38, speedMul: 0.93 },
  },
  armor_vest_heavy: {
    id: 'armor_vest_heavy', name: 'Schwere Schutzweste', cat: 'armor', rarity: 'epic', value: 4500, weight: 11.0, stack: 1,
    desc: 'Eine Splitterschutzweste aus Spezialbeständen. Man fühlt sich unverwundbar – und sehr langsam.',
    durabilityMax: 100,
    armor: { slot: 'body', protection: 0.5, speedMul: 0.86 },
  },
  armor_cap: {
    id: 'armor_cap', name: 'Verstärkte Mütze', cat: 'armor', rarity: 'common', value: 120, weight: 0.3, stack: 1,
    desc: 'Eine Schirmmütze mit eingenähter Kunststoffschale. Schützt vor dem Gröbsten.',
    durabilityMax: 100,
    armor: { slot: 'head', protection: 0.08, speedMul: 1.0 },
  },
  armor_helmet: {
    id: 'armor_helmet', name: 'Gefechtshelm', cat: 'armor', rarity: 'uncommon', value: 900, weight: 1.4, stack: 1,
    desc: 'Ein Kevlarhelm mit Kinnriemen. Fängt Schläge ab, die sonst den Schädel spalten würden.',
    durabilityMax: 100,
    armor: { slot: 'head', protection: 0.2, speedMul: 0.98 },
  },
  armor_helmet_heavy: {
    id: 'armor_helmet_heavy', name: 'Schwerer Einsatzhelm', cat: 'armor', rarity: 'epic', value: 2600, weight: 2.6, stack: 1,
    desc: 'Vollschutzhelm mit Visier. Schwer, heiß und unbezahlbar, wenn ein Koloss zuschlägt.',
    durabilityMax: 100,
    armor: { slot: 'head', protection: 0.32, speedMul: 0.95 },
  },

  // ───────────────────────────── Backpacks ─────────────────────────────
  pack_small: {
    id: 'pack_small', name: 'Kleiner Rucksack', cat: 'backpack', rarity: 'common', value: 200, weight: 0.8, stack: 1,
    desc: 'Ein Schulrucksack mit verstärkten Nähten. Platz für das Nötigste.',
    backpack: { slots: 12, weightBonus: 8 },
  },
  pack_medium: {
    id: 'pack_medium', name: 'Wanderrucksack', cat: 'backpack', rarity: 'uncommon', value: 700, weight: 1.5, stack: 1,
    desc: 'Robuster Trekkingrucksack mit Hüftgurt. Trägt sich auch voll beladen gut.',
    backpack: { slots: 20, weightBonus: 15 },
  },
  pack_large: {
    id: 'pack_large', name: 'Militärrucksack', cat: 'backpack', rarity: 'rare', value: 1800, weight: 2.4, stack: 1,
    desc: 'Ein riesiger Rucksack aus Armeebeständen. Für Plünderer, die nichts zurücklassen wollen.',
    backpack: { slots: 30, weightBonus: 25 },
  },

  // ───────────────────────────── Keys ─────────────────────────────
  key_city_tunnel: {
    id: 'key_city_tunnel', name: 'Tunnelschlüssel', cat: 'key', rarity: 'rare', value: 150, weight: 0.05, stack: 1,
    desc: 'Ein schwerer Schlüssel der Stadtwerke. Öffnet das Gitter zum Versorgungstunnel unter der Stadt.',
    key: { unlocks: 'city_tunnel', mapId: 'city' },
  },
  key_military_gate: {
    id: 'key_military_gate', name: 'Bunkerschlüssel', cat: 'key', rarity: 'rare', value: 250, weight: 0.05, stack: 1,
    desc: 'Ein codierter Schlüssel mit Militärstempel. Öffnet den Bunkerausgang der Basis.',
    key: { unlocks: 'mil_bunker', mapId: 'military' },
  },
  key_industrial_elevator: {
    id: 'key_industrial_elevator', name: 'Aufzugsschlüssel', cat: 'key', rarity: 'rare', value: 200, weight: 0.05, stack: 1,
    desc: 'Der Schlüssel für den Lastenaufzug im Industriegebiet. Der Weg nach unten – und hinaus.',
    key: { unlocks: 'ind_elevator', mapId: 'industrial' },
  },
  key_research_exit: {
    id: 'key_research_exit', name: 'Notausgangskarte', cat: 'key', rarity: 'epic', value: 350, weight: 0.02, stack: 1,
    desc: 'Eine Schlüsselkarte mit roter Markierung. Öffnet den Notausgang des Labors.',
    key: { unlocks: 'res_emergency', mapId: 'research' },
  },
  key_lab_card: {
    id: 'key_lab_card', name: 'Laborzugangskarte', cat: 'key', rarity: 'epic', value: 400, weight: 0.02, stack: 1,
    desc: 'Eine Sicherheitskarte der höchsten Freigabestufe. Öffnet die verschlossene Tür zum Untergrundlabor.',
    key: { unlocks: 'lab_door', mapId: 'research' },
  },

  // ───────────────────────────── Mission items ─────────────────────────────
  mis_datapack: {
    id: 'mis_datapack', name: 'Datenpaket', cat: 'mission', rarity: 'rare', value: 50, weight: 0.5, stack: 1,
    desc: 'Ein versiegelter Datenträger in einer stoßfesten Hülle. Die Basis braucht dringend, was darauf gespeichert ist.',
    mission: {},
  },
  mis_supply_package: {
    id: 'mis_supply_package', name: 'Versorgungspaket', cat: 'mission', rarity: 'rare', value: 50, weight: 5.0, stack: 1,
    desc: 'Ein abgeworfenes Hilfspaket mit Rotkreuz-Markierung. Schwer, aber überlebenswichtig für die Basis.',
    mission: {},
  },
  mis_generator_part: {
    id: 'mis_generator_part', name: 'Generatorteil', cat: 'mission', rarity: 'rare', value: 50, weight: 4.0, stack: 1,
    desc: 'Ein Lichtmaschinenmodul für einen Industriegenerator. Ohne es bleibt die Basis dunkel.',
    mission: {},
  },
  mis_sample_case: {
    id: 'mis_sample_case', name: 'Probenkoffer', cat: 'mission', rarity: 'epic', value: 50, weight: 2.5, stack: 1,
    desc: 'Ein gekühlter Koffer mit Gewebeproben. Was auch immer darin ist – es könnte ein Heilmittel sein.',
    mission: {},
  },

  // ───────────────────────────── Collectibles ─────────────────────────────
  col_watch: {
    id: 'col_watch', name: 'Luxusuhr', cat: 'collectible', rarity: 'rare', value: 450, weight: 0.2, stack: 5,
    desc: 'Eine Schweizer Automatikuhr. Tickt noch, als wäre nichts geschehen.',
  },
  col_coin: {
    id: 'col_coin', name: 'Goldmünze', cat: 'collectible', rarity: 'uncommon', value: 180, weight: 0.05, stack: 10,
    desc: 'Eine Unze pures Gold. Ein Zahlungsmittel, das jede Katastrophe übersteht.',
  },
  col_jewelry: {
    id: 'col_jewelry', name: 'Schmuckschatulle', cat: 'collectible', rarity: 'rare', value: 380, weight: 0.3, stack: 5,
    desc: 'Ringe, Ketten und Ohrringe in einer kleinen Samtschatulle.',
  },
  col_bitcoin: {
    id: 'col_bitcoin', name: 'Krypto-Wallet', cat: 'collectible', rarity: 'epic', value: 1500, weight: 0.05, stack: 5,
    desc: 'Ein Hardware-Wallet mit unbekanntem Inhalt. Der Händler zahlt trotzdem einen Batzen dafür.',
  },
  col_medal: {
    id: 'col_medal', name: 'Tapferkeitsmedaille', cat: 'collectible', rarity: 'uncommon', value: 220, weight: 0.1, stack: 5,
    desc: 'Eine Auszeichnung aus einem Krieg, der lange vor diesem stattfand.',
  },
  col_painting: {
    id: 'col_painting', name: 'Ölgemälde', cat: 'collectible', rarity: 'legendary', value: 3000, weight: 3.0, stack: 1,
    desc: 'Ein gerahmtes Gemälde aus einer Villa. Vielleicht ein echter alter Meister – vielleicht auch nicht.',
  },
  col_dogtags: {
    id: 'col_dogtags', name: 'Erkennungsmarken', cat: 'collectible', rarity: 'common', value: 60, weight: 0.05, stack: 10,
    desc: 'Die Marken eines gefallenen Soldaten. Jemand sollte erfahren, was aus ihm geworden ist.',
  },
  col_lighter: {
    id: 'col_lighter', name: 'Sturmfeuerzeug', cat: 'collectible', rarity: 'common', value: 70, weight: 0.1, stack: 5,
    desc: 'Ein graviertes Benzinfeuerzeug. Funktioniert bei jedem Wetter.',
  },
  col_figurine: {
    id: 'col_figurine', name: 'Porzellanfigur', cat: 'collectible', rarity: 'uncommon', value: 150, weight: 0.4, stack: 3,
    desc: 'Eine zerbrechliche Tänzerin aus feinem Porzellan. Wie durch ein Wunder unbeschädigt.',
  },
  col_vinyl: {
    id: 'col_vinyl', name: 'Seltene Schallplatte', cat: 'collectible', rarity: 'rare', value: 400, weight: 0.3, stack: 3,
    desc: 'Eine Erstpressung in der Originalhülle. Musik aus einer Welt ohne Sirenen.',
  },
};

const ITEM_LIST = Object.values(ITEMS);

function itemsByCat(cat) {
  const out = [];
  for (const def of ITEM_LIST) if (def.cat === cat) out.push(def);
  return out;
}
