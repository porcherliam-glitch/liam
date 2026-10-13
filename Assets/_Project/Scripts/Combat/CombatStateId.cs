namespace Aetherfall.Combat
{
    /// <summary>
    /// States of the player combat state machine (architecture 11.4: Bereit, Angriff, Aufladen, Blocken, Parierfenster,
    /// Ausweichen, Taumeln, Finisher, Tot). The parry window is a sub-state of <see cref="Blocking"/>
    /// (<see cref="CombatStateMachine.IsParryWindowOpen"/>).
    /// </summary>
    public enum CombatStateId
    {
        /// <summary>Ready: free movement, any action may start.</summary>
        Idle = 0,

        /// <summary>An attack runs (light combo step, heavy, sprint, jump or counter attack).</summary>
        Attacking = 1,

        /// <summary>The heavy attack is being charged (button held).</summary>
        Charging = 2,

        /// <summary>Guard raised (block); the first 150 ms after the press are the parry window.</summary>
        Blocking = 3,

        /// <summary>Dodge roll or back step.</summary>
        Dodging = 4,

        /// <summary>Staggered, guard broken or knocked down: no action possible.</summary>
        Staggered = 5,

        /// <summary>Finisher animation against a target with broken poise; invulnerable.</summary>
        Finisher = 6,

        /// <summary>Dead.</summary>
        Dead = 7
    }
}
