using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// One hit on its way from a hitbox to the target's <see cref="Combatant.ReceiveHit"/>: attacker, attack, base damage,
    /// zone and positions. Built by <see cref="Hitbox"/> (and by the finisher). Value type, no allocation.
    /// </summary>
    public struct IncomingHit
    {
        /// <summary>The attacking combatant.</summary>
        public Combatant Attacker { get; set; }

        /// <summary>The attack.</summary>
        public AttackSpec Attack { get; set; }

        /// <summary>Weapon or enemy damage, attribute weights and poise value of the attacker.</summary>
        public AttackProfile Profile { get; set; }

        /// <summary>Hurtbox zone that was hit.</summary>
        public HitZone Zone { get; set; }

        /// <summary>World position of the hit (feedback, damage numbers).</summary>
        public Vector3 Point { get; set; }

        /// <summary>World position of the attacker (block angle, knockback direction).</summary>
        public Vector3 AttackerPosition { get; set; }

        /// <summary>Lowest damage of the hit (finisher: share of the target's max health, GDD 03 4.10); 0 = none.</summary>
        public float MinimumDamage { get; set; }

        /// <summary>The target dies if at most this share of its health is left after the hit (finisher 0.15); 0 = never.</summary>
        public float ExecuteBelowFraction { get; set; }
    }
}
