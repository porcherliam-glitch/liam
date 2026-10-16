// 04_data_meta.js — missions, upgrades, recipes, trader stock, loot tables, XP and economy constants (SPEC §5).
// Public API:
//   MISSION_FAIL_TEXT, MISSIONS (24: city_01..research_06), MISSION_BY_ID
//   UPGRADES { stash, workshop, medbay, radio, defense, trader } (3 levels each), upgradeInfo(area, level)
//   RECIPES (33), TRADER_STOCK (56 lines), LOOT_TABLES (12 container types + floor + zombie)
//   xpForLevel(level), levelFromXp(xp), MAX_LEVEL, XP_REWARDS, ECONOMY,
//   SECURE_SLOTS_BASE, CARRY_BASE, STASH_SLOTS_BASE, START_CREDITS
// Dependencies: none at definition time (ids refer to ITEMS, ZOMBIE_TYPES, MAPS of files 01–03).
//
// Decisions where the SPEC is silent:
// - Objective ids are 'o1', 'o2', ... for required and 'x1', 'x2', ... for optional objectives
//   (unique within a mission). Objectives with a single target event (find_key, kill_boss,
//   retrieve, investigate, generator, extract_at) use count 1.
// - Mission requiresLevel may be lower than the map's unlockLevel (maps unlocked early via the
//   radio upgrade stay playable); availability still requires the map to be unlocked.
// - Repeatable missions: city_06, industrial_02, military_04.
// - Every mission has its own failText (German).
// - UPGRADES entries additionally carry `effect` with PER-LEVEL increments that apply cumulatively
//   (stashSlots, repairDiscount, recipeTier, hpMax, freeHealing, missionSlots, showWindows,
//   secureSlots, carryKg, insurance, sellBonus, buyDiscount). They mirror the SPEC formulas
//   (§19: secureSlots = base + level, carry +5 kg/level, hpMax +10/level, repair −15 %/level, free
//   healing at medbay 3, mission slots 1 + radio level, trader bonuses from ECONOMY).
// - Recipe station 'armory' (ammo, grenades, blades) is gated by the WORKSHOP upgrade level
//   (the SPEC lists "ammo crafting" under workshop); 'workshop' recipes use the workshop level,
//   'medbay' recipes the medbay level. Recipe output/input value ratios stay below ~2 so that
//   buy → craft → sell can never generate credits.
// - TRADER_STOCK: `stock:[min,max]` is the unit count (ammo: rounds); `basePrice` is omitted
//   (price = ProfileManager.buyPrice(def)). The first line is ammo_9mm.
// - LOOT_TABLES entries: `count` for ammo stays within 5–30 rounds; `cat` entries are resolved by
//   LootSystem.pickByCategory (rarity-weighted by tier). No key or mission items appear anywhere.
// - xpForLevel is not clamped at MAX_LEVEL (so "xp for next level" stays defined at max level);
//   levelFromXp is clamped to 1..MAX_LEVEL.

const MISSION_FAIL_TEXT = 'Bei Tod, Vermisst oder Abbruch geht der Fortschritt dieses Einsatzes verloren. Missionsgegenstände zählen nur, wenn sie extrahiert werden.';

