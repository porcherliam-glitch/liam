using System;
using Aetherfall.Events;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Plain data of one attack (built from <see cref="AttackDefinition"/> by <see cref="AttackDefinition.CreateSpec"/>, or in
    /// tests directly). There are no animations yet, so an attack is a data-driven time line: wind-up → active (hit window)
    /// → recovery (GDD 03 4.4), plus hitbox shape, multipliers, stamina, forward impulse and hit feedback.
    /// </summary>
    /// <remarks>
    /// Times in seconds, distances in metres, offsets relative to the attacker root (x right, y up, z forward). The
    /// <see cref="AttackRunner"/> opens and closes the hit window at these times through the same API that Animation Events
    /// will call later (<see cref="IHitWindowReceiver"/>, §9.8). Pure C#, no UnityEngine calls.
    /// </remarks>
    public sealed class AttackSpec
    {
        /// <summary>Id of the attack, e.g. <c>attack.einhandschwert.leicht_1</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>Kind of attack (cancel rules, feedback).</summary>
        public AttackKind Kind { get; set; } = AttackKind.Light;

        /// <summary>Wind-up before the hit window (enemies: the telegraph, at least 0.4 s, GDD 03 9.5).</summary>
        public float WindupSeconds { get; set; } = 0.2f;

        /// <summary>Duration of the hit window.</summary>
        public float ActiveSeconds { get; set; } = 0.12f;

        /// <summary>Recovery after the hit window.</summary>
        public float RecoverySeconds { get; set; } = 0.5f;

        /// <summary>
        /// Time from the start at which the next combo input is accepted (GDD 03 4.4: from about 55 % of the clip).
        /// Values at or above <see cref="TotalSeconds"/> mean "only after the attack".
        /// </summary>
        public float ComboWindowStartSeconds { get; set; } = 0.45f;

        /// <summary>
        /// True: dodge or block may cancel the attack only in the recovery (heavy attacks); false: at any time except in the
        /// active phase (light attacks, GDD 03 4.4).
        /// </summary>
        public bool CancelOnlyInRecovery { get; set; }

        /// <summary>M_Angriff for the damage (light 1.0, combo finisher 1.2, heavy 1.5 …).</summary>
        public float DamageMultiplier { get; set; } = 1f;

        /// <summary>M_Angriff for the poise damage (light 1.0, combo finisher 1.5, heavy 1.5 …).</summary>
        public float PoiseMultiplier { get; set; } = 1f;

        /// <summary>Stamina cost when the attack starts (GDD 03 4.3).</summary>
        public float StaminaCost { get; set; }

        /// <summary>Stamina damage against a block, before the block stability (GDD 03 4.7).</summary>
        public float StaminaDamage { get; set; } = 20f;

        /// <summary>True: the damage type of the attack replaces the weapon's type (e.g. the thrust of the 4th sword hit).</summary>
        public bool OverrideDamageType { get; set; }

        /// <summary>Damage type used when <see cref="OverrideDamageType"/> is set.</summary>
        public DamageType DamageType { get; set; } = DamageType.Slash;

        /// <summary>Shape of the hitbox query.</summary>
        public HitboxShape Shape { get; set; } = HitboxShape.Box;

        /// <summary>Hitbox centre, x (right) relative to the attacker root.</summary>
        public float OffsetX { get; set; }

        /// <summary>Hitbox centre, y (up) relative to the attacker root.</summary>
        public float OffsetY { get; set; } = 1f;

        /// <summary>Hitbox centre, z (forward) relative to the attacker root.</summary>
        public float OffsetZ { get; set; } = 1.1f;

        /// <summary>Full box size, x.</summary>
        public float SizeX { get; set; } = 1.6f;

        /// <summary>Full box size, y.</summary>
        public float SizeY { get; set; } = 1.2f;

        /// <summary>Full box size, z.</summary>
        public float SizeZ { get; set; } = 1.4f;

        /// <summary>Sphere radius (shape <see cref="HitboxShape.Sphere"/>).</summary>
        public float Radius { get; set; } = 0.8f;

        /// <summary>Forward movement of the attacker during the attack (replaces root motion while there are no animations).</summary>
        public float LungeDistance { get; set; }

        /// <summary>Distance the target is pushed back by a hit (knockback).</summary>
        public float KnockbackDistance { get; set; } = 0.3f;

        /// <summary>Hitstop on hit in seconds; 0 = value of the feedback table (GDD 03 4.11).</summary>
        public float HitStopSeconds { get; set; }

        /// <summary>Camera shake amplitude on hit; 0 = value of the feedback table (GDD 03 4.11).</summary>
        public float ShakeAmplitude { get; set; }

        /// <summary>Camera shake duration on hit in seconds; 0 = value of the feedback table.</summary>
        public float ShakeDuration { get; set; }

        /// <summary>Cannot be blocked (red attacks, grabs; GDD 03 4.7, 9.5).</summary>
        public bool Unblockable { get; set; }

        /// <summary>Cannot be parried (GDD 03 4.8).</summary>
        public bool Unparryable { get; set; }

        /// <summary>Charge level of a heavy attack (0 = uncharged, 1, 2; set by the state machine, GDD 03 4.5).</summary>
        public int ChargeLevel { get; set; }

        /// <summary>Largest turn towards the target or stick direction at the start in degrees (GDD 03 4.4: 45°).</summary>
        public float MaxTurnDegrees { get; set; } = 45f;

        /// <summary>Flight speed of the projectile in m/s; 0 = a melee attack with the hitbox (staff bolt, arrow: greater than 0).</summary>
        public float ProjectileSpeed { get; set; }

        /// <summary>Range of the projectile in metres.</summary>
        public float ProjectileRange { get; set; } = 25f;

        /// <summary>Radius of the projectile for the hit query in metres.</summary>
        public float ProjectileRadius { get; set; } = 0.2f;

        /// <summary>Downward acceleration of the projectile in m/s² (0 = straight; arrows 0.5 g, GDD 03 6.1).</summary>
        public float ProjectileGravity { get; set; }

        /// <summary>Status build-up the attack carries (GDD 03 7.1: fire arrow burning 35, fireball 30, explosion burning 60 and stun 30).</summary>
        public StatusBuildup Buildup { get; set; } = StatusBuildup.None;

        /// <summary>True for explosions (poise factor 1.5, GDD 03 8.2; barrels, powder kegs, the corruption burst).</summary>
        public bool IsExplosion { get; set; }

        /// <summary>True if the attack fires a projectile in its hit window instead of opening the hitbox.</summary>
        public bool IsProjectile => ProjectileSpeed > 0f;

        /// <summary>Wind-up + active + recovery.</summary>
        public float TotalSeconds => WindupSeconds + ActiveSeconds + RecoverySeconds;

        /// <summary>Start of the hit window (= end of the wind-up).</summary>
        public float ActiveStartSeconds => WindupSeconds;

        /// <summary>End of the hit window.</summary>
        public float ActiveEndSeconds => WindupSeconds + ActiveSeconds;

        /// <summary>Start of the forward movement: in the second half of the wind-up.</summary>
        public float LungeStartSeconds => WindupSeconds * 0.5f;

        /// <summary>End of the forward movement: end of the hit window.</summary>
        public float LungeEndSeconds => ActiveEndSeconds;

        /// <summary>Speed of the forward movement in m/s (0 without lunge).</summary>
        public float LungeSpeed
        {
            get
            {
                float duration = LungeEndSeconds - LungeStartSeconds;
                return LungeDistance > 0f && duration > 0f ? LungeDistance / duration : 0f;
            }
        }

        /// <summary>Phase at <paramref name="elapsed"/> seconds after the start.</summary>
        /// <param name="elapsed">Seconds since the attack started.</param>
        public AttackPhase PhaseAt(float elapsed)
        {
            if (elapsed < 0f || elapsed >= TotalSeconds)
            {
                return AttackPhase.None;
            }

            if (elapsed < ActiveStartSeconds)
            {
                return AttackPhase.Windup;
            }

            return elapsed < ActiveEndSeconds ? AttackPhase.Active : AttackPhase.Recovery;
        }

        /// <summary>True if a dodge or block may cancel the attack at <paramref name="elapsed"/> (GDD 03 4.4).</summary>
        /// <param name="elapsed">Seconds since the attack started.</param>
        public bool CanCancelAt(float elapsed)
        {
            AttackPhase phase = PhaseAt(elapsed);
            if (CancelOnlyInRecovery)
            {
                return phase == AttackPhase.Recovery || phase == AttackPhase.None;
            }

            return phase != AttackPhase.Active;
        }

        /// <summary>Creates a copy (charge levels, variants).</summary>
        public AttackSpec Clone()
        {
            return (AttackSpec)MemberwiseClone();
        }

        /// <summary>Returns an error text if a value is out of range, otherwise an empty string.</summary>
        public string Validate()
        {
            if (!(WindupSeconds >= 0f && ActiveSeconds > 0f && RecoverySeconds >= 0f))
            {
                return "Attack '" + Id + "': wind-up and recovery must be 0 or more, the active time greater than 0.";
            }

            if (!(DamageMultiplier >= 0f && PoiseMultiplier >= 0f && StaminaCost >= 0f && StaminaDamage >= 0f))
            {
                return "Attack '" + Id + "': multipliers and stamina values must be 0 or more.";
            }

            if (Shape == HitboxShape.Box && !(SizeX > 0f && SizeY > 0f && SizeZ > 0f))
            {
                return "Attack '" + Id + "': the box size must be greater than 0.";
            }

            if (Shape == HitboxShape.Sphere && !(Radius > 0f))
            {
                return "Attack '" + Id + "': the sphere radius must be greater than 0.";
            }

            if (!(LungeDistance >= 0f && KnockbackDistance >= 0f && MaxTurnDegrees >= 0f))
            {
                return "Attack '" + Id + "': lunge, knockback and turn must be 0 or more.";
            }

            if (IsProjectile && !(ProjectileRange > 0f && ProjectileRadius > 0f && ProjectileGravity >= 0f))
            {
                return "Attack '" + Id + "': a projectile needs a range and a radius greater than 0 and a gravity of 0 or more.";
            }

            return string.Empty;
        }

        /// <summary>A light test attack with the given phase times (tests, fallbacks).</summary>
        /// <param name="id">Id.</param>
        /// <param name="windup">Wind-up.</param>
        /// <param name="active">Active time.</param>
        /// <param name="recovery">Recovery.</param>
        public static AttackSpec Create(string id, float windup, float active, float recovery)
        {
            return new AttackSpec
            {
                Id = id ?? string.Empty,
                WindupSeconds = Math.Max(0f, windup),
                ActiveSeconds = Math.Max(0.01f, active),
                RecoverySeconds = Math.Max(0f, recovery),
                ComboWindowStartSeconds = Math.Max(0f, windup) + Math.Max(0.01f, active)
            };
        }
    }
}
