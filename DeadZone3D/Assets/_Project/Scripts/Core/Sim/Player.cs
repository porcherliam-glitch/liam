using System;
using System.Collections.Generic;
using System.Linq;
using DeadZone.Core.Data;

namespace DeadZone.Core
{
    /// <summary>What the player takes into a raid.</summary>
    public sealed class Loadout
    {
        public Equipment equipment;
        public Inventory inventory, secure;
        public double hp = 100, hpMax = 100, hunger = 100, thirst = 100, carryLimit = 30;
    }

    public sealed class UseChannel { public ItemInst inst; public double timer, total; public string name; }

    /// <summary>Player character (port of 13_player.js).</summary>
    public sealed class Player : Entity
    {
        private const int TILE = World.TILE;
        private readonly Raid _raid;
        public double angle;
        public Equipment equipment;
        public Inventory inventory, secure;
        public double hpMax, hp, stamina = 100, staminaMax = 100, hunger, thirst, toxic, bleedTimer;
        public bool bleeding, crouching, sprinting, moving, flashlightOn = true, dead, god;
        public readonly List<Effect> effects = new List<Effect>();
        public int activeSlot;
        public UseChannel usingItem;
        public Interactable interactTarget;
        public double holdProgress;
        public string holdLabel, causeOfDeath;
        public readonly PlayerStats stats = new PlayerStats();
        public double staminaDelay, stepTimer, legPhase, meleeAnim, hurtTimer, grenadeCooldown, bleedFx;
        public (double vx, double vy, double t)? knock;
        private bool _lastFire, _warnHunger, _warnThirst;
        public double carryLimitBase;
        /// <summary>First person: interaction prefers what the player looks at (set by the view layer).</summary>
        public bool interactByLook;
        /// <summary>Grenade throw strength 0.3..1.5 (first person: from the view pitch; 1 = default range).</summary>
        public double throwPower = 1;
        /// <summary>First person: zoom is held (set by the view layer). Tighter spread, slower walk, no sprint.</summary>
        public bool aiming;
        /// <summary>First person: sprint only roughly forward (within about 60° of the view direction).</summary>
        public bool sprintForwardOnly;
        /// <summary>First person: vertical aim in radians, positive = looking down. Shots then fly along the line of sight
        /// (over heads, into the floor, head shots). NaN = flat 2D shots as in the top-down view.</summary>
        public double aimPitch = double.NaN;
        /// <summary>First person: eye height in sim px (16 px per metre; 1.62 m standing = 26 px), where aimed shots start.</summary>
        public double eyeHeightPx = 1.62 * PxPerMetre;
        /// <summary>First person: living zombies are solid, the player cannot walk through them (see <see cref="PushOutOfZombies"/>).</summary>
        public bool blockedByZombies;
        /// <summary>Simulation pixels per metre (one 32 px tile is 2 m).</summary>
        public const double PxPerMetre = TILE / World.MetersPerTile;
        private readonly List<Zombie> _nearZombies = new List<Zombie>();

        public Player(Raid raid, Loadout loadout)
        {
            _raid = raid;
            loadout = loadout ?? new Loadout();
            radius = 12;
            equipment = loadout.equipment ?? new Equipment();
            inventory = loadout.inventory ?? new Inventory(equipment.BackpackSlots());
            secure = loadout.secure ?? new Inventory(1);
            hpMax = loadout.hpMax > 0 ? loadout.hpMax : 100;
            hp = M.Clamp(loadout.hp, 1, hpMax);
            hunger = M.Clamp(loadout.hunger, 0, 100);
            thirst = M.Clamp(loadout.thirst, 0, 100);
            carryLimitBase = loadout.carryLimit > 0 ? loadout.carryLimit - equipment.CarryBonus() : 30;
            activeSlot = Math.Max(0, Array.FindIndex(WeaponSlots(), w => w != null));
        }

        private IFeedback Fb => _raid.fb;
        public ItemInst[] WeaponSlots() => new[] { equipment.primary, equipment.secondary, equipment.melee };
        public ItemInst WeaponInst => activeSlot >= 0 && activeSlot <= 2 ? WeaponSlots()[activeSlot] : null;
        public double EffectiveHpMax() => Math.Max(20, hpMax - (thirst < 25 ? 20 : 0));
        public bool HasEffect(string id) => effects.Any(e => e.id == id);
        public double CarryLimit() => carryLimitBase + equipment.CarryBonus();
        public double TotalWeight() => inventory.Weight() + equipment.Weight() + secure.Weight();