const MISSIONS = [
  // ═══════════════════════════════ City ═══════════════════════════════
  {
    id: 'city_01', mapId: 'city', title: 'Erste Schritte',
    desc: 'Die Basis braucht Vorräte, und die Wohnhäuser am Stadtrand wurden kaum geplündert. Sieh dich um, nimm mit, was du tragen kannst, und komm lebend zurück.',
    difficulty: 1, requiresLevel: 1, unlockedBy: [], repeatable: false,
    objectives: [
      { id: 'o1', type: 'search', target: 'house', count: 3, text: '3 Behälter in Wohnhäusern durchsuchen' },
      { id: 'o2', type: 'extract_at', target: 'city_edge', count: 1, text: 'An der Evakuierungszone Stadtrand extrahieren' },
    ],
    optional: [
      { id: 'x1', type: 'kill', target: 'any', count: 8, text: '8 Infizierte beliebiger Art erledigen' },
    ],
    rewards: { credits: 350, xp: 120, items: [{ id: 'med_bandage', count: 3 }] },
    optionalRewards: { credits: 100, xp: 40 },
    failText: 'Stirbst du oder verpasst du die Extraktion, zählen die durchsuchten Häuser nicht. Versuch es einfach erneut.',
  },
  {
    id: 'city_02', mapId: 'city', title: 'Apothekenlauf',
    desc: 'In der Krankenstation der Basis gehen die Medikamente aus. Die Apotheke in der Innenstadt könnte noch Vorräte haben – wenn niemand schneller war.',
    difficulty: 1, requiresLevel: 1, unlockedBy: [], repeatable: false,
    objectives: [
      { id: 'o1', type: 'search', target: 'pharmacy', count: 3, text: '3 Behälter in der Apotheke durchsuchen' },
      { id: 'o2', type: 'rescue_medical', target: 'medical', count: 4, text: '4 im Einsatz gefundene Medizin-Gegenstände extrahieren' },
    ],
    optional: [
      { id: 'x1', type: 'kill', target: 'runner', count: 3, text: '3 Läufer erledigen' },
    ],
    rewards: { credits: 450, xp: 150, items: [{ id: 'med_firstaid', count: 1 }] },
    optionalRewards: { credits: 120, xp: 50 },
    failText: 'Ohne Extraktion zählt keine gefundene Medizin. Die Apotheke wird beim nächsten Einsatz neu bestückt.',
  },
  {
    id: 'city_03', mapId: 'city', title: 'Funkstille',
    desc: 'Unser Funkgerät verliert ständig das Signal. Besorge Batterien und prüfe den alten Funkturm im Zentrum – vielleicht lässt er sich als Relais nutzen.',
    difficulty: 2, requiresLevel: 2, unlockedBy: ['city_01'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'collect', target: 'elec_battery', count: 3, text: '3 Batterien abgeben (am Funkgerät oder bei der Extraktion)' },
      { id: 'o2', type: 'investigate', target: 'radio_tower', count: 1, text: 'Den Funkturm 5 Sekunden lang untersuchen' },
    ],
    optional: [
      { id: 'x1', type: 'search', target: 'office', count: 2, text: '2 Behälter in Bürogebäuden durchsuchen' },
    ],
    rewards: { credits: 600, xp: 220, items: [{ id: 'ammo_9mm', count: 40 }] },
    optionalRewards: { credits: 150, xp: 60 },
    failText: 'Die Untersuchung des Funkturms geht bei Tod oder Abbruch verloren. Abgegebene Batterien bleiben angerechnet.',
  },
  {
    id: 'city_04', mapId: 'city', title: 'Der Versorgungsabwurf',
    desc: 'Ein Flugzeug hat über der Stadt ein Hilfspaket abgeworfen, bevor es abdrehte. Hol es, bevor die Kreischer jeden Toten im Viertel darauf aufmerksam machen.',
    difficulty: 2, requiresLevel: 2, unlockedBy: ['city_02'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'retrieve', target: 'mis_supply_package', count: 1, text: 'Das Versorgungspaket an der Abwurfstelle bergen und extrahieren' },
      { id: 'o2', type: 'kill', target: 'screamer', count: 1, text: '1 Kreischer ausschalten' },
    ],
    optional: [
      { id: 'x1', type: 'extract_at', target: 'city_heli', count: 1, text: 'Mit dem Hubschrauber vom Dachlandeplatz extrahieren' },
    ],
    rewards: { credits: 800, xp: 280, items: [{ id: 'armor_vest_light', count: 1 }] },
    optionalRewards: { credits: 250, xp: 80 },
    failText: 'Stirbst du mit dem Versorgungspaket, ist es verloren. Beim nächsten Einsatz liegt ein neues an der Abwurfstelle.',
  },
  {
    id: 'city_05', mapId: 'city', title: 'Der Tunnelschlüssel',
    desc: 'Unter der Stadt verläuft ein Versorgungstunnel, der direkt aus der Gefahrenzone führt. Irgendwo in den Gebäuden liegt der Schlüssel der Stadtwerke.',
    difficulty: 2, requiresLevel: 3, unlockedBy: ['city_03'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'find_key', target: 'key_city_tunnel', count: 1, text: 'Den Schlüssel zum Versorgungstunnel finden' },
      { id: 'o2', type: 'extract_at', target: 'city_tunnel', count: 1, text: 'Durch den Versorgungstunnel extrahieren' },
    ],
    optional: [
      { id: 'x1', type: 'search', target: 'safe', count: 2, text: '2 Tresore öffnen und durchsuchen' },
    ],
    rewards: { credits: 900, xp: 320, items: [{ id: 'pack_medium', count: 1 }] },
    optionalRewards: { credits: 250, xp: 90 },
    failText: 'Ein gefundener Schlüssel zählt nur, wenn du die Extraktion erreichst. Bei Tod liegt er beim nächsten Mal wieder in der Stadt.',
  },
  {
    id: 'city_06', mapId: 'city', title: 'Säuberung der Hauptstraße',
    desc: 'Die Händler wollen eine sichere Route durch die Stadt. Dünne die Horden aus und erledige die Pirscher, die in den dunklen Hauseingängen lauern.',
    difficulty: 3, requiresLevel: 4, unlockedBy: ['city_04', 'city_05'], repeatable: true,
    objectives: [
      { id: 'o1', type: 'kill', target: 'stalker', count: 2, text: '2 Pirscher aufspüren und töten' },
      { id: 'o2', type: 'kill', target: 'any', count: 25, text: '25 Infizierte in der Stadt erledigen' },
    ],
    optional: [
      { id: 'x1', type: 'search', target: 'garage', count: 2, text: '2 Behälter in Garagen durchsuchen' },
    ],
    rewards: { credits: 1000, xp: 350, items: [{ id: 'grenade_molotov', count: 2 }] },
    optionalRewards: { credits: 200, xp: 80 },
    failText: 'Abschüsse zählen nur nach erfolgreicher Extraktion. Dieser Auftrag kann beliebig oft wiederholt werden.',
  },

  // ═══════════════════════════════ Industrial ═══════════════════════════════
  {
    id: 'industrial_01', mapId: 'industrial', title: 'Treibstoff für den Laster',
    desc: 'Am Werkstor steht ein fahrbereiter Lastwagen – es fehlt nur der Treibstoff. Durchsuche die Werkstätten und bring den Laster mit einem vollen Kanister zum Laufen.',
    difficulty: 2, requiresLevel: 2, unlockedBy: [], repeatable: false,
    objectives: [
      { id: 'o1', type: 'search', target: 'workshop', count: 3, text: '3 Behälter in Werkstätten durchsuchen' },
      { id: 'o2', type: 'extract_at', target: 'ind_truck', count: 1, text: 'Mit dem Lastwagen extrahieren (Treibstoffkanister nötig)' },
    ],
    optional: [
      { id: 'x1', type: 'kill', target: 'toxic', count: 2, text: '2 Giftspucker erledigen' },
    ],
    rewards: { credits: 900, xp: 300, items: [{ id: 'tool_wrench', count: 1 }] },
    optionalRewards: { credits: 200, xp: 80 },
    failText: 'Ohne Extraktion mit dem Lastwagen gilt der Auftrag als gescheitert. Ein Treibstoffkanister geht bei Tod verloren.',
  },
  {
    id: 'industrial_02', mapId: 'industrial', title: 'Giftige Proben',
    desc: 'Die Verseuchten im Industriegebiet sondern ein Gift ab, das unser Arzt untersuchen will. Erlege einige von ihnen und bring Chemikalien für das Labor mit.',
    difficulty: 2, requiresLevel: 3, unlockedBy: [], repeatable: true,
    objectives: [
      { id: 'o1', type: 'kill', target: 'toxic', count: 4, text: '4 Giftspucker erledigen' },
      { id: 'o2', type: 'collect', target: 'mat_chemicals', count: 3, text: '3 Chemikalien abgeben (am Funkgerät oder bei der Extraktion)' },
    ],
    optional: [
      { id: 'x1', type: 'search', target: 'lab', count: 2, text: '2 Behälter im Chemielabor durchsuchen' },
    ],
    rewards: { credits: 1000, xp: 340, items: [{ id: 'med_antitoxin', count: 2 }] },
    optionalRewards: { credits: 200, xp: 80 },
    failText: 'Abschüsse gehen bei Tod verloren, abgegebene Chemikalien bleiben angerechnet. Der Auftrag ist wiederholbar.',
  },
  {
    id: 'industrial_03', mapId: 'industrial', title: 'Strom für die Halle',
    desc: 'Die Fabrikhallen liegen im Dunkeln. Starte den Notstromgenerator und durchsuche die Hallen, solange das Licht brennt.',
    difficulty: 2, requiresLevel: 3, unlockedBy: ['industrial_01'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'generator', target: 'generator', count: 1, text: 'Den Notstromgenerator starten (E 4 Sekunden halten)' },
      { id: 'o2', type: 'search', target: 'factory', count: 4, text: '4 Behälter in den Fabrikhallen durchsuchen' },
    ],
    optional: [
      { id: 'x1', type: 'investigate', target: 'water_tower', count: 1, text: 'Den Wasserturm am Gleis untersuchen' },
    ],
    rewards: { credits: 1100, xp: 380, items: [{ id: 'elec_battery', count: 4 }] },
    optionalRewards: { credits: 250, xp: 90 },
    failText: 'Ein gestarteter Generator zählt nur nach erfolgreicher Extraktion. Bei Tod musst du ihn erneut anwerfen.',
  },
  {
    id: 'industrial_04', mapId: 'industrial', title: 'Ersatzteile',
    desc: 'Der Generator der Basis ist ausgefallen. In einer der Hallen liegt ein passendes Lichtmaschinenmodul, dazu brauchen wir funktionierende Platinen.',
    difficulty: 3, requiresLevel: 4, unlockedBy: ['industrial_03'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'retrieve', target: 'mis_generator_part', count: 1, text: 'Das Generatorteil bergen und extrahieren' },
      { id: 'o2', type: 'collect', target: 'elec_circuit', count: 2, text: '2 Platinen abgeben (am Funkgerät oder bei der Extraktion)' },
    ],
    optional: [
      { id: 'x1', type: 'kill', target: 'stalker', count: 2, text: '2 Pirscher in den Hallen aufspüren und töten' },
    ],
    rewards: { credits: 1400, xp: 450, items: [{ id: 'tool_toolbox', count: 1 }] },
    optionalRewards: { credits: 300, xp: 100 },
    failText: 'Das Generatorteil ist bei Tod verloren und muss erneut geborgen werden. Abgegebene Platinen bleiben angerechnet.',
  },
  {
    id: 'industrial_05', mapId: 'industrial', title: 'Der Lastenaufzug',
    desc: 'Ein Lastenaufzug führt in die Versorgungsschächte und von dort aus dem Gebiet. Der Schlüssel muss irgendwo in den Büros oder Lagern liegen.',
    difficulty: 3, requiresLevel: 4, unlockedBy: ['industrial_02'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'find_key', target: 'key_industrial_elevator', count: 1, text: 'Den Schlüssel für den Lastenaufzug finden' },
      { id: 'o2', type: 'extract_at', target: 'ind_elevator', count: 1, text: 'Über den Lastenaufzug extrahieren' },
    ],
    optional: [
      { id: 'x1', type: 'search', target: 'safe', count: 2, text: '2 Tresore in den Büros durchsuchen' },
    ],
    rewards: { credits: 1500, xp: 480, items: [{ id: 'armor_vest_police', count: 1 }] },
    optionalRewards: { credits: 300, xp: 100 },
    failText: 'Der Schlüssel zählt nur, wenn du mit ihm extrahierst. Bei Tod liegt er beim nächsten Einsatz wieder im Gebiet.',
  },
  {
    id: 'industrial_06', mapId: 'industrial', title: 'Das Massengrab',
    desc: 'Hinter dem Rangierbahnhof soll es ein Massengrab geben, das die Werksleitung ausheben ließ. Finde heraus, was dort vertuscht wurde.',
    difficulty: 3, requiresLevel: 5, unlockedBy: ['industrial_04', 'industrial_05'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'investigate', target: 'mass_grave', count: 1, text: 'Das Massengrab hinter dem Rangierbahnhof untersuchen' },
      { id: 'o2', type: 'kill', target: 'any', count: 30, text: '30 Infizierte im Industriegebiet erledigen' },
    ],
    optional: [
      { id: 'x1', type: 'rescue_medical', target: 'medical', count: 3, text: '3 im Einsatz gefundene Medizin-Gegenstände extrahieren' },
    ],
    rewards: { credits: 1800, xp: 600, items: [{ id: 'rifle_ak', count: 1 }] },
    optionalRewards: { credits: 350, xp: 120 },
    failText: 'Untersuchung und Abschüsse gehen bei Tod oder Abbruch verloren. Bisher gespeicherter Fortschritt bleibt erhalten.',
  },

  // ═══════════════════════════════ Military ═══════════════════════════════
  {
    id: 'military_01', mapId: 'military', title: 'Waffenkammer',
    desc: 'Die Waffenkammer der Basis Falkenhorst soll noch gut bestückt sein. Hol dir, was du findest, und verschwinde durch das Haupttor.',
    difficulty: 3, requiresLevel: 4, unlockedBy: [], repeatable: false,
    objectives: [
      { id: 'o1', type: 'search', target: 'armory', count: 3, text: '3 Behälter in der Waffenkammer durchsuchen' },
      { id: 'o2', type: 'extract_at', target: 'mil_gate', count: 1, text: 'Am bewachten Tor extrahieren' },
    ],
    optional: [
      { id: 'x1', type: 'kill', target: 'armored', count: 3, text: '3 Gepanzerte erledigen' },
    ],
    rewards: { credits: 1500, xp: 450, items: [{ id: 'ammo_556', count: 60 }] },
    optionalRewards: { credits: 300, xp: 100 },
    failText: 'Durchsuchte Behälter zählen nur nach erfolgreicher Extraktion. Gefundene Waffen sind bei Tod verloren.',
  },
  {
    id: 'military_02', mapId: 'military', title: 'Feldlazarett',
    desc: 'Das Feldlazarett der Basis war für eine ganze Kompanie ausgelegt. Rette, was an Medizin übrig ist, bevor die Kolosse alles zertrampeln.',
    difficulty: 3, requiresLevel: 4, unlockedBy: [], repeatable: false,
    objectives: [
      { id: 'o1', type: 'search', target: 'medical', count: 3, text: '3 Behälter im Lazarett durchsuchen' },
      { id: 'o2', type: 'rescue_medical', target: 'medical', count: 5, text: '5 im Einsatz gefundene Medizin-Gegenstände extrahieren' },
    ],
    optional: [
      { id: 'x1', type: 'kill', target: 'brute', count: 1, text: '1 Koloss zur Strecke bringen' },
    ],
    rewards: { credits: 1600, xp: 480, items: [{ id: 'med_medkit', count: 1 }] },
    optionalRewards: { credits: 350, xp: 110 },
    failText: 'Medizin zählt nur, wenn du sie extrahierst. Bei Tod ist alles im Rucksack verloren.',
  },
  {
    id: 'military_03', mapId: 'military', title: 'Der Absturz',
    desc: 'Ein Transporthubschrauber ist auf dem Gelände abgestürzt. An Bord war ein Datenpaket mit den letzten Befehlen des Oberkommandos.',
    difficulty: 3, requiresLevel: 5, unlockedBy: ['military_01'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'investigate', target: 'crash_site', count: 1, text: 'Die Absturzstelle des Transporthubschraubers untersuchen' },
      { id: 'o2', type: 'retrieve', target: 'mis_datapack', count: 1, text: 'Das Datenpaket aus dem Wrack bergen und extrahieren' },
    ],
    optional: [
      { id: 'x1', type: 'extract_at', target: 'mil_heli', count: 1, text: 'Mit dem Helikopter vom Landeplatz extrahieren' },
    ],
    rewards: { credits: 2000, xp: 600, items: [{ id: 'armor_helmet', count: 1 }] },
    optionalRewards: { credits: 400, xp: 120 },
    failText: 'Stirbst du mit dem Datenpaket, ist es verloren. Beim nächsten Einsatz liegt ein neues an der Absturzstelle.',
  },
  {
    id: 'military_04', mapId: 'military', title: 'Schwere Gegner',
    desc: 'Kolosse und Gepanzerte blockieren die Zufahrten der Basis. Dünne sie aus, damit unsere Trupps wieder durchkommen.',
    difficulty: 4, requiresLevel: 5, unlockedBy: ['military_02'], repeatable: true,
    objectives: [
      { id: 'o1', type: 'kill', target: 'brute', count: 3, text: '3 Kolosse erledigen' },
      { id: 'o2', type: 'kill', target: 'armored', count: 5, text: '5 Gepanzerte erledigen' },
    ],
    optional: [
      { id: 'x1', type: 'search', target: 'weapon_rack', count: 3, text: '3 Waffenständer durchsuchen' },
    ],
    rewards: { credits: 2200, xp: 650, items: [{ id: 'grenade_frag', count: 3 }] },
    optionalRewards: { credits: 400, xp: 120 },
    failText: 'Abschüsse zählen nur nach erfolgreicher Extraktion. Dieser Auftrag kann beliebig oft wiederholt werden.',
  },
  {
    id: 'military_05', mapId: 'military', title: 'Bunkerausgang',
    desc: 'Das Hauptquartier hatte einen geheimen Bunkerausgang. Finde den Schlüssel, sichere die Unterlagen und nimm den unauffälligen Weg hinaus.',
    difficulty: 4, requiresLevel: 6, unlockedBy: ['military_03'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'find_key', target: 'key_military_gate', count: 1, text: 'Den Schlüssel zum Bunkerausgang finden' },
      { id: 'o2', type: 'search', target: 'hq', count: 3, text: '3 Behälter im Hauptquartier durchsuchen' },
      { id: 'o3', type: 'extract_at', target: 'mil_bunker', count: 1, text: 'Über den Bunkerausgang extrahieren' },
    ],
    optional: [
      { id: 'x1', type: 'collect', target: 'elec_harddrive', count: 2, text: '2 Festplatten abgeben (am Funkgerät oder bei der Extraktion)' },
    ],
    rewards: { credits: 2600, xp: 750, items: [{ id: 'rifle_m4', count: 1 }] },
    optionalRewards: { credits: 500, xp: 150 },
    failText: 'Schlüssel und durchsuchte Behälter zählen nur, wenn du extrahierst. Bei Tod liegt der Schlüssel wieder auf der Basis.',
  },
  {
    id: 'military_06', mapId: 'military', title: 'Operation Morgengrauen',
    desc: 'Der Funkmast der Basis könnte uns mit anderen Überlebenden verbinden. Bring ihn wieder in Gang und sorge dafür, dass niemand die Arbeiten stört.',
    difficulty: 4, requiresLevel: 7, unlockedBy: ['military_04', 'military_05'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'investigate', target: 'radio_tower', count: 1, text: 'Den Funkmast der Basis untersuchen' },
      { id: 'o2', type: 'collect', target: 'elec_radio', count: 2, text: '2 Funkgeräte abgeben (am Funkgerät oder bei der Extraktion)' },
      { id: 'o3', type: 'kill', target: 'any', count: 40, text: '40 Infizierte auf der Basis erledigen' },
    ],
    optional: [
      { id: 'x1', type: 'search', target: 'military_crate', count: 6, text: '6 Militärkisten durchsuchen' },
    ],
    rewards: { credits: 3200, xp: 900, items: [{ id: 'armor_vest_military', count: 1 }] },
    optionalRewards: { credits: 600, xp: 180 },
    failText: 'Untersuchung und Abschüsse gehen bei Tod verloren, abgegebene Funkgeräte bleiben angerechnet.',
  },

  // ═══════════════════════════════ Research ═══════════════════════════════
  {
    id: 'research_01', mapId: 'research', title: 'Forschungsdaten',
    desc: 'Das Rechenzentrum der Anlage speichert alles, was hier erforscht wurde. Durchsuche die Serverschränke und bring die Daten durch das Haupttor heraus.',
    difficulty: 4, requiresLevel: 6, unlockedBy: [], repeatable: false,
    objectives: [
      { id: 'o1', type: 'search', target: 'server', count: 3, text: '3 Behälter im Rechenzentrum durchsuchen' },
      { id: 'o2', type: 'extract_at', target: 'res_main', count: 1, text: 'Am Haupttor extrahieren' },
    ],
    optional: [
      { id: 'x1', type: 'collect', target: 'elec_harddrive', count: 2, text: '2 Festplatten abgeben (am Funkgerät oder bei der Extraktion)' },
    ],
    rewards: { credits: 2400, xp: 700, items: [{ id: 'ammo_556_ap', count: 30 }] },
    optionalRewards: { credits: 500, xp: 150 },
    failText: 'Durchsuchte Serverschränke zählen nur nach erfolgreicher Extraktion am Haupttor.',
  },
  {
    id: 'research_02', mapId: 'research', title: 'Der Probenkoffer',
    desc: 'Ein Forscherteam hat vor dem Ausbruch Gewebeproben gesichert. Der Koffer liegt noch in einem der Labore – vielleicht der Schlüssel zu einem Heilmittel.',
    difficulty: 4, requiresLevel: 6, unlockedBy: [], repeatable: false,
    objectives: [
      { id: 'o1', type: 'retrieve', target: 'mis_sample_case', count: 1, text: 'Den Probenkoffer bergen und extrahieren' },
      { id: 'o2', type: 'kill', target: 'toxic', count: 4, text: '4 Giftspucker erledigen' },
    ],
    optional: [
      { id: 'x1', type: 'search', target: 'lab_cabinet', count: 4, text: '4 Laborschränke durchsuchen' },
    ],
    rewards: { credits: 2600, xp: 750, items: [{ id: 'med_antitoxin', count: 3 }] },
    optionalRewards: { credits: 500, xp: 150 },
    failText: 'Stirbst du mit dem Probenkoffer, ist er verloren. Beim nächsten Einsatz liegt ein neuer in der Anlage.',
  },
  {
    id: 'research_03', mapId: 'research', title: 'Notstrom',
    desc: 'Ohne Strom bleibt der Lüftungsschacht verriegelt. Starte den Notstromgenerator auf dem Campus und nutze den Schacht als Fluchtweg.',
    difficulty: 4, requiresLevel: 7, unlockedBy: ['research_01'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'generator', target: 'generator', count: 1, text: 'Den Notstromgenerator auf dem Campus starten (E 4 Sekunden halten)' },
      { id: 'o2', type: 'extract_at', target: 'res_power', count: 1, text: 'Durch den Lüftungsschacht extrahieren (Strom nötig)' },
    ],
    optional: [
      { id: 'x1', type: 'investigate', target: 'server_room', count: 1, text: 'Den Serverraum 5 Sekunden lang untersuchen' },
    ],
    rewards: { credits: 2800, xp: 800, items: [{ id: 'elec_circuit', count: 3 }] },
    optionalRewards: { credits: 500, xp: 150 },
    failText: 'Der Generator muss in jedem Einsatz neu gestartet werden. Ohne Extraktion zählt der Auftrag nicht.',
  },
  {
    id: 'research_04', mapId: 'research', title: 'Die Zugangskarte',
    desc: 'Die Tür zum Untergrundlabor öffnet sich nur mit einer Karte der höchsten Freigabestufe. Der Sicherheitsdienst hatte eine – irgendwo in seiner Zentrale.',
    difficulty: 4, requiresLevel: 7, unlockedBy: ['research_02'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'find_key', target: 'key_lab_card', count: 1, text: 'Die Laborzugangskarte in der Sicherheitszentrale finden' },
      { id: 'o2', type: 'search', target: 'security', count: 3, text: '3 Behälter in der Sicherheitszentrale durchsuchen' },
    ],
    optional: [
      { id: 'x1', type: 'kill', target: 'stalker', count: 3, text: '3 Pirscher erledigen' },
    ],
    rewards: { credits: 3000, xp: 850, items: [{ id: 'med_medkit', count: 2 }] },
    optionalRewards: { credits: 600, xp: 160 },
    failText: 'Die Zugangskarte zählt nur nach erfolgreicher Extraktion. Bei Tod liegt sie wieder in der Sicherheitszentrale.',
  },
  {
    id: 'research_05', mapId: 'research', title: 'Patient Null',
    desc: 'Die Spuren führen zum Eingang des Untergrundlabors. Untersuche ihn und rette die Medikamente, die dort für den Ernstfall gelagert wurden.',
    difficulty: 5, requiresLevel: 8, unlockedBy: ['research_03', 'research_04'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'investigate', target: 'lab_entrance', count: 1, text: 'Den Eingang zum Untergrundlabor untersuchen' },
      { id: 'o2', type: 'rescue_medical', target: 'medical', count: 6, text: '6 im Einsatz gefundene Medizin-Gegenstände extrahieren' },
    ],
    optional: [
      { id: 'x1', type: 'find_key', target: 'key_research_exit', count: 1, text: 'Die Notausgangskarte des Labors finden' },
      { id: 'x2', type: 'extract_at', target: 'res_emergency', count: 1, text: 'Durch den Notausgang des Labors extrahieren' },
    ],
    rewards: { credits: 3600, xp: 1000, items: [{ id: 'med_adrenaline', count: 2 }] },
    optionalRewards: { credits: 800, xp: 250 },
    failText: 'Untersuchung und Medizin zählen nur nach erfolgreicher Extraktion. Bei Tod ist alles im Rucksack verloren.',
  },
  {
    id: 'research_06', mapId: 'research', title: 'Der Wirt',
    desc: 'Tief unter dem Labor haust der Ursprung der Seuche: ein Koloss aus verschmolzenem Fleisch, den die Forscher nur „den Wirt“ nannten. Beende es.',
    difficulty: 5, requiresLevel: 9, unlockedBy: ['research_05'], repeatable: false,
    objectives: [
      { id: 'o1', type: 'kill_boss', target: 'boss', count: 1, text: 'Den Wirt in der Bunkerhalle unter dem Labor töten' },
      { id: 'o2', type: 'extract_at', target: 'res_main', count: 1, text: 'Nach dem Kampf am Haupttor extrahieren' },
    ],
    optional: [
      { id: 'x1', type: 'kill', target: 'any', count: 50, text: '50 Infizierte in der Anlage erledigen' },
    ],
    rewards: { credits: 6000, xp: 2000, items: [{ id: 'lmg_m249', count: 1 }] },
    optionalRewards: { credits: 1000, xp: 300 },
    failText: 'Fällst du oder verpasst du die Extraktion, zählt der Sieg über den Wirt nicht – er erwartet dich beim nächsten Einsatz erneut.',
  },
];

