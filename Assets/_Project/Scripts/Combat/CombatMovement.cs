namespace Aetherfall.Combat
{
    /// <summary>
    /// Movement limits of the current combat state, read by the movement code of the owner (player motor, enemy controller):
    /// "Bewegung waehrend Angriffen eingeschraenkt". Immutable value type.
    /// </summary>
    public readonly struct CombatMovement
    {
        /// <summary>Mode.</summary>
        public readonly CombatMovementMode Mode;

        /// <summary>Speed limit in m/s (mode <see cref="CombatMovementMode.Slowed"/>).</summary>
        public readonly float SpeedLimit;

        /// <summary>Speed in m/s along the forced direction (mode <see cref="CombatMovementMode.Forced"/>).</summary>
        public readonly float ForcedSpeed;

        /// <summary>Creates the value.</summary>
        /// <param name="mode">Mode.</param>
        /// <param name="speedLimit">Speed limit.</param>
        /// <param name="forcedSpeed">Forced speed.</param>
        public CombatMovement(CombatMovementMode mode, float speedLimit = 0f, float forcedSpeed = 0f)
        {
            Mode = mode;
            SpeedLimit = speedLimit;
            ForcedSpeed = forcedSpeed;
        }

        /// <summary>Normal locomotion.</summary>
        public static CombatMovement Free => new CombatMovement(CombatMovementMode.Free);

        /// <summary>No locomotion from input.</summary>
        public static CombatMovement Locked => new CombatMovement(CombatMovementMode.Locked);

        /// <summary>True if jumping is allowed.</summary>
        public bool AllowsJump => Mode == CombatMovementMode.Free;

        /// <summary>True if sprinting is allowed.</summary>
        public bool AllowsSprint => Mode == CombatMovementMode.Free;
    }
}
