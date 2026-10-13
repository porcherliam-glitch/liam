namespace Aetherfall.Combat
{
    /// <summary>
    /// Debug view of a combatant's brain for the combat overlay (DevTools): current state as German text and the
    /// combatant it focuses on (lock-on target of the player, current target of an enemy).
    /// </summary>
    public interface ICombatDebugSource
    {
        /// <summary>Current state as short German text, e.g. "Angriff: Kombo 2/4 (aktiv)".</summary>
        string DebugStateText { get; }

        /// <summary>The focused combatant, or null.</summary>
        Combatant FocusTarget { get; }
    }
}
