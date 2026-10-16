// 15_missions.js — MissionSystem: availability, accept/abandon, hand-in, rewards (base side) and objective tracking,
// persistence rule §16.1, HUD lines (raid side) (SPEC §16).
// Dependencies: 00_util.js, 01/03/04 data, 10_items_inventory.js, 19_progression.js; game.profileMgr at runtime.

const MS_POI_NAMES = { crash_site: 'Absturzstelle', radio_tower: 'Funkturm', lab_entrance: 'Laboreingang', mass_grave: 'Massengrab', boss_arena: 'Versuchshalle',
  supply_drop: 'Abwurfstelle', checkpoint: 'Kontrollpunkt', server_room: 'Serverraum', water_tower: 'Wasserturm', generator: 'Generator' };

class MissionSystem {
  constructor(game) {
    this.game = game || null;
  }
  static allObjectives(def) { return [...(def.objectives || []), ...(def.optional || [])]; }

  // ---------------- base side ----------------
  _m(profile) {
    if (!profile.missions || typeof profile.missions !== 'object') profile.missions = { active: [], completed: [], progress: {} };
    const m = profile.missions;
    if (!Array.isArray(m.active)) m.active = [];
    if (!Array.isArray(m.completed)) m.completed = [];
    if (!m.progress || typeof m.progress !== 'object') m.progress = {};
    return m;
  }
  _level(profile) { return Progression.levelFromXp(profile.xp || 0); }
  _mapUnlocked(profile, mapId) {
    const lvl = this._level(profile);
    const radio = (profile.upgrades && profile.upgrades.radio) || 0;
    return Progression.unlockedMapsFor(lvl, radio).includes(mapId);
  }
  availableFor(profile) {
    if (!profile || typeof MISSIONS === 'undefined') return [];
    const m = this._m(profile);
    const done = new Set(m.completed);
    const lvl = this._level(profile);
    return MISSIONS.filter(def => {
      if (m.active.includes(def.id)) return false;
      if (done.has(def.id) && !def.repeatable) return false;
      if ((def.unlockedBy || []).some(id => !done.has(id))) return false;
      if ((def.requiresLevel || 1) > lvl) return false;
      return this._mapUnlocked(profile, def.mapId);
    });
  }
  lockedFor(profile) {
    // missions not yet available, with the German reason (radio screen preview)
    if (!profile || typeof MISSIONS === 'undefined') return [];
    const m = this._m(profile);
    const done = new Set(m.completed);
    const lvl = this._level(profile);
    const out = [];
    for (const def of MISSIONS) {
      if (m.active.includes(def.id) || (done.has(def.id) && !def.repeatable)) continue;
      const missing = (def.unlockedBy || []).filter(id => !done.has(id));
      let reason = null;
      if (missing.length) reason = 'Voraussetzung: ' + missing.map(id => (MISSION_BY_ID[id] || {}).title || id).join(', ');
      else if ((def.requiresLevel || 1) > lvl) reason = 'Ab Stufe ' + def.requiresLevel;
      else if (!this._mapUnlocked(profile, def.mapId)) reason = 'Gebiet gesperrt';
      if (reason) out.push({ def, reason });
    }
    return out;
  }
  active(profile) {
    if (!profile) return [];
    return this._m(profile).active.map(id => MISSION_BY_ID[id]).filter(Boolean);
  }
  maxActive(profile) { return 1 + ((profile && profile.upgrades && profile.upgrades.radio) || 0); }
  completed(profile) { return profile ? this._m(profile).completed.slice() : []; }
  accept(profile, missionId) {
    if (!profile) return { ok: false, reason: 'Kein Spielstand' };
    const def = MISSION_BY_ID[missionId];
    if (!def) return { ok: false, reason: 'Unbekannter Auftrag' };
    const m = this._m(profile);
    if (m.active.includes(missionId)) return { ok: false, reason: 'Bereits angenommen' };
    if (m.active.length >= this.maxActive(profile)) return { ok: false, reason: 'Maximal ' + this.maxActive(profile) + ' aktive Aufträge (Funkstation ausbauen)' };
    if (!this.availableFor(profile).some(d => d.id === missionId)) return { ok: false, reason: 'Auftrag nicht verfügbar' };
    m.active.push(missionId);
    m.progress[missionId] = m.progress[missionId] || {};
    return { ok: true, reason: null };
  }
  abandon(profile, missionId) {
    if (!profile) return false;
    const m = this._m(profile);
    const i = m.active.indexOf(missionId);
    if (i < 0) return false;
    m.active.splice(i, 1);
    delete m.progress[missionId];
    return true;
  }
  _stash(profile) {
    const pm = this.game && this.game.profileMgr;
    if (pm && pm.profile === profile && pm.stash) return pm.stash;
    return profile.stash && typeof profile.stash.count === 'function' ? profile.stash : null;
  }
  progressOf(profile, missionId) {
    const def = MISSION_BY_ID[missionId];
    if (!def || !profile) return { objectives: [], optional: [], done: false };
    const prog = this._m(profile).progress[missionId] || {};
    const map = (o) => {
      const progress = Math.min(o.count || 1, prog[o.id] || 0);
      return { def: o, progress, done: progress >= (o.count || 1) };
    };
    const objectives = (def.objectives || []).map(map);
    const optional = (def.optional || []).map(map);
    return { objectives: [...objectives, ...optional], required: objectives, optional, done: objectives.every(o => o.done) };
  }
  canHandIn(profile, missionId, objId) {
    const def = MISSION_BY_ID[missionId];
    if (!def || !profile || !this._m(profile).active.includes(missionId)) return false;
    const o = MissionSystem.allObjectives(def).find(x => x.id === objId);
    if (!o || o.type !== 'collect') return false;
    const prog = this._m(profile).progress[missionId] || {};
    const need = (o.count || 1) - (prog[o.id] || 0);
    if (need <= 0) return false;
    const stash = this._stash(profile);
    return !!stash && stash.count(o.target) >= need;
  }
  handIn(profile, missionId, objId) {
    if (!this.canHandIn(profile, missionId, objId)) return { ok: false, reason: 'Gegenstände fehlen im Lager' };
    const def = MISSION_BY_ID[missionId];
    const o = MissionSystem.allObjectives(def).find(x => x.id === objId);
    const m = this._m(profile);
    const prog = m.progress[missionId] = m.progress[missionId] || {};
    const need = (o.count || 1) - (prog[o.id] || 0);
    this._stash(profile).removeById(o.target, need);
    prog[o.id] = o.count || 1;
    const audio = this.game && this.game.audio;
    if (audio) audio.play('objective');
    let completed = false, rewards = null;
    if ((def.objectives || []).every(x => (prog[x.id] || 0) >= (x.count || 1))) {
      const optDone = (def.optional || []).length > 0 && def.optional.every(x => (prog[x.id] || 0) >= (x.count || 1));
      rewards = this._complete(profile, def, optDone);
      completed = true;
    }
    return { ok: true, completed, rewards };
  }
  _complete(profile, def, withOptional) {
    const m = this._m(profile);
    m.active = m.active.filter(id => id !== def.id);
    if (!m.completed.includes(def.id)) m.completed.push(def.id);
    delete m.progress[def.id];
    return this.grantRewards(profile, def, withOptional);
  }
  grantRewards(profile, missionDef, withOptional) {
    const r = missionDef.rewards || {};
    const o = withOptional ? (missionDef.optionalRewards || {}) : {};
    const credits = (r.credits || 0) + (o.credits || 0);
    const xp = (r.xp || 0) + (o.xp || 0);
    const items = [];
    profile.credits = (profile.credits || 0) + credits;
    if (profile.stats) profile.stats.creditsEarned = (profile.stats.creditsEarned || 0) + credits;
    const pm = this.game && this.game.profileMgr;
    const stash = this._stash(profile);
    for (const it of r.items || []) {
      const inst = Items.create(it.id, it.count || 1);
      if (!inst) continue;
      items.push({ id: it.id, count: it.count || 1 });
      if (stash) {
        const res = stash.add(inst);
        if (res.remaining) {
          const credit = Math.max(1, Math.round(Items.value(res.remaining) * (ECONOMY.overflowSellMul || 0.6)));
          profile.credits += credit;
        }
      }
    }
    if (pm && pm.profile === profile) pm.addXp(xp);
    else profile.xp = (profile.xp || 0) + xp;
    if (profile.stats) profile.stats.missionsCompleted = (profile.stats.missionsCompleted || 0) + 1;
    if (this.game && this.game.events) this.game.events.emit('missionComplete', { mission: missionDef, rewards: { credits, xp, items } });
    const audio = this.game && this.game.audio;
    if (audio) audio.play('mission_complete');
    return { credits, xp, items };
  }

