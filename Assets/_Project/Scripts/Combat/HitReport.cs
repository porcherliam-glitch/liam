using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// What one hit did, for the local events <see cref="Combatant.HitReceived"/>, <see cref="Combatant.HitDealt"/> and
    /// <see cref="ICombatService.HitLanded"/> (feedback, camera shake, damage numbers, debug overlay). Contains object
    /// references, so it never goes over the global event bus (architecture 4.3); the bus gets <c>DamageDealt</c>.
    /// </summary>
    public struct HitReport
    {
        /// <summary>The attacker.</summary>
        public Combatant Attacker { get; set; }

        /// <summary>The target.</summary>
        public Combatant Target { get; set; }

        /// <summary>The attack.</summary>
        public AttackSpec Attack { get; set; }

        /// <summary>How the target met the hit.</summary>
        public DefenseOutcome Defense { get; set; }

        /// <summary>Damage of the hit after all reductions (what the damage numbers show).</summary>
        public int Damage { get; set; }

        /// <summary>Health actually removed (capped by the remaining health).</summary>
        public float Applied { get; set; }

        /// <summary>Flags of the damage calculation (critical, blocked, parried, zone …).</summary>
        public HitFlags Flags { get; set; }

        /// <summary>Main damage type.</summary>
        public DamageType DamageType { get; set; }

        /// <summary>Zone that was hit.</summary>
        public HitZone Zone { get; set; }

        /// <summary>Poise damage of the hit.</summary>
        public float PoiseDamage { get; set; }

        /// <summary>Stamina the defender pays for a blocked hit (GDD 03 4.7).</summary>
        public float BlockStaminaCost { get; set; }

        /// <summary>Effect on the target's poise meter (enemies, dummy).</summary>
        public PoiseOutcome Poise { get; set; }

        /// <summary>Reaction of a target with stability (player): stagger, knockdown, guard break.</summary>
        public StaggerKind Stagger { get; set; }

        /// <summary>True if the hit killed the target.</summary>
        public bool Killed { get; set; }

        /// <summary>Row of the hit feel table (GDD 03 4.11).</summary>
        public HitFeedbackKind Feedback { get; set; }

        /// <summary>Hitstop for the target (and, once per swing, the attacker) in seconds.</summary>
        public float HitStopSeconds { get; set; }

        /// <summary>Camera shake amplitude (0 = none).</summary>
        public float ShakeAmplitude { get; set; }

        /// <summary>Camera shake duration in seconds.</summary>
        public float ShakeDuration { get; set; }

        /// <summary>World position of the hit.</summary>
        public Vector3 Point { get; set; }

        /// <summary>True if the hit was critical.</summary>
        public bool IsCritical => (Flags & HitFlags.Critical) != 0;

        /// <summary>True if damage was applied.</summary>
        public bool DealtDamage => Applied > 0f;
    }
}
