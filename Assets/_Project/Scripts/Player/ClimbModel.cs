using System;

namespace Aetherfall.Player
{
    /// <summary>Kind of a climbable surface (GDD 03 3.3, GDD 05 3.2: marked rock, vines, ladders).</summary>
    public enum ClimbSurfaceKind
    {
        /// <summary>Pale, worn rock: 1.2 m/s up, 1.4 m/s sideways.</summary>
        Rock = 0,

        /// <summary>Vines: 1.0 m/s.</summary>
        Vines = 1,

        /// <summary>Ladder: 1.5 m/s, up and down only, no stamina.</summary>
        Ladder = 2
    }

    /// <summary>What the climbing does this step.</summary>
    public enum ClimbOutcome
    {
        /// <summary>Hanging or moving on the surface.</summary>
        Climbing = 0,

        /// <summary>Let go (B / dodge key): falls.</summary>
        LetGo = 1,

        /// <summary>Out of stamina after the warning shake: falls.</summary>
        Exhausted = 2
    }

    /// <summary>How a climb ended (for the tour, the UI and the log).</summary>
    public enum ClimbExit
    {
        /// <summary>Still climbing or never climbed.</summary>
        None = 0,

        /// <summary>Let go with the dodge button.</summary>
        LetGo = 1,

        /// <summary>Fell after the shaking (stamina out).</summary>
        Exhausted = 2,

        /// <summary>Pulled up over the top edge.</summary>
        TopOut = 3,

        /// <summary>Climbed down to the ground and stood up.</summary>
        Ground = 4,

        /// <summary>The wall ended without a ledge (or the character was moved away).</summary>
        Lost = 5
    }

    /// <summary>
    /// Climbing on marked surfaces (GDD 03 3.3, pure logic): speeds per surface, stamina 6/s while moving, 2/s while hanging,
    /// 0 at rest points and on ladders; climb jump 1.8 m in the stick direction for 20 stamina; fast climbing (sprint) ×1.5
    /// speed and ×2 stamina; at 0 stamina the hands shake for 1.0 s, then the character falls. Movement happens in the plane
    /// of the wall: <see cref="StepResult.Right"/> along the wall, <see cref="StepResult.Up"/> upwards.
    /// </summary>
    public sealed class ClimbModel
    {
        /// <summary>Stamina per second while moving.</summary>
        public const float MoveStamina = 6f;

        /// <summary>Stamina per second while hanging still.</summary>
        public const float HangStamina = 2f;

        /// <summary>Stamina of a climb jump.</summary>
        public const float JumpStamina = 20f;

        /// <summary>Distance of a climb jump in metres.</summary>
        public const float JumpDistance = 1.8f;

        /// <summary>Duration of a climb jump in seconds.</summary>
        public const float JumpSeconds = 0.35f;

        /// <summary>Warning shake before the fall in seconds.</summary>
        public const float ShakeSeconds = 1.0f;

        private float _jumpLeft;
        private float _jumpRight;
        private float _jumpUp;
        private float _shake = -1f;

        /// <summary>True during a climb jump.</summary>
        public bool IsJumping => _jumpLeft > 0f;

        /// <summary>True while the hands shake (stamina is out).</summary>
        public bool IsShaking => _shake >= 0f;

        /// <summary>Climbing speed upwards on a surface (m/s).</summary>
        /// <param name="kind">Surface.</param>
        public static float UpSpeed(ClimbSurfaceKind kind)
        {
            return kind == ClimbSurfaceKind.Ladder ? 1.5f : kind == ClimbSurfaceKind.Vines ? 1.0f : 1.2f;
        }

        /// <summary>Climbing speed sideways on a surface (m/s; ladders: none).</summary>
        /// <param name="kind">Surface.</param>
        public static float SideSpeed(ClimbSurfaceKind kind)
        {
            return kind == ClimbSurfaceKind.Ladder ? 0f : kind == ClimbSurfaceKind.Vines ? 1.0f : 1.4f;
        }

