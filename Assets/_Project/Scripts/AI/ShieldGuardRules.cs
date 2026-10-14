using Aetherfall.Combat;

namespace Aetherfall.AI
{
    /// <summary>
    /// When a shield-bearing enemy blocks (GDD 02 11.7: elite skeleton with tower shield): while it is not attacking past the
    /// wind-up, not stunned and alive, a hit from the front within the shield angle is blocked. Pure logic.
    /// </summary>
    public static class ShieldGuardRules
    {
        /// <summary>Default shield angle of a tower shield in degrees.</summary>
        public const float TowerShieldAngle = 170f;

        /// <summary>True if the shield is raised in this state.</summary>
        /// <param name="state">Brain state.</param>
        /// <param name="attackPhase">Phase of the running attack.</param>
        /// <param name="alive">True if alive.</param>
        public static bool IsGuarding(EnemyStateId state, AttackPhase attackPhase, bool alive)
        {
            if (!alive || state == EnemyStateId.Stunned || state == EnemyStateId.Dead)
            {
                return false;
            }

            return attackPhase == AttackPhase.None || attackPhase == AttackPhase.Windup;
        }

        /// <summary>True if the shield covers a hit from this bearing.</summary>
        /// <param name="bearing">Bearing of the attacker relative to the view direction (-180..180).</param>
        /// <param name="angle">Shield angle in degrees.</param>
        public static bool Covers(float bearing, float angle)
        {
            float half = angle * 0.5f;
            return bearing >= -half && bearing <= half;
        }
    }
}