  static validate() {
    const problems = [];
    if (typeof MISSIONS === 'undefined') return { ok: false, problems: ['MISSIONS fehlt'] };
    const buildingTypes = ['house', 'apartment', 'shop', 'supermarket', 'pharmacy', 'garage', 'barracks', 'armory', 'warehouse', 'checkpoint', 'hq', 'factory', 'workshop', 'storage', 'office', 'lab', 'security', 'medical', 'server', 'bunker'];
    const containerTypes = typeof CONTAINER_NAMES !== 'undefined' ? Object.keys(CONTAINER_NAMES) : ['crate', 'locker', 'fridge', 'desk', 'medcabinet', 'safe', 'military_crate', 'toolbox', 'weapon_rack', 'server_rack', 'lab_cabinet', 'body'];
    const poiTypes = Object.keys(MS_POI_NAMES);
    const ids = new Set(MISSIONS.map(m => m.id));
    for (const m of MISSIONS) {
      const map = MAPS[m.mapId];
      if (!map) problems.push(m.id + ': unbekannte Karte ' + m.mapId);
      for (const u of m.unlockedBy || []) if (!ids.has(u)) problems.push(m.id + ': unbekannte Voraussetzung ' + u);
      const oids = new Set();
      for (const o of MissionSystem.allObjectives(m)) {
        if (oids.has(o.id)) problems.push(m.id + ': doppelte Ziel-ID ' + o.id);
        oids.add(o.id);
        if (!(o.count >= 1)) problems.push(m.id + '/' + o.id + ': count < 1');
        const t = o.target;
        let ok = true;
        switch (o.type) {
          case 'collect': case 'retrieve': case 'find_key': ok = !!ITEMS[t]; break;
          case 'kill': ok = t === 'any' || !!ZOMBIE_TYPES[t]; break;
          case 'kill_boss': ok = !!(map && map.boss); break;
          case 'search': ok = buildingTypes.includes(t) || containerTypes.includes(t); break;
          case 'investigate': ok = poiTypes.includes(t); break;
          case 'generator': ok = t === 'generator'; break;
          case 'extract_at': ok = !!(map && (map.extractions || []).some(e => e.id === t)); break;
          case 'rescue_medical': ok = t === 'medical'; break;
          default: ok = false;
        }
        if (!ok) problems.push(m.id + '/' + o.id + ': ungültiges Ziel ' + o.type + ':' + t);
      }
      for (const it of (m.rewards && m.rewards.items) || []) if (!ITEMS[it.id]) problems.push(m.id + ': unbekannte Belohnung ' + it.id);
    }
    return { ok: problems.length === 0, problems };
  }

