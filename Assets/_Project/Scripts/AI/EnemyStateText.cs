using System.Globalization;
using Aetherfall.Combat;

namespace Aetherfall.AI
{
    /// <summary>German one-line description of an enemy's AI state for the combat debug overlay.</summary>
    public static class EnemyStateText
    {
        /// <summary>Describes the brain state, e.g. "Kampf: umkreist, Token: nein" or the stun with its remaining time.</summary>
        /// <param name="brain">The brain, or null while it starts.</param>
        /// <returns>German text.</returns>
        public static string Describe(EnemyBrain brain)
        {
            if (brain == null)
            {
                return "startet …";
            }

            string detection = " (Entdeckung " + ((int)brain.Detection).ToString(CultureInfo.InvariantCulture) + ")";
            switch (brain.State)
            {
                case EnemyStateId.Patrol: return "Patrouille" + detection;
                case EnemyStateId.Guard: return "Wache" + detection;
                case EnemyStateId.Suspicious: return "Misstrauisch" + detection;
                case EnemyStateId.Search: return "Sucht" + detection;
                case EnemyStateId.Flee: return "Flieht";
                case EnemyStateId.Return: return "Kehrt zurück (Leash)";
                case EnemyStateId.Dead: return "Tot";
                case EnemyStateId.Stunned:
                    return (brain.StunAllowsFinisher ? "BETÄUBT – Finisher möglich" : "Offen nach Parade") + " (" +
                           CombatStateText.Seconds(brain.StunRemaining) + ")";
            }

            string token = brain.HasToken ? ", Token: ja" : ", Token: nein";
            switch (brain.CombatPhase)
            {
                case EnemyCombatPhase.Approach: return "Kampf: nähert sich" + token;
                case EnemyCombatPhase.Circle: return "Kampf: umkreist" + token;
                case EnemyCombatPhase.Engage: return "Kampf: greift gleich an" + token;
                case EnemyCombatPhase.Retreat: return "Kampf: weicht zurück" + token;
                default:
                    AttackSpec attack = brain.CurrentAttack;
                    string attackName = attack != null ? attack.Id : "–";
                    return (brain.IsTelegraphing ? "Kampf: TELEGRAFIE " : "Kampf: Angriff ") + attackName + token;
            }
        }
    }
}
