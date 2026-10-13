namespace Aetherfall.Player
{
    /// <summary>
    /// Gait selection and target speeds of the player (GDD 03 1.5 and 3.1): stick deflection below 50 % walks, from 50 %
    /// runs; sprint and sneak override; walk mode (Caps Lock) caps full input at walking speed. Pure logic.
    /// </summary>
    public static class PlayerGaitRules
    {
        /// <summary>Gait for an input magnitude and the current states (GDD 03 1.5, 3.1).</summary>
        /// <param name="inputMagnitude">Movement input magnitude 0–1.</param>
        /// <param name="sprinting">Sprint state.</param>
        /// <param name="sneaking">Sneak state.</param>
        /// <param name="walkMode">Walk mode (Caps Lock).</param>
        /// <param name="runThreshold">Input magnitude from which the player runs (50 %).</param>
        public static PlayerGait ResolveGait(float inputMagnitude, bool sprinting, bool sneaking, bool walkMode, float runThreshold)
        {
            if (!(inputMagnitude > PlayerMovementMath.InputEpsilon))
            {
                return PlayerGait.Idle;
            }

            if (sneaking)
            {
                return PlayerGait.Sneak;
            }

            if (sprinting)
            {
                return PlayerGait.Sprint;
            }

            return walkMode || inputMagnitude < runThreshold ? PlayerGait.Walk : PlayerGait.Run;
        }

        /// <summary>
        /// Target speed of a gait. Walking and sneaking scale with the stick deflection up to the run threshold
        /// (analog creeping); running and sprinting use their fixed speeds.
        /// </summary>
        /// <param name="gait">Gait.</param>
        /// <param name="inputMagnitude">Movement input magnitude 0–1.</param>
        /// <param name="tuning">Tuning values.</param>
        public static float TargetSpeed(PlayerGait gait, float inputMagnitude, PlayerMovementTuning tuning)
        {
            float analog = PlayerMovementMath.Clamp01(inputMagnitude / tuning.RunInputThreshold);
            switch (gait)
            {
                case PlayerGait.Walk:
                    return tuning.WalkSpeed * analog;
                case PlayerGait.Sneak:
                    return tuning.SneakSpeed * analog;
                case PlayerGait.Run:
                    return tuning.RunSpeed;
                case PlayerGait.Sprint:
                    return tuning.SprintSpeed;
                default:
                    return 0f;
            }
        }
    }
}