  // ---------------- raid side ----------------
  startRaid(raid, missionDefs) {
    const profile = this.game && this.game.profileMgr ? this.game.profileMgr.profile : null;
    const prog = profile ? this._m(profile).progress : {};
    raid.missionStates = (missionDefs || []).filter(Boolean).map(def => {
      const p = prog[def.id] || {};
      const mk = (o, optional) => ({ def: o, progress: Math.min(o.count || 1, p[o.id] || 0), done: (p[o.id] || 0) >= (o.count || 1), optional });
      const st = { def, objectives: (def.objectives || []).map(o => mk(o, false)), optional: (def.optional || []).map(o => mk(o, true)), done: false, optionalDone: false };
      return st;
    });
    if (raid.events) {
      for (const name of ['kill', 'containerOpened', 'itemPicked', 'poiReached', 'generatorOn', 'bossDead', 'extracted']) {
        raid.events.on(name, (data) => this.onEvent(raid, name, data));
      }
    }
    return raid.missionStates;
  }

  _advance(raid, st, o, amount, absolute = false) {
    if (o.done) return;
    const before = o.progress;
    o.progress = Math.min(o.def.count || 1, absolute ? Math.max(o.progress, amount) : o.progress + amount);
    if (o.progress >= (o.def.count || 1)) {
      o.done = true;
      if (raid.events) raid.events.emit('objectiveComplete', { mission: st.def, objective: o.def });
      const ui = raid.game && raid.game.ui;
      if (ui) ui.toast('Ziel erfüllt: ' + o.def.text, 'success', 3000);
      const audio = raid.game && raid.game.audio;
      if (audio) audio.play('objective');
      st.done = st.objectives.every(x => x.done);
      st.optionalDone = st.optional.length > 0 && st.optional.every(x => x.done);
    } else if (o.progress !== before && raid.game && raid.game.ui && ['kill', 'search'].includes(o.def.type)) {
      raid.game.ui.toast(o.def.text + ' (' + o.progress + '/' + (o.def.count || 1) + ')', 'info', 1500);
    }
  }

