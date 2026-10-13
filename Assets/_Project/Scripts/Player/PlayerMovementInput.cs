namespace Aetherfall.Player
{
    /// <summary>
    /// Movement commands of one frame for <see cref="PlayerMovementModel"/>, filled by <see cref="PlayerInputReader"/>
    /// (pure data, no Input System types).
    /// </summary>
    public struct PlayerMovementInput
    {
        /// <summary>Movement input right (stick X or A/D), −1–1; together with <see cref="MoveY"/> magnitude 0–1.</summary>
        public float MoveX { get; set; }

        /// <summary>Movement input forward relative to the camera (stick Y or W/S), −1–1.</summary>
        public float MoveY { get; set; }

        /// <summary>Yaw of the camera in degrees (0 = world +Z); the movement is relative to it.</summary>
        public float CameraYaw { get; set; }

        /// <summary>Jump was pressed this frame.</summary>
        public bool JumpPressed { get; set; }

        /// <summary>Sprint was pressed this frame.</summary>
        public bool SprintPressed { get; set; }

        /// <summary>Sprint is held (hold mode: keyboard Shift).</summary>
        public bool SprintHeld { get; set; }

        /// <summary>
        /// Sprint toggles instead of being held (GDD 05 4.2: controller "Umschalten" on L3, keyboard "Halten" on Shift).
        /// Set from the device that pressed Sprint or Sneak last.
        /// </summary>
        public bool SprintToggleMode { get; set; }

        /// <summary>Sneak was pressed this frame (toggle).</summary>
        public bool SneakPressed { get; set; }

        /// <summary>
        /// Sprint and Sneak were triggered by the same button (L3): the context rule decides by stick deflection
        /// (GDD 03 1.3 K3: ≥ 50 % = sprint, otherwise sneak).
        /// </summary>
        public bool SprintSneakShared { get; set; }

        /// <summary>Walk/run toggle switched this frame (Caps Lock; on macOS press or release, see IGameplayInput.WasToggledThisFrame).</summary>
        public bool WalkTogglePressed { get; set; }
    }
}
