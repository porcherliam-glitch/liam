// 12_weapons.js — WeaponSystem: firing, spread/bloom, projectiles with tile raycasts and zombie hits, penetration,
// melee, reloading, grenades (frag / molotov / flash) (SPEC §13).
// Decisions: holding the trigger re-fires semi-automatic guns at their fire rate × 0.8 (twin-stick convention);
//   misfires return reason 'misfire'; shotgun slugs ('Flintenlaufgeschoss') fire one projectile with pellets × 0.55 damage.
//   Active reloads are tracked in this.reloads (inst.rt holds only numbers/booleans).
// Dependencies: 00_util.js, 08_world.js, 09_collision.js, 10_items_inventory.js; raid subsystems at runtime.

class WeaponSystem {
  constructor(raid) {
    this.raid = raid;
    this.rng = raid && raid.rng && raid.rng.fork ? raid.rng.fork('weapons') : new RNG(7);
    this.projectiles = [];
    this.reloads = [];
    this._cands = [];
  }
  get grenades() { return this.raid ? this.raid.grenades : []; }

  static rt(inst) {
    if (!inst.rt) inst.rt = { cooldown: 0, reloading: false, reloadTimer: 0, bloom: 0, held: 0 };
    return inst.rt;
  }

  tryFire(inst, shooter, aimAngle, isPlayer = true, semiHeld = false) {
    const def = Items.def(inst);
    const w = def && def.weapon;
    if (!w) return { fired: false, reason: null };
    if (w.class === 'melee') return { fired: false, reason: 'melee' };
    const rt = WeaponSystem.rt(inst);
    if (rt.reloading) return { fired: false, reason: 'reloading' };
    if (rt.cooldown > 0) return { fired: false, reason: 'cooldown' };
    const raid = this.raid;
    const audio = raid && raid.game && raid.game.audio;
    if ((inst.mag || 0) <= 0) {
      rt.cooldown = 0.35;
      if (audio) audio.play('empty_click', { x: shooter.x, y: shooter.y });
      return { fired: false, reason: 'empty' };
    }
    if (inst.durability !== undefined && inst.durability < 15 && this.rng.chance(0.1)) {
      rt.cooldown = 0.45;
      if (audio) audio.play('empty_click', { x: shooter.x, y: shooter.y });
      if (isPlayer && raid && raid.game && raid.game.ui) raid.game.ui.toast('Ladehemmung!', 'warning', 1200);
      return { fired: false, reason: 'misfire' };
    }
    const ammo = Items.def(inst.ammoId);
    const a = (ammo && ammo.ammo) || { dmgMul: 1, penMul: 1, noiseMul: 1, label: 'Standard' };
    rt.cooldown = (1 / Math.max(0.1, w.fireRate)) * (!w.auto && semiHeld ? 1.25 : 1);
    inst.mag--;
    if (inst.durability !== undefined) inst.durability = Math.max(0, inst.durability - 0.15);
    const sm = typeof shooter.spreadMul === 'function' ? shooter.spreadMul() : 1;
    const slug = a.label === 'Flintenlaufgeschoss';
    const pellets = slug ? 1 : Math.max(1, w.pellets || 1);
    let spread = (w.spread || 0.03) * sm * (1 + rt.bloom) * (slug ? 0.35 : 1);
    const durMul = inst.durability !== undefined && inst.durability < 30 ? 0.9 : 1;
    const dmg = w.damage * (a.dmgMul || 1) * durMul * (slug ? (w.pellets || 1) * 0.55 : 1);
    const pen = clamp(Math.round((w.penetration || 1) * (a.penMul || 1)), 1, 3);
    const speed = w.class === 'sniper' ? 2200 : 1400;
    const mx = shooter.x + Math.cos(aimAngle) * 20, my = shooter.y + Math.sin(aimAngle) * 20;
    // never spawn a bullet inside a wall (shooting point-blank at a wall)
    const muzzle = raid && raid.world ? Physics.raycastTiles(raid.world, shooter.x, shooter.y, mx, my) : { hit: false, x: mx, y: my };
    for (let i = 0; i < pellets; i++) {
      const ang = aimAngle + (this.rng.next() + this.rng.next() - 1) * spread;
      if (this.projectiles.length >= 400) this.projectiles.shift();
      const p = {
        x: muzzle.hit ? shooter.x : mx, y: muzzle.hit ? shooter.y : my,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dirX: Math.cos(ang), dirY: Math.sin(ang),
        dmg, pen, range: w.range || 700, traveled: 0, ownerIsPlayer: isPlayer, ttl: 2, trail: 0, cls: w.class,
        hitCounted: false, shooter,
      };
      this.projectiles.push(p);
    }
    rt.bloom = Math.min(2.2, rt.bloom + (w.recoil || 0.2) * 0.5);
    if (raid) {
      if (raid.fx) { raid.fx.muzzleFlash(mx, my, aimAngle, w.class === 'shotgun' || w.class === 'lmg' ? 1.3 : 1); raid.fx.casing(shooter.x, shooter.y, aimAngle); }
      if (isPlayer && raid.game && raid.game.camera) raid.game.camera.addShake((w.recoil || 0.2) * 6);
      if (audio) audio.play('shot_' + (w.class === 'lmg' ? 'lmg' : w.class), { x: shooter.x, y: shooter.y });
      if (raid.emitNoise) raid.emitNoise(shooter.x, shooter.y, (w.noise || 600) * (a.noiseMul || 1), 'shot');
    }
    if (shooter.stats) shooter.stats.shotsFired++;
    if (isPlayer && inst.mag === 0 && audio) audio.play('empty_click', { x: shooter.x, y: shooter.y, volume: 0.4 });
    return { fired: true, reason: null };
  }

