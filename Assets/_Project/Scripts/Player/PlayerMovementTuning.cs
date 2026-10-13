using System;

namespace Aetherfall.Player
{
    /// <summary>
    /// Tuning values of the player movement as plain data (GDD 03 3.1), used by <see cref="PlayerMovementModel"/>.
    /// Built from <see cref="PlayerMovementSettings"/> at run time; <see cref="CreateDefault"/> returns the GDD values,
    /// so the model is testable without Unity assets.
    /// </summary>
    /// <remarks>Speeds in m/s, times in s, angles in degrees, accelerations in m/s².</remarks>
    public sealed class PlayerMovementTuning
    {
        /// <summary>Standard gravity, 1 g in m/s².</summary>
        public const float StandardGravity = 9.81f;

        /// <summary>Walking speed (GDD 03 3.1: 2.0 m/s).</summary>
        public float WalkSpeed { get; set; } = 2.0f;

        /// <summary>Running speed (GDD 03 3.1, canon: 5.0 m/s).</summary>
        public float RunSpeed { get; set; } = 5.0f;

        /// <summary>Sprinting speed (GDD 03 3.1, canon: 7.0 m/s).</summary>
        public float SprintSpeed { get; set; } = 7.0f;

        /// <summary>Sneaking speed (GDD 03 3.1: 1.8 m/s).</summary>
        public float SneakSpeed { get; set; } = 1.8f;

        /// <summary>Stick deflection from which the player runs instead of walking (GDD 03 1.5: 50 %).</summary>
        public float RunInputThreshold { get; set; } = 0.5f;

        /// <summary>Time from standstill to running speed (GDD 03 3.1: 0 → 5 m/s in 0.15 s).</summary>
        public float AccelerationTime { get; set; } = 0.15f;

        /// <summary>Time from running speed to standstill (GDD 03 3.1: stop in 0.12 s).</summary>
        public float DecelerationTime { get; set; } = 0.12f;

        /// <summary>Turn rate while walking or running (GDD 03 3.1: 720 °/s).</summary>
        public float TurnRate { get; set; } = 720f;

        /// <summary>Turn rate while sprinting (GDD 03 3.1: 540 °/s).</summary>
        public float SprintTurnRate { get; set; } = 540f;

        /// <summary>Jump height from standing (GDD 03 3.1: 1.2 m).</summary>
        public float JumpHeight { get; set; } = 1.2f;

        /// <summary>Gravity in m/s² (1 g).</summary>
        public float Gravity { get; set; } = StandardGravity;

        /// <summary>Gravity factor while rising (GDD 03 3.1: 1.0 g).</summary>
        public float RisingGravityScale { get; set; } = 1.0f;

        /// <summary>Gravity factor while falling (GDD 03 3.1: 1.6 g, short "snappy" arc).</summary>
        public float FallingGravityScale { get; set; } = 1.6f;

        /// <summary>Highest fall speed (GDD 03 3.1: 40 m/s).</summary>
        public float MaxFallSpeed { get; set; } = 40f;

        /// <summary>Air control as share of the ground acceleration (GDD 03 3.1: 40 %, correct direction, no reversal).</summary>
        public float AirControl { get; set; } = 0.4f;

        /// <summary>Jumping is still possible this long after leaving the ground (GDD 03 3.1: 0.12 s).</summary>
        public float CoyoteTime { get; set; } = 0.12f;

        /// <summary>A jump pressed this long before landing is executed on landing (GDD 03 3.1: 0.15 s).</summary>
        public float JumpBufferTime { get; set; } = 0.15f;

        /// <summary>Steepest walkable slope (GDD 03 3.1: up to 45°); the CharacterController uses <see cref="ControllerSlopeLimit"/>.</summary>
        public float WalkableSlopeAngle { get; set; } = 45f;

        /// <summary>Slope angle from which the player slides down (GDD 03 3.1: from 50°).</summary>
        public float SlideStartAngle { get; set; } = 50f;

        /// <summary>Highest sliding speed on steep slopes (Vorschlag: 12 m/s).</summary>
        public float MaxSlideSpeed { get; set; } = 12f;

