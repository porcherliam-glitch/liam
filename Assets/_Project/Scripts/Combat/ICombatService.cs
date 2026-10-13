using System;
using System.Collections.Generic;
using Aetherfall.Utilities;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Combat service (architecture 4.1 step 12 "Combat-Konfiguration"): one <see cref="DamageCalculator"/> and random source
    /// for all hits, the registry of active combatants (lock-on, AI targets), the combat state of the player (global event
    /// <c>CombatStateChanged</c>), the global event <c>DamageDealt</c> and the local event <see cref="HitLanded"/> for hit
    /// feedback. Registered by <see cref="CombatInstaller"/>.
    /// </summary>
    public interface ICombatService
    {
        /// <summary>The damage formula (GDD 03 8).</summary>
        DamageCalculator Calculator { get; }

        /// <summary>Random source of critical rolls.</summary>
        IRandom Random { get; }

        /// <summary>Hit feel table (GDD 03 4.11).</summary>
        HitFeedbackTable Feedback { get; }

        /// <summary>True while the player is in combat.</summary>
        bool InCombat { get; }

        /// <summary>Active combatants (enabled, registered by themselves).</summary>
        IReadOnlyList<Combatant> Combatants { get; }

        /// <summary>Raised after every resolved hit (local event with object references, not on the global bus).</summary>
        event Action<HitReport> HitLanded;

        /// <summary>Adds a combatant (called by <see cref="Combatant"/> in OnEnable).</summary>
        /// <param name="combatant">Combatant.</param>
        void Register(Combatant combatant);

        /// <summary>Removes a combatant (OnDisable).</summary>
        /// <param name="combatant">Combatant.</param>
        void Unregister(Combatant combatant);

        /// <summary>An enemy starts or stops fighting the player (AI state "Kaempfen").</summary>
        /// <param name="agent">The enemy.</param>
        /// <param name="engaged">True while it fights.</param>
        void ReportEngagement(object agent, bool engaged);

        /// <summary>Publishes a resolved hit: <c>DamageDealt</c>, combat state, <see cref="HitLanded"/>.</summary>
        /// <param name="report">The hit.</param>
        void ReportHit(in HitReport report);

        /// <summary>
        /// Protects a combatant from new enemy attacks for a while (finisher: "andere Gegner geben ihre Angriffs-Token fuer
        /// die Dauer zurueck", GDD 03 4.10).
        /// </summary>
        /// <param name="target">Protected combatant.</param>
        /// <param name="seconds">Duration.</param>
        void ProtectFromAttacks(Combatant target, float seconds);

        /// <summary>True while <paramref name="target"/> is protected from new attacks.</summary>
        /// <param name="target">Combatant.</param>
        bool IsProtectedFromAttacks(Combatant target);

        /// <summary>Forgets the combat state (player respawn).</summary>
        void ResetCombatState();
    }
}
