// 19_progression.js — Progression helpers (levels, map unlocks, ranks) and achievements (SPEC §20).
// Dependencies: 00_util.js, 03_data_maps.js (MAPS, MAP_ORDER), 04_data_meta.js (xpForLevel, levelFromXp, MAX_LEVEL).

const MAP_UNLOCKS = { city: 1, industrial: 3, military: 5, research: 8 };

class Progression {
  static levelFromXp(xp) { return typeof levelFromXp === 'function' ? levelFromXp(xp) : 1; }
  static xpForLevel(l) { return typeof xpForLevel === 'function' ? xpForLevel(l) : 0; }
  static progress(xp) {
    const level = Progression.levelFromXp(xp);
    const max = typeof MAX_LEVEL !== 'undefined' ? MAX_LEVEL : 30;
    const base = Progression.xpForLevel(level);
    const nextTotal = level >= max ? base : Progression.xpForLevel(level + 1);
    const cur = Math.max(0, (xp || 0) - base);
    const next = Math.max(1, nextTotal - base);
    return { level, cur, next, pct: level >= max ? 1 : clamp(cur / next, 0, 1) };
  }
  static unlockedMapsFor(level, radioLevel) {
    const order = typeof MAP_ORDER !== 'undefined' ? MAP_ORDER : Object.keys(MAP_UNLOCKS);
    return order.filter(id => {
      const m = typeof MAPS !== 'undefined' ? MAPS[id] : null;
      const unlock = m && Number.isFinite(m.unlockLevel) ? m.unlockLevel : (MAP_UNLOCKS[id] || 1);
      const radio = m && Number.isFinite(m.radioUnlock) ? m.radioUnlock : 0;
      return level >= unlock || (radio > 0 && (radioLevel || 0) >= radio);
    });
  }
  static rankTitle(level) {
    const ranks = [[1, 'Rekrut'], [3, 'Plünderer'], [5, 'Späher'], [8, 'Überlebender'], [11, 'Veteran'], [15, 'Jäger'], [19, 'Kommandant'], [24, 'Legende der Zone']];
    let t = ranks[0][1];
    for (const [l, name] of ranks) if (level >= l) t = name;
    return t;
  }
}

const ACHIEVEMENTS = [
  { id: 'first_extract', name: 'Lebend raus', desc: 'Schließe deine erste Extraktion ab.', check: p => (p.stats.extractions || 0) >= 1 },
  { id: 'extract_10', name: 'Routinier', desc: 'Extrahiere zehnmal erfolgreich.', check: p => (p.stats.extractions || 0) >= 10 },
  { id: 'kills_50', name: 'Säuberung', desc: 'Erledige insgesamt 50 Zombies.', check: p => (p.stats.kills || 0) >= 50 },
  { id: 'kills_500', name: 'Schlächter', desc: 'Erledige insgesamt 500 Zombies.', check: p => (p.stats.kills || 0) >= 500 },
  { id: 'boss', name: 'Wirtswechsel', desc: 'Besiege den Wirt in der Forschungsanlage.', check: p => ((p.stats.killsByType || {}).boss || 0) >= 1 },
  { id: 'rich', name: 'Gut betucht', desc: 'Besitze 20.000 CR auf einmal.', check: p => (p.credits || 0) >= 20000 },
  { id: 'loot_big', name: 'Großer Fang', desc: 'Extrahiere Beute im Wert von 5.000 CR in einem Einsatz.', check: p => (p.stats.bestRaidValue || 0) >= 5000 },
  { id: 'missions_5', name: 'Zuverlässig', desc: 'Schließe fünf Aufträge ab.', check: p => (p.stats.missionsCompleted || 0) >= 5 },
  { id: 'missions_20', name: 'Funkstimme', desc: 'Schließe zwanzig Aufträge ab.', check: p => (p.stats.missionsCompleted || 0) >= 20 },
  { id: 'crafter', name: 'Tüftler', desc: 'Stelle zehn Gegenstände her.', check: p => (p.stats.itemsCrafted || 0) >= 10 },
  { id: 'builder', name: 'Bauherr', desc: 'Kaufe fünf Basisverbesserungen.', check: p => (p.stats.upgradesBought || 0) >= 5 },
  { id: 'all_maps', name: 'Kartograf', desc: 'Schalte alle vier Gebiete frei.', check: p => Array.isArray(p.unlockedMaps) && p.unlockedMaps.length >= 4 },
  { id: 'level_10', name: 'Erfahren', desc: 'Erreiche Stufe 10.', check: p => (p.level || 1) >= 10 },
  { id: 'sharpshooter', name: 'Scharfschütze', desc: 'Erreiche über 500 Schüsse eine Trefferquote von 60 %.', check: p => (p.stats.shotsFired || 0) >= 500 && (p.stats.shotsHit || 0) / Math.max(1, p.stats.shotsFired) >= 0.6 },
  { id: 'scavenger', name: 'Aasgeier', desc: 'Durchsuche 200 Behälter.', check: p => (p.stats.containersOpened || 0) >= 200 },
];

function evaluateAchievements(profile) {
  if (!profile || !profile.stats) return [];
  if (!Array.isArray(profile.stats.achievements)) profile.stats.achievements = [];
  const have = new Set(profile.stats.achievements);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    let ok = false;
    try { ok = !!a.check(profile); } catch (e) { ok = false; }
    if (ok && !have.has(a.id)) { profile.stats.achievements.push(a.id); fresh.push(a.id); }
  }
  return fresh;
}