const MISSION_BY_ID = Object.fromEntries(MISSIONS.map(m => [m.id, m]));

// ───────────────────────────── Base upgrades ─────────────────────────────
const UPGRADES = {
  stash: [
    { level: 1, name: 'Lager erweitern I', cost: { credits: 600, items: [{ id: 'mat_wood', count: 4 }] },
      desc: '+12 Lagerplätze', effect: { stashSlots: 12 } },
    { level: 2, name: 'Lager erweitern II', cost: { credits: 1800, items: [{ id: 'mat_wood', count: 8 }, { id: 'mat_scrap', count: 6 }] },
      desc: '+12 Lagerplätze (insgesamt 48)', effect: { stashSlots: 12 } },
    { level: 3, name: 'Lager erweitern III', cost: { credits: 4500, items: [{ id: 'mat_steel', count: 6 }, { id: 'tool_toolbox', count: 1 }] },
      desc: '+12 Lagerplätze (insgesamt 60)', effect: { stashSlots: 12 } },
  ],
  workshop: [
    { level: 1, name: 'Werkstatt I', cost: { credits: 800, items: [{ id: 'mat_scrap', count: 6 }, { id: 'tool_wrench', count: 1 }] },
      desc: 'Reparaturen 15 % günstiger, Munitionsherstellung und Rezepte der Stufe 1', effect: { repairDiscount: 0.15, recipeTier: 1 } },
    { level: 2, name: 'Werkstatt II', cost: { credits: 2200, items: [{ id: 'tool_toolbox', count: 1 }, { id: 'mat_steel', count: 4 }] },
      desc: 'Reparaturen 30 % günstiger, Rezepte der Stufe 2', effect: { repairDiscount: 0.15, recipeTier: 1 } },
    { level: 3, name: 'Werkstatt III', cost: { credits: 5000, items: [{ id: 'tool_drill', count: 1 }, { id: 'elec_circuit', count: 4 }] },
      desc: 'Reparaturen 45 % günstiger, Rezepte der Stufe 3', effect: { repairDiscount: 0.15, recipeTier: 1 } },
  ],
  medbay: [
    { level: 1, name: 'Krankenstation I', cost: { credits: 700, items: [{ id: 'mat_cloth', count: 6 }, { id: 'med_bandage', count: 3 }] },
      desc: '+10 max. Lebenspunkte (110), Medizin-Rezepte der Stufe 1', effect: { hpMax: 10, recipeTier: 1 } },
    { level: 2, name: 'Krankenstation II', cost: { credits: 2000, items: [{ id: 'med_firstaid', count: 2 }, { id: 'mat_chemicals', count: 4 }] },
      desc: '+10 max. Lebenspunkte (120), Medizin-Rezepte der Stufe 2', effect: { hpMax: 10, recipeTier: 1 } },
    { level: 3, name: 'Krankenstation III', cost: { credits: 4800, items: [{ id: 'med_medkit', count: 2 }, { id: 'elec_circuit', count: 3 }] },
      desc: '+10 max. Lebenspunkte (130), Behandlung kostenlos, Medizin-Rezepte der Stufe 3', effect: { hpMax: 10, recipeTier: 1, freeHealing: true } },
  ],
  radio: [
    { level: 1, name: 'Funkstation I', cost: { credits: 900, items: [{ id: 'elec_wires', count: 4 }, { id: 'elec_battery', count: 2 }] },
      desc: '2 Aufträge gleichzeitig, Industriegebiet sofort zugänglich, Extraktionsfenster auf der Karte', effect: { missionSlots: 1, showWindows: true } },
    { level: 2, name: 'Funkstation II', cost: { credits: 2500, items: [{ id: 'elec_radio', count: 1 }, { id: 'elec_circuit', count: 3 }] },
      desc: '3 Aufträge gleichzeitig, Militärbasis sofort zugänglich', effect: { missionSlots: 1 } },
    { level: 3, name: 'Funkstation III', cost: { credits: 6000, items: [{ id: 'elec_radio', count: 2 }, { id: 'elec_harddrive', count: 2 }] },
      desc: '4 Aufträge gleichzeitig, Forschungsanlage sofort zugänglich', effect: { missionSlots: 1 } },
  ],
  defense: [
    { level: 1, name: 'Verteidigung I', cost: { credits: 1000, items: [{ id: 'mat_steel', count: 4 }, { id: 'mat_wood', count: 6 }] },
      desc: '+1 sicherer Platz, +5 kg Traglast', effect: { secureSlots: 1, carryKg: 5 } },
    { level: 2, name: 'Verteidigung II', cost: { credits: 2800, items: [{ id: 'mat_steel', count: 8 }, { id: 'tool_ducttape', count: 3 }] },
      desc: '+1 sicherer Platz, +5 kg Traglast', effect: { secureSlots: 1, carryKg: 5 } },
    { level: 3, name: 'Verteidigung III', cost: { credits: 7000, items: [{ id: 'mat_steel', count: 12 }, { id: 'elec_circuit', count: 4 }] },
      desc: '+1 sicherer Platz, +5 kg Traglast, 50 % Chance, verlorene Ausrüstung bei Tod zurückzuerhalten', effect: { secureSlots: 1, carryKg: 5, insurance: 0.5 } },
  ],
  trader: [
    { level: 1, name: 'Händlerkontakte I', cost: { credits: 1000, items: [{ id: 'col_coin', count: 2 }] },
      desc: '+8 % Verkaufspreis, −7 % Einkaufspreis, größeres Sortiment', effect: { sellBonus: 0.08, buyDiscount: 0.07 } },
    { level: 2, name: 'Händlerkontakte II', cost: { credits: 3000, items: [{ id: 'col_watch', count: 1 }, { id: 'col_jewelry', count: 1 }] },
      desc: '+16 % Verkaufspreis, −14 % Einkaufspreis, seltenere Waren', effect: { sellBonus: 0.08, buyDiscount: 0.07 } },
    { level: 3, name: 'Händlerkontakte III', cost: { credits: 7500, items: [{ id: 'col_bitcoin', count: 1 }, { id: 'col_medal', count: 2 }] },
      desc: '+24 % Verkaufspreis, −21 % Einkaufspreis, Militärwaren im Angebot', effect: { sellBonus: 0.08, buyDiscount: 0.07 } },
  ],
};