        /// <summary>Downward speed that keeps the player on the ground when walking down slopes and stairs (Vorschlag: 2 m/s).</summary>
        public float GroundStickSpeed { get; set; } = 2f;

        /// <summary>Highest step the CharacterController climbs without jumping (Vorschlag: 0.3 m).</summary>
        public float StepOffset { get; set; } = 0.3f;

        /// <summary>Stamina cost of sprinting per second (GDD 03 3.1 / 4.3: 12/s).</summary>
        public float SprintStaminaPerSecond { get; set; } = 12f;

        /// <summary>Stamina needed to start a sprint (GDD 03 3.1: "Start erst ab 10 Ausdauer").</summary>
        public float SprintStartMinimumStamina { get; set; } = 10f;

        /// <summary>Stamina cost of a jump (GDD 03 3.1 / 4.3: 10). Jumping needs more than 0 stamina.</summary>
        public float JumpStaminaCost { get; set; } = 10f;

        /// <summary>Returns a new instance with the values of GDD 03 3.1.</summary>
        public static PlayerMovementTuning CreateDefault()
        {
            return new PlayerMovementTuning();
        }

        /// <summary>Tolerance in degrees between <see cref="WalkableSlopeAngle"/> and the CharacterController slope limit.</summary>
        public const float SlopeLimitTolerance = 0.5f;

        /// <summary>
        /// Slope limit for the CharacterController: <see cref="WalkableSlopeAngle"/> plus <see cref="SlopeLimitTolerance"/>.
        /// PhysX compares cosines, so a slope of exactly the walkable angle (the 45° test ramp) would be walkable or not
        /// depending on float rounding; the small tolerance keeps it walkable. Sliding still starts at
        /// <see cref="SlideStartAngle"/>.
        /// </summary>
        public float ControllerSlopeLimit => WalkableSlopeAngle + SlopeLimitTolerance;

        /// <summary>Acceleration on the ground in m/s² (running speed / acceleration time).</summary>
        public float GroundAcceleration => RunSpeed / Math.Max(0.001f, AccelerationTime);

        /// <summary>Deceleration on the ground in m/s² (running speed / deceleration time).</summary>
        public float GroundDeceleration => RunSpeed / Math.Max(0.001f, DecelerationTime);

        /// <summary>Returns an error text if a value is out of range, otherwise an empty string.</summary>
        public string Validate()
        {
            if (!(WalkSpeed > 0f && RunSpeed > 0f && SprintSpeed > 0f && SneakSpeed > 0f))
            {
                return "All speeds must be greater than 0.";
            }

            if (!(RunInputThreshold > 0f && RunInputThreshold <= 1f))
            {
                return "RunInputThreshold must be in (0, 1].";
            }

            if (!(AccelerationTime > 0f && DecelerationTime > 0f))
            {
                return "Acceleration and deceleration times must be greater than 0.";
            }

            if (!(JumpHeight >= 0f && Gravity > 0f && RisingGravityScale > 0f && FallingGravityScale > 0f && MaxFallSpeed > 0f))
            {
                return "Jump height must be 0 or more; gravity, gravity scales and max fall speed must be greater than 0.";
            }

            if (!(AirControl >= 0f && AirControl <= 1f))
            {
                return "AirControl must be in [0, 1].";
            }

            if (!(CoyoteTime >= 0f && JumpBufferTime >= 0f))
            {
                return "Coyote time and jump buffer must be 0 or more.";
            }

            if (!(WalkableSlopeAngle > 0f && WalkableSlopeAngle < 90f && SlideStartAngle >= WalkableSlopeAngle && SlideStartAngle < 90f))
            {
                return "Slope angles must satisfy 0 < walkable ≤ slide start < 90.";
            }

            if (!(SprintStaminaPerSecond >= 0f && SprintStartMinimumStamina >= 0f && JumpStaminaCost >= 0f))
            {
                return "Stamina costs and the sprint start minimum must be 0 or more.";
            }

            return string.Empty;
        }
    }
}
