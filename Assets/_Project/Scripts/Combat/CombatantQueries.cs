using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Searches over the registered combatants (<see cref="ICombatService.Combatants"/>): the finisher target in front and
    /// the nearest hostile for the soft-lock. Small lists (a few dozen), no allocation.
    /// </summary>
    public static class CombatantQueries
    {
        /// <summary>
        /// The nearest combatant that is open for a finisher (stunned after a poise break), damageable by
        /// <paramref name="self"/>, within <paramref name="range"/> and ±<paramref name="halfAngle"/> around the facing.
        /// </summary>
        /// <param name="combatants">Registered combatants.</param>
        /// <param name="self">The attacker.</param>
        /// <param name="yaw">Facing of the attacker in degrees.</param>
        /// <param name="range">Range in metres.</param>
        /// <param name="halfAngle">Half angle in degrees.</param>
        /// <returns>The target, or null.</returns>
        public static Combatant FindFinisherTarget(IReadOnlyList<Combatant> combatants, Combatant self, float yaw, float range, float halfAngle)
        {
            if (combatants == null || self == null)
            {
                return null;
            }

            Vector3 position = self.transform.position;
            Combatant best = null;
            float bestDistance = float.MaxValue;
            for (int i = 0; i < combatants.Count; i++)
            {
                Combatant candidate = combatants[i];
                if (candidate == null || candidate == self || !candidate.IsOpenForFinisher || !CombatTeams.CanDamage(self.Team, candidate.Team))
                {
                    continue;
                }

                Vector3 point = candidate.transform.position;
                float distance = CombatMath.PlanarDistance(position.x, position.z, point.x, point.z);
                float bearing = CombatMath.BearingTo(position.x, position.z, yaw, point.x, point.z);
                if (distance <= range && Math.Abs(bearing) <= halfAngle && distance < bestDistance)
                {
                    best = candidate;
                    bestDistance = distance;
                }
            }

            return best;
        }

        /// <summary>The nearest targetable combatant <paramref name="self"/> can damage, within <paramref name="range"/>.</summary>
        /// <param name="combatants">Registered combatants.</param>
        /// <param name="self">The attacker.</param>
        /// <param name="range">Range in metres.</param>
        /// <returns>The target, or null.</returns>
        public static Combatant FindNearestHostile(IReadOnlyList<Combatant> combatants, Combatant self, float range)
        {
            if (combatants == null || self == null || !(range > 0f))
            {
                return null;
            }

            Vector3 position = self.transform.position;
            Combatant best = null;
            float bestDistance = range;
            for (int i = 0; i < combatants.Count; i++)
            {
                Combatant candidate = combatants[i];
                if (candidate == null || candidate == self || !candidate.IsTargetable || !CombatTeams.CanDamage(self.Team, candidate.Team))
                {
                    continue;
                }

                Vector3 point = candidate.transform.position;
                float distance = CombatMath.PlanarDistance(position.x, position.z, point.x, point.z);
                if (distance <= bestDistance)
                {
                    best = candidate;
                    bestDistance = distance;
                }
            }

            return best;
        }
    }
}