function upgradeInfo(area, level) {
  const list = UPGRADES[area];
  if (!Array.isArray(list)) return null;
  const l = Math.floor(Number(level));
  if (!Number.isFinite(l) || l < 1 || l > list.length) return null;
  return list[l - 1] || null;
}

// ───────────────────────────── Recipes ─────────────────────────────
const RECIPES = [
  // workshop (workshop level)
  { id: 'rc_steel', station: 'workshop', name: 'Stahlplatte schmieden', inputs: [{ id: 'mat_scrap', count: 5 }], output: { id: 'mat_steel', count: 1 }, requiresLevel: 0, time: 0 },
  { id: 'rc_ducttape', station: 'workshop', name: 'Panzerband herstellen', inputs: [{ id: 'mat_cloth', count: 2 }, { id: 'mat_chemicals', count: 1 }], output: { id: 'tool_ducttape', count: 1 }, requiresLevel: 0, time: 0 },
  { id: 'rc_vest_light', station: 'workshop', name: 'Leichte Schutzweste nähen', inputs: [{ id: 'mat_cloth', count: 6 }, { id: 'mat_steel', count: 3 }, { id: 'tool_ducttape', count: 2 }], output: { id: 'armor_vest_light', count: 1 }, requiresLevel: 0, time: 0 },
  { id: 'rc_circuit', station: 'workshop', name: 'Platine löten', inputs: [{ id: 'elec_wires', count: 2 }, { id: 'mat_scrap', count: 1 }], output: { id: 'elec_circuit', count: 1 }, requiresLevel: 1, time: 0 },
  { id: 'rc_lockpick', station: 'workshop', name: 'Dietrich-Set feilen', inputs: [{ id: 'mat_scrap', count: 3 }, { id: 'mat_steel', count: 1 }, { id: 'tool_ducttape', count: 1 }], output: { id: 'tool_lockpick', count: 1 }, requiresLevel: 1, time: 0 },
  { id: 'rc_toolbox', station: 'workshop', name: 'Werkzeugkoffer zusammenstellen', inputs: [{ id: 'tool_wrench', count: 1 }, { id: 'mat_steel', count: 2 }, { id: 'mat_scrap', count: 4 }], output: { id: 'tool_toolbox', count: 1 }, requiresLevel: 1, time: 0 },
  { id: 'rc_pack_medium', station: 'workshop', name: 'Rucksack vergrößern', inputs: [{ id: 'pack_small', count: 1 }, { id: 'mat_cloth', count: 10 }, { id: 'tool_ducttape', count: 3 }], output: { id: 'pack_medium', count: 1 }, requiresLevel: 1, time: 0 },
  { id: 'rc_radio', station: 'workshop', name: 'Funkgerät bauen', inputs: [{ id: 'elec_circuit', count: 2 }, { id: 'elec_battery', count: 2 }, { id: 'elec_wires', count: 2 }], output: { id: 'elec_radio', count: 1 }, requiresLevel: 2, time: 0 },
  { id: 'rc_fuel', station: 'workshop', name: 'Treibstoff destillieren', inputs: [{ id: 'mat_chemicals', count: 3 }, { id: 'mat_scrap', count: 2 }], output: { id: 'mat_fuel', count: 1 }, requiresLevel: 2, time: 0 },
  { id: 'rc_vest_police', station: 'workshop', name: 'Schutzweste verstärken', inputs: [{ id: 'armor_vest_light', count: 1 }, { id: 'mat_steel', count: 5 }, { id: 'tool_ducttape', count: 2 }], output: { id: 'armor_vest_police', count: 1 }, requiresLevel: 2, time: 0 },
  { id: 'rc_helmet', station: 'workshop', name: 'Gefechtshelm bauen', inputs: [{ id: 'armor_cap', count: 1 }, { id: 'mat_steel', count: 6 }, { id: 'tool_ducttape', count: 3 }, { id: 'mat_cloth', count: 4 }], output: { id: 'armor_helmet', count: 1 }, requiresLevel: 2, time: 0 },
  { id: 'rc_pack_large', station: 'workshop', name: 'Militärrucksack fertigen', inputs: [{ id: 'pack_medium', count: 1 }, { id: 'mat_cloth', count: 12 }, { id: 'mat_steel', count: 3 }, { id: 'tool_ducttape', count: 3 }], output: { id: 'pack_large', count: 1 }, requiresLevel: 3, time: 0 },
  { id: 'rc_vest_military', station: 'workshop', name: 'Plattenträger fertigen', inputs: [{ id: 'armor_vest_police', count: 1 }, { id: 'mat_steel', count: 8 }, { id: 'tool_ducttape', count: 3 }], output: { id: 'armor_vest_military', count: 1 }, requiresLevel: 3, time: 0 },

  // armory (workshop level; ammo crafting needs workshop ≥ 1)
  { id: 'rc_ammo_9mm', station: 'armory', name: '9-mm-Patronen laden', inputs: [{ id: 'mat_gunpowder', count: 1 }, { id: 'mat_scrap', count: 1 }], output: { id: 'ammo_9mm', count: 20 }, requiresLevel: 1, time: 0 },
  { id: 'rc_ammo_45', station: 'armory', name: '.45-ACP-Patronen laden', inputs: [{ id: 'mat_gunpowder', count: 1 }, { id: 'mat_scrap', count: 1 }], output: { id: 'ammo_45', count: 15 }, requiresLevel: 1, time: 0 },
  { id: 'rc_ammo_12g', station: 'armory', name: 'Schrotpatronen laden', inputs: [{ id: 'mat_gunpowder', count: 1 }, { id: 'mat_scrap', count: 1 }, { id: 'mat_cloth', count: 1 }], output: { id: 'ammo_12g', count: 10 }, requiresLevel: 1, time: 0 },
  { id: 'rc_molotov', station: 'armory', name: 'Molotowcocktails abfüllen', inputs: [{ id: 'mat_fuel', count: 1 }, { id: 'mat_cloth', count: 2 }], output: { id: 'grenade_molotov', count: 2 }, requiresLevel: 1, time: 0 },
  { id: 'rc_machete', station: 'armory', name: 'Machete schmieden', inputs: [{ id: 'mat_steel', count: 3 }, { id: 'tool_ducttape', count: 1 }, { id: 'mat_wood', count: 1 }], output: { id: 'melee_machete', count: 1 }, requiresLevel: 1, time: 0 },
  { id: 'rc_ammo_556', station: 'armory', name: '5,56-mm-Patronen laden', inputs: [{ id: 'mat_gunpowder', count: 2 }, { id: 'mat_scrap', count: 1 }], output: { id: 'ammo_556', count: 20 }, requiresLevel: 2, time: 0 },
  { id: 'rc_ammo_762', station: 'armory', name: '7,62-mm-Patronen laden', inputs: [{ id: 'mat_gunpowder', count: 2 }, { id: 'mat_scrap', count: 2 }], output: { id: 'ammo_762', count: 20 }, requiresLevel: 2, time: 0 },
  { id: 'rc_ammo_9mm_hp', station: 'armory', name: 'Hohlspitzgeschosse fräsen', inputs: [{ id: 'ammo_9mm', count: 20 }, { id: 'mat_chemicals', count: 1 }], output: { id: 'ammo_9mm_hp', count: 20 }, requiresLevel: 2, time: 0 },
  { id: 'rc_frag', station: 'armory', name: 'Splittergranate bauen', inputs: [{ id: 'mat_gunpowder', count: 3 }, { id: 'mat_scrap', count: 2 }, { id: 'mat_steel', count: 1 }], output: { id: 'grenade_frag', count: 1 }, requiresLevel: 2, time: 0 },
  { id: 'rc_flash', station: 'armory', name: 'Blendgranate bauen', inputs: [{ id: 'mat_chemicals', count: 2 }, { id: 'elec_battery', count: 1 }], output: { id: 'grenade_flash', count: 1 }, requiresLevel: 2, time: 0 },
  { id: 'rc_ammo_308', station: 'armory', name: '.308-Patronen laden', inputs: [{ id: 'mat_gunpowder', count: 2 }, { id: 'mat_steel', count: 1 }], output: { id: 'ammo_308', count: 10 }, requiresLevel: 3, time: 0 },
  { id: 'rc_ammo_556_ap', station: 'armory', name: 'Panzerbrechende 5,56 mm fertigen', inputs: [{ id: 'ammo_556', count: 20 }, { id: 'mat_steel', count: 1 }], output: { id: 'ammo_556_ap', count: 20 }, requiresLevel: 3, time: 0 },

  // medbay (medbay level)
  { id: 'rc_bandage', station: 'medbay', name: 'Verband anfertigen', inputs: [{ id: 'mat_cloth', count: 4 }], output: { id: 'med_bandage', count: 1 }, requiresLevel: 0, time: 0 },
  { id: 'rc_splint', station: 'medbay', name: 'Schiene bauen', inputs: [{ id: 'mat_wood', count: 2 }, { id: 'mat_cloth', count: 3 }, { id: 'tool_ducttape', count: 1 }], output: { id: 'med_splint', count: 1 }, requiresLevel: 0, time: 0 },
  { id: 'rc_firstaid', station: 'medbay', name: 'Erste-Hilfe-Set packen', inputs: [{ id: 'med_bandage', count: 2 }, { id: 'mat_chemicals', count: 1 }], output: { id: 'med_firstaid', count: 1 }, requiresLevel: 1, time: 0 },
  { id: 'rc_painkillers', station: 'medbay', name: 'Schmerzmittel mischen', inputs: [{ id: 'mat_chemicals', count: 2 }], output: { id: 'med_painkillers', count: 1 }, requiresLevel: 1, time: 0 },
  { id: 'rc_water_purified', station: 'medbay', name: 'Wasser aufbereiten', inputs: [{ id: 'water_bottle', count: 2 }, { id: 'mat_chemicals', count: 1 }], output: { id: 'water_purified', count: 2 }, requiresLevel: 1, time: 0 },
  { id: 'rc_antitoxin', station: 'medbay', name: 'Gegengift synthetisieren', inputs: [{ id: 'mat_chemicals', count: 3 }, { id: 'water_purified', count: 1 }], output: { id: 'med_antitoxin', count: 1 }, requiresLevel: 2, time: 0 },
  { id: 'rc_medkit', station: 'medbay', name: 'Sanitätstasche packen', inputs: [{ id: 'med_firstaid', count: 2 }, { id: 'med_bandage', count: 2 }, { id: 'mat_chemicals', count: 2 }], output: { id: 'med_medkit', count: 1 }, requiresLevel: 2, time: 0 },
  { id: 'rc_adrenaline', station: 'medbay', name: 'Adrenalinspritze aufziehen', inputs: [{ id: 'mat_chemicals', count: 4 }, { id: 'med_painkillers', count: 1 }], output: { id: 'med_adrenaline', count: 1 }, requiresLevel: 3, time: 0 },
];