        public double WeightSpeedMul()
        {
            double r = TotalWeight() / Math.Max(1, CarryLimit());
            if (r <= 0.7) return 1;
            if (r <= 1) return M.Lerp(1, 0.8, (r - 0.7) / 0.3);
            return 0.55;
        }

        public bool Overweight() => TotalWeight() > CarryLimit();

        public double SpreadMul()
        {
            double m = crouching ? 0.6 : sprinting ? 2.0 : moving ? 1.4 : 1.0;
            foreach (var e in effects) if (e.spreadMul > 0) m *= e.spreadMul;
            if (aiming && !sprinting) m *= 0.65;
            return m;
        }

        public double NoiseRadius() => !moving ? 0 : crouching ? 45 : sprinting ? 260 : 130;

        public void Update(double dt, IPlayerInput input)
        {
            if (dead) return;
            var world = _raid.world;
            hurtTimer = Math.Max(0, hurtTimer - dt);
            meleeAnim = Math.Max(0, meleeAnim - dt * 4);
            grenadeCooldown = Math.Max(0, grenadeCooldown - dt);

            double speedMul = 1;
            for (int i = effects.Count - 1; i >= 0; i--)
            {
                var e = effects[i];
                e.timer -= dt;
                if (e.speedMul > 0) speedMul *= e.speedMul;
                if (e.hps > 0) Heal(e.hps * dt, true);
                if (e.timer <= 0) effects.RemoveAt(i);
            }

            var ax = input?.MoveAxis() ?? new Vec2();
            if (input != null && input.Pressed("crouch")) crouching = !crouching;
            bool wantSprint = input != null && input.IsDown("sprint");
            double mag = M.Hypot(ax.x, ax.y);
            moving = mag > 0.05;
            bool canSprint = wantSprint && moving && stamina > 1 && !Overweight() && !crouching && usingItem == null && !aiming;
            if (canSprint && sprintForwardOnly && (ax.x * Math.Cos(angle) + ax.y * Math.Sin(angle)) / mag <= 0.5) canSprint = false;
            sprinting = canSprint;
            double speed = crouching ? 85 : canSprint ? 250 : 150;
            speed *= WeightSpeedMul() * speedMul * equipment.SpeedMul();
            if (usingItem != null) speed *= 0.55;
            if (aiming && !sprinting) speed *= 0.75;
            speed *= world.SpeedMul(M.Floor(x / TILE), M.Floor(y / TILE)) * _raid.moveScale;
            double dx = ax.x * speed * dt, dy = ax.y * speed * dt;
            if (knock.HasValue)
            {
                var k = knock.Value;
                double f = Math.Min(dt, k.t);
                dx += k.vx * f; dy += k.vy * f;
                k.t -= dt;
                knock = k.t <= 0 ? ((double, double, double)?)null : k;
            }
            if (dx != 0 || dy != 0)
            {
                double ox = x, oy = y;
                var r = Physics.MoveCircle(world, x, y, radius, dx, dy);
                x = r.x; y = r.y;
                double moved = M.Hypot(x - ox, y - oy);
                stats.distance += moved;
                legPhase += moved * 0.12;
            }
            if (sprinting) { stamina = Math.Max(0, stamina - 22 * dt); staminaDelay = 1; }
            else
            {
                staminaDelay = Math.Max(0, staminaDelay - dt);
                if (staminaDelay <= 0) stamina = Math.Min(staminaMax, stamina + 18 * dt * (hunger < 25 ? 0.5 : 1));
            }
            if (moving)
            {
                stepTimer -= dt;
                if (stepTimer <= 0)
                {
                    stepTimer = sprinting ? 0.3 : 0.38;
                    double nr = NoiseRadius();
                    if (nr > 0) _raid.EmitNoise(x, y, nr, "step");
                    if (!crouching) Fb.Sfx(sprinting ? "footstep_run" : "footstep", x, y, 0.5);
                    if (sprinting) Fb.Effect(Fx.FootDust, x, y + 6);
                }
            }
            else stepTimer = 0.1;

            if (input != null)
            {
                double a = input.AimAngle(x, y);
                if (!double.IsNaN(a) && !double.IsInfinity(a)) angle = a;
                for (int i = 0; i < 5; i++) if (input.Pressed("slot" + (i + 1))) SwitchSlot(i);
                if (input.Pressed("flashlight")) { flashlightOn = !flashlightOn; Fb.Sfx("flashlight", double.NaN, double.NaN, 0.5); }
                if (input.Pressed("reload")) Reload();
                if (input.Pressed("quickMed")) QuickMed();
                if (input.Pressed("grenade")) ThrowGrenade();
                bool fire = input.WantsFire();
                bool edge = fire && !_lastFire;
                if (fire) Fire(edge);
                _lastFire = fire;
            }

            if (usingItem != null)
            {
                usingItem.timer -= dt;
                if (usingItem.timer <= 0) FinishUse();
            }

            interactTarget = _raid.FindInteractable(x, y, 56, interactByLook ? angle : double.NaN);
            if (input != null && input.Pressed("interact") && interactTarget != null) _raid.Interact(interactTarget);

            hunger = Math.Max(0, hunger - (2.0 / 60) * dt);
            thirst = Math.Max(0, thirst - (3.0 / 60) * dt);
            if (hunger < 25 && !_warnHunger) { _warnHunger = true; Fb.Toast("Du hast Hunger – iss etwas.", "warning"); }
            if (thirst < 25 && !_warnThirst) { _warnThirst = true; Fb.Toast("Du hast Durst – trink etwas.", "warning"); }
            if (hunger > 30) _warnHunger = false;
            if (thirst > 30) _warnThirst = false;
            double cap = EffectiveHpMax();
            if (hp > cap) hp = cap;
            if (hunger <= 0 || thirst <= 0) Drain(0.5 * dt, thirst <= 0 ? "Verdurstet" : "Verhungert");
            if (bleeding)
            {
                bleedTimer += dt;
                Drain(1.5 * dt, "Verblutet");
                if (bleedTimer >= 45) { bleeding = false; bleedTimer = 0; }
                bleedFx += dt;
                if (bleedFx > 0.5) { bleedFx = 0; Fb.Effect(Fx.Blood, x, y, angle + Math.PI, 0.3); }
            }
            if (toxic > 0)
            {
                toxic = Math.Max(0, toxic - dt);
                Drain(2 * dt, "Vergiftung");
            }
        }