  ammoInInventory(inst, inventory) {
    const def = Items.def(inst);
    if (!def || !def.weapon || !def.weapon.ammo || !inventory) return 0;
    let n = 0;
    for (const it of inventory.all()) {
      const d = Items.def(it);
      if (d && d.ammo && d.ammo.caliber === def.weapon.ammo) n += it.count;
    }
    return n;
  }

  reserveText(inst, inventory) {
    const def = Items.def(inst);
    if (!def || !def.weapon) return '';
    if (def.weapon.class === 'melee') return '—';
    return (inst.mag || 0) + ' / ' + this.ammoInInventory(inst, inventory);
  }

  _chooseAmmo(inst, inventory) {
    const def = Items.def(inst);
    const cal = def.weapon.ammo;
    const counts = new Map();
    for (const it of inventory.all()) {
      const d = Items.def(it);
      if (d && d.ammo && d.ammo.caliber === cal) counts.set(it.id, (counts.get(it.id) || 0) + it.count);
    }
    if (inst.ammoId && counts.get(inst.ammoId) > 0) return inst.ammoId;
    let best = null, bn = 0;
    for (const [id, n] of counts) if (n > bn) { bn = n; best = id; }
    return best;
  }

  startReload(inst, inventory) {
    const def = Items.def(inst);
    if (!def || !def.weapon || def.weapon.class === 'melee' || !inventory) return { ok: false, reason: null };
    const rt = WeaponSystem.rt(inst);
    if (rt.reloading) return { ok: false, reason: 'reloading' };
    const audio = this.raid && this.raid.game && this.raid.game.audio;
    const ammoId = this._chooseAmmo(inst, inventory);
    const fullOfSame = (inst.mag || 0) >= (def.weapon.magSize || 0) && (!ammoId || ammoId === inst.ammoId);
    if (fullOfSame) return { ok: false, reason: 'full' };
    if (!ammoId) {
      if (audio) audio.play('empty_click');
      return { ok: false, reason: 'no_ammo' };
    }
    rt.reloading = true;
    rt.reloadTimer = def.weapon.reloadTime || 2;
    this.reloads = this.reloads.filter(r => r.inst !== inst);
    this.reloads.push({ inst, inventory, ammoId });
    if (audio) audio.play('reload_start', this.raid && this.raid.player ? { x: this.raid.player.x, y: this.raid.player.y } : {});
    return { ok: true, reason: null };
  }

  cancelReload(inst) {
    if (!inst) return;
    const rt = WeaponSystem.rt(inst);
    rt.reloading = false; rt.reloadTimer = 0;
    this.reloads = this.reloads.filter(r => r.inst !== inst);
  }

  finishReload(inst, inventory, ammoIdArg) {
    const def = Items.def(inst);
    const rt = WeaponSystem.rt(inst);
    rt.reloading = false; rt.reloadTimer = 0;
    if (!def || !def.weapon || !inventory) return;
    const ammoId = ammoIdArg && inventory.count(ammoIdArg) > 0 ? ammoIdArg : this._chooseAmmo(inst, inventory);
    if (!ammoId) return;
    if (ammoId !== inst.ammoId && (inst.mag || 0) > 0 && inst.ammoId) {
      const back = Items.create(inst.ammoId, inst.mag);
      if (back) {
        const r = inventory.add(back);
        if (r.remaining && this.raid && this.raid.player && this.raid.dropItem) this.raid.dropItem(r.remaining, this.raid.player.x, this.raid.player.y);
      }
      inst.mag = 0;
    }
    const need = (def.weapon.magSize || 0) - (inst.mag || 0);
    const take = Math.min(need, inventory.count(ammoId));
    if (take <= 0) return;
    inst.mag = (inst.mag || 0) + take;
    inventory.removeById(ammoId, take);
    inst.ammoId = ammoId;
  }