// ───────────────────────────── Trader stock ─────────────────────────────
const TRADER_STOCK = [
  // level 0, always in stock (no dead ends)
  { id: 'ammo_9mm', stock: [60, 120], minLevel: 0, chance: 1 },
  { id: 'ammo_45', stock: [40, 90], minLevel: 0, chance: 1 },
  { id: 'ammo_556', stock: [40, 90], minLevel: 0, chance: 1 },
  { id: 'ammo_762', stock: [40, 90], minLevel: 0, chance: 1 },
  { id: 'ammo_12g', stock: [20, 40], minLevel: 0, chance: 1 },
  { id: 'ammo_308', stock: [20, 30], minLevel: 0, chance: 1 },
  { id: 'med_bandage', stock: [3, 6], minLevel: 0, chance: 1 },
  { id: 'med_firstaid', stock: [1, 3], minLevel: 0, chance: 1 },
  { id: 'food_beans', stock: [2, 5], minLevel: 0, chance: 1 },
  { id: 'water_bottle', stock: [2, 5], minLevel: 0, chance: 1 },
  { id: 'pistol_m9', stock: [1, 2], minLevel: 0, chance: 1 },
  { id: 'pack_small', stock: [1, 1], minLevel: 0, chance: 1 },
  { id: 'food_bar', stock: [2, 6], minLevel: 0, chance: 1 },
  { id: 'water_can', stock: [2, 6], minLevel: 0, chance: 1 },
  { id: 'mat_wood', stock: [4, 10], minLevel: 0, chance: 1 },
  // level 0, sometimes
  { id: 'mat_cloth', stock: [4, 10], minLevel: 0, chance: 0.8 },
  { id: 'mat_scrap', stock: [4, 10], minLevel: 0, chance: 0.8 },
  { id: 'elec_battery', stock: [2, 5], minLevel: 0, chance: 0.7 },
  { id: 'elec_wires', stock: [2, 5], minLevel: 0, chance: 0.7 },
  { id: 'tool_ducttape', stock: [1, 3], minLevel: 0, chance: 0.6 },
  { id: 'melee_crowbar', stock: [1, 1], minLevel: 0, chance: 0.6 },
  { id: 'melee_bat', stock: [1, 1], minLevel: 0, chance: 0.5 },
  { id: 'armor_cap', stock: [1, 1], minLevel: 0, chance: 0.6 },
  { id: 'grenade_molotov', stock: [1, 3], minLevel: 0, chance: 0.5 },
  { id: 'shotgun_sawed', stock: [1, 1], minLevel: 0, chance: 0.4 },
  // level 1
  { id: 'ammo_9mm_hp', stock: [20, 60], minLevel: 1, chance: 0.8 },
  { id: 'ammo_45_hp', stock: [20, 50], minLevel: 1, chance: 0.7 },
  { id: 'ammo_12g_slug', stock: [20, 30], minLevel: 1, chance: 0.7 },
  { id: 'med_medkit', stock: [1, 2], minLevel: 1, chance: 0.7 },
  { id: 'armor_vest_light', stock: [1, 1], minLevel: 1, chance: 0.9 },
  { id: 'pistol_p45', stock: [1, 1], minLevel: 1, chance: 0.7 },
  { id: 'smg_uzi', stock: [1, 1], minLevel: 1, chance: 0.6 },
  { id: 'shotgun_pump', stock: [1, 1], minLevel: 1, chance: 0.6 },
  { id: 'mat_gunpowder', stock: [3, 8], minLevel: 1, chance: 0.8 },
  { id: 'mat_chemicals', stock: [2, 5], minLevel: 1, chance: 0.7 },
  { id: 'mat_steel', stock: [2, 6], minLevel: 1, chance: 0.6 },
  { id: 'med_painkillers', stock: [1, 3], minLevel: 1, chance: 0.8 },
  { id: 'med_antitoxin', stock: [1, 2], minLevel: 1, chance: 0.7 },
  { id: 'food_mre', stock: [1, 3], minLevel: 1, chance: 0.7 },
  { id: 'water_purified', stock: [1, 3], minLevel: 1, chance: 0.7 },
  { id: 'elec_circuit', stock: [1, 3], minLevel: 1, chance: 0.5 },
  { id: 'tool_wrench', stock: [1, 1], minLevel: 1, chance: 0.6 },
  // level 2
  { id: 'ammo_556_ap', stock: [20, 40], minLevel: 2, chance: 0.6 },
  { id: 'ammo_762_ap', stock: [20, 40], minLevel: 2, chance: 0.6 },
  { id: 'rifle_ak', stock: [1, 1], minLevel: 2, chance: 0.6 },
  { id: 'smg_mp5', stock: [1, 1], minLevel: 2, chance: 0.6 },
  { id: 'armor_vest_police', stock: [1, 1], minLevel: 2, chance: 0.6 },
  { id: 'armor_helmet', stock: [1, 1], minLevel: 2, chance: 0.5 },
  { id: 'pack_medium', stock: [1, 1], minLevel: 2, chance: 0.6 },
  { id: 'med_adrenaline', stock: [1, 2], minLevel: 2, chance: 0.5 },
  { id: 'grenade_frag', stock: [1, 3], minLevel: 2, chance: 0.6 },
  { id: 'grenade_flash', stock: [1, 3], minLevel: 2, chance: 0.6 },
  { id: 'mat_fuel', stock: [1, 2], minLevel: 2, chance: 0.6 },
  { id: 'elec_radio', stock: [1, 1], minLevel: 2, chance: 0.5 },
  { id: 'elec_harddrive', stock: [1, 2], minLevel: 2, chance: 0.4 },
  // level 3
  { id: 'ammo_308_ap', stock: [20, 30], minLevel: 3, chance: 0.6 },
  { id: 'rifle_m4', stock: [1, 1], minLevel: 3, chance: 0.5 },
  { id: 'sniper_bolt', stock: [1, 1], minLevel: 3, chance: 0.5 },
  { id: 'lmg_pkm', stock: [1, 1], minLevel: 3, chance: 0.35 },
  { id: 'shotgun_auto', stock: [1, 1], minLevel: 3, chance: 0.35 },
  { id: 'smg_vector', stock: [1, 1], minLevel: 3, chance: 0.4 },
  { id: 'revolver_357', stock: [1, 1], minLevel: 3, chance: 0.5 },
  { id: 'melee_fireaxe', stock: [1, 1], minLevel: 3, chance: 0.5 },
  { id: 'armor_vest_military', stock: [1, 1], minLevel: 3, chance: 0.4 },
  { id: 'pack_large', stock: [1, 1], minLevel: 3, chance: 0.4 },
  { id: 'tool_toolbox', stock: [1, 1], minLevel: 3, chance: 0.5 },
];

