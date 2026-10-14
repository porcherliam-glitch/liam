using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Searches over the registered combatants (<see cref="ICombatService.Combatants"/>): the finisher target in front, the
    /// nearest hostile for the soft-lock and everyone in a cone (abilities). Small lists (a few dozen), no allocation.
    /// </summary>
    public static class CombatantQueries
    {
        private const float BodyRadius = 0.5f;

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

        /// <summary>
        /// Every living combatant <paramref name="self"/> can damage within <paramref name="range"/> and ±<paramref name="halfAngle"/>
        /// around <paramref name="yaw"/> (cone abilities like the Aether-Stoß). The distance is measured to the edge of a body of
        /// about half a metre, so a large enemy whose centre is just outside still counts.
        /// </summary>
        /// <param name="combatants">Registered combatants.</param>
        /// <param name="self">The caster.</param>
        /// <param name="yaw">Direction of the cone in degrees.</param>
        /// <param name="range">Range in metres.</param>
        /// <param name="halfAngle">Half angle in degrees.</param>
        /// <param name="result">Receives the hit combatants, nearest first.</param>
        public static void FindInCone(IReadOnlyList<Combatant> combatants, Combatant self, float yaw, float range, float halfAngle, List<Combatant> result)
        {
            result.Clear();
            if (combatants == null || self == null || !(range > 0f))
            {
                return;
            }

            Vector3 position = self.transform.position;
            for (int i = 0; i < combatants.Count; i++)
            {
                Combatant candidate = combatants[i];
                if (candidate == null || candidate == self || !candidate.IsAlive || !candidate.isActiveAndEnabled ||
                    !CombatTeams.CanDamage(self.Team, candidate.Team))
                {
                    continue;
                }

                Vector3 point = candidate.transform.position;
                float distance = CombatMath.PlanarDistance(position.x, position.z, point.x, point.z);
                if (!IsInCone(distance, CombatMath.BearingTo(position.x, position.z, yaw, point.x, point.z), range, halfAngle))
                {
                    continue;
                }

                int index = result.Count;
                while (index > 0 && CombatMath.PlanarDistance(position.x, position.z, result[index - 1].transform.position.x,
                           result[index - 1].transform.position.z) > distance)
                {
                    index--;
                }

                result.Insert(index, candidate);
            }
        }

        /// <summary>
        /// True if a body whose centre lies <paramref name="distance"/> metres away at <paramref name="bearing"/> degrees from the
        /// cone direction is inside the cone: its edge (half a metre) within the range, and its centre within the half angle –
        /// except up close, where a body within its own radius always counts.
        /// </summary>
        /// <param name="distance">Planar distance of the centre in metres.</param>
        /// <param name="bearing">Angle from the cone direction in degrees (−180..180).</param>
        /// <param name="range">Range in metres.</param>
        /// <param name="halfAngle">Half angle in degrees.</param>
        public static bool IsInCone(float distance, float bearing, float range, float halfAngle)
        {
            if (distance - BodyRadius > range)
            {
                return false;
            }

            return distance <= BodyRadius || Math.Abs(bearing) <= halfAngle;
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