  melee(inst, shooter, aimAngle) {
    const def = Items.def(inst);
    const w = def && def.weapon;
    if (!w) return { hit: 0 };
    const rt = WeaponSystem.rt(inst);
    if (rt.cooldown > 0) return { hit: 0 };
    rt.cooldown = w.swingTime || 0.5;
    const raid = this.raid;
    const audio = raid && raid.game && raid.game.audio;
    if (audio) audio.play('melee_swing', { x: shooter.x, y: shooter.y });
    if (shooter) shooter.meleeAnim = 1;
    const range = w.meleeRange || 60, arc = w.meleeArc || 1.6;
    let dmgMul = 1;
    if (inst.durability !== undefined) dmgMul = inst.durability <= 0 ? 0.4 : inst.durability < 15 ? 0.6 : 1;
    let hit = 0;
    const zs = raid && raid.zombies ? raid.zombies.inRadius(shooter.x, shooter.y, range + 40) : [];
    for (const z of zs) {
      const d = dist(shooter.x, shooter.y, z.x, z.y);
      if (d > range + z.radius) continue;
      const a = angleTo(shooter.x, shooter.y, z.x, z.y);
      if (Math.abs(angleDiff(aimAngle, a)) > arc / 2 && d > z.radius + 6) continue;
      if (raid.world && !Physics.lineOfSight(raid.world, shooter.x, shooter.y, z.x, z.y)) continue;
      const r = raid.zombies.damage(z, w.damage * dmgMul, { pen: 2, dirX: Math.cos(a), dirY: Math.sin(a), source: 'melee' });
      // knock the target back a little
      if (!z.dead && z.type && z.type.id !== 'brute' && z.type.id !== 'boss' && raid.world) {
        const m = Physics.moveCircle(raid.world, z.x, z.y, z.radius, Math.cos(a) * 18, Math.sin(a) * 18);
        z.x = m.x; z.y = m.y;
      }
      if (raid.fx) raid.fx.blood(z.x, z.y, a, 1.2);
      if (shooter.stats) shooter.stats.damageDealt += r.dealt || 0;
      hit++;
      if (inst.durability !== undefined) inst.durability = Math.max(0, inst.durability - 0.6);
    }
    if (hit) {
      if (audio) audio.play('melee_hit', { x: shooter.x, y: shooter.y });
      if (raid && raid.fx) raid.fx.hitMarker();
      if (raid && raid.game && raid.game.camera) raid.game.camera.addShake(2);
    }
    if (raid && raid.emitNoise) raid.emitNoise(shooter.x, shooter.y, 60, 'step');
    return { hit };
  }

  throwGrenade(inst, from, aimAngle, power = 1) {
    const def = Items.def(inst);
    if (!def || !inst || inst.count < 1) return false;
    const g = def.grenade || { damage: 120, radius: 140, fuse: 2.2, noise: 1000, kind: 'frag' };
    inst.count--;
    const speed = 420 * clamp(power, 0.3, 1.5);
    const raid = this.raid;
    raid.grenades.push({
      x: from.x + Math.cos(aimAngle) * 14, y: from.y + Math.sin(aimAngle) * 14, vx: Math.cos(aimAngle) * speed, vy: Math.sin(aimAngle) * speed,
      z: 8, vz: 230, fuse: g.kind === 'molotov' ? 4 : (g.fuse || 2.2), def, g, inst, kind: g.kind || 'frag', rot: 0, bounced: false,
    });
    const audio = raid && raid.game && raid.game.audio;
    if (audio) audio.play('grenade_throw', { x: from.x, y: from.y });
    return true;
  }

