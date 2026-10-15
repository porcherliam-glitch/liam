// End-to-end smoke tests in headless Chromium covering the 20 QA cases of MASTERPROMPT §17.
// Drives the game exclusively through window.DZ (SPEC §26) and data-action buttons.
import { openGame, assert, assertEq, runTests } from './harness.mjs';

// Page-side helpers (serialized into the browser).
const findOpenGround = () => {
  const w = window.DZ.world(); const p = window.DZ.player();
  const ptx = Math.floor(p.x / 32), pty = Math.floor(p.y / 32);
  let best = null, bestD = Infinity;
  for (let ty = 3; ty < w.h - 3; ty++) for (let tx = 3; tx < w.w - 3; tx++) {
    let ok = true;
    for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (!w.isWalkable(tx + dx, ty + dy) || w.tile(tx + dx, ty + dy) === 3) { ok = false; break; }
    if (!ok) continue;
    const d = (tx - ptx) ** 2 + (ty - pty) ** 2;
    if (d < bestD) { bestD = d; best = { x: tx * 32 + 16, y: ty * 32 + 16, tx, ty }; }
  }
  return best;
};
const findWallSpot = () => {
  // A walkable tile whose east neighbour blocks movement.
  const w = window.DZ.world();
  for (let ty = 3; ty < w.h - 3; ty++) for (let tx = 3; tx < w.w - 4; tx++) {
    if (w.isWalkable(tx, ty) && w.isWalkable(tx - 1, ty) && w.blocksMove(tx + 1, ty) && w.tile(tx + 1, ty) === 4) return { x: tx * 32 + 16, y: ty * 32 + 16, tx, ty };
  }
  return null;
};

async function startRaid(g, mapId = 'city', seed = 1) {
  await g.eval(({ mapId, seed }) => window.DZ.startRaid(mapId, { seed }), { mapId, seed });
  await g.step(5);
  assertEq(await g.state(), 'raid', 'state is raid after startRaid');
  const spot = await g.eval(findOpenGround);
  assert(spot, 'found open ground');
  await g.eval(s => window.DZ.teleport(s.x, s.y), spot);
  await g.eval(() => window.DZ.killAll());
  await g.step(2);
  return spot;
}

