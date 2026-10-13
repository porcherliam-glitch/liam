using System.Globalization;

namespace Aetherfall.Combat
{
    /// <summary>
    /// German short texts of combat states for the debug overlays ("Angriff: Kombo 2/4 (Ausholen)", "Blocken –
    /// PARIERFENSTER offen" …). Pure logic, shared by the player and the enemies.
    /// </summary>
    public static class CombatStateText
    {
        /// <summary>Describes the state of the player's combat state machine.</summary>
        /// <param name="machine">The state machine.</param>
        /// <param name="comboLength">Number of steps of the light combo (for "Kombo 2/4").</param>
        /// <returns>German one-line text.</returns>
        public static string Describe(CombatStateMachine machine, int comboLength)
        {
            if (machine == null)
            {
                return "kein Kampf (Einrichtung fehlerhaft)";
            }

            switch (machine.State)
            {
                case CombatStateId.Idle:
                    return "Bereit";
                case CombatStateId.Attacking:
                    AttackSpec attack = machine.CurrentAttack;
                    string phase = Phase(machine.AttackPhase);
                    if (attack != null && (attack.Kind == AttackKind.Light || attack.Kind == AttackKind.ComboFinisher))
                    {
                        return "Angriff: Kombo " + (machine.ComboStep + 1) + "/" + comboLength + " (" + phase + ")";
                    }

                    return "Angriff: " + Kind(attack) + " (" + phase + ")" + (machine.HasHyperArmor ? ", Hyperarmor" : string.Empty);
                case CombatStateId.Charging:
                    return "Schwer aufladen: Stufe " + machine.ChargeLevel + " (" + Seconds(machine.ChargeSeconds) + ")" +
                           (machine.HasHyperArmor ? ", Hyperarmor" : string.Empty);
                case CombatStateId.Blocking:
                    return machine.IsParryWindowOpen ? "Blocken – PARIERFENSTER offen" : "Blocken";
                case CombatStateId.Dodging:
                    return (machine.IsRoll ? "Rolle" : "Rückwärtsschritt") + (machine.IsInvulnerable ? " (unverwundbar)" : string.Empty);
                case CombatStateId.Staggered:
                    return Stagger(machine.StaggerKind) + " (" + Seconds(machine.StaggerRemaining) + ")";
                case CombatStateId.Finisher:
                    return "Finisher (unverwundbar)";
                default:
                    return "Tot";
            }
        }

        /// <summary>German name of an attack phase.</summary>
        /// <param name="phase">Phase.</param>
        public static string Phase(AttackPhase phase)
        {
            switch (phase)
            {
                case AttackPhase.Windup: return "Ausholen";
                case AttackPhase.Active: return "Treffer";
                case AttackPhase.Recovery: return "Erholung";
                default: return "–";
            }
        }

        /// <summary>German name of an attack kind (or its id for light attacks).</summary>
        /// <param name="attack">Attack, may be null.</param>
        public static string Kind(AttackSpec attack)
        {
            if (attack == null)
            {
                return "–";
            }

            switch (attack.Kind)
            {
                case AttackKind.Heavy: return attack.ChargeLevel > 0 ? "schwer, Stufe " + attack.ChargeLevel : "schwer";
                case AttackKind.Sprint: return "Sprintangriff";
                case AttackKind.Jump: return "Sprungangriff";
                case AttackKind.Counter: return "Konter";
                case AttackKind.Finisher: return "Finisher";
                default: return attack.Id;
            }
        }

        /// <summary>German name of a stagger kind.</summary>
        /// <param name="kind">Kind.</param>
        public static string Stagger(StaggerKind kind)
        {
            switch (kind)
            {
                case StaggerKind.Knockdown: return "Umgeworfen";
                case StaggerKind.GuardBreak: return "Deckungsbruch";
                default: return "Taumeln";
            }
        }

        /// <summary>Seconds with one decimal, e.g. "1.2 s".</summary>
        /// <param name="seconds">Seconds.</param>
        public static string Seconds(float seconds)
        {
            return seconds.ToString("0.0", CultureInfo.InvariantCulture) + " s";
        }
    }
}