  update(dt) {
    const raid = this.raid;
    if (!raid) return;
    // reloads
    for (let i = this.reloads.length - 1; i >= 0; i--) {
      const r = this.reloads[i];
      const rt = WeaponSystem.rt(r.inst);
      if (!rt.reloading) { this.reloads.splice(i, 1); continue; }
      rt.reloadTimer -= dt;
      if (rt.reloadTimer <= 0) {
        this.reloads.splice(i, 1);
        this.finishReload(r.inst, r.inventory, r.ammoId);
        const audio = raid.game && raid.game.audio;
        if (audio) audio.play('reload_end', raid.player ? { x: raid.player.x, y: raid.player.y } : {});
      }
    }
    // cooldown and bloom of the player's weapons
    const p = raid.player;
    if (p && p.equipment) {
      for (const inst of [p.equipment.primary, p.equipment.secondary, p.equipment.melee]) {
        if (!inst || !inst.rt) continue;
        inst.rt.cooldown = Math.max(0, inst.rt.cooldown - dt);
        inst.rt.bloom = Math.max(0, inst.rt.bloom - 2 * dt);
      }
    }
    this._updateProjectiles(dt);
    this._updateGrenades(dt);
  }

  _falloff(p) {
    const R = p.range;
    if (p.traveled <= 0.6 * R) return 1;
    return lerp(1, 0.5, clamp((p.traveled - 0.6 * R) / (0.4 * R), 0, 1));
  }

