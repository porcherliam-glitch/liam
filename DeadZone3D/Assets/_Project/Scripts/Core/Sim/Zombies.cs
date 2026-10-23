using System;
using System.Collections.Generic;
using System.Linq;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    public sealed class BossAbility { public string kind; public double t, total, dash, vx, vy; public bool hit; }

    public sealed class Zombie : Entity
    {
        public string uid, id, state, groupId;
        public ZombieDef type;
        public double angle, hp, hpMax, speed, damage, alert, windupTimer, cooldown, pathTimer, wanderTimer, stagger, deathTimer, flash;
        public double abilityTimer, visibleAlpha, doorTimer, legPhase, senseTimer, attackAnim, lastX, lastY, stuckTimer, farTimer;
        public double screamTimer, investigateTime, lookTimer, lostTimer, stunTimer, growlTimer, pathMode, moveX, moveY;
        public double slamTimer = 4, chargeTimer = 7, summonTimer = 12;
        public int phase, pathIdx;
        public bool dead, lurking, hitThisAttack, seesPlayer, sensed;
        public Vec2? target, lastSeen;
        public List<Vec2> path;
        public BossAbility ability;
    }

    public struct DamageResult { public bool killed; public double dealt; }

    /// <summary>Zombie spawning, perception, state machine, boss and spawn director (port of 14_zombies.js).</summary>
    public sealed class ZombieAI
    {
        private const int TILE = World.TILE;
        private const double ActiveRadius = 1500;
        private static readonly Dictionary<string, double> Bleed = new Dictionary<string, double>
        { ["walker"] = 0.15, ["runner"] = 0.2, ["brute"] = 0.5, ["screamer"] = 0.1, ["toxic"] = 0.15, ["armored"] = 0.25, ["stalker"] = 0.35, ["boss"] = 0.5 };

        private readonly Raid _raid;
        public readonly Rng rng, directorRng;
        public readonly List<Zombie> zombies = new List<Zombie>();
        public bool directorEnabled = true;
        private int _pathBudget = 1, _seq;
        public Zombie boss;
        private double _directorTimer = 8;
        private readonly List<Zombie> _near = new List<Zombie>();
        private bool _screamWarned;

        public ZombieAI(Raid raid)
        {
            _raid = raid;
            rng = raid.rng.Fork("ai");
            directorRng = raid.rng.Fork("director");
        }

        public int MaxAlive => _raid.map?.zombies != null && _raid.map.zombies.maxAlive > 0 ? _raid.map.zombies.maxAlive : 90;
        private Player P => _raid.player;
        private World W => _raid.world;
        private IFeedback Fb => _raid.fb;

        public int AliveCount() { int n = 0; foreach (var z in zombies) if (!z.dead) n++; return n; }

        public Zombie Nearest(double x, double y, double r)
        {
            Zombie best = null; double bd = r * r;
            foreach (var z in zombies) { if (z.dead) continue; double d = M.Dist2(x, y, z.x, z.y); if (d <= bd) { bd = d; best = z; } }
            return best;
        }

        public List<Zombie> InRadius(double x, double y, double r)
        {
            var outp = new List<Zombie>();
            foreach (var z in zombies) { if (z.dead) continue; double rr = r + z.radius; if (M.Dist2(x, y, z.x, z.y) <= rr * rr) outp.Add(z); }
            return outp;
        }

        public Zombie Spawn(string typeId, double x, double y, string groupId = null)
        {
            if (typeId == null || !DataTables.ZOMBIE_TYPES.TryGetValue(typeId, out var type) || double.IsNaN(x) || double.IsNaN(y)) return null;
            if (typeId != "boss" && AliveCount() >= MaxAlive) return null;
            double hpMul = _raid.map != null && _raid.map.difficulty >= 3 && typeId != "boss" ? 1.1 : 1;
            double hp0 = M.Round((type.hp > 0 ? type.hp : 60) * hpMul);
            var z = new Zombie
            {
                uid = "z" + (++_seq), type = type, id = typeId, x = x, y = y, angle = rng.Float(-Math.PI, Math.PI), radius = type.radius > 0 ? type.radius : 13,
                hp = hp0, hpMax = hp0, speed = (type.speed > 0 ? type.speed : 55) * rng.Float(0.9, 1.1), damage = type.damage > 0 ? type.damage : 10,
                state = type.lurk ? "lurk" : "idle", pathTimer = rng.Float(0, 2), wanderTimer = rng.Float(1, 5), groupId = groupId, lurking = type.lurk,
                visibleAlpha = type.lurk ? (type.alpha > 0 ? type.alpha : 0.35) : 1, legPhase = rng.Float(0, 6), senseTimer = rng.Float(0, 0.15),
                lastX = x, lastY = y, farTimer = rng.Float(0, 0.5), screamTimer = type.screamCooldown > 0 ? rng.Float(1.5, 4) : 0, growlTimer = rng.Float(2, 9),
            };
            if (typeId == "boss") boss = z;
            zombies.Add(z);
            return z;
        }

        public void SpawnInitial()
        {
            var w = W;
            for (int i = 0; i < w.zombieSpawns.Count; i++)
            {
                var s = w.zombieSpawns[i];
                string gid = "g" + i;
                foreach (var t in s.types)
                {
                    double px = s.x, py = s.y;
                    for (int tries = 0; tries < 8; tries++)
                    {
                        double ox = s.x + rng.Float(-40, 40), oy = s.y + rng.Float(-40, 40);
                        if (w.IsWalkable(M.Floor(ox / TILE), M.Floor(oy / TILE))) { px = ox; py = oy; break; }
                    }
                    Spawn(t, px, py, gid);
                }
            }
        }

        public List<Zombie> SpawnNearPlayer(string typeId, double minDist = 500, double maxDist = 900, int count = 1, string groupId = null)
        {
            groupId = groupId ?? Uid.Next();
            var p = P; var w = W;
            var outp = new List<Zombie>();
            if (p == null) return outp;
            for (int n = 0; n < count; n++)
            {
                if (AliveCount() >= MaxAlive) break;
                Vec2? spot = null, lastWalk = null;
                for (int k = 0; k < 12 && !spot.HasValue; k++)
                {
                    double a = rng.Float(0, Math.PI * 2), d = rng.Float(minDist, maxDist);
                    double x = p.x + Math.Cos(a) * d, y = p.y + Math.Sin(a) * d;
                    if (!w.IsWalkable(M.Floor(x / TILE), M.Floor(y / TILE)))
                    {
                        var r = _raid.nav.RandomWalkable(rng, x, y, 2);
                        if (!r.HasValue) continue;
                        x = r.Value.x; y = r.Value.y;
                    }
                    if (x < 3 * TILE || y < 3 * TILE || x > w.PixelW - 3 * TILE || y > w.PixelH - 3 * TILE) continue;
                    lastWalk = new Vec2(x, y);
                    if (!Physics.LineOfSight(w, p.x, p.y, x, y)) spot = new Vec2(x, y);
                }
                if (!spot.HasValue) spot = lastWalk;
                if (!spot.HasValue) continue;
                var z = Spawn(typeId, spot.Value.x, spot.Value.y, groupId);
                if (z != null)
                {
                    z.state = "investigate"; z.target = new Vec2(p.x, p.y); z.alert = 0.7; z.investigateTime = 0;
                    outp.Add(z);
                }
            }
            return outp;
        }

        public void OnNoise(double x, double y, double radius, string kind, double strength = 1)
        {
            var w = W; var p = P;
            if (!(radius > 0)) return;
            bool srcIndoor = w.IsIndoor(x, y);
            var srcB = w.BuildingAt(x, y);
            foreach (var z in zombies)
            {
                if (z.dead || z.state == "stunned") continue;
                double r = radius * (z.type.hearingMult > 0 ? z.type.hearingMult : 1) * strength;
                if (srcIndoor && w.BuildingAt(z.x, z.y) != srcB) r *= 0.6;
                double d2v = M.Dist2(x, y, z.x, z.y);
                if (d2v > r * r) continue;
                if (z.lurking && kind != "scream" && kind != "explosion") continue;
                if (z.lurking) z.lurking = false;
                bool nearPlayer = p != null && M.Dist(x, y, p.x, p.y) < 80;
                var tgt = nearPlayer ? new Vec2(p.x, p.y) : new Vec2(x, y);
                if (z.state == "chase" || z.state == "attack" || z.state == "ability")
                {
                    if (!z.seesPlayer) z.lastSeen = tgt;
                    continue;
                }
                if (kind == "scream" || z.alert > 0.5)
                {
                    z.state = "chase"; z.alert = 1; z.lastSeen = tgt; z.lostTimer = 0;
                }
                else
                {
                    double d = Math.Sqrt(d2v);
                    double spread = Math.Min(120, d * 0.15);
                    z.state = "investigate";
                    double ox = rng.Float(-spread, spread), oy = rng.Float(-spread, spread);
                    z.target = new Vec2(tgt.x + ox, tgt.y + oy);
                    z.investigateTime = 0; z.lookTimer = 0; z.path = null; z.pathTimer = 0;
                    z.alert = Math.Max(z.alert, 0.6);
                }
            }
        }

        public void AlertGroup(Zombie z)
        {
            if (z?.groupId == null) return;
            foreach (var o in zombies)
            {
                if (o == z || o.dead || o.groupId != z.groupId) continue;
                if (o.state != "idle" && o.state != "wander") continue;
                if (M.Dist2(o.x, o.y, z.x, z.y) > 320 * 320) continue;
                o.state = "investigate";
                o.target = z.lastSeen ?? new Vec2(z.x, z.y);
                o.alert = Math.Max(o.alert, 0.6);
                o.investigateTime = 0; o.path = null; o.pathTimer = 0;
            }
        }

        public DamageResult Damage(Zombie z, double amount, int pen = 1, double dirX = double.NaN, double dirY = double.NaN, string source = null)
        {
            if (z == null || z.dead || !(amount > 0)) return new DamageResult();
            double red = 0;
            if (z.type.armor > 0 && z.type.armorArc > 0 && !double.IsNaN(dirX) && !double.IsNaN(dirY))
            {
                double from = Math.Atan2(-dirY, -dirX);
                if (Math.Abs(M.AngleDiff(z.angle, from)) < z.type.armorArc / 2)
                {
                    red = pen >= 3 ? 0 : pen == 2 ? z.type.armor * 0.5 : z.type.armor;
                    if (red > 0 && source == "bullet") Fb.Effect(Fx.Impact, z.x - dirX * z.radius, z.y - dirY * z.radius, Math.Atan2(dirY, dirX), T.FENCE);
                }
            }
            else if (z.type.armor > 0 && z.type.armorArc <= 0) red = z.type.armor * (pen >= 3 ? 0 : pen == 2 ? 0.5 : 1);
            double dealt = Math.Min(z.hp, amount * (1 - red));
            z.hp -= dealt;
            z.flash = 0.12;
            if (dealt >= z.hpMax * 0.25 && z.id != "brute" && z.id != "boss") { z.stagger = 0.35; z.windupTimer = 0; z.attackAnim = 0; }
            var p = P;
            if (z.lurking) z.lurking = false;
            if (p != null && z.state != "chase" && z.state != "attack" && z.state != "ability")
            {
                z.state = "chase"; z.alert = 1; z.lastSeen = new Vec2(p.x, p.y); z.lostTimer = 0;
                AlertGroup(z);
            }
            if (z.hp <= 0) { Kill(z); return new DamageResult { killed = true, dealt = dealt }; }
            return new DamageResult { dealt = dealt };
        }

        public void Kill(Zombie z, bool silent = false)
        {
            if (z == null || z.dead) return;
            z.dead = true; z.hp = 0; z.state = "dead"; z.deathTimer = 0; z.attackAnim = 0; z.windupTimer = 0;
            if (silent) return;
            foreach (var inst in _raid.loot.RollZombieDrop(z.type)) _raid.DropItem(inst, z.x, z.y);
            var p = P;
            if (p != null)
            {
                p.stats.kills++;
                p.stats.killsByType[z.id] = (p.stats.killsByType.TryGetValue(z.id, out var k) ? k : 0) + 1;
            }
            int xp = z.type.xp > 0 ? z.type.xp : 10;
            _raid.AddXp(xp);
            Fb.Effect(Fx.Blood, z.x, z.y, z.angle + Math.PI, 2);
            Fb.Effect(Fx.FloatingText, z.x, z.y - 24, 0, 1, "+" + xp + " EP", "#9fe870");
            Fb.Sfx(z.id == "boss" ? "boss_roar" : "zombie_die", z.x, z.y);
            if (z.id == "toxic")
            {
                double tr = (z.type.toxicRadius > 0 ? z.type.toxicRadius : 70) * 1.3;
                _raid.AddHazard("toxic", z.x, z.y, tr, z.type.toxicDuration > 0 ? z.type.toxicDuration : 8);
                Fb.Effect(Fx.ToxicCloud, z.x, z.y, tr);
                Fb.Sfx("toxic", z.x, z.y);
            }
            _raid.events.Emit(new SimEvent("kill") { x = z.x, y = z.y, id = z.id, data = z });
            if (z.id == "boss")
            {
                _raid.bossKilled = true;
                _raid.events.Emit(new SimEvent("bossDead") { x = z.x, y = z.y, data = z });
                Fb.Toast("Der Wirt ist tot!", "success", 4000);
                Fb.Shake(14);
            }
        }

        public void Update(double dt)
        {
            var p = P;
            _pathBudget = 1;
            for (int i = zombies.Count - 1; i >= 0; i--)
            {
                var z = zombies[i];
                if (!z.dead) continue;
                z.deathTimer += dt;
                if (z.deathTimer >= (z.id == "boss" ? 60 : 25))
                {
                    zombies.RemoveAt(i);
                    if (boss == z) boss = null;
                }
            }
            foreach (var z in zombies.ToArray())
            {
                if (z.dead) continue;
                z.flash = Math.Max(0, z.flash - dt);
                double d = p != null ? M.Dist(z.x, z.y, p.x, p.y) : double.PositiveInfinity;
                if (d > ActiveRadius) { FarUpdate(z, dt); continue; }
                UpdateOne(z, dt, d);
            }
            Director(dt);
        }

        private void Director(double dt)
        {
            if (!directorEnabled || P == null || P.dead) return;
            _directorTimer -= dt;
            if (_directorTimer > 0) return;
            _directorTimer = 8;
            var p = P;
            int near = 0;
            foreach (var z in zombies) if (!z.dead && M.Dist2(z.x, z.y, p.x, p.y) < 1200 * 1200) near++;
            if (near >= 4 || AliveCount() >= MaxAlive) return;
            var weights = (_raid.map?.zombies?.weights ?? new Dictionary<string, double> { ["walker"] = 1 })
                .Where(kv => kv.Key != "boss" && DataTables.ZOMBIE_TYPES.ContainsKey(kv.Key)).ToList();
            var pick = directorRng.Weighted(weights, kv => kv.Value);
            string id = pick.Key ?? "walker";
            foreach (var q in SpawnNearPlayer(id, 700, 1100, directorRng.Int(2, 4))) { q.state = "wander"; q.alert = 0; }
        }

        private void FarUpdate(Zombie z, double dt)
        {
            z.farTimer += dt;
            if (z.farTimer < 0.5) return;
            double fdt = z.farTimer;
            z.farTimer = 0;
            z.attackAnim = 0; z.windupTimer = 0;
            double? tx = null, ty = null;
            double spd = z.speed * 0.5;
            if ((z.state == "chase" || z.state == "investigate") && (z.lastSeen.HasValue || z.target.HasValue))
            {
                var t = z.state == "chase" ? z.lastSeen : z.target;
                if (t.HasValue)
                {
                    tx = t.Value.x; ty = t.Value.y; spd = z.speed * 0.8;
                    if (M.Dist(z.x, z.y, tx.Value, ty.Value) < 24) { z.state = "wander"; z.alert = 0; }
                }
            }
            else
            {
                z.wanderTimer -= fdt;
                if (z.wanderTimer <= 0)
                {
                    z.wanderTimer = rng.Float(3, 8);
                    var r = _raid.nav.RandomWalkable(rng, z.x, z.y, 5);
                    z.target = r; z.state = r.HasValue ? "wander" : "idle";
                }
                if (z.target.HasValue) { tx = z.target.Value.x; ty = z.target.Value.y; }
            }
            if (!tx.HasValue) return;
            double dx = tx.Value - z.x, dy = ty.Value - z.y, l = M.Hypot(dx, dy);
            if (l < 2) return;
            double step = Math.Min(l, spd * fdt);
            var m = Physics.MoveCircle(W, z.x, z.y, z.radius, dx / l * step, dy / l * step);
            z.x = m.x; z.y = m.y;
            z.angle = Math.Atan2(dy, dx);
        }

        private double DarknessAt(double x, double y) => _raid.DarknessAt(x, y);

        private void Sense(Zombie z, double d)
        {
            var p = P;
            if (p == null || p.dead) { z.seesPlayer = false; return; }
            double lf = 1 - 0.45 * DarknessAt(z.x, z.y);
            if (p.flashlightOn) lf = Math.Max(lf, 0.9);
            double range = (z.type.sightRange > 0 ? z.type.sightRange : 380) * lf * (p.crouching ? 0.65 : 1);
            bool close = d < 56;
            bool sees = (d <= range || close) && Physics.LineOfSight(W, z.x, z.y, p.x, p.y);
            z.seesPlayer = sees;
            z.sensed = true;
            if (!sees) return;
            z.lastSeen = new Vec2(p.x, p.y);
            z.lostTimer = 0;
            if (z.lurking)
            {
                if (d > (z.type.ambushRange > 0 ? z.type.ambushRange : 220)) return;
                z.lurking = false;
            }
            if (z.state != "chase" && z.state != "attack" && z.state != "ability")
            {
                z.state = "chase"; z.alert = 1; z.path = null;
                AlertGroup(z);
                Fb.Sfx(z.id == "boss" ? "boss_roar" : "zombie_alert", z.x, z.y, 0.8);
            }
        }

        private void UpdateOne(Zombie z, double dt, double d)
        {
            var p = P; var w = W; var type = z.type;
            if (z.growlTimer > 0) z.growlTimer -= dt;
            else
            {
                z.growlTimer = rng.Float(4, 10);
                if (d < 700) Fb.Sfx("zombie_growl", z.x, z.y, z.id == "brute" || z.id == "boss" ? 1 : 0.7, z.id == "runner" ? 1.25 : z.id == "brute" ? 0.7 : 1);
            }
            if (z.state == "stunned")
            {
                z.stunTimer -= dt;
                z.attackAnim = 0;
                if (z.stunTimer <= 0) z.state = z.lastSeen.HasValue ? "chase" : "idle";
                return;
            }
            z.senseTimer -= dt;
            if (z.senseTimer <= 0) { z.senseTimer += 0.15; Sense(z, d); }
            if (type.lurk)
            {
                bool inCone = p != null && p.flashlightOn && d < 380 && Math.Abs(M.AngleDiff(p.angle, M.AngleTo(p.x, p.y, z.x, z.y))) < 0.55;
                double alpha = type.alpha > 0 ? type.alpha : 0.35;
                double target = inCone || d < 90 ? 1 : (z.state == "lurk" || z.lurking ? alpha : 0.55);
                z.visibleAlpha += (target - z.visibleAlpha) * Math.Min(1, dt * 6);
                if (z.lurking && p != null && d <= (type.ambushRange > 0 ? type.ambushRange : 220) && Physics.LineOfSight(w, z.x, z.y, p.x, p.y))
                {
                    z.lurking = false; z.state = "chase"; z.alert = 1; z.lastSeen = new Vec2(p.x, p.y);
                    Fb.Sfx("zombie_alert", z.x, z.y, 1, 1.3);
                }
            }
            if (z.stagger > 0) { z.stagger -= dt; z.attackAnim = Math.Max(0, z.attackAnim - dt * 4); Separate(z); return; }
            if (z.id == "boss") BossPhase(z);
            if (type.screamCooldown > 0 && (z.state == "chase" || z.state == "attack"))
            {
                z.screamTimer -= dt;
                if (z.screamTimer <= 0 && d < 1000)
                {
                    z.screamTimer = type.screamCooldown;
                    Fb.Sfx("screamer", z.x, z.y);
                    _raid.EmitNoise(z.x, z.y, type.screamRadius > 0 ? type.screamRadius : 1000, "scream");
                    var s = type.summon != null && type.summon.Length >= 2 ? type.summon : new double[] { 2, 4 };
                    SpawnNearPlayer("walker", 500, 900, rng.Int((int)s[0], (int)s[1]));
                    z.attackAnim = 1;
                    if (!_screamWarned) { _screamWarned = true; Fb.Toast("Ein Schreier ruft Verstärkung!", "warning"); }
                }
            }
            double mvx = 0, mvy = 0, spd = 0;
            double reach = z.radius + (p?.radius ?? 12) + (type.attackRange > 0 ? type.attackRange : 10);
            switch (z.state)
            {
                case "lurk": break;
                case "idle":
                    z.wanderTimer -= dt;
                    z.attackAnim = Math.Max(0, z.attackAnim - dt * 2);
                    if (z.wanderTimer <= 0) { z.wanderTimer = rng.Float(2, 6); if (!rng.Chance(0.4)) { z.state = "wander"; z.target = null; z.path = null; } }
                    break;
                case "wander":
                    {
                        z.wanderTimer -= dt;
                        if (!z.target.HasValue || z.wanderTimer <= 0)
                        {
                            z.wanderTimer = rng.Float(2, 6);
                            if (rng.Chance(0.4)) { z.state = "idle"; break; }
                            Zombie near = null;
                            if (z.alert == 0 && z.groupId != null)
                                foreach (var o in zombies) if (o != z && !o.dead && o.groupId == z.groupId && M.Dist2(o.x, o.y, z.x, z.y) < 200 * 200) { near = o; break; }
                            if (near != null) { double ox = rng.Float(-96, 96), oy = rng.Float(-96, 96); z.target = new Vec2(near.x + ox, near.y + oy); }
                            else z.target = _raid.nav.RandomWalkable(rng, z.x, z.y, 6);
                            z.path = null; z.pathTimer = 0;
                            if (!z.target.HasValue) { z.state = "idle"; break; }
                        }
                        var v = SteerTo(z, z.target, dt);
                        if (v.HasValue) { mvx = v.Value.x; mvy = v.Value.y; spd = z.speed * 0.5; } else z.target = null;
                        break;
                    }
                case "investigate":
                    {
                        z.investigateTime += dt;
                        if (!z.target.HasValue || z.investigateTime > 10) { z.state = "wander"; z.alert = Math.Max(0, z.alert - 0.3); z.target = null; break; }
                        if (M.Dist(z.x, z.y, z.target.Value.x, z.target.Value.y) < 24)
                        {
                            z.lookTimer += dt;
                            z.angle += Math.Sin(z.lookTimer * 2.2) * dt * 1.6;
                            if (z.lookTimer > 3) { z.state = "wander"; z.alert = 0.3; z.target = null; }
                            break;
                        }
                        var v = SteerTo(z, z.target, dt);
                        if (v.HasValue) { mvx = v.Value.x; mvy = v.Value.y; spd = z.speed * 0.8; }
                        break;
                    }
                case "chase":
                    {
                        if (p == null || p.dead) { z.state = "wander"; break; }
                        if (!z.seesPlayer)
                        {
                            z.lostTimer += dt;
                            if (z.lostTimer > 6)
                            {
                                z.state = "investigate"; z.target = z.lastSeen;
                                z.investigateTime = 0; z.lookTimer = 0; z.path = null; break;
                            }
                        }
                        if (d <= reach && (z.seesPlayer || !z.sensed)) { z.state = "attack"; z.cooldown = Math.Min(z.cooldown, 0.05); break; }
                        if (z.id == "boss" && BossAbilities(z, d, dt)) break;
                        var v = ChaseDir(z, d, dt);
                        if (v.HasValue) { mvx = v.Value.x; mvy = v.Value.y; spd = z.speed * (z.id == "boss" ? BossSpeedMul(z) : 1); }
                        z.stuckTimer += dt;
                        if (z.stuckTimer >= 1.5)
                        {
                            if (M.Dist(z.x, z.y, z.lastX, z.lastY) < 4 && _pathBudget > 0)
                            {
                                _pathBudget--;
                                var goal = z.seesPlayer ? new Vec2(p.x, p.y) : (z.lastSeen ?? new Vec2(p.x, p.y));
                                z.path = _raid.nav.FindPath(z.x, z.y, goal.x, goal.y);
                                z.pathIdx = 0; z.pathMode = 2;
                            }
                            z.stuckTimer = 0; z.lastX = z.x; z.lastY = z.y;
                        }
                        break;
                    }
                case "attack":
                    {
                        if (p == null || p.dead) { z.state = "wander"; break; }
                        z.angle = M.LerpAngle(z.angle, M.AngleTo(z.x, z.y, p.x, p.y), Math.Min(1, dt * 10));
                        double windup = type.windup > 0 ? type.windup : 0.45, acd = type.attackCooldown > 0 ? type.attackCooldown : 1.2;
                        if (z.windupTimer > 0)
                        {
                            z.windupTimer -= dt;
                            z.attackAnim = M.Clamp(1 - z.windupTimer / Math.Max(0.05, windup), 0, 1);
                            if (z.windupTimer <= 0)
                            {
                                z.windupTimer = 0;
                                if (d <= reach * 1.3) Hit(z);
                                z.attackAnim = 1;
                                z.cooldown = acd;
                            }
                            break;
                        }
                        if (z.cooldown > 0)
                        {
                            z.cooldown -= dt;
                            z.attackAnim = M.Clamp(z.cooldown / acd, 0, 1) * 0.8;
                            if (d > reach * 0.8) { var v = ChaseDir(z, d, dt); if (v.HasValue) { mvx = v.Value.x; mvy = v.Value.y; spd = z.speed * 0.6; } }
                            if (d > reach * 1.6 && z.cooldown <= 0) z.state = "chase";
                            break;
                        }
                        if (d <= reach) { z.windupTimer = windup; z.hitThisAttack = false; }
                        else z.state = "chase";
                        break;
                    }
                case "ability": BossAbilityUpdate(z, d, dt); break;
                default: z.state = "idle"; break;
            }
            if (spd > 0 && (mvx != 0 || mvy != 0)) Move(z, mvx, mvy, spd, dt);
            else z.doorTimer = 0;
            Separate(z);
            if (p != null && !p.dead)
            {
                double min = z.radius + p.radius;
                double dd = M.Dist(z.x, z.y, p.x, p.y);
                if (dd < min && dd > 0.01)
                {
                    var m = Physics.MoveCircle(w, z.x, z.y, z.radius, (z.x - p.x) / dd * (min - dd), (z.y - p.y) / dd * (min - dd));
                    z.x = m.x; z.y = m.y;
                }
            }
        }

        private Vec2? SteerTo(Zombie z, Vec2? target, double dt)
        {
            if (!target.HasValue) return null;
            double dx = target.Value.x - z.x, dy = target.Value.y - z.y;
            double l = M.Hypot(dx, dy);
            if (l < 8) return null;
            z.pathTimer -= dt;
            if (z.path != null && z.pathIdx < z.path.Count)
            {
                var wp = z.path[z.pathIdx];
                double wx = wp.x - z.x, wy = wp.y - z.y, wl = M.Hypot(wx, wy);
                if (wl < 10) { z.pathIdx++; return SteerTo(z, target, 0); }
                return new Vec2(wx / wl, wy / wl);
            }
            bool los = Physics.LineOfSight(W, z.x, z.y, target.Value.x, target.Value.y);
            if (!los && z.pathTimer <= 0 && _pathBudget > 0)
            {
                _pathBudget--;
                z.pathTimer = 2;
                z.path = _raid.nav.FindPath(z.x, z.y, target.Value.x, target.Value.y);
                z.pathIdx = 0;
                if (z.path == null) return new Vec2(dx / l, dy / l);
                return SteerTo(z, target, 0);
            }
            return new Vec2(dx / l, dy / l);
        }

        private Vec2? ChaseDir(Zombie z, double d, double dt)
        {
            var p = P;
            if (z.pathMode > 0 && z.path != null && z.pathIdx < z.path.Count)
            {
                z.pathMode -= dt;
                var wp = z.path[z.pathIdx];
                double wx = wp.x - z.x, wy = wp.y - z.y, wl = M.Hypot(wx, wy);
                if (wl < 10) z.pathIdx++;
                if (wl > 0.01) return new Vec2(wx / wl, wy / wl);
            }
            if (z.seesPlayer && d <= 48) return new Vec2((p.x - z.x) / Math.Max(1, d), (p.y - z.y) / Math.Max(1, d));
            var fd = _raid.nav.DirAt(z.x, z.y);
            if (fd.HasValue && d > 48)
            {
                if (z.seesPlayer)
                {
                    double dx0 = (p.x - z.x) / d, dy0 = (p.y - z.y) / d;
                    double bx = fd.Value.x * 0.6 + dx0 * 0.4, by = fd.Value.y * 0.6 + dy0 * 0.4, bl = M.Hypot(bx, by);
                    if (bl == 0) bl = 1;
                    return new Vec2(bx / bl, by / bl);
                }
                return fd;
            }
            var t = z.seesPlayer ? new Vec2(p.x, p.y) : (z.lastSeen ?? new Vec2(p.x, p.y));
            double dx = t.x - z.x, dy = t.y - z.y, l = M.Hypot(dx, dy);
            if (l < 4) return null;
            return new Vec2(dx / l, dy / l);
        }

        private void Move(Zombie z, double dx, double dy, double spd, double dt)
        {
            var w = W;
            double tileMul = w.SpeedMul(M.Floor(z.x / TILE), M.Floor(z.y / TILE));
            double step = spd * tileMul * dt;
            double px = z.x + dx * (z.radius + 6), py = z.y + dy * (z.radius + 6);
            int ptx = M.Floor(px / TILE), pty = M.Floor(py / TILE);
            if (w.Tile(ptx, pty) == T.DOOR_CLOSED)
            {
                z.doorTimer += dt;
                z.attackAnim = 0.5 + 0.5 * Math.Sin(z.doorTimer * 12);
                if (z.doorTimer >= (z.id == "brute" || z.id == "boss" ? 0.3 : 1.2))
                {
                    z.doorTimer = 0;
                    _raid.ToggleDoor(ptx, pty, true);
                }
            }
            else z.doorTimer = 0;
            double ox = z.x, oy = z.y;
            var m = Physics.MoveCircle(w, z.x, z.y, z.radius, dx * step, dy * step);
            z.x = m.x; z.y = m.y;
            double moved = M.Hypot(z.x - ox, z.y - oy);
            z.legPhase += moved * (z.id == "runner" ? 0.16 : 0.1);
            z.moveX = dx; z.moveY = dy;
            if (z.state != "attack") z.angle = M.LerpAngle(z.angle, Math.Atan2(dy, dx), Math.Min(1, dt * 8));
        }

        private void Separate(Zombie z)
        {
            _near.Clear();
            _raid.hash.Query(z.x, z.y, 40, _near);
            int n = 0; double pxs = 0, pys = 0;
            foreach (var o in _near)
            {
                if (o == z || o.dead) continue;
                double dx = z.x - o.x, dy = z.y - o.y;
                double r = z.radius + o.radius;
                double d2v = dx * dx + dy * dy;
                if (d2v >= r * r) continue;
                double d = Math.Sqrt(d2v);
                if (d == 0) d = 0.01;
                double push = (r - d) * (o.id == "boss" || o.id == "brute" ? 0.8 : 0.5);
                pxs += dx / d * push; pys += dy / d * push;
                if (++n >= 6) break;
            }
            if (n > 0 && (pxs != 0 || pys != 0))
            {
                if (z.id == "boss") { pxs *= 0.2; pys *= 0.2; }
                var m = Physics.MoveCircle(W, z.x, z.y, z.radius, M.Clamp(pxs, -8, 8), M.Clamp(pys, -8, 8));
                z.x = m.x; z.y = m.y;
            }
        }

        private void Hit(Zombie z)
        {
            var p = P; var type = z.type;
            if (p == null || p.dead || z.hitThisAttack) return;
            if (!Physics.LineOfSight(W, z.x, z.y, p.x, p.y)) return;
            z.hitThisAttack = true;
            Fb.Sfx("zombie_attack", z.x, z.y);
            p.TakeDamage(z.damage, type.name ?? "Zombie", z.x, z.y, Bleed.TryGetValue(z.id, out var b) ? b : 0.15);
            if (z.id == "brute")
            {
                double a = M.AngleTo(z.x, z.y, p.x, p.y);
                double kb = (type.knockback > 0 ? type.knockback : 140) / 0.2;
                p.knock = (Math.Cos(a) * kb, Math.Sin(a) * kb, 0.2);
                Fb.Shake(9);
            }
            if (z.id == "toxic")
            {
                double tr = type.toxicRadius > 0 ? type.toxicRadius : 70;
                _raid.AddHazard("toxic", p.x, p.y, tr, type.toxicDuration > 0 ? type.toxicDuration : 8);
                p.toxic = Math.Max(p.toxic, 4);
                Fb.Effect(Fx.ToxicCloud, p.x, p.y, tr);
                Fb.Sfx("toxic", p.x, p.y);
            }
        }

        // ------------------------------------------------------------------ boss
        private static double BossSpeedMul(Zombie z)
        {
            var phases = z.type.phases;
            return phases != null && z.phase < phases.Length && phases[z.phase].speedMul > 0 ? phases[z.phase].speedMul : 1;
        }

        private void BossPhase(Zombie z)
        {
            var phases = z.type.phases ?? new BossPhase[0];
            double pct = z.hp / z.hpMax;
            int ph = 0;
            for (int i = 0; i < phases.Length; i++) if (pct <= phases[i].hpPct) ph = i;
            if (ph > z.phase)
            {
                z.phase = ph;
                Fb.Sfx("boss_roar", z.x, z.y);
                Fb.Shake(12);
                Fb.Toast(ph == 1 ? "Der Wirt wird rasend!" : "Der Wirt ruft seine Brut!", "danger", 3000);
                _raid.EmitNoise(z.x, z.y, 1200, "scream");
            }
        }

        private bool BossAbilities(Zombie z, double d, double dt)
        {
            var phases = z.type.phases;
            var abil = phases != null && z.phase < phases.Length && phases[z.phase].abilities != null ? phases[z.phase].abilities : new[] { "slam" };
            z.slamTimer -= dt; z.chargeTimer -= dt; z.summonTimer -= dt;
            if (abil.Contains("summon") && z.summonTimer <= 0)
            {
                z.summonTimer = 15;
                SpawnNearPlayer("walker", 300, 500, 3);
                Fb.Sfx("screamer", z.x, z.y, 1, 0.7);
            }
            if (abil.Contains("slam") && z.slamTimer <= 0 && d < 170)
            {
                z.state = "ability"; z.ability = new BossAbility { kind = "slam", t = 0.7, total = 0.7 };
                return true;
            }
            if (abil.Contains("charge") && z.chargeTimer <= 0 && d > 180 && d < 650 && z.seesPlayer)
            {
                double a = M.AngleTo(z.x, z.y, P.x, P.y);
                z.state = "ability"; z.ability = new BossAbility { kind = "charge", t = 0.5, total = 0.5, dash = 0.9, vx = Math.Cos(a), vy = Math.Sin(a) };
                Fb.Sfx("boss_roar", z.x, z.y, 0.7);
                return true;
            }
            return false;
        }

        private void BossAbilityUpdate(Zombie z, double d, double dt)
        {
            var ab = z.ability; var p = P;
            if (ab == null || p == null) { z.state = "chase"; return; }
            if (ab.kind == "slam")
            {
                ab.t -= dt;
                z.attackAnim = M.Clamp(1 - ab.t / ab.total, 0, 1);
                if (ab.t <= 0)
                {
                    if (d <= 120 + p.radius) p.TakeDamage(45, z.type.name ?? "Boss", z.x, z.y, 0.3);
                    Fb.Effect(Fx.Explosion, z.x, z.y, 60);
                    Fb.Shake(12);
                    Fb.Sfx("explosion", z.x, z.y, 0.6, 0.6);
                    z.slamTimer = 6;
                    z.ability = null; z.state = "chase"; z.attackAnim = 1; z.cooldown = 0.8;
                }
                return;
            }
            if (ab.kind == "charge")
            {
                if (ab.t > 0) { ab.t -= dt; z.attackAnim = M.Clamp(1 - ab.t / ab.total, 0, 1) * 0.6; z.angle = Math.Atan2(ab.vy, ab.vx); return; }
                ab.dash -= dt;
                double step = 420 * dt;
                var m = Physics.MoveCircle(W, z.x, z.y, z.radius, ab.vx * step, ab.vy * step);
                bool blocked = m.collided && M.Hypot(m.x - z.x, m.y - z.y) < step * 0.3;
                z.x = m.x; z.y = m.y;
                z.legPhase += step * 0.08;
                if (!ab.hit && M.Dist(z.x, z.y, p.x, p.y) < z.radius + p.radius + 8)
                {
                    ab.hit = true;
                    p.TakeDamage(50, z.type.name ?? "Boss", z.x, z.y, 0.5);
                    p.knock = (ab.vx * 900, ab.vy * 900, 0.2);
                    Fb.Shake(14);
                }
                if (ab.dash <= 0 || blocked)
                {
                    if (blocked) Fb.Shake(8);
                    z.chargeTimer = 9;
                    z.ability = null; z.state = "chase";
                    if (blocked) z.stagger = 0.6;
                }
            }
        }
    }
}
