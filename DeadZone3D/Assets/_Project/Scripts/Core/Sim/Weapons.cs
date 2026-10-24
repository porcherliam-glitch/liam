using System;
using System.Collections.Generic;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    public struct FireResult { public bool fired; public string reason; }

    /// <summary>Firing, projectiles, melee, reloading and grenades (port of 12_weapons.js).</summary>
    public sealed class WeaponSystem
    {
        private const int TILE = World.TILE;
        private readonly Raid _raid;
        public readonly Rng rng;
        public readonly List<Projectile> projectiles = new List<Projectile>();
        private readonly List<(ItemInst inst, Inventory inv, string ammoId)> _reloads = new List<(ItemInst, Inventory, string)>();
        private readonly List<Zombie> _cands = new List<Zombie>();

        public WeaponSystem(Raid raid)
        {
            _raid = raid;
            rng = raid.rng.Fork("weapons");
        }

        public static WeaponRt Rt(ItemInst inst) => inst.rt ?? (inst.rt = new WeaponRt());
        private IFeedback Fb => _raid.fb;

        public FireResult TryFire(ItemInst inst, Player shooter, double aimAngle, bool isPlayer = true, bool semiHeld = false)
        {
            var def = Items.Def(inst);
            var w = def?.weapon;
            if (w == null) return new FireResult();
            if (w.@class == "melee") return new FireResult { reason = "melee" };
            var rt = Rt(inst);
            if (rt.reloading) return new FireResult { reason = "reloading" };
            if (rt.cooldown > 0) return new FireResult { reason = "cooldown" };
            if ((inst.mag ?? 0) <= 0)
            {
                rt.cooldown = 0.35;
                Fb.Sfx("empty_click", shooter.x, shooter.y);
                return new FireResult { reason = "empty" };
            }
            if (inst.durability.HasValue && inst.durability.Value < 15 && rng.Chance(0.1))
            {
                rt.cooldown = 0.45;
                Fb.Sfx("empty_click", shooter.x, shooter.y);
                if (isPlayer) Fb.Toast("Ladehemmung!", "warning", 1200);
                return new FireResult { reason = "misfire" };
            }
            var a = Items.Def(inst.ammoId)?.ammo ?? new AmmoStats { dmgMul = 1, penMul = 1, noiseMul = 1, label = "Standard" };
            rt.cooldown = (1 / Math.Max(0.1, w.fireRate)) * (!w.auto && semiHeld ? 1.25 : 1);
            inst.mag = inst.mag.Value - 1;
            if (inst.durability.HasValue) inst.durability = Math.Max(0, inst.durability.Value - 0.15);
            double sm = shooter.SpreadMul();
            bool slug = a.label == "Flintenlaufgeschoss";
            int pellets = slug ? 1 : Math.Max(1, w.pellets);
            double spread = (w.spread > 0 ? w.spread : 0.03) * sm * (1 + rt.bloom) * (slug ? 0.35 : 1);
            double durMul = inst.durability.HasValue && inst.durability.Value < 30 ? 0.9 : 1;
            double dmg = w.damage * (a.dmgMul > 0 ? a.dmgMul : 1) * durMul * (slug ? Math.Max(1, w.pellets) * 0.55 : 1);
            int pen = M.Clamp(M.Round(Math.Max(1, w.penetration) * (a.penMul > 0 ? a.penMul : 1)), 1, 3);
            double speed = w.@class == "sniper" ? 2200 : 1400;
            double mx = shooter.x + Math.Cos(aimAngle) * 20, my = shooter.y + Math.Sin(aimAngle) * 20;
            var muzzle = Physics.RaycastTiles(_raid.world, shooter.x, shooter.y, mx, my);
            for (int i = 0; i < pellets; i++)
            {
                double ang = aimAngle + (rng.Next() + rng.Next() - 1) * spread;
                if (projectiles.Count >= 400) projectiles.RemoveAt(0);
                double px = muzzle.hit ? shooter.x : mx, py = muzzle.hit ? shooter.y : my;
                projectiles.Add(new Projectile
                {
                    x = px, y = py, prevX = px, prevY = py, vx = Math.Cos(ang) * speed, vy = Math.Sin(ang) * speed, dirX = Math.Cos(ang), dirY = Math.Sin(ang),
                    dmg = dmg, pen = pen, range = w.range > 0 ? w.range : 700, ownerIsPlayer = isPlayer, ttl = 2, cls = w.@class, shooter = shooter,
                });
            }
            rt.bloom = Math.Min(2.2, rt.bloom + (w.recoil > 0 ? w.recoil : 0.2) * 0.5);
            Fb.Effect(Fx.MuzzleFlash, mx, my, aimAngle, w.@class == "shotgun" || w.@class == "lmg" ? 1.3 : 1);
            Fb.Effect(Fx.Casing, shooter.x, shooter.y, aimAngle);
            if (isPlayer) Fb.Shake((w.recoil > 0 ? w.recoil : 0.2) * 6);
            Fb.Sfx("shot_" + (w.@class == "lmg" ? "lmg" : w.@class), shooter.x, shooter.y);
            _raid.EmitNoise(shooter.x, shooter.y, (w.noise > 0 ? w.noise : 600) * (a.noiseMul > 0 ? a.noiseMul : 1), "shot");
            shooter.stats.shotsFired++;
            if (isPlayer && inst.mag == 0) Fb.Sfx("empty_click", shooter.x, shooter.y, 0.4);
            return new FireResult { fired = true };
        }

        public int AmmoInInventory(ItemInst inst, Inventory inventory)
        {
            var def = Items.Def(inst);
            if (def?.weapon?.ammo == null || inventory == null) return 0;
            int n = 0;
            foreach (var it in inventory.items)
            {
                if (it == null) continue;
                var d = Items.Def(it);
                if (d?.ammo != null && d.ammo.caliber == def.weapon.ammo) n += it.count;
            }
            return n;
        }

        public string ReserveText(ItemInst inst, Inventory inventory)
        {
            var def = Items.Def(inst);
            if (def?.weapon == null) return "";
            if (def.weapon.@class == "melee") return "—";
            return (inst.mag ?? 0) + " / " + AmmoInInventory(inst, inventory);
        }

        private string ChooseAmmo(ItemInst inst, Inventory inventory)
        {
            string cal = Items.Def(inst).weapon.ammo;
            var counts = new Dictionary<string, int>();
            var order = new List<string>();
            foreach (var it in inventory.items)
            {
                if (it == null) continue;
                var d = Items.Def(it);
                if (d?.ammo == null || d.ammo.caliber != cal) continue;
                if (!counts.ContainsKey(it.id)) { counts[it.id] = 0; order.Add(it.id); }
                counts[it.id] += it.count;
            }
            if (inst.ammoId != null && counts.TryGetValue(inst.ammoId, out var cur) && cur > 0) return inst.ammoId;
            string best = null; int bn = 0;
            foreach (var id in order) if (counts[id] > bn) { bn = counts[id]; best = id; }
            return best;
        }

        public (bool ok, string reason) StartReload(ItemInst inst, Inventory inventory)
        {
            var def = Items.Def(inst);
            if (def?.weapon == null || def.weapon.@class == "melee" || inventory == null) return (false, null);
            var rt = Rt(inst);
            if (rt.reloading) return (false, "reloading");
            string ammoId = ChooseAmmo(inst, inventory);
            bool fullOfSame = (inst.mag ?? 0) >= def.weapon.magSize && (ammoId == null || ammoId == inst.ammoId);
            if (fullOfSame) return (false, "full");
            if (ammoId == null) { Fb.Sfx("empty_click"); return (false, "no_ammo"); }
            rt.reloading = true;
            rt.reloadTimer = def.weapon.reloadTime > 0 ? def.weapon.reloadTime : 2;
            _reloads.RemoveAll(r => r.inst == inst);
            _reloads.Add((inst, inventory, ammoId));
            var p = _raid.player;
            Fb.Sfx("reload_start", p?.x ?? double.NaN, p?.y ?? double.NaN);
            return (true, null);
        }

        public void CancelReload(ItemInst inst)
        {
            if (inst == null) return;
            var rt = Rt(inst);
            rt.reloading = false; rt.reloadTimer = 0;
            _reloads.RemoveAll(r => r.inst == inst);
        }

        public void FinishReload(ItemInst inst, Inventory inventory, string ammoIdArg)
        {
            var def = Items.Def(inst);
            var rt = Rt(inst);
            rt.reloading = false; rt.reloadTimer = 0;
            if (def?.weapon == null || inventory == null) return;
            string ammoId = ammoIdArg != null && inventory.Count(ammoIdArg) > 0 ? ammoIdArg : ChooseAmmo(inst, inventory);
            if (ammoId == null) return;
            if (ammoId != inst.ammoId && (inst.mag ?? 0) > 0 && inst.ammoId != null)
            {
                var back = Items.Create(inst.ammoId, 1);
                if (back != null)
                {
                    back.count = inst.mag.Value; // may exceed one stack (LMG belts); Inventory.Add splits it
                    var r = inventory.Add(back);
                    if (r.remaining != null && _raid.player != null) _raid.DropItem(r.remaining, _raid.player.x, _raid.player.y);
                }
                inst.mag = 0;
            }
            int need = def.weapon.magSize - (inst.mag ?? 0);
            int take = Math.Min(need, inventory.Count(ammoId));
            if (take <= 0) return;
            inst.mag = (inst.mag ?? 0) + take;
            inventory.RemoveById(ammoId, take);
            inst.ammoId = ammoId;
        }

        public int Melee(ItemInst inst, Player shooter, double aimAngle)
        {
            var w = Items.Def(inst)?.weapon;
            if (w == null) return 0;
            var rt = Rt(inst);
            if (rt.cooldown > 0) return 0;
            rt.cooldown = w.swingTime > 0 ? w.swingTime : 0.5;
            Fb.Sfx("melee_swing", shooter.x, shooter.y);
            shooter.meleeAnim = 1;
            double range = w.meleeRange > 0 ? w.meleeRange : 60, arc = w.meleeArc > 0 ? w.meleeArc : 1.6;
            double dmgMul = 1;
            if (inst.durability.HasValue) dmgMul = inst.durability.Value <= 0 ? 0.4 : inst.durability.Value < 15 ? 0.6 : 1;
            int hit = 0;
            foreach (var z in _raid.zombies.InRadius(shooter.x, shooter.y, range + 40))
            {
                double d = M.Dist(shooter.x, shooter.y, z.x, z.y);
                if (d > range + z.radius) continue;
                double a = M.AngleTo(shooter.x, shooter.y, z.x, z.y);
                // big zombies fill more of the swing: widen the arc by their apparent half width
                double half = arc / 2 + Math.Asin(Math.Min(1, z.radius / Math.Max(d, 1)));
                if (Math.Abs(M.AngleDiff(aimAngle, a)) > half && d > z.radius + 6) continue;
                if (!Physics.LineOfSight(_raid.world, shooter.x, shooter.y, z.x, z.y)) continue;
                var r = _raid.zombies.Damage(z, w.damage * dmgMul, 2, Math.Cos(a), Math.Sin(a), "melee");
                if (!z.dead && z.id != "brute" && z.id != "boss")
                {
                    var m = Physics.MoveCircle(_raid.world, z.x, z.y, z.radius, Math.Cos(a) * 18, Math.Sin(a) * 18);
                    z.x = m.x; z.y = m.y;
                }
                Fb.Effect(Fx.Blood, z.x, z.y, a, 1.2);
                shooter.stats.damageDealt += r.dealt;
                hit++;
                if (inst.durability.HasValue) inst.durability = Math.Max(0, inst.durability.Value - 0.6);
            }
            if (hit > 0)
            {
                Fb.Sfx("melee_hit", shooter.x, shooter.y);
                Fb.Effect(Fx.HitMarker, shooter.x, shooter.y);
                Fb.Shake(2);
            }
            _raid.EmitNoise(shooter.x, shooter.y, 60, "step");
            return hit;
        }

        public bool ThrowGrenade(ItemInst inst, Player from, double aimAngle, double power = 1)
        {
            var def = Items.Def(inst);
            if (def == null || inst.count < 1) return false;
            var g = def.grenade ?? new GrenadeStats { damage = 120, radius = 140, fuse = 2.2, noise = 1000, kind = "frag" };
            inst.count--;
            double speed = 420 * M.Clamp(power, 0.3, 1.5);
            double sx = from.x + Math.Cos(aimAngle) * 14, sy = from.y + Math.Sin(aimAngle) * 14;
            // standing against a wall: release it at the body instead of inside the wall
            if (Physics.RaycastTiles(_raid.world, from.x, from.y, sx, sy).hit) { sx = from.x; sy = from.y; }
            _raid.grenades.Add(new Grenade
            {
                x = sx, y = sy, vx = Math.Cos(aimAngle) * speed, vy = Math.Sin(aimAngle) * speed,
                z = 8, vz = 230, fuse = g.kind == "molotov" ? 4 : (g.fuse > 0 ? g.fuse : 2.2), def = def, g = g, kind = g.kind ?? "frag",
            });
            Fb.Sfx("grenade_throw", from.x, from.y);
            return true;
        }

        public void Update(double dt)
        {
            for (int i = _reloads.Count - 1; i >= 0; i--)
            {
                var r = _reloads[i];
                var rt = Rt(r.inst);
                if (!rt.reloading) { _reloads.RemoveAt(i); continue; }
                var holder = _raid.player;
                if (holder != null && r.inv == holder.inventory && r.inst != holder.WeaponInst)
                {
                    // the weapon was put away, dropped or moved: the reload stops and takes no ammo
                    rt.reloading = false; rt.reloadTimer = 0;
                    _reloads.RemoveAt(i);
                    continue;
                }
                rt.reloadTimer -= dt;
                if (rt.reloadTimer <= 0)
                {
                    _reloads.RemoveAt(i);
                    FinishReload(r.inst, r.inv, r.ammoId);
                    var pl = _raid.player;
                    Fb.Sfx("reload_end", pl?.x ?? double.NaN, pl?.y ?? double.NaN);
                }
            }
            var p = _raid.player;
            if (p != null)
            {
                foreach (var inst in new[] { p.equipment.primary, p.equipment.secondary, p.equipment.melee })
                {
                    if (inst?.rt == null) continue;
                    inst.rt.cooldown = Math.Max(0, inst.rt.cooldown - dt);
                    inst.rt.bloom = Math.Max(0, inst.rt.bloom - 2 * dt);
                }
            }
            UpdateProjectiles(dt);
            UpdateGrenades(dt);
        }

        private static double Falloff(Projectile p)
        {
            double R = p.range;
            if (p.traveled <= 0.6 * R) return 1;
            return M.Lerp(1, 0.5, M.Clamp((p.traveled - 0.6 * R) / (0.4 * R), 0, 1));
        }

        private void UpdateProjectiles(double dt)
        {
            var world = _raid.world;
            var hits = new List<(Zombie z, double t)>();
            for (int i = projectiles.Count - 1; i >= 0; i--)
            {
                var p = projectiles[i];
                p.prevX = p.x; p.prevY = p.y;
                p.ttl -= dt;
                double x1 = p.x + p.vx * dt, y1 = p.y + p.vy * dt;
                double segLen = M.Hypot(x1 - p.x, y1 - p.y);
                bool dead = false;
                if (p.traveled + segLen > p.range)
                {
                    double rem = Math.Max(0, p.range - p.traveled);
                    x1 = p.x + p.dirX * rem; y1 = p.y + p.dirY * rem; segLen = rem;
                    dead = true;
                }
                var ray = Physics.RaycastTiles(world, p.x, p.y, x1, y1);
                double ex = ray.x, ey = ray.y;
                bool hitAny = false;
                double minx = Math.Min(p.x, ex), miny = Math.Min(p.y, ey);
                _cands.Clear();
                _raid.hash.QueryRect(minx - 24, miny - 24, Math.Abs(ex - p.x) + 48, Math.Abs(ey - p.y) + 48, _cands);
                hits.Clear();
                foreach (var z in _cands)
                {
                    if (z.dead) continue;
                    double t = Physics.SegmentCircle(p.x, p.y, ex, ey, z.x, z.y, z.radius);
                    if (t >= 0) hits.Add((z, t));
                }
                if (hits.Count > 0)
                {
                    hits.Sort((a, b) => a.t.CompareTo(b.t));
                    double mul = 1;
                    int n = Math.Min(hits.Count, p.pen);
                    for (int k = 0; k < n; k++)
                    {
                        var (z, t) = hits[k];
                        double hx = p.x + (ex - p.x) * t, hy = p.y + (ey - p.y) * t;
                        p.traveled += segLen * t;
                        double dmg = p.dmg * Falloff(p) * mul;
                        var r = _raid.zombies.Damage(z, dmg, p.pen, p.dirX, p.dirY, "bullet");
                        Fb.Effect(Fx.Blood, hx, hy, Math.Atan2(p.dirY, p.dirX), 0.8);
                        if (p.ownerIsPlayer)
                        {
                            Fb.Effect(Fx.HitMarker, hx, hy);
                            Fb.Effect(Fx.FloatingText, hx, hy - 10, 0, 0, M.Round(r.dealt > 0 ? r.dealt : dmg).ToString(), r.killed ? "#ff6b6b" : "#ffe08a");
                            if (p.shooter != null)
                            {
                                if (!p.hitCounted) { p.shooter.stats.shotsHit++; p.hitCounted = true; }
                                p.shooter.stats.damageDealt += r.dealt;
                            }
                        }
                        if (k == 0) Fb.Sfx("zombie_hit", hx, hy, 0.6);
                        mul *= 0.6;
                    }
                    hitAny = true;
                }
                if (hitAny) { projectiles.RemoveAt(i); continue; }
                if (ray.hit)
                {
                    Fb.Effect(Fx.Impact, ray.x, ray.y, Math.Atan2(p.dirY, p.dirX), ray.tile);
                    projectiles.RemoveAt(i);
                    continue;
                }
                p.traveled += segLen;
                p.x = x1; p.y = y1;
                p.trail = Math.Min(p.trail + segLen, 60);
                if (dead || p.ttl <= 0) projectiles.RemoveAt(i);
            }
        }

        private void UpdateGrenades(double dt)
        {
            var world = _raid.world;
            var gs = _raid.grenades;
            for (int i = gs.Count - 1; i >= 0; i--)
            {
                var g = gs[i];
                g.fuse -= dt;
                g.rot += dt * 10;
                g.vz -= 650 * dt;
                g.z += g.vz * dt;
                bool landed = false;
                if (g.z <= 0)
                {
                    g.z = 0;
                    if (Math.Abs(g.vz) > 60) { g.vz = -g.vz * 0.35; landed = true; } else g.vz = 0;
                    g.vx *= 0.55; g.vy *= 0.55;
                }
                double nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
                if (world.BlocksBullets(M.Floor(nx / TILE), M.Floor(g.y / TILE))) g.vx = -g.vx * 0.5; else g.x = nx;
                if (world.BlocksBullets(M.Floor(g.x / TILE), M.Floor(ny / TILE))) g.vy = -g.vy * 0.5; else g.y = ny;
                if (g.z == 0) { double k = Math.Exp(-4 * dt); g.vx *= k; g.vy *= k; }
                if ((g.kind == "molotov" && (landed || (g.z == 0 && g.vz == 0))) || g.fuse <= 0)
                {
                    gs.RemoveAt(i);
                    Explode(g);
                }
            }
        }

        private void Explode(Grenade g)
        {
            double R = g.g.radius > 0 ? g.g.radius : 140;
            var zs = _raid.zombies;
            var p = _raid.player;
            if (g.kind == "molotov")
            {
                _raid.AddHazard("fire", g.x, g.y, R * 0.6, 9);
                Fb.Sfx("fire", g.x, g.y);
                Fb.Effect(Fx.Explosion, g.x, g.y, R * 0.4);
                _raid.EmitNoise(g.x, g.y, g.g.noise > 0 ? g.g.noise : 500, "explosion");
                foreach (var z in zs.InRadius(g.x, g.y, R * 0.6)) zs.Damage(z, 25, 3, double.NaN, double.NaN, "fire");
                return;
            }
            if (g.kind == "flash")
            {
                Fb.Sfx("explosion", g.x, g.y, 0.6, 1.6);
                Fb.Effect(Fx.LightFlash, g.x, g.y, R * 4, 0.35);
                foreach (var z in zs.InRadius(g.x, g.y, R * 1.4))
                {
                    if (!Physics.LineOfSight(_raid.world, g.x, g.y, z.x, z.y)) continue;
                    z.state = "stunned"; z.stunTimer = 3.5; z.windupTimer = 0; z.attackAnim = 0;
                }
                if (p != null && M.Dist(p.x, p.y, g.x, g.y) < R * 1.5 && Physics.LineOfSight(_raid.world, g.x, g.y, p.x, p.y))
                {
                    bool facing = Math.Abs(M.AngleDiff(p.angle, M.AngleTo(p.x, p.y, g.x, g.y))) < 1.4;
                    Fb.Effect(Fx.Flash, p.x, p.y, facing ? 1 : 0.5);
                }
                _raid.EmitNoise(g.x, g.y, g.g.noise > 0 ? g.g.noise : 900, "explosion");
                return;
            }
            Fb.Sfx("explosion", g.x, g.y);
            Fb.Effect(Fx.Explosion, g.x, g.y, R);
            if (p != null) Fb.Shake(M.Clamp(18 - M.Dist(p.x, p.y, g.x, g.y) / 40, 2, 18));
            double dmg = g.g.damage > 0 ? g.g.damage : 120;
            foreach (var z in zs.InRadius(g.x, g.y, R))
            {
                if (!Physics.LineOfSight(_raid.world, g.x, g.y, z.x, z.y)) continue;
                double d = M.Dist(g.x, g.y, z.x, z.y);
                double f = M.Clamp(1 - d / R, 0.2, 1);
                double a = M.AngleTo(g.x, g.y, z.x, z.y);
                var r = zs.Damage(z, dmg * f, 3, Math.Cos(a), Math.Sin(a), "explosion");
                if (p != null) p.stats.damageDealt += r.dealt;
            }
            if (p != null && !p.dead)
            {
                double d = M.Dist(p.x, p.y, g.x, g.y);
                if (d < R && Physics.LineOfSight(_raid.world, g.x, g.y, p.x, p.y))
                    p.TakeDamage(dmg * M.Clamp(1 - d / R, 0.15, 1) * 0.7, "Explosion", g.x, g.y, 0.4);
            }
            _raid.EmitNoise(g.x, g.y, g.g.noise > 0 ? g.g.noise : 1100, "explosion");
        }
    }
}