  _updateProjectiles(dt) {
    const raid = this.raid, world = raid.world;
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.ttl -= dt;
      let x1 = p.x + p.vx * dt, y1 = p.y + p.vy * dt;
      let segLen = Math.hypot(x1 - p.x, y1 - p.y);
      let dead = false;
      if (p.traveled + segLen > p.range) {
        const rem = Math.max(0, p.range - p.traveled);
        x1 = p.x + p.dirX * rem; y1 = p.y + p.dirY * rem; segLen = rem;
        dead = true;
      }
      const ray = world ? Physics.raycastTiles(world, p.x, p.y, x1, y1) : { hit: false, x: x1, y: y1 };
      const ex = ray.x, ey = ray.y;
      // zombie hits along the clipped segment
      let hitAny = false;
      if (raid.hash && raid.zombies) {
        const minx = Math.min(p.x, ex), miny = Math.min(p.y, ey);
        this._cands.length = 0;
        raid.hash.queryRect(minx - 24, miny - 24, Math.abs(ex - p.x) + 48, Math.abs(ey - p.y) + 48, this._cands);
        const hits = [];
        for (const z of this._cands) {
          if (z.dead) continue;
          const t = Physics.segmentCircle(p.x, p.y, ex, ey, z.x, z.y, z.radius);
          if (t >= 0) hits.push({ z, t });
        }
        if (hits.length) {
          hits.sort((a, b) => a.t - b.t);
          let mul = 1;
          const n = Math.min(hits.length, p.pen);
          for (let k = 0; k < n; k++) {
            const { z, t } = hits[k];
            const hx = p.x + (ex - p.x) * t, hy = p.y + (ey - p.y) * t;
            p.traveled += segLen * t;
            const dmg = p.dmg * this._falloff(p) * mul;
            const r = raid.zombies.damage(z, dmg, { pen: p.pen, dirX: p.dirX, dirY: p.dirY, source: 'bullet' });
            if (raid.fx) {
              raid.fx.blood(hx, hy, Math.atan2(p.dirY, p.dirX), 0.8);
              if (p.ownerIsPlayer) { raid.fx.hitMarker(); raid.fx.floatingText(hx, hy - 10, Math.round(r.dealt || dmg), r.killed ? '#ff6b6b' : '#ffe08a'); }
            }
            if (p.ownerIsPlayer && p.shooter && p.shooter.stats) {
              if (!p.hitCounted) { p.shooter.stats.shotsHit++; p.hitCounted = true; }
              p.shooter.stats.damageDealt += r.dealt || 0;
            }
            const audio = raid.game && raid.game.audio;
            if (audio && k === 0) audio.play('zombie_hit', { x: hx, y: hy, volume: 0.6 });
            mul *= 0.6;
          }
          hitAny = true;
        }
      }
      if (hitAny) { list.splice(i, 1); continue; }
      if (ray.hit) {
        if (raid.fx) raid.fx.impact(ray.x, ray.y, Math.atan2(p.dirY, p.dirX), ray.tile);
        list.splice(i, 1);
        continue;
      }
      p.traveled += segLen;
      p.x = x1; p.y = y1;
      p.trail = Math.min(p.trail + segLen, 60);
      if (dead || p.ttl <= 0) list.splice(i, 1);
    }
  }

  _updateGrenades(dt) {
    const raid = this.raid, world = raid.world;
    const gs = raid.grenades;
    for (let i = gs.length - 1; i >= 0; i--) {
      const g = gs[i];
      g.fuse -= dt;
      g.rot += dt * 10;
      // vertical arc
      g.vz -= 650 * dt;
      g.z += g.vz * dt;
      let landed = false;
      if (g.z <= 0) {
        g.z = 0;
        if (Math.abs(g.vz) > 60) { g.vz = -g.vz * 0.35; landed = true; } else g.vz = 0;
        g.vx *= 0.55; g.vy *= 0.55;
      }
      // horizontal movement with wall bounces
      const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
      if (world) {
        if (world.blocksBullets(Math.floor(nx / TILE), Math.floor(g.y / TILE))) g.vx = -g.vx * 0.5; else g.x = nx;
        if (world.blocksBullets(Math.floor(g.x / TILE), Math.floor(ny / TILE))) g.vy = -g.vy * 0.5; else g.y = ny;
      } else { g.x = nx; g.y = ny; }
      if (g.z === 0) { const k = Math.exp(-4 * dt); g.vx *= k; g.vy *= k; }
      if ((g.kind === 'molotov' && (landed || g.z === 0 && g.vz === 0)) || g.fuse <= 0) {
        gs.splice(i, 1);
        this._explode(g);
      }
    }
  }

  _explode(g) {
    const raid = this.raid;
    const audio = raid.game && raid.game.audio;
    const R = g.g.radius || 140;
    if (g.kind === 'molotov') {
      raid.addHazard({ kind: 'fire', x: g.x, y: g.y, r: R * 0.6, duration: 9 });
      if (audio) audio.play('fire', { x: g.x, y: g.y });
      if (raid.fx) raid.fx.explosion(g.x, g.y, R * 0.4);
      raid.emitNoise(g.x, g.y, g.g.noise || 500, 'explosion');
      // instant burn for zombies inside
      for (const z of raid.zombies.inRadius(g.x, g.y, R * 0.6)) raid.zombies.damage(z, 25, { pen: 3, source: 'fire' });
      return;
    }
    if (g.kind === 'flash') {
      if (audio) audio.play('explosion', { x: g.x, y: g.y, volume: 0.6, pitch: 1.6 });
      if (raid.fx) { raid.fx.lightFlashes.push({ x: g.x, y: g.y, r: R * 4, ttl: 0.35, color: '#ffffff' }); }
      for (const z of raid.zombies.inRadius(g.x, g.y, R * 1.4)) {
        if (raid.world && !Physics.lineOfSight(raid.world, g.x, g.y, z.x, z.y)) continue;
        z.state = 'stunned'; z.stunTimer = 3.5; z.windupTimer = 0; z.attackAnim = 0;
      }
      const p = raid.player;
      if (p && dist(p.x, p.y, g.x, g.y) < R * 1.5 && Physics.lineOfSight(raid.world, g.x, g.y, p.x, p.y) && raid.fx) {
        const facing = Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, g.x, g.y))) < 1.4;
        raid.fx.flash(facing ? 1 : 0.5);
      }
      raid.emitNoise(g.x, g.y, g.g.noise || 900, 'explosion');
      return;
    }
    // frag
    if (audio) audio.play('explosion', { x: g.x, y: g.y });
    if (raid.fx) raid.fx.explosion(g.x, g.y, R);
    if (raid.game && raid.game.camera && raid.player) {
      const d = dist(raid.player.x, raid.player.y, g.x, g.y);
      raid.game.camera.addShake(clamp(18 - d / 40, 2, 18));
    }
    const dmg = g.g.damage || 120;
    for (const z of raid.zombies.inRadius(g.x, g.y, R)) {
      if (raid.world && !Physics.lineOfSight(raid.world, g.x, g.y, z.x, z.y)) continue;
      const d = dist(g.x, g.y, z.x, z.y);
      const f = clamp(1 - d / R, 0.2, 1);
      const a = angleTo(g.x, g.y, z.x, z.y);
      const r = raid.zombies.damage(z, dmg * f, { pen: 3, dirX: Math.cos(a), dirY: Math.sin(a), source: 'explosion' });
      if (raid.player && raid.player.stats) raid.player.stats.damageDealt += r.dealt || 0;
    }
    const p = raid.player;
    if (p && !p.dead) {
      const d = dist(p.x, p.y, g.x, g.y);
      if (d < R && Physics.lineOfSight(raid.world, g.x, g.y, p.x, p.y)) {
        p.takeDamage(dmg * clamp(1 - d / R, 0.15, 1) * 0.7, { source: 'Explosion', from: { x: g.x, y: g.y }, bleedChance: 0.4 });
      }
    }
    raid.emitNoise(g.x, g.y, g.g.noise || 1100, 'explosion');
  }
}
