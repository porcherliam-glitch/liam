namespace Aetherfall.Combat
{
    /// <summary>How the combat state limits the locomotion of its owner (see <see cref="CombatMovement"/>).</summary>
    public enum CombatMovementMode
    {
        /// <summary>Normal locomotion.</summary>
        Free = 0,

        /// <summary>Locomotion with a speed limit (blocking: 2.5 m/s), no sprint, no jump.</summary>
        Slowed = 1,

        /// <summary>No locomotion from input (attack wind-up/recovery, charging, stagger, finisher, death).</summary>
        Locked = 2,

        /// <summary>Moved by the combat state (dodge, attack lunge) along a fixed direction.</summary>
        Forced = 3
    }
}
