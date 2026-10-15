using System.Collections.Generic;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Applies an explosion to everyone around a point (GDD 03 6.6): every combatant within the radius (plus half a metre of
    /// body) receives the explosion attack as a hit from <c>attacker</c> (the one who set it off, so kills count for him) and
    /// other explosives and oil puddles in range go off after a short delay (chain). Pure scene helper for
    /// <see cref="ExplosiveObject"/> and <see cref="ElementArea"/>; the numbers live in <see cref="ElementReactions"/>.
    /// </summary>
    public static class Explosions
    {
        private const float BodyRadius = 0.5f;

        /// <summary>Hits everyone within <paramref name="radius"/> of <paramref name="origin"/>.</summary>
        /// <param name="attacker">Who set it off (null: the source itself).</param>
        /// <param name="source">The exploding object's combatant (never hit itself).</param>
        /// <param name="origin">Centre.</param>
        /// <param name="radius">Radius in metres.</param>
        /// <param name="attack">Explosion attack (<see cref="ElementReactions.CreateOilExplosion"/> …).</param>
        /// <param name="damage">Total damage before the formula.</param>
        /// <param name="poise">Poise value of the explosion.</param>
        /// <param name="combatants">Registered combatants.</param>
        /// <returns>Number of combatants hit.</returns>
        public static int Detonate(Combatant attacker, Combatant source, Vector3 origin, float radius, AttackSpec attack, float damage, float poise,
            IReadOnlyList<Combatant> combatants)
        {
            if (attack == null)
            {
                return 0;
            }

            var profile = new AttackProfile(ElementReactions.ExplosionPacket(damage), AttributeScaling.None, poise);
            return Detonate(attacker, source, null, origin, radius, attack, profile, damage, combatants);
        }

        /// <summary>
        /// Hits everyone within <paramref name="radius"/> of <paramref name="origin"/> with a given damage profile (spell explosions
        /// such as the Feuerball, GDD 03 6.4); explosives and oil puddles in range go off as well.
        /// </summary>
        /// <param name="attacker">Who set it off (null: the source itself).</param>
        /// <param name="source">The exploding object's combatant (never hit itself; may be null).</param>
        /// <param name="skip">A combatant that is not hit (e.g. the one the projectile already hit directly; may be null).</param>
        /// <param name="origin">Centre.</param>
        /// <param name="radius">Radius in metres.</param>
        /// <param name="attack">Explosion attack.</param>
        /// <param name="profile">Damage profile of every hit.</param>
        /// <param name="triggerDamage">Damage that sets off explosives and oil (chain).</param>
        /// <param name="combatants">Registered combatants.</param>
        /// <returns>Number of combatants hit.</returns>
        public static int Detonate(Combatant attacker, Combatant source, Combatant skip, Vector3 origin, float radius, AttackSpec attack,
            in AttackProfile profile, float triggerDamage, IReadOnlyList<Combatant> combatants)
        {
            if (combatants == null || attack == null)
            {
                return 0;
            }

            Combatant owner = attacker != null ? attacker : source;
            int hits = 0;
            for (int i = 0; i < combatants.Count; i++)
            {
                Combatant target = combatants[i];
                if (target == null || target == source || target == skip || !target.IsAlive || !target.isActiveAndEnabled)
                {
                    continue;
                }

                Vector3 point = target.transform.position;
                if (CombatMath.PlanarDistance(origin.x, origin.z, point.x, point.z) > radius + BodyRadius || Mathf.Abs(point.y - origin.y) > radius + 1f)
                {
                    continue;
                }

                if (target.TryGetComponent(out ExplosiveObject explosive))
                {
                    // Chain: barrels and kegs go off a moment later (GDD 03 6.6 #16).
                    explosive.Ignite(owner, triggerDamage, ElementReactions.ChainDelaySeconds);
                    continue;
                }

                if (target.TryGetComponent(out ElementArea area))
                {
                    area.Ignite(owner, triggerDamage, ElementReactions.ChainDelaySeconds);
                    continue;
                }

                if (owner != null && owner != target && !CombatTeams.CanDamage(owner.Team, target.Team))
                {
                    continue;
                }

                target.ReceiveHit(new IncomingHit
                {
                    Attacker = owner != null ? owner : target,
                    Attack = attack,
                    Profile = profile,
                    Zone = HitZone.Body,
                    Point = target.TargetPosition,
                    AttackerPosition = origin
                });
                hits++;
            }

            return hits;
        }
    }
}
