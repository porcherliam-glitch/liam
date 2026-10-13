namespace Aetherfall.Combat
{
    /// <summary>Team rules of hit registration (pure logic).</summary>
    public static class CombatTeams
    {
        /// <summary>
        /// True if an attacker of <paramref name="attacker"/> may damage a target of <paramref name="target"/>: neutral
        /// targets always, otherwise only the other side. Neutral attackers (traps without owner) hit everyone.
        /// </summary>
        /// <param name="attacker">Team of the attacker.</param>
        /// <param name="target">Team of the target.</param>
        public static bool CanDamage(CombatTeam attacker, CombatTeam target)
        {
            if (target == CombatTeam.Neutral || attacker == CombatTeam.Neutral)
            {
                return true;
            }

            return attacker != target;
        }

        /// <summary>True if <paramref name="target"/> is a valid lock-on or AI target for <paramref name="viewer"/>.</summary>
        /// <param name="viewer">Team of the one who looks for a target.</param>
        /// <param name="target">Team of the candidate.</param>
        public static bool IsHostileOrNeutral(CombatTeam viewer, CombatTeam target)
        {
            return target == CombatTeam.Neutral || (viewer != CombatTeam.Neutral && viewer != target);
        }
    }
}