        /// <summary>Starts a new climb (hands on the wall).</summary>
        public void Begin()
        {
            _jumpLeft = 0f;
            _shake = -1f;
        }

        /// <summary>Advances the climbing one step.</summary>
        /// <param name="kind">Surface.</param>
        /// <param name="restPoint">True on a marked rest point (no stamina).</param>
        /// <param name="moveX">Stick right (−1 … 1).</param>
        /// <param name="moveY">Stick up (−1 … 1).</param>
        /// <param name="fast">Sprint held: fast climbing.</param>
        /// <param name="jump">Jump pressed: climb jump in the stick direction.</param>
        /// <param name="letGo">Dodge pressed: let go.</param>
        /// <param name="stamina">Current stamina.</param>
        /// <param name="deltaTime">Seconds.</param>
        public StepResult Step(ClimbSurfaceKind kind, bool restPoint, float moveX, float moveY, bool fast, bool jump, bool letGo, float stamina,
            float deltaTime)
        {
            var result = new StepResult { Outcome = ClimbOutcome.Climbing };
            float dt = Math.Max(0f, deltaTime);
            if (letGo)
            {
                result.Outcome = ClimbOutcome.LetGo;
                return result;
            }

            if (_jumpLeft > 0f)
            {
                // A climb jump runs to its end, no new input.
                float part = Math.Min(dt, _jumpLeft);
                _jumpLeft -= part;
                if (_jumpLeft < 1e-4f)
                {
                    _jumpLeft = 0f;
                }

                result.Right = _jumpRight * part / JumpSeconds;
                result.Up = _jumpUp * part / JumpSeconds;
                return result;
            }

            bool free = kind == ClimbSurfaceKind.Ladder || restPoint;
            if (_shake >= 0f)
            {
                _shake += dt;
                result.Shaking = true;
                if (_shake >= ShakeSeconds)
                {
                    result.Outcome = ClimbOutcome.Exhausted;
                }

                return result;
            }

            if (!free && stamina <= 0f)
            {
                // GDD 03 3.3: 1.0 s shaking as a warning, then the fall.
                _shake = 0f;
                result.Shaking = true;
                return result;
            }

            float x = kind == ClimbSurfaceKind.Ladder ? 0f : Clamp(moveX);
            float y = Clamp(moveY);
            float length = (float)Math.Sqrt(x * x + y * y);
            if (length > 1f)
            {
                x /= length;
                y /= length;
                length = 1f;
            }

            bool moving = length > 0.1f;
            if (jump && moving && kind != ClimbSurfaceKind.Ladder && (stamina >= JumpStamina || restPoint))
            {
                _jumpLeft = JumpSeconds;
                _jumpRight = x / length * JumpDistance;
                _jumpUp = y / length * JumpDistance;
                result.StaminaCost = restPoint ? 0f : JumpStamina;
                result.Jumped = true;
                return result;
            }

            float speedFactor = fast && kind != ClimbSurfaceKind.Ladder ? 1.5f : 1f;
            result.Right = x * SideSpeed(kind) * speedFactor * dt;
            result.Up = y * UpSpeed(kind) * speedFactor * dt;
            if (!free)
            {
                float rate = moving ? MoveStamina * (fast ? 2f : 1f) : HangStamina;
                result.StaminaCost = rate * dt;
            }

            return result;
        }

        private static float Clamp(float value)
        {
            return Math.Max(-1f, Math.Min(1f, value));
        }

        /// <summary>Result of one climbing step.</summary>
        public struct StepResult
        {
            /// <summary>What happens.</summary>
            public ClimbOutcome Outcome { get; set; }

            /// <summary>Metres along the wall to the right this step.</summary>
            public float Right { get; set; }

            /// <summary>Metres upwards this step.</summary>
            public float Up { get; set; }

            /// <summary>Stamina used this step.</summary>
            public float StaminaCost { get; set; }

            /// <summary>True when a climb jump started this step.</summary>
            public bool Jumped { get; set; }

            /// <summary>True while the hands shake.</summary>
            public bool Shaking { get; set; }
        }
    }
}