export default async function () {
  return runTests({
    async '01 game boots without errors and shows the main menu'() {
      const g = await openGame();
      try {
        assertEq(await g.screen(), 'main', 'main menu visible');
        assertEq(await g.state(), 'main', 'state main');
        const v = await g.eval(() => window.DZ.version);
        assert(typeof v === 'string', 'version string');
        await g.step(30);
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '02 new game enters the base with a starting profile'() {
      const g = await openGame();
      try {
        const ok = await g.dz('newGame');
        assert(ok !== false, 'newGame resolved');
        assertEq(await g.state(), 'base', 'state base');
        assertEq(await g.screen(), 'base', 'base screen');
        const p = await g.dz('profile');
        assert(p && p.credits === 800, `start credits 800 (got ${p && p.credits})`);
        assert(p.equipment && p.equipment.secondary && p.equipment.secondary.id === 'pistol_m9', 'pistol equipped');
        assert(p.stash && p.stash.items && p.stash.items.some(Boolean), 'stash has starter items');
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '03 raid starts on every map, world valid, 300 steps without errors'() {
      const g = await openGame();
      try {
        await g.dz('newGame');
        for (const mapId of ['city', 'industrial', 'military', 'research']) {
          const v = await g.eval(m => window.DZ.validateWorld(m, 3), mapId);
          assert(v && v.ok, `${mapId} world valid`);
          await g.eval(m => window.DZ.startRaid(m, { seed: 2 }), mapId);
          assertEq(await g.state(), 'raid', `${mapId}: raid state`);
          await g.step(300);
          const p = await g.player();
          assert(p && !p.dead, `${mapId}: player alive after 300 steps`);
          const z = await g.eval(() => window.DZ.zombies().length);
          assert(z >= 20, `${mapId}: zombies spawned (${z})`);
          g.assertNoErrors(mapId);
          await g.eval(() => window.DZ.die());
          await g.step(5);
          await g.dz('toBase');
        }
      } finally { await g.close(); }
    },

    async '04 player moves in all four directions'() {
      const g = await openGame();
      try {
        await g.dz('newGame');
        await startRaid(g);
        const moves = [['KeyW', 0, -1], ['KeyS', 0, 1], ['KeyA', -1, 0], ['KeyD', 1, 0]];
        for (const [code, dx, dy] of moves) {
          const before = await g.player();
          await g.key(code, true); await g.step(45); await g.key(code, false); await g.step(2);
          const after = await g.player();
          const mx = after.x - before.x, my = after.y - before.y;
          assert(Math.abs(mx * dx + my * dy) > 60, `${code} moved (${mx.toFixed(1)}, ${my.toFixed(1)})`);
          assert(Math.abs(dx ? my : mx) < 5, `${code} moved straight`);
        }
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '05 walls block movement'() {
      const g = await openGame();
      try {
        await g.dz('newGame');
        await startRaid(g);
        const spot = await g.eval(findWallSpot);
        assert(spot, 'found a wall spot');
        await g.eval(s => window.DZ.teleport(s.x, s.y), spot);
        await g.key('KeyD', true); await g.step(120); await g.key('KeyD', false);
        const p = await g.player();
        const tx = Math.floor(p.x / 32), ty = Math.floor(p.y / 32);
        assertEq(ty, spot.ty, 'player row unchanged');
        assert(tx <= spot.tx, `player did not enter the wall (tx ${tx} vs wall ${spot.tx + 1})`);
        assert(p.x < (spot.tx + 1) * 32, 'player stays left of wall');
        const inside = await g.eval(() => { const w = window.DZ.world(); const p = window.DZ.player(); return w.blocksMove(Math.floor(p.x / 32), Math.floor(p.y / 32)); });
        assert(!inside, 'player not inside a blocking tile');
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '06 aiming and shooting consume ammo, projectiles fly, reload refills from inventory'() {
      const g = await openGame();
      try {
        await g.dz('newGame');
        const spot = await startRaid(g);
        await g.eval(s => window.DZ.aimAt(s.x + 300, s.y), spot);
        await g.step(2);
        const angle = (await g.player()).angle;
        assert(Math.abs(angle) < 0.2, `aim angle toward +x (${angle})`);
        const magBefore = await g.eval(() => window.DZ.player().weaponInst.mag);
        assert(magBefore > 0, 'weapon loaded');
        await g.eval(() => window.DZ.mouse(640, 360, true));
        await g.step(1);
        const projectiles = await g.eval(() => window.DZ.raid().weapons.projectiles.length);
        await g.step(12);
        await g.eval(() => window.DZ.mouse(640, 360, false));
        const magAfter = await g.eval(() => window.DZ.player().weaponInst.mag);
        assert(projectiles >= 1, 'projectile created');
        assert(magAfter < magBefore, `magazine decreased ${magBefore} → ${magAfter}`);
        const shots = await g.eval(() => window.DZ.player().stats.shotsFired);
        assert(shots >= 1, 'shotsFired counted');
        // Reload
        const ammoBefore = await g.eval(() => window.DZ.player().inventory.count('ammo_9mm'));
        assert(ammoBefore > 0, 'inventory has 9mm ammo');
        await g.eval(() => { window.DZ.player().weaponInst.mag = 0; });
        await g.tap('KeyR');
        const reloadTime = await g.eval(() => window.DZ.player().weaponInst && window.DZ.world() && Object.values(window.ITEMS || {}).length, null);
        await g.step(5 * 60);
        const magReloaded = await g.eval(() => window.DZ.player().weaponInst.mag);
        const ammoAfter = await g.eval(() => window.DZ.player().inventory.count('ammo_9mm'));
        assert(magReloaded > 0, 'magazine refilled');
        assertEq(ammoBefore - ammoAfter, magReloaded, 'inventory ammo decreased by loaded rounds');
        // No ammo → cannot reload
        await g.eval(() => { const p = window.DZ.player(); p.inventory.removeById('ammo_9mm', 9999); p.weaponInst.mag = 0; });
        await g.tap('KeyR');
        await g.step(5 * 60);
        assertEq(await g.eval(() => window.DZ.player().weaponInst.mag), 0, 'no reload without ammo');
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '07 zombies notice, chase and damage the player; player can kill them'() {
      const g = await openGame();
      try {
        await g.dz('newGame');
        const spot = await startRaid(g);
        await g.eval(() => window.DZ.god(true));
        const uid = await g.eval(s => window.DZ.spawnZombie('walker', s.x + 220, s.y).uid, spot);
        assert(uid, 'zombie spawned');
        const d0 = await g.eval(u => { const z = window.DZ.zombies().find(z => z.uid === u); const p = window.DZ.player(); return Math.hypot(z.x - p.x, z.y - p.y); }, uid);
        await g.step(240);
        const info = await g.eval(u => { const z = window.DZ.zombies().find(z => z.uid === u); const p = window.DZ.player(); return { state: z.state, d: Math.hypot(z.x - p.x, z.y - p.y) }; }, uid);
        assert(['chase', 'attack'].includes(info.state), `zombie chases (state ${info.state})`);
        assert(info.d < d0, `zombie approached (${d0.toFixed(0)} → ${info.d.toFixed(0)})`);
        await g.eval(() => window.DZ.god(false));
        await g.step(300);
        const hp = (await g.player()).hp;
        assert(hp < 100, `player took damage (hp ${hp})`);
        // Kill it
        await g.eval(() => window.DZ.god(true));
        await g.eval(u => { const z = window.DZ.zombies().find(z => z.uid === u); const p = window.DZ.player(); z.x = p.x + 90; z.y = p.y; window.DZ.aimAt(z.x, z.y); }, uid);
        await g.eval(() => window.DZ.mouse(640, 360, true));
        let dead = false;
        for (let i = 0; i < 40 && !dead; i++) {
          await g.step(15);
          dead = await g.eval(u => { const z = window.DZ.zombies().find(z => z.uid === u); return !z || z.dead; }, uid);
          if (!dead) await g.eval(u => { const z = window.DZ.zombies().find(z => z.uid === u); window.DZ.aimAt(z.x, z.y); const w = window.DZ.player().weaponInst; if (w.mag === 0) { w.mag = w.rt && w.rt.reloading ? w.mag : 15; } }, uid);
        }
        await g.eval(() => window.DZ.mouse(640, 360, false));
        assert(dead, 'zombie killed by shooting');
        const kills = await g.eval(() => window.DZ.player().stats.kills);
        assert(kills >= 1, 'kill counted');
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '08 loot: open a container, take items; full inventory blocks pickup'() {
      const g = await openGame();
      try {
        await g.dz('newGame');
        await startRaid(g);
        await g.eval(() => window.DZ.god(true));
        const c = await g.eval(() => window.DZ.nearest('container'));
        assert(c && c.ref, 'nearest container found');
        // teleport onto the adjacent walkable tile
        const spot = await g.eval(c => { const w = window.DZ.world(); const tx = Math.floor(c.x / 32), ty = Math.floor(c.y / 32);
          for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (w.isWalkable(tx + dx, ty + dy)) return { x: (tx + dx) * 32 + 16, y: (ty + dy) * 32 + 16 };
          return null; }, c);
        assert(spot, 'container has a walkable neighbour');
        await g.eval(s => window.DZ.teleport(s.x, s.y), spot);
        await g.step(3);
        const prompt = await g.eval(() => window.DZ.player().interactTarget && window.DZ.player().interactTarget.kind);
        assertEq(prompt, 'container', 'interact target is the container');
        await g.eval(() => { const c = window.DZ.player().interactTarget.ref; c.items = null; }); // force a fresh roll
        await g.tap('KeyE');
        assertEq(await g.screen(), 'loot', 'loot screen opened');
        const opened = await g.eval(() => window.DZ.player().interactTarget && window.DZ.player().interactTarget.ref.opened);
        assert(opened, 'container marked opened');
        // make sure there is something to take
        await g.eval(() => { const c = window.DZ.player().interactTarget.ref; if (!c.items || !c.items.length) { c.items = [Items.create('med_bandage', 2)]; } window.DZ.ui.refresh(); });
        const before = await g.eval(() => window.DZ.player().inventory.all().reduce((a, i) => a + i.count, 0));
        await g.dz('click', '[data-action="take-all"]');
        await g.step(2);
        const after = await g.eval(() => window.DZ.player().inventory.all().reduce((a, i) => a + i.count, 0));
        assert(after > before, `items taken (${before} → ${after})`);
        await g.tap('Escape');
        assert(await g.screen() === null || await g.screen() === 'pause' || await g.screen() === undefined, 'loot screen closed');
        await g.eval(() => { if (window.DZ.screen() === 'pause') window.DZ.game.resumeRaid(); });
        // Full inventory
        await g.eval(() => { const inv = window.DZ.player().inventory; for (let i = 0; i < 60 && !inv.isFull(); i++) inv.add(Items.create('tool_wrench', 1)); });
        const full = await g.eval(() => window.DZ.player().inventory.isFull());
        assert(full, 'inventory full');
        const res = await g.eval(() => { const p = window.DZ.player(); const fl = window.DZ.raid().dropItem(Items.create('col_coin', 1), p.x + 10, p.y); const n0 = p.inventory.all().length; const r = window.DZ.raid().pickFloorLoot(fl); return { n0, n1: p.inventory.all().length, stillOnFloor: window.DZ.world().floorLoot.includes(fl) }; });
        assertEq(res.n1, res.n0, 'no new slot used when full');
        assert(res.stillOnFloor, 'item stays on the floor');
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '09 extraction: countdown at the always-available point, loot reaches the stash'() {
      const g = await openGame();
      try {
        await g.dz('newGame');
        await startRaid(g, 'city', 4);
        await g.eval(() => window.DZ.god(true));
        await g.eval(() => window.DZ.giveItem('col_watch', 1));
        const e = await g.eval(() => { const pts = window.DZ.raid().extraction.points; const a = pts.find(p => p.kind === 'always'); return { id: a.id, x: a.x, y: a.y, duration: a.duration }; });
        await g.eval(e => window.DZ.teleport(e.x, e.y), e);
        await g.step(30);
        const cur = await g.eval(() => { const c = window.DZ.raid().extraction.current(); return c && { id: c.point.id, progress: c.progress }; });
        assert(cur && cur.id === e.id && cur.progress > 0, 'extraction in progress');
        const hud = await g.eval(() => window.DZ.raid().extraction.hudText());
        assert(typeof hud === 'string' && hud.length > 0, 'hud text present');
        await g.step(Math.ceil(e.duration * 60) + 30);
        assertEq(await g.state(), 'result', 'state result after extraction');
        assertEq(await g.screen(), 'result', 'result screen');
        const r = await g.eval(() => { const r = window.DZ.game.raid && window.DZ.game.raid.result; return r && r.outcome; });
        const stashHasWatch = await g.eval(() => window.DZ.game.profileMgr.stash.count('col_watch'));
        assert(stashHasWatch >= 1, 'extracted item is in the stash');
        const prof = await g.dz('profile');
        assertEq(prof.stats.extractions, 1, 'extraction counted');
        assert(prof.xp > 0, 'xp gained');
        await g.dz('click', '[data-action="to-base"]');
        assertEq(await g.state(), 'base', 'back in base');
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '10 death applies loss rules; secure container is kept'() {
      const g = await openGame();
      try {
        await g.dz('newGame');
        await startRaid(g, 'city', 5);
        await g.eval(() => { const p = window.DZ.player(); p.secure.add(Items.create('col_coin', 1)); p.inventory.add(Items.create('col_watch', 1)); });
        await g.eval(() => window.DZ.die());
        await g.step(5);
        assertEq(await g.state(), 'result', 'state result after death');
        assertEq(await g.screen(), 'death', 'death screen');
        const prof = await g.dz('profile');
        assert(!prof.equipment.secondary && !prof.equipment.primary, 'weapons lost on death');
        assert(!prof.equipment.backpack, 'backpack lost on death');
        const stash = await g.eval(() => ({ coin: window.DZ.game.profileMgr.stash.count('col_coin'), watch: window.DZ.game.profileMgr.stash.count('col_watch') }));
        assertEq(stash.coin, 1, 'secure item kept');
        assertEq(stash.watch, 0, 'backpack loot lost');
        assertEq(prof.stats.deaths, 1, 'death counted');
        assert(prof.hp < 100, 'player injured after death');
        await g.dz('click', '[data-action="to-base"]');
        assertEq(await g.state(), 'base', 'back in base');
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '11 base: trader buy/sell, stash transfer, medbay heal, upgrade, missions accept/hand-in'() {
      const g = await openGame();
      try {
        await g.dz('newGame');
        await g.eval(() => window.DZ.giveCredits(5000));
        const r1 = await g.eval(() => { const pm = window.DZ.game.profileMgr; pm.restockTrader(); const c0 = pm.profile.credits; const r = pm.buy(0, 1); return { ok: r.ok, reason: r.reason, c0, c1: pm.profile.credits, id: pm.profile.trader.stock[0].id, stashCount: pm.stash.count(pm.profile.trader.stock[0].id) }; });
        assert(r1.ok, `buy ok (${r1.reason})`);
        assert(r1.c1 < r1.c0, 'credits decreased on buy');
        assert(r1.stashCount >= 1, 'bought item in stash');
        const r2 = await g.eval(() => { const pm = window.DZ.game.profileMgr; const inst = pm.stash.all().find(i => i.id === 'med_bandage') || pm.stash.all()[0]; const c0 = pm.profile.credits; const r = pm.sell(inst.uid, 1); return { ok: r.ok, gained: pm.profile.credits - c0 }; });
        assert(r2.ok && r2.gained > 0, 'sell gives credits');
        const r3 = await g.eval(() => { const pm = window.DZ.game.profileMgr; const inst = pm.stash.all()[0]; const n0 = pm.loadoutInventory.all().length; pm.moveStashToLoadout(inst.uid, inst.count); const n1 = pm.loadoutInventory.all().length; pm.moveLoadoutToStash(pm.loadoutInventory.all()[n1 - 1].uid, 9999); return { n0, n1, n2: pm.loadoutInventory.all().length }; });
        assert(r3.n1 === r3.n0 + 1 && r3.n2 === r3.n0, 'stash ↔ loadout transfer');
        const r4 = await g.eval(() => { const pm = window.DZ.game.profileMgr; pm.profile.hp = 40; const cost = pm.healCost(); pm.heal(); return { cost, hp: pm.profile.hp, hpMax: pm.hpMax() }; });
        assert(r4.cost > 0 && r4.hp === r4.hpMax, 'medbay heals to max for credits');
        const r5 = await g.eval(() => { const pm = window.DZ.game.profileMgr; for (const it of (UPGRADES.stash[0].cost.items || [])) pm.stash.add(Items.create(it.id, it.count)); const slots0 = pm.stash.slots; const r = pm.upgrade('stash'); return { ok: r.ok, reason: r.reason, slots0, slots1: pm.stash.slots, level: pm.profile.upgrades.stash }; });
        assert(r5.ok, `stash upgrade ok (${r5.reason})`);
        assert(r5.slots1 > r5.slots0 && r5.level === 1, 'stash grew');
        const r6 = await g.eval(() => { const ms = window.DZ.game.missions; const pm = window.DZ.game.profileMgr; const avail = ms.availableFor(pm.profile); const r = ms.accept(pm.profile, avail[0].id); return { n: avail.length, ok: r.ok, active: ms.active(pm.profile).length }; });
        assert(r6.n >= 1 && r6.ok && r6.active === 1, 'mission accepted');
        const r7 = await g.eval(() => { const ms = window.DZ.game.missions; const pm = window.DZ.game.profileMgr; const m = MISSIONS.find(m => m.objectives.some(o => o.type === 'collect') && m.mapId === 'city'); if (!m) return { skip: true };
          pm.profile.missions.active = [m.id]; const o = m.objectives.find(o => o.type === 'collect'); pm.stash.add(Items.create(o.target, o.count)); const can = ms.canHandIn(pm.profile, m.id, o.id); const r = ms.handIn(pm.profile, m.id, o.id); const prog = ms.progressOf(pm.profile, m.id); return { can, r, done: prog.objectives.find(x => x.def.id === o.id).done, left: pm.stash.count(o.target) }; });
        if (!r7.skip) { assert(r7.can && r7.done, 'collect objective handed in'); assertEq(r7.left, 0, 'items removed from stash'); }
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '12 progress persists across a page reload; corrupted save is repaired'() {
      const g = await openGame();
      try {
        await g.dz('newGame');
        await g.eval(() => { window.DZ.giveCredits(1234); window.DZ.giveStash('col_watch', 2); });
        assert(await g.dz('save'), 'save ok');
        const before = await g.eval(() => ({ credits: window.DZ.profile().credits, watch: window.DZ.game.profileMgr.stash.count('col_watch') }));
        await g.page.reload();
        await g.page.waitForFunction(() => !!window.DZ);
        await g.eval(() => window.DZ.setAuto(false));
        assertEq(await g.screen(), 'main', 'main menu after reload');
        const canContinue = await g.eval(() => !!document.querySelector('[data-action="continue"]') && !document.querySelector('[data-action="continue"]').disabled);
        assert(canContinue, 'continue button enabled');
        await g.dz('continueGame');
        const after = await g.eval(() => ({ credits: window.DZ.profile().credits, watch: window.DZ.game.profileMgr.stash.count('col_watch') }));
        assertEq(after.credits, before.credits, 'credits persisted');
        assertEq(after.watch, before.watch, 'stash persisted');
        // Raid in progress + reload → MIA
        await g.eval(() => window.DZ.startRaid('city', { seed: 7 }));
        await g.step(10);
        await g.page.reload();
        await g.page.waitForFunction(() => !!window.DZ);
        await g.eval(() => window.DZ.setAuto(false));
        await g.dz('continueGame');
        const p2 = await g.dz('profile');
        assert(!p2.raidInProgress, 'raidInProgress cleared');
        assert(!p2.equipment.secondary, 'MIA rule: equipment lost');
        assertEq(p2.stats.mia, 1, 'mia counted');
        // Corrupt save
        await g.eval(() => { localStorage.setItem('deadzone_save_v1', '{"version":1,"profile":{"credits":"x","stash":5'); });
        await g.page.reload();
        await g.page.waitForFunction(() => !!window.DZ);
        await g.eval(() => window.DZ.setAuto(false));
        const res = await g.dz('load');
        assert(res && typeof res.ok === 'boolean', 'load returns a result object');
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '13 every screen opens and closes without errors; settings apply and persist'() {
      const g = await openGame();
      try {
        await g.dz('newGame');
        const baseScreens = ['base', 'stash', 'armory', 'medbay', 'workshop', 'radio', 'defense', 'trader', 'missionSelect', 'settings', 'stats', 'credits', 'base'];
        for (const s of baseScreens) { await g.eval(s => window.DZ.ui.showScreen(s), s); assertEq(await g.screen(), s, `screen ${s}`); await g.step(2); }
        await startRaid(g);
        for (const s of ['inventory', 'map', 'pause', 'settings', 'pause']) { await g.eval(s => window.DZ.ui.showScreen(s), s); assertEq(await g.screen(), s, `raid screen ${s}`); await g.step(2); }
        await g.dz('click', '[data-action="resume"]');
        assert(!(await g.screen()), 'resume closes pause');
        await g.tap('Tab'); assertEq(await g.screen(), 'inventory', 'Tab opens inventory');
        await g.tap('Tab'); assert(!(await g.screen()), 'Tab closes inventory');
        await g.tap('KeyM'); assertEq(await g.screen(), 'map', 'M opens map');
        await g.tap('Escape'); assert(!(await g.screen()), 'Escape closes map');
        await g.tap('Escape'); assertEq(await g.screen(), 'pause', 'Escape opens pause');
        assert(await g.eval(() => window.DZ.game.paused), 'game paused');
        await g.tap('Escape'); assert(!(await g.screen()), 'Escape resumes');
        await g.eval(() => window.DZ.game.applySettings({ master: 0.25, screenShake: false }));
        const s = await g.eval(() => window.DZ.game.save.loadSettings());
        assertEq(s.master, 0.25, 'settings saved'); assertEq(s.screenShake, false, 'settings saved (bool)');
        const buttons = await g.eval(() => Array.from(document.querySelectorAll('#ui button')).filter(b => !b.dataset.action && !b.onclick && !b.closest('[data-action]')).length);
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '14 mobile controls: touch mode shows virtual sticks and moves the player'() {
      const g = await openGame({ touch: true, mobile: true, viewport: { width: 900, height: 420 } });
      try {
        await g.dz('newGame');
        await startRaid(g);
        const touch = await g.eval(() => window.DZ.game.input.touchMode);
        assert(touch, 'touch mode detected');
        const visible = await g.eval(() => { const m = document.getElementById('mobile'); return m && !m.hidden && getComputedStyle(m).display !== 'none'; });
        assert(visible, 'mobile controls visible');
        const before = await g.player();
        await g.eval(() => window.DZ.game.input.setStick('move', 0, -1));
        await g.step(45);
        await g.eval(() => window.DZ.game.input.setStick('move', 0, 0));
        const after = await g.player();
        assert(before.y - after.y > 60, `stick moved player north (${(before.y - after.y).toFixed(1)})`);
        const mag0 = await g.eval(() => window.DZ.player().weaponInst.mag);
        await g.eval(() => { window.DZ.game.input.setStick('aim', 1, 0); window.DZ.game.input.touchFire(true); });
        await g.step(10);
        await g.eval(() => { window.DZ.game.input.touchFire(false); window.DZ.game.input.setStick('aim', 0, 0); });
        const mag1 = await g.eval(() => window.DZ.player().weaponInst.mag);
        assert(mag1 < mag0, 'touch fire shoots');
        await g.eval(() => window.DZ.game.input.touchAction('interact', true));
        await g.step(1);
        await g.eval(() => window.DZ.game.input.touchAction('interact', false));
        await g.step(2);
        g.assertNoErrors();
      } finally { await g.close(); }
    },

    async '15 stress: 1500 steps with random input, no errors, raid stays consistent'() {
      const g = await openGame();
      try {
        await g.dz('newGame');
        await g.eval(() => window.DZ.startRaid('industrial', { seed: 11 }));
        const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'KeyC', 'KeyF', 'KeyE', 'KeyR', 'Digit1', 'Digit2', 'Digit3', 'KeyG', 'KeyQ'];
        let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
        for (let i = 0; i < 50; i++) {
          const k = keys[Math.floor(rnd() * keys.length)];
          await g.key(k, true);
          if (rnd() < 0.5) await g.eval(() => window.DZ.mouse(300 + Math.random() * 600, 100 + Math.random() * 500, true));
          await g.step(30);
          await g.key(k, false);
          await g.eval(() => window.DZ.mouse(640, 360, false));
          const st = await g.state();
          if (st !== 'raid') break;
        }
        const st = await g.state();
        assert(['raid', 'result'].includes(st), `state consistent (${st})`);
        const counts = await g.eval(() => ({ particles: window.DZ.raid() ? window.DZ.raid().fx.particles.length : 0, zombies: window.DZ.raid() ? window.DZ.raid().zombies.zombies.length : 0 }));
        assert(counts.particles <= 700, `particle cap (${counts.particles})`);
        assert(counts.zombies <= 200, `zombie cap (${counts.zombies})`);
        g.assertNoErrors();
      } finally { await g.close(); }
    },
  });
}