  onEvent(raid, name, data) {
    for (const st of raid.missionStates || []) {
      for (const o of [...st.objectives, ...st.optional]) {
        if (o.done) continue;
        const d = o.def;
        if (name === 'kill' && d.type === 'kill' && data && data.zombie) {
          if (d.target === 'any' || d.target === data.zombie.id) this._advance(raid, st, o, 1);
        } else if (name === 'containerOpened' && d.type === 'search' && data && data.container) {
          const c = data.container;
          if (c.buildingType === d.target || c.type === d.target) this._advance(raid, st, o, 1);
        } else if (name === 'itemPicked' && d.type === 'find_key' && data && data.inst && data.inst.id === d.target) {
          this._advance(raid, st, o, 1);
        } else if (name === 'poiReached' && d.type === 'investigate' && data && data.poi && data.poi.type === d.target) {
          this._advance(raid, st, o, 1);
        } else if (name === 'generatorOn' && d.type === 'generator') {
          this._advance(raid, st, o, 1);
        } else if (name === 'bossDead' && d.type === 'kill_boss') {
          this._advance(raid, st, o, 1);
        } else if (name === 'extracted' && data) {
          if (d.type === 'extract_at' && data.extractionId === d.target) this._advance(raid, st, o, 1);
          else if (d.type === 'retrieve' || d.type === 'collect' || d.type === 'rescue_medical') {
            const invs = [data.inventory, data.secure].filter(Boolean);
            let n = 0;
            for (const inv of invs) for (const it of inv.all()) {
              if (!it.raidFound) continue;
              if (d.type === 'rescue_medical') { const def = Items.def(it); if (def && def.cat === 'medical') n += it.count; }
              else if (it.id === d.target) n += it.count;
            }
            if (n > 0) this._advance(raid, st, o, Math.min(n, (d.count || 1) - o.progress));
          }
        }
      }
    }
  }

  _consume(invs, id, count, catMedical) {
    let need = count;
    for (const inv of invs) {
      for (let i = inv.slots - 1; i >= 0 && need > 0; i--) {
        const it = inv.items[i];
        if (!it || !it.raidFound) continue;
        if (catMedical) { const d = Items.def(it); if (!d || d.cat !== 'medical') continue; }
        else if (it.id !== id) continue;
        const take = Math.min(need, it.count);
        it.count -= take; need -= take;
        if (it.count <= 0) inv.items[i] = null;
      }
    }
  }

  finalizeOnExtract(raid, profile) {
    const res = { completed: [], objectivesDone: 0, rewards: { credits: 0, xp: 0, items: [] }, failed: [] };
    if (!profile) return res;
    const m = this._m(profile);
    const persistTypes = ['kill', 'search', 'investigate', 'generator', 'find_key', 'kill_boss'];
    const pm = this.game && this.game.profileMgr;
    const invs = [];
    if (pm && pm.stash) invs.push(pm.stash);
    for (const st of raid.missionStates || []) {
      const id = st.def.id;
      if (!m.active.includes(id)) continue;
      const prog = m.progress[id] = m.progress[id] || {};
      for (const o of [...st.objectives, ...st.optional]) {
        if (persistTypes.includes(o.def.type)) prog[o.def.id] = Math.max(prog[o.def.id] || 0, o.progress);
        else if (o.done) prog[o.def.id] = o.def.count || 1;
        if (o.done) res.objectivesDone++;
      }
      const allDone = (st.def.objectives || []).every(o => (prog[o.id] || 0) >= (o.count || 1));
      if (allDone) {
        // consume delivered retrieve / collect / medical items from the stash (they were moved there by applyRaidResult)
        for (const o of st.objectives.concat(st.optional)) {
          if (!o.done) continue;
          if (o.def.type === 'retrieve' || o.def.type === 'collect') this._consume(invs, o.def.target, o.def.count || 1, false);
          else if (o.def.type === 'rescue_medical') this._consume(invs, null, o.def.count || 1, true);
        }
        const optDone = (st.def.optional || []).length > 0 && st.def.optional.every(o => (prog[o.id] || 0) >= (o.count || 1));
        const r = this._complete(profile, st.def, optDone);
        res.completed.push(st.def);
        res.rewards.credits += r.credits; res.rewards.xp += r.xp; res.rewards.items.push(...r.items);
      }
    }
    return res;
  }

  finalizeOnDeath(raid, profile) {
    const res = { completed: [], objectivesDone: 0, rewards: { credits: 0, xp: 0, items: [] }, failed: [] };
    if (!profile) return res;
    const m = this._m(profile);
    for (const st of raid.missionStates || []) if (m.active.includes(st.def.id)) res.failed.push(st.def);
    if (profile.stats) profile.stats.missionsFailed = (profile.stats.missionsFailed || 0) + res.failed.length;
    return res;
  }

  hudLines(raid) {
    const out = [];
    for (const st of raid.missionStates || []) {
      for (const o of st.objectives) out.push({ text: o.def.text + ((o.def.count || 1) > 1 ? ' (' + o.progress + '/' + o.def.count + ')' : ''), done: o.done, optional: false, mission: st.def.title });
      for (const o of st.optional) out.push({ text: o.def.text + ((o.def.count || 1) > 1 ? ' (' + o.progress + '/' + o.def.count + ')' : ''), done: o.done, optional: true, mission: st.def.title });
    }
    return out;
  }
}
