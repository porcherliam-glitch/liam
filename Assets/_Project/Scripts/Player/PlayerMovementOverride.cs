namespace Aetherfall.Player
{
    /// <summary>
    /// Limits and commands of the combat system for one movement step (pure data): locked locomotion during attacks,
    /// speed limit while blocking, forced velocity for dodge rolls, attack lunges and knockback, a facing to keep (lock-on,
    /// attack towards the target) and strafing in lock-on (GDD 03 3.1: sideways 4.0 m/s, backwards 3.5 m/s).
    /// </summary>
    /// <remarks>The default value changes nothing. Filled by the player combat controller and passed through
    /// <see cref="PlayerMotor.SetMovementOverride"/> to <see cref="PlayerMovementModel.Step(in PlayerMovementInput, in GroundContact, float, in PlayerMovementOverride)"/>.</remarks>
    public struct PlayerMovementOverride
    {
        /// <summary>No locomotion from input (the character decelerates; air momentum is kept).</summary>
        public bool LockLocomotion { get; set; }

        /// <summary>Speed limit in m/s; 0 or less = none (blocking: 2.5).</summary>
        public float SpeedLimit { get; set; }

        /// <summary>True: the horizontal velocity is <see cref="ForcedVelocityX"/>/<see cref="ForcedVelocityZ"/> (dodge, lunge, knockback).</summary>
        public bool HasForcedVelocity { get; set; }

        /// <summary>Forced velocity, X in m/s.</summary>
        public float ForcedVelocityX { get; set; }

        /// <summary>Forced velocity, Z in m/s.</summary>
        public float ForcedVelocityZ { get; set; }

        /// <summary>True: turn towards <see cref="FacingYaw"/> instead of the movement direction.</summary>
        public bool HasFacing { get; set; }

        /// <summary>Wanted facing in degrees.</summary>
        public float FacingYaw { get; set; }

        /// <summary>Turn rate towards the facing in degrees per second; 0 = the normal turn rate.</summary>
        public float FacingTurnRate { get; set; }

        /// <summary>
        /// Lock-on strafing: the character keeps <see cref="FacingYaw"/> and moves in all eight directions with the strafe
        /// speeds (sprinting ends the strafing, like in the GDD camera rules).
        /// </summary>
        public bool Strafe { get; set; }

        /// <summary>No jump (and a buffered jump is dropped).</summary>
        public bool BlockJump { get; set; }

        /// <summary>No sprint (a running sprint ends).</summary>
        public bool BlockSprint { get; set; }
    }
}
