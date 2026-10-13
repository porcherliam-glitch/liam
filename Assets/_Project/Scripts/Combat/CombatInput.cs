namespace Aetherfall.Combat
{
    /// <summary>
    /// Combat commands of one frame for <see cref="CombatStateMachine.Tick"/>, filled by the player combat controller from the
    /// Gameplay actions (pure data, no Input System types).
    /// </summary>
    public struct CombatInput
    {
        /// <summary>Light attack pressed this frame (X / left mouse button).</summary>
        public bool LightPressed { get; set; }

        /// <summary>Heavy attack pressed this frame (Y / right mouse button).</summary>
        public bool HeavyPressed { get; set; }

        /// <summary>Heavy attack held (charging, GDD 03 4.5).</summary>
        public bool HeavyHeld { get; set; }

        /// <summary>Block pressed this frame (LB / Q): raises the guard and opens the parry window.</summary>
        public bool BlockPressed { get; set; }

        /// <summary>Block held.</summary>
        public bool BlockHeld { get; set; }

        /// <summary>Dodge pressed this frame (B / Ctrl).</summary>
        public bool DodgePressed { get; set; }

        /// <summary>Movement input present: with input the dodge is a roll, without a back step (GDD 03 1.4).</summary>
        public bool HasMoveInput { get; set; }

        /// <summary>Seconds the player has been sprinting without break (0 = not sprinting).</summary>
        public float SprintSeconds { get; set; }

        /// <summary>True while jumping or falling (light attack = jump attack).</summary>
        public bool IsAirborne { get; set; }

        /// <summary>A target with broken poise is within finisher range and angle (GDD 03 4.10).</summary>
        public bool FinisherAvailable { get; set; }
    }
}