        /// <summary>
        /// After the zombies moved: steps out of living zombies that still overlap the player, e.g. one standing against a wall
        /// or pushed in by the crowd. Only the player moves, walls still block. Called by the raid when <see cref="blockedByZombies"/> is set.
        /// </summary>
        public void PushOutOfZombies()
        {
            if (dead || _raid.hash == null) return;
            _nearZombies.Clear();
            // the hash was filled at the start of the step; the margin covers how far zombies moved since
            _raid.hash.Query(x, y, radius + 64, _nearZombies);
            double px = 0, py = 0;
            foreach (var z in _nearZombies)
            {
                if (z.dead) continue;
                double dx = x - z.x, dy = y - z.y, r = radius + z.radius;
                double d2 = dx * dx + dy * dy;
                if (d2 >= r * r) continue;
                double d = Math.Sqrt(d2);
                // exactly on top of each other: step back against the view direction
                if (d < 0.01) { px -= Math.Cos(angle) * r; py -= Math.Sin(angle) * r; continue; }
                px += dx / d * (r - d); py += dy / d * (r - d);
            }
            if (px == 0 && py == 0) return;
            var m = Physics.MoveCircle(_raid.world, x, y, radius, M.Clamp(px, -16, 16), M.Clamp(py, -16, 16));
            x = m.x; y = m.y;
        }

        public void Drain(double amount, string cause)
        {
            if (god || dead) return;
            hp -= amount;
            if (hp <= 0) { hp = 0; causeOfDeath = cause; Die(); }
        }

        private void Fire(bool edge)
        {
            if (activeSlot == 3) { if (edge) ThrowGrenade(); return; }
            if (activeSlot == 4) { if (edge) QuickMed(); return; }
            var inst = WeaponInst;
            if (inst == null) return;
            if (usingItem != null) { Fb.Toast("Anwendung abgebrochen", "info", 1000); usingItem = null; }
            var def = Items.Def(inst);
            if (def?.weapon != null && def.weapon.@class == "melee") { _raid.weapons.Melee(inst, this, angle); return; }
            var r = _raid.weapons.TryFire(inst, this, angle, true, !edge);
            if (r.reason == "empty" && edge)
            {
                var rr = _raid.weapons.StartReload(inst, inventory);
                if (!rr.ok && rr.reason == "no_ammo") Fb.Toast("Keine passende Munition", "warning", 1500);
            }
        }

