using System;
using Aetherfall.Events;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Plain data of an active ability (built from <see cref="AbilityDefinition"/>, or in tests directly): mana cost, cooldown,
    /// cast times, the way it takes effect (<see cref="Kind"/>: cone, projectile, chain, ground area, strikes, self-buff) and its
    /// element (GDD 03 6.3–6.5: Aether-Stoß, the fire, ice and lightning spells of the mage).
    /// </summary>
    /// <remarks>
    /// <para>Damage of one hit: <see cref="DamageMultiplier"/> × the reference value, split into the <see cref="Element"/>
    /// (<see cref="ElementShare"/>) and blunt damage. The reference value is max(weapon damage, spell power) for abilities that
    /// scale with the weapon (Aether-Stoß, GDD 03 6.5), otherwise the spell power (spells).</para>
    /// <para>Mana costs are level 1 values; they grow with the level, × (1 + 0.02 × (level − 1)) (GDD 03 6.3,
    /// <see cref="ManaCostAt"/>). Pure C#, no UnityEngine calls.</para>
    /// </remarks>
    public sealed class AbilitySpec
    {
        /// <summary>Mana cost growth per level above 1 (GDD 03 6.3).</summary>
        public const float ManaCostPerLevel = 0.02f;

        /// <summary>Id, e.g. <c>ability.aether.aether_stoss</c> or <c>ability.feuer.feuerball</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>Name for the HUD.</summary>
        public string DisplayName { get; set; } = string.Empty;

        /// <summary>How it takes effect.</summary>
        public AbilityKind Kind { get; set; } = AbilityKind.Cone;

        /// <summary>Mana paid when the ability takes effect (level 1).</summary>
        public float ManaCost { get; set; } = 15f;

        /// <summary>Cooldown in seconds, from the moment the ability takes effect.</summary>
        public float CooldownSeconds { get; set; } = 8f;

        /// <summary>Wind-up before the effect in seconds.</summary>
        public float WindupSeconds { get; set; } = 0.25f;

        /// <summary>Recovery after the effect in seconds.</summary>
        public float RecoverySeconds { get; set; } = 0.35f;

        /// <summary>
        /// Range in metres: length of the cone, flight range of the projectile, distance to the first chain target, or the farthest
        /// point an area or the strikes can be placed.
        /// </summary>
        public float Range { get; set; } = 6f;

        /// <summary>Full opening angle of the cone in degrees (90 = 45° to each side, 360 = all around).</summary>
        public float ConeAngle { get; set; } = 90f;

        /// <summary>Damage as a multiple of the reference value (1.2 = 120 %; areas: per tick).</summary>
        public float DamageMultiplier { get; set; } = 1.2f;

        /// <summary>Element of the damage.</summary>
        public DamageType Element { get; set; } = DamageType.Aether;

        /// <summary>Share of <see cref="Element"/> damage (the rest is blunt).</summary>
        public float ElementShare { get; set; } = 0.5f;

        /// <summary>True: the reference value is max(weapon damage, spell power); false: the spell power alone.</summary>
        public bool ScalesWithWeapon { get; set; } = true;

        /// <summary>Poise damage of a hit (before the damage type factor and the target's resistance).</summary>
        public float PoiseDamage { get; set; } = 30f;

        /// <summary>Distance the targets are pushed back in metres.</summary>
        public float KnockbackDistance { get; set; } = 3f;

        /// <summary>Corruption per use (GDD 03 6.5: Aether abilities +2; element spells 0).</summary>
        public float Corruption { get; set; } = 2f;

        /// <summary>Status effect built up by each hit (with <see cref="Buildup"/> above 0).</summary>
        public StatusEffectId BuildupEffect { get; set; } = StatusEffectId.Burning;

        /// <summary>Status build-up per hit (GDD 03 6.4: Feuerball burning 30, Eislanze freezing 35, …); 0 = none.</summary>
        public float Buildup { get; set; }

        /// <summary>Projectile: speed in m/s.</summary>
        public float ProjectileSpeed { get; set; } = 24f;

        /// <summary>Projectile: radius of the sweep in metres.</summary>
        public float ProjectileRadius { get; set; } = 0.3f;

        /// <summary>Projectile: how many enemies it hits before it stops (Eislanze 2: it pierces the first).</summary>
        public int MaxTargets { get; set; } = 1;

        /// <summary>Projectile: radius of the explosion where it stops (Feuerball 2 m); 0 = none.</summary>
        public float ExplosionRadius { get; set; }

        /// <summary>Projectile: damage of the explosion for everyone around as a share of a direct hit.</summary>
        public float ExplosionShare { get; set; } = 0.7f;

        /// <summary>Chain: number of targets including the first (Kettenblitz 3).</summary>
        public int ChainTargets { get; set; } = 3;

        /// <summary>Chain: farthest jump from one target to the next in metres.</summary>
        public float ChainRange { get; set; } = 6f;

        /// <summary>Chain: damage lost per jump (0.2 = −20 % per jump).</summary>
        public float ChainFalloff { get; set; } = 0.2f;

        /// <summary>Area or strikes: radius in metres (Flammenteppich 4, Gewitterruf 6).</summary>
        public float AreaRadius { get; set; } = 4f;

        /// <summary>Ground area: duration in seconds (Flammenteppich 6).</summary>
        public float AreaSeconds { get; set; } = 6f;

        /// <summary>Ground area: seconds between two ticks.</summary>
        public float AreaTickSeconds { get; set; } = 0.5f;

        /// <summary>Strikes: number of strikes (Gewitterruf 3).</summary>
        public int StrikeCount { get; set; } = 3;

        /// <summary>Strikes: seconds between two strikes.</summary>
        public float StrikeInterval { get; set; } = 0.35f;

        /// <summary>Strikes: radius of one strike in metres.</summary>
        public float StrikeRadius { get; set; } = 2f;

        /// <summary>Self-buff: kind.</summary>
        public AbilityBuffKind BuffKind { get; set; } = AbilityBuffKind.None;

        /// <summary>Self-buff: duration in seconds.</summary>
        public float BuffSeconds { get; set; } = 10f;

        /// <summary>Self-buff: strength (Glutmantel 0.2 = +20 % as fire, Eispanzer 0.3 = armor +30 %, Sturmschritt 0.2 = +20 % speed).</summary>
        public float BuffValue { get; set; } = 0.2f;

        /// <summary>Half of the cone angle in degrees.</summary>
        public float HalfAngle => ConeAngle * 0.5f;

        /// <summary>True for abilities that need a target to start (the chain).</summary>
        public bool NeedsTarget => Kind == AbilityKind.Chain;

        /// <summary>True for abilities that deal damage when they take effect (all but self-buffs).</summary>
        public bool DealsDamage => Kind != AbilityKind.SelfBuff;

        /// <summary>Mana cost at a character level (GDD 03 6.3: × (1 + 0.02 × (level − 1))).</summary>
        /// <param name="level">Character level (values below 1 count as 1).</param>
        public float ManaCostAt(int level)
        {
            return ManaCost * (1f + ManaCostPerLevel * (Math.Max(1, level) - 1));
        }

        /// <summary>
        /// Base damage of one hit: the reference value split into <see cref="Element"/> and blunt damage. The
        /// <see cref="DamageMultiplier"/> is applied by the attack (<see cref="CreateAttack"/>), like M_Angriff of a weapon hit.
        /// </summary>
        /// <param name="weaponDamage">Weapon damage W of the main hand.</param>
        /// <param name="spellPower">Spell power of the caster.</param>
        public DamagePacket BaseDamage(float weaponDamage, float spellPower)
        {
            float spell = Math.Max(0f, spellPower);
            return Split(ScalesWithWeapon ? Math.Max(Math.Max(0f, weaponDamage), spell) : spell);
        }

        /// <summary>A reference value split into <see cref="Element"/> and blunt damage (<see cref="ElementShare"/>).</summary>
        /// <param name="reference">Reference value (weapon damage, spell power or the power of the staff).</param>
        public DamagePacket Split(float reference)
        {
            reference = Math.Max(0f, reference);
            float share = Math.Max(0f, Math.Min(1f, ElementShare));
            DamagePacket packet = DamagePacket.Single(Element, reference * share);
            return share < 1f ? packet.With(DamageType.Blunt, reference * (1f - share)) : packet;
        }

        /// <summary>
        /// The attack data for the hit pipeline: damage multiplier, knockback, status build-up and, for projectiles, the flight
        /// values; cannot be parried (a spell, not a weapon swing).
        /// </summary>
        public AttackSpec CreateAttack()
        {
            AttackSpec attack = AttackSpec.Create(Id, WindupSeconds, 0.05f, RecoverySeconds);
            // Burning ground ticks every half second: light hits, so the targets do not get the heavy hit feedback each time.
            attack.Kind = Kind == AbilityKind.GroundArea ? AttackKind.Light : AttackKind.Heavy;
            attack.DamageMultiplier = Math.Max(0f, DamageMultiplier);
            attack.PoiseMultiplier = 1f;
            attack.StaminaCost = 0f;
            attack.StaminaDamage = Kind == AbilityKind.GroundArea ? 0f : 30f;
            attack.KnockbackDistance = Math.Max(0f, KnockbackDistance);
            attack.Unparryable = true;
            attack.MaxTurnDegrees = 180f;
            attack.OverrideDamageType = true;
            attack.DamageType = Element;
            if (Buildup > 0f)
            {
                attack.Buildup = StatusBuildup.None.With(BuildupEffect, Buildup);
            }

            if (Kind == AbilityKind.Projectile)
            {
                attack.ProjectileSpeed = Math.Max(0.1f, ProjectileSpeed);
                attack.ProjectileRange = Math.Max(1f, Range);
                attack.ProjectileRadius = Math.Max(0.05f, ProjectileRadius);
                attack.ProjectileGravity = 0f;
                attack.ProjectileMaxTargets = Math.Max(1, MaxTargets);
            }

            return attack;
        }

        /// <summary>The attack of the explosion of a projectile (<see cref="ExplosionRadius"/> above 0), or null.</summary>
        public AttackSpec CreateExplosionAttack()
        {
            if (Kind != AbilityKind.Projectile || ExplosionRadius <= 0f)
            {
                return null;
            }

            AttackSpec attack = CreateAttack();
            attack.Id = Id + ".explosion";
            attack.ProjectileSpeed = 0f;
            attack.DamageMultiplier = Math.Max(0f, DamageMultiplier * ExplosionShare);
            attack.KnockbackDistance = Math.Max(attack.KnockbackDistance, 1f);
            attack.IsExplosion = true;
            return attack;
        }

        /// <summary>Returns an error text if a value is out of range, otherwise an empty string.</summary>
        public string Validate()
        {
            if (string.IsNullOrEmpty(Id) || !Id.StartsWith("ability.", StringComparison.Ordinal))
            {
                return "Ability '" + Id + "': the id must start with 'ability.'.";
            }

            if (!(ManaCost >= 0f && CooldownSeconds >= 0f && WindupSeconds >= 0f && RecoverySeconds >= 0f && Buildup >= 0f))
            {
                return "Ability '" + Id + "': costs, times and build-up must be 0 or more.";
            }

            if (!(Range > 0f))
            {
                return "Ability '" + Id + "': the range must be greater than 0.";
            }

            switch (Kind)
            {
                case AbilityKind.Cone:
                    return ConeAngle > 0f && ConeAngle <= 360f ? string.Empty : "Ability '" + Id + "': the cone angle must be between 0 and 360 degrees.";
                case AbilityKind.Projectile:
                    return ProjectileSpeed > 0f && ProjectileRadius > 0f && MaxTargets >= 1 && ExplosionRadius >= 0f && ExplosionShare >= 0f
                        ? string.Empty
                        : "Ability '" + Id + "': a projectile needs speed and radius above 0, at least 1 target and no negative explosion.";
                case AbilityKind.Chain:
                    return ChainTargets >= 1 && ChainRange > 0f && ChainFalloff >= 0f && ChainFalloff < 1f
                        ? string.Empty
                        : "Ability '" + Id + "': a chain needs at least 1 target, a jump range above 0 and a falloff from 0 to below 1.";
                case AbilityKind.GroundArea:
                    return AreaRadius > 0f && AreaSeconds > 0f && AreaTickSeconds > 0f
                        ? string.Empty
                        : "Ability '" + Id + "': an area needs radius, duration and tick time above 0.";
                case AbilityKind.Strikes:
                    return StrikeCount >= 1 && StrikeInterval >= 0f && StrikeRadius > 0f && AreaRadius >= 0f
                        ? string.Empty
                        : "Ability '" + Id + "': strikes need at least 1 strike, a strike radius above 0 and no negative times.";
                case AbilityKind.SelfBuff:
                    return BuffKind != AbilityBuffKind.None && BuffSeconds > 0f && BuffValue >= 0f
                        ? string.Empty
                        : "Ability '" + Id + "': a self-buff needs a buff kind and a duration above 0.";
                default:
                    return "Ability '" + Id + "': unknown kind " + Kind + ".";
            }
        }
    }
}
