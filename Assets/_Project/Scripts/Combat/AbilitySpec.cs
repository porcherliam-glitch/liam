using System;
using Aetherfall.Events;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Plain data of an active ability (built from <see cref="AbilityDefinition"/>, or in tests directly): mana cost, cooldown,
    /// cast times and a cone in front of the caster that hits every enemy inside (GDD 03 6.5, first ability: Aether-Stoß).
    /// </summary>
    /// <remarks>
    /// The damage follows GDD 03 6.5: <see cref="DamageMultiplier"/> × the reference value max(weapon damage, spell power),
    /// split into Aether (<see cref="AetherShare"/>) and blunt damage. Pure C#, no UnityEngine calls.
    /// </remarks>
    public sealed class AbilitySpec
    {
        /// <summary>Id, e.g. <c>ability.aether.aether_stoss</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>Name for the HUD.</summary>
        public string DisplayName { get; set; } = string.Empty;

        /// <summary>Mana paid when the ability takes effect.</summary>
        public float ManaCost { get; set; } = 15f;

        /// <summary>Cooldown in seconds, from the moment the ability takes effect.</summary>
        public float CooldownSeconds { get; set; } = 8f;

        /// <summary>Wind-up before the effect in seconds.</summary>
        public float WindupSeconds { get; set; } = 0.25f;

        /// <summary>Recovery after the effect in seconds.</summary>
        public float RecoverySeconds { get; set; } = 0.35f;

        /// <summary>Range of the cone in metres.</summary>
        public float Range { get; set; } = 6f;

        /// <summary>Full opening angle of the cone in degrees (90 = 45° to each side).</summary>
        public float ConeAngle { get; set; } = 90f;

        /// <summary>Damage as a multiple of the reference value (1.2 = 120 %).</summary>
        public float DamageMultiplier { get; set; } = 1.2f;

        /// <summary>Share of Aether damage (the rest is blunt).</summary>
        public float AetherShare { get; set; } = 0.5f;

        /// <summary>Poise damage of a hit (before the damage type factor and the target's resistance).</summary>
        public float PoiseDamage { get; set; } = 30f;

        /// <summary>Distance the targets are pushed back in metres.</summary>
        public float KnockbackDistance { get; set; } = 3f;

        /// <summary>Corruption per use (GDD 03 6.5; counted once corruption exists).</summary>
        public float Corruption { get; set; } = 2f;

        /// <summary>Half of the cone angle in degrees.</summary>
        public float HalfAngle => ConeAngle * 0.5f;

        /// <summary>
        /// Base damage of one hit: the reference value max(weapon damage, spell power) split into Aether and blunt damage. The
        /// <see cref="DamageMultiplier"/> is applied by the attack (<see cref="CreateAttack"/>), like M_Angriff of a weapon hit.
        /// </summary>
        /// <param name="weaponDamage">Weapon damage W of the main hand.</param>
        /// <param name="spellPower">Spell power of the caster.</param>
        public DamagePacket BaseDamage(float weaponDamage, float spellPower)
        {
            float reference = Math.Max(Math.Max(0f, weaponDamage), Math.Max(0f, spellPower));
            float aether = Math.Max(0f, Math.Min(1f, AetherShare));
            return DamagePacket.Single(DamageType.Aether, reference * aether).With(DamageType.Blunt, reference * (1f - aether));
        }

        /// <summary>
        /// The attack data of the push for the hit pipeline: damage multiplier, knockback, a short active time; cannot be parried
        /// (a push of force, not a weapon swing).
        /// </summary>
        public AttackSpec CreateAttack()
        {
            AttackSpec attack = AttackSpec.Create(Id, WindupSeconds, 0.05f, RecoverySeconds);
            attack.Kind = AttackKind.Heavy;
            attack.DamageMultiplier = Math.Max(0f, DamageMultiplier);
            attack.PoiseMultiplier = 1f;
            attack.StaminaCost = 0f;
            attack.StaminaDamage = 30f;
            attack.KnockbackDistance = Math.Max(0f, KnockbackDistance);
            attack.Unparryable = true;
            attack.MaxTurnDegrees = 180f;
            return attack;
        }

        /// <summary>Returns an error text if a value is out of range, otherwise an empty string.</summary>
        public string Validate()
        {
            if (string.IsNullOrEmpty(Id) || !Id.StartsWith("ability.", StringComparison.Ordinal))
            {
                return "Ability '" + Id + "': the id must start with 'ability.'.";
            }

            if (!(ManaCost >= 0f && CooldownSeconds >= 0f && WindupSeconds >= 0f && RecoverySeconds >= 0f))
            {
                return "Ability '" + Id + "': costs and times must be 0 or more.";
            }

            if (!(Range > 0f && ConeAngle > 0f && ConeAngle <= 360f))
            {
                return "Ability '" + Id + "': the range must be greater than 0 and the cone angle between 0 and 360 degrees.";
            }

            return string.Empty;
        }
    }
}