// ───────────────────────────── Loot tables ─────────────────────────────
const LOOT_TABLES = {
  crate: { rolls: [1, 3], entries: [
    { cat: 'material', w: 30, count: [1, 3] },
    { cat: 'ammo', w: 15, count: [5, 20] },
    { cat: 'food', w: 14, count: [1, 2] },
    { cat: 'water', w: 10, count: [1, 2] },
    { cat: 'tool', w: 8, count: [1, 1] },
    { cat: 'electronics', w: 8, count: [1, 2] },
    { cat: 'medical', w: 6, count: [1, 1] },
    { cat: 'collectible', w: 4, count: [1, 1] },
    { cat: 'weapon', w: 4, count: [1, 1], minTier: 2 },
    { id: 'mat_fuel', w: 3, count: [1, 1], minTier: 2 },
  ] },
  locker: { rolls: [1, 3], entries: [
    { cat: 'ammo', w: 18, count: [5, 20] },
    { cat: 'medical', w: 12, count: [1, 1] },
    { cat: 'armor', w: 10, count: [1, 1] },
    { cat: 'material', w: 10, count: [1, 2] },
    { cat: 'food', w: 8, count: [1, 2] },
    { cat: 'water', w: 8, count: [1, 2] },
    { cat: 'weapon', w: 6, count: [1, 1] },
    { cat: 'tool', w: 6, count: [1, 1] },
    { cat: 'backpack', w: 5, count: [1, 1] },
    { cat: 'collectible', w: 5, count: [1, 1] },
  ] },
  fridge: { rolls: [1, 3], entries: [
    { cat: 'food', w: 50, count: [1, 2] },
    { cat: 'water', w: 40, count: [1, 2] },
    { id: 'mat_chemicals', w: 6, count: [1, 1] },
    { id: 'med_antitoxin', w: 4, count: [1, 1], minTier: 2 },
  ] },
  desk: { rolls: [1, 2], entries: [
    { cat: 'electronics', w: 22, count: [1, 2] },
    { cat: 'collectible', w: 18, count: [1, 1] },
    { id: 'elec_battery', w: 12, count: [1, 2] },
    { id: 'food_bar', w: 10, count: [1, 2] },
    { id: 'med_painkillers', w: 8, count: [1, 1] },
    { id: 'ammo_9mm', w: 8, count: [5, 15] },
    { id: 'tool_lockpick', w: 4, count: [1, 1] },
    { id: 'elec_harddrive', w: 6, count: [1, 1], minTier: 2 },
    { id: 'tool_ducttape', w: 6, count: [1, 1] },
  ] },
  medcabinet: { rolls: [1, 3], entries: [
    { cat: 'medical', w: 60, count: [1, 2] },
    { id: 'med_bandage', w: 25, count: [1, 3] },
    { id: 'mat_chemicals', w: 15, count: [1, 2] },
    { id: 'med_antitoxin', w: 10, count: [1, 1] },
    { id: 'med_medkit', w: 5, count: [1, 1], minTier: 3 },
  ] },
  safe: { rolls: [2, 4], entries: [
    { cat: 'collectible', w: 50, count: [1, 2] },
    { id: 'col_coin', w: 15, count: [1, 3] },
    { cat: 'ammo', w: 10, count: [10, 25] },
    { id: 'elec_harddrive', w: 8, count: [1, 1] },
    { cat: 'weapon', w: 6, count: [1, 1] },
    { id: 'col_bitcoin', w: 4, count: [1, 1], minTier: 3 },
    { id: 'col_painting', w: 1, count: [1, 1], minTier: 4 },
  ] },
  military_crate: { rolls: [2, 4], entries: [
    { cat: 'ammo', w: 40, count: [10, 30] },
    { cat: 'weapon', w: 14, count: [1, 1] },
    { cat: 'armor', w: 12, count: [1, 1] },
    { cat: 'grenade', w: 10, count: [1, 2] },
    { cat: 'medical', w: 10, count: [1, 1] },
    { id: 'food_mre', w: 8, count: [1, 2] },
    { id: 'mat_gunpowder', w: 8, count: [1, 3] },
    { cat: 'backpack', w: 4, count: [1, 1], minTier: 2 },
    { id: 'col_dogtags', w: 5, count: [1, 2] },
    { id: 'elec_radio', w: 4, count: [1, 1], minTier: 2 },
  ] },
  toolbox: { rolls: [1, 3], entries: [
    { cat: 'material', w: 40, count: [1, 3] },
    { cat: 'tool', w: 35, count: [1, 1] },
    { cat: 'electronics', w: 15, count: [1, 2] },
    { id: 'mat_fuel', w: 5, count: [1, 1], minTier: 2 },
    { id: 'mat_gunpowder', w: 5, count: [1, 2] },
  ] },
  weapon_rack: { rolls: [1, 2], entries: [
    { cat: 'weapon', w: 55, count: [1, 1] },
    { cat: 'ammo', w: 35, count: [10, 30] },
    { cat: 'grenade', w: 10, count: [1, 2] },
  ] },
  server_rack: { rolls: [1, 2], entries: [
    { cat: 'electronics', w: 60, count: [1, 2] },
    { id: 'elec_harddrive', w: 25, count: [1, 2] },
    { id: 'elec_circuit', w: 20, count: [1, 2] },
    { id: 'elec_radio', w: 6, count: [1, 1] },
    { id: 'col_bitcoin', w: 3, count: [1, 1], minTier: 3 },
  ] },
  lab_cabinet: { rolls: [1, 3], entries: [
    { id: 'mat_chemicals', w: 30, count: [1, 3] },
    { cat: 'medical', w: 30, count: [1, 2] },
    { id: 'med_antitoxin', w: 15, count: [1, 2] },
    { cat: 'electronics', w: 10, count: [1, 1] },
    { id: 'water_purified', w: 8, count: [1, 1] },
    { id: 'med_adrenaline', w: 8, count: [1, 1], minTier: 3 },
  ] },
  body: { rolls: [1, 2], entries: [
    { cat: 'ammo', w: 20, count: [5, 20] },
    { cat: 'medical', w: 15, count: [1, 1] },
    { cat: 'food', w: 12, count: [1, 1] },
    { cat: 'water', w: 12, count: [1, 1] },
    { cat: 'collectible', w: 12, count: [1, 1] },
    { cat: 'material', w: 10, count: [1, 2] },
    { id: 'col_dogtags', w: 10, count: [1, 1] },
    { cat: 'weapon', w: 6, count: [1, 1] },
  ] },
  floor: { rolls: [1, 1], entries: [
    { cat: 'material', w: 25, count: [1, 2] },
    { cat: 'ammo', w: 20, count: [5, 15] },
    { cat: 'food', w: 12, count: [1, 1] },
    { cat: 'water', w: 12, count: [1, 1] },
    { cat: 'medical', w: 10, count: [1, 1] },
    { cat: 'electronics', w: 8, count: [1, 1] },
    { cat: 'collectible', w: 6, count: [1, 1] },
    { cat: 'tool', w: 5, count: [1, 1] },
    { cat: 'weapon', w: 3, count: [1, 1], minTier: 2 },
    { cat: 'grenade', w: 2, count: [1, 1] },
  ] },
  zombie: { rolls: [1, 1], entries: [
    { cat: 'ammo', w: 30, count: [5, 15] },
    { cat: 'medical', w: 12, count: [1, 1] },
    { id: 'med_bandage', w: 6, count: [1, 1] },
    { cat: 'food', w: 12, count: [1, 1] },
    { cat: 'water', w: 10, count: [1, 1] },
    { cat: 'material', w: 15, count: [1, 2] },
    { cat: 'collectible', w: 10, count: [1, 1] },
    { id: 'col_dogtags', w: 8, count: [1, 1] },
  ] },
};

// ───────────────────────────── XP and economy ─────────────────────────────
const MAX_LEVEL = 30;

function xpForLevel(level) {
  let l = Math.floor(Number(level));
  if (!Number.isFinite(l) || l < 1) l = 1;
  const n = l - 1;
  return 60 * n * n + 140 * n;
}

function levelFromXp(xp) {
  const v = Number(xp);
  if (!Number.isFinite(v) || v <= 0) return 1;
  let level = 1;
  for (let i = 0; i < MAX_LEVEL && level < MAX_LEVEL; i++) {
    if (v >= xpForLevel(level + 1)) level++;
    else break;
  }
  return level;
}

const XP_REWARDS = { extraction: 60, perLootValue: 0.08, missionBase: 0 };

const ECONOMY = {
  sellMul: 0.45, buyMul: 1.5, traderSellBonus: 0.08, traderBuyDiscount: 0.07,
  repairCostMul: 0.35, overflowSellMul: 0.6, healCostPerHp: 3,
};

const SECURE_SLOTS_BASE = 1;
const CARRY_BASE = 30;        // kg
const STASH_SLOTS_BASE = 24;
const START_CREDITS = 800;