        public void Reload()
        {
            var inst = WeaponInst;
            if (inst == null) return;
            usingItem = null;
            var r = _raid.weapons.StartReload(inst, inventory);
            if (!r.ok && r.reason == "no_ammo") Fb.Toast("Keine passende Munition", "warning", 1500);
        }

        public bool ThrowGrenade()
        {
            var g = equipment.grenade;
            if (g == null || g.count < 1 || grenadeCooldown > 0)
            {
                if (g == null) Fb.Toast("Keine Granate ausgerüstet", "info", 1200);
                return false;
            }
            grenadeCooldown = 0.8;
            bool ok = _raid.weapons.ThrowGrenade(g, this, angle, throwPower);
            if (ok && g.count <= 0)
            {
                equipment["grenade"] = null;
                if (activeSlot == 3) SwitchSlot(Math.Max(0, Array.FindIndex(WeaponSlots(), w => w != null)), true);
            }
            return ok;
        }

        public void QuickMed()
        {
            var m = BestMedical();
            if (m == null) { Fb.Toast("Keine passende Medizin", "info", 1200); return; }
            UseItem(m);
        }

        public void SwitchSlot(int idx, bool silent = false)
        {
            if (idx < 0 || idx > 4) return;
            bool ok;
            if (idx <= 2) ok = WeaponSlots()[idx] != null;
            else if (idx == 3) ok = equipment.grenade != null;
            else ok = BestMedical() != null;
            if (!ok)
            {
                if (!silent) { Fb.Sfx("ui_error"); Fb.Toast("Leer", "info", 900); }
                return;
            }
            if (idx == activeSlot) return;
            var cur = WeaponInst;
            if (cur != null) _raid.weapons.CancelReload(cur);
            activeSlot = idx;
            usingItem = null;
            if (!silent) Fb.Sfx("ui_click", double.NaN, double.NaN, 0.4);
        }

        private static double HealAmount(ItemInst i) { var m = Items.Def(i).medical; return m.heal + m.overTime; }

        public ItemInst BestMedical()
        {
            var items = inventory.All().Concat(secure.All()).Where(i => Items.Def(i)?.medical != null).ToList();
            if (items.Count == 0) return null;
            if (bleeding)
            {
                var stop = items.Where(i => Items.Def(i).medical.stopBleed).OrderBy(i => Items.Def(i).medical.useTime > 0 ? Items.Def(i).medical.useTime : 2).ToList();
                if (stop.Count > 0) return stop[0];
            }
            if (toxic > 0)
            {
                var anti = items.FirstOrDefault(i => Items.Def(i).medical.cureToxic);
                if (anti != null) return anti;
            }
            double missing = EffectiveHpMax() - hp;
            if (missing <= 1) return null;
            var heal = items.Where(i => HealAmount(i) > 0).OrderBy(HealAmount).ToList();
            if (heal.Count == 0) return null;
            return heal.FirstOrDefault(i => HealAmount(i) >= missing) ?? heal[heal.Count - 1];
        }

        public bool UseItem(ItemInst inst)
        {
            var d = Items.Def(inst);
            if (d == null || dead) return false;
            double useTime = d.medical?.useTime ?? d.food?.useTime ?? d.water?.useTime ?? -1;
            if (useTime < 0) return false;
            double t = useTime > 0 ? useTime : (d.medical != null ? 2 : 1.5);
            usingItem = new UseChannel { inst = inst, timer = t, total = t, name = d.name };
            Fb.Sfx(d.medical != null ? "heal" : "eat", double.NaN, double.NaN, 0.5);
            return true;
        }

