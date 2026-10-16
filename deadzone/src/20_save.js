// 20_save.js — SaveSystem: versioned localStorage saves with backup, validation on load, settings, export/import,
// raid-in-progress marker (SPEC §21). Every localStorage access is wrapped in try/catch; corruption → Log.warn.
// Dependencies: 00_util.js, 18_profile.js (ProfileManager.validate, DEFAULT_SETTINGS).

class SaveSystem {
  constructor(game) { this.game = game || null; }
  static get KEY() { return 'deadzone_save_v1'; }
  static get SETTINGS_KEY() { return 'deadzone_settings_v1'; }
  static get BACKUP_KEY() { return 'deadzone_save_backup'; }

  _ls() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }
  available() {
    try {
      const ls = this._ls();
      if (!ls) return false;
      ls.setItem('deadzone_probe', '1');
      ls.removeItem('deadzone_probe');
      return true;
    } catch (e) { return false; }
  }
  _get(key) { try { const ls = this._ls(); return ls ? ls.getItem(key) : null; } catch (e) { return null; } }
  _set(key, v) { try { const ls = this._ls(); if (!ls) return false; ls.setItem(key, v); return true; } catch (e) { Log.warn('Speichern fehlgeschlagen:', e && e.message); return false; } }
  _del(key) { try { const ls = this._ls(); if (ls) ls.removeItem(key); } catch (e) { /* ignore */ } }

  hasSave() {
    const raw = this._get(SaveSystem.KEY);
    if (!raw) return false;
    try { const o = JSON.parse(raw); return !!o && typeof o === 'object'; } catch (e) { return false; }
  }

  _plain(profile) {
    if (!profile) return null;
    const pl = (v) => (v && typeof v.serialize === 'function' ? v.serialize() : v);
    const out = Object.assign({}, profile, { stash: pl(profile.stash), loadout: pl(profile.loadout), secure: pl(profile.secure), equipment: pl(profile.equipment) });
    return JSON.parse(JSON.stringify(out));
  }

  save(profile) {
    if (!profile) return false;
    let plain;
    try { plain = this._plain(profile); } catch (e) { Log.warn('Spielstand konnte nicht serialisiert werden'); return false; }
    plain.lastSaved = Date.now();
    if (profile && typeof profile === 'object' && !Array.isArray(profile)) { try { profile.lastSaved = plain.lastSaved; } catch (e) { /* ignore */ } }
    const prev = this._get(SaveSystem.KEY);
    if (prev) {
      try {
        const o = JSON.parse(prev);
        if (o && ProfileManager.validate(o.profile).ok) this._set(SaveSystem.BACKUP_KEY, prev);
      } catch (e) { /* previous save corrupt: keep the old backup */ }
    }
    return this._set(SaveSystem.KEY, JSON.stringify({ version: SAVE_VERSION, savedAt: plain.lastSaved, profile: plain }));
  }

  _tryParse(raw) {
    if (!raw) return { ok: false, error: 'Kein Spielstand vorhanden' };
    let o;
    try { o = JSON.parse(raw); } catch (e) { return { ok: false, error: 'Spielstand beschädigt' }; }
    if (!o || typeof o !== 'object') return { ok: false, error: 'Spielstand beschädigt' };
    const p = o.profile && typeof o.profile === 'object' ? o.profile : o;
    const v = ProfileManager.validate(p);
    if (!v.ok) return { ok: false, error: v.error || 'Spielstand ungültig' };
    return { ok: true, profile: v.profile, repaired: v.repaired };
  }

  load() {
    const main = this._tryParse(this._get(SaveSystem.KEY));
    if (main.ok) return { ok: true, profile: main.profile, repaired: main.repaired || [], error: null };
    if (this._get(SaveSystem.KEY)) Log.warn('Spielstand beschädigt, versuche Sicherung:', main.error);
    const bak = this._tryParse(this._get(SaveSystem.BACKUP_KEY));
    if (bak.ok) return { ok: true, profile: bak.profile, repaired: ['Spielstand war beschädigt – Sicherung geladen', ...(bak.repaired || [])], error: null };
    return { ok: false, profile: null, repaired: [], error: main.error || 'Kein Spielstand' };
  }

  reset() { this._del(SaveSystem.KEY); this._del(SaveSystem.BACKUP_KEY); }

  saveSettings(settings) {
    try { return this._set(SaveSystem.SETTINGS_KEY, JSON.stringify(settings || {})); } catch (e) { return false; }
  }
  loadSettings() {
    const out = Object.assign({}, DEFAULT_SETTINGS);
    const raw = this._get(SaveSystem.SETTINGS_KEY);
    if (!raw) return out;
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        for (const k of Object.keys(DEFAULT_SETTINGS)) if (o[k] !== undefined && typeof o[k] === typeof DEFAULT_SETTINGS[k]) out[k] = o[k];
        for (const k of ['master', 'sfx', 'music']) out[k] = clamp(Number(out[k]) || 0, 0, 1);
        if (!['auto', 'on', 'off'].includes(out.touchControls)) out.touchControls = 'auto';
        if (!['low', 'medium', 'high'].includes(out.quality)) out.quality = 'high';
      }
    } catch (e) { Log.warn('Einstellungen beschädigt – Standardwerte'); }
    return out;
  }

  exportString() {
    const raw = this._get(SaveSystem.KEY);
    if (!raw) return null;
    try { return btoa(unescape(encodeURIComponent(raw))); } catch (e) { return null; }
  }
  importString(str) {
    if (typeof str !== 'string' || !str.trim()) return { ok: false, error: 'Kein Text eingefügt' };
    let raw;
    try { raw = decodeURIComponent(escape(atob(str.trim()))); } catch (e) { return { ok: false, error: 'Text ist kein gültiger Export' }; }
    const t = this._tryParse(raw);
    if (!t.ok) return { ok: false, error: t.error };
    const prev = this._get(SaveSystem.KEY);
    if (prev) this._set(SaveSystem.BACKUP_KEY, prev);
    this._set(SaveSystem.KEY, JSON.stringify({ version: SAVE_VERSION, savedAt: Date.now(), profile: t.profile }));
    return { ok: true, error: null };
  }

  markRaidStart(profile, info) {
    if (!profile) return false;
    profile.raidInProgress = { mapId: info.mapId, missionIds: (info.missionIds || []).slice(), seed: info.seed, startedAt: info.startedAt || Date.now() };
    return this.save(profile);
  }
  clearRaid(profile) { if (profile) profile.raidInProgress = null; }
}