        private void FinishUse()
        {
            var u = usingItem;
            usingItem = null;
            if (u == null) return;
            var d = Items.Def(u.inst);
            if (d == null) return;
            Inventory src = null;
            if (inventory.IndexOf(u.inst.uid) >= 0) src = inventory;
            else if (secure.IndexOf(u.inst.uid) >= 0) src = secure;
            if (src == null) return;
            src.Remove(u.inst.uid, 1);
            if (d.medical != null)
            {
                var m = d.medical;
                if (m.heal > 0) Heal(m.heal);
                if (m.overTime > 0) { double dur = m.duration > 0 ? m.duration : 20; ApplyEffect(new Effect { id = "regen", timer = dur, hps = m.overTime / dur, label = "Schmerzmittel" }); }
                if (m.stopBleed) CureBleeding();
                if (m.cureToxic) toxic = 0;
                if (m.stamina > 0) { stamina = staminaMax; ApplyEffect(new Effect { id = "adrenaline", timer = 20, speedMul = 1.2, label = "Adrenalin" }); }
                if (d.id == "med_splint") effects.RemoveAll(e => e.id == "fracture");
                Fb.Sfx("heal", double.NaN, double.NaN, 0.6);
            }
            if (d.food != null) { hunger = M.Clamp(hunger + d.food.hunger, 0, 100); Fb.Sfx("eat", double.NaN, double.NaN, 0.6); }
            if (d.water != null) { thirst = M.Clamp(thirst + d.water.thirst, 0, 100); Fb.Sfx("eat", double.NaN, double.NaN, 0.6); }
            Fb.Toast(d.name + " benutzt", "success", 1200);
            if (activeSlot == 4 && BestMedical() == null) SwitchSlot(Math.Max(0, Array.FindIndex(WeaponSlots(), w => w != null)), true);
        }

        public void Heal(double amount, bool silent = false)
        {
            if (dead || !(amount > 0)) return;
            double before = hp;
            hp = Math.Min(EffectiveHpMax(), hp + amount);
            if (!silent && hp > before) Fb.Effect(Fx.FloatingText, x, y - 20, 0, 1, "+" + M.Round(hp - before), "#6cff8a");
        }

        public void ApplyEffect(Effect effect)
        {
            var ex = effects.FirstOrDefault(e => e.id == effect.id);
            if (ex != null) { ex.timer = effect.timer; ex.hps = effect.hps; ex.speedMul = effect.speedMul; ex.spreadMul = effect.spreadMul; ex.label = effect.label; }
            else effects.Add(effect);
        }

        public void CureBleeding() { bleeding = false; bleedTimer = 0; }

        private static readonly string[] PlainCauses = { "Vergiftung", "Feuer", "Verblutet", "Explosion", "Verhungert", "Verdurstet" };

        public double TakeDamage(double amount, string source, double fromX = double.NaN, double fromY = double.NaN, double bleedChance = 0, double toxicAmount = 0)
        {
            if (dead || god || !(amount > 0)) return 0;
            double raw = amount;
            double p = M.Clamp(equipment.ProtectionBody * 0.75 + equipment.ProtectionHead * 0.25, 0, 0.85);
            double dealt = raw * (1 - p);
            var body = equipment.armorBody; var head = equipment.armorHead;
            if (body?.durability != null) body.durability = Math.Max(0, body.durability.Value - raw * 0.5);
            if (head?.durability != null) head.durability = Math.Max(0, head.durability.Value - raw * 0.2);
            hp -= dealt;
            hurtTimer = 0.25;
            stats.damageTaken += dealt;
            if (bleedChance > 0 && _raid.rng.Chance(bleedChance * (1 - p * 0.6)))
            {
                if (!bleeding) Fb.Toast("Du blutest! (Q oder Verband)", "danger", 2000);
                bleeding = true; bleedTimer = 0;
            }
            if (toxicAmount > 0) toxic = Math.Max(toxic, toxicAmount);
            if (usingItem != null && dealt > 8) usingItem = null;
            bool hasFrom = !double.IsNaN(fromX);
            Fb.Effect(Fx.DamageFlash, x, y, M.Clamp(dealt / 30, 0.25, 1));
            if (hasFrom) Fb.Effect(Fx.HitDirection, x, y, M.AngleTo(x, y, fromX, fromY));
            Fb.Effect(Fx.Blood, x, y, hasFrom ? M.AngleTo(fromX, fromY, x, y) : 0, 0.6);
            Fb.Shake(M.Clamp(dealt / 4, 2, 10));
            Fb.Sfx("player_hurt", double.NaN, double.NaN, 0.8);
            _raid.events.Emit("playerHit", x, y, null, dealt);
            if (hp <= 0)
            {
                hp = 0;
                string src = source ?? "Unbekannt";
                causeOfDeath = Array.IndexOf(PlainCauses, src) >= 0 ? src : "Getötet von: " + src;
                Die();
            }
            return dealt;
        }

        public void Die()
        {
            if (dead) return;
            dead = true;
            hp = 0;
            if (causeOfDeath == null) causeOfDeath = "Unbekannt";
            _raid.OnPlayerDeath();
        }
    }
}
