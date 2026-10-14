using System;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Simple idle and "look at the player" logic of an NPC (pure logic, yaw in degrees like Unity: 0 = +Z, positive = right):
    /// in a conversation the NPC faces the partner, otherwise the player within the look radius; idle it looks in its home
    /// direction and glances aside every few seconds (random but fixed per NPC by the seed). Turning is limited to a speed.
    /// </summary>
    /// <remarks>TODO (schedule step): daily schedules, walking to activity anchors, animations (architecture 11.11).</remarks>
    public sealed class NpcLookModel
    {
        /// <summary>Default turn speed in degrees per second.</summary>
        public const float DefaultTurnSpeed = 180f;

        /// <summary>Default largest glance angle in degrees.</summary>
        public const float DefaultGlanceAngle = 25f;

        /// <summary>Seconds a glance lasts.</summary>
        public const float GlanceHoldSeconds = 1.5f;

        /// <summary>Smallest glance angle (smaller glances are not visible).</summary>
        public const float MinGlanceAngle = 8f;

        private const float RadToDeg = (float)(180.0 / Math.PI);

        private readonly float _turnSpeed;
        private readonly float _glanceAngle;
        private readonly float _glanceMin;
        private readonly float _glanceMax;
        private uint _random;
        private float _timer;
        private float _glanceOffset;
        private bool _glancing;

        /// <summary>Creates the model.</summary>
        /// <param name="homeYaw">Direction the NPC looks when idle.</param>
        /// <param name="seed">Seed of the glances (e.g. from the NPC id); 0 is replaced.</param>
        /// <param name="turnSpeed">Turn speed in degrees per second.</param>
        /// <param name="glanceAngle">Largest glance angle in degrees (0 = no glances).</param>
        /// <param name="glanceMinSeconds">Shortest pause between glances.</param>
        /// <param name="glanceMaxSeconds">Longest pause between glances.</param>
        public NpcLookModel(float homeYaw, uint seed, float turnSpeed = DefaultTurnSpeed, float glanceAngle = DefaultGlanceAngle,
            float glanceMinSeconds = 4f, float glanceMaxSeconds = 8f)
        {
            HomeYaw = homeYaw;
            Yaw = homeYaw;
            _random = seed == 0 ? 2463534242u : seed;
            _turnSpeed = Math.Max(1f, turnSpeed);
            _glanceAngle = Math.Max(0f, glanceAngle);
            _glanceMin = Math.Max(0.5f, glanceMinSeconds);
            _glanceMax = Math.Max(_glanceMin, glanceMaxSeconds);
            _timer = NextPause();
        }

        /// <summary>Current yaw in degrees.</summary>
        public float Yaw { get; private set; }

        /// <summary>Direction the NPC looks when idle.</summary>
        public float HomeYaw { get; set; }

        /// <summary>Current state.</summary>
        public NpcLookState State { get; private set; }

        /// <summary>True while the NPC glances aside.</summary>
        public bool IsGlancing => _glancing;

        /// <summary>Advances the model by one frame.</summary>
        /// <param name="deltaTime">Frame time in seconds.</param>
        /// <param name="talking">True during a conversation.</param>
        /// <param name="targetInRange">True if the player (or the partner) is within the look radius.</param>
        /// <param name="targetYaw">Yaw towards the player or partner.</param>
        /// <returns>The new yaw.</returns>
        public float Tick(float deltaTime, bool talking, bool targetInRange, float targetYaw)
        {
            float dt = float.IsNaN(deltaTime) || deltaTime < 0f ? 0f : deltaTime;
            float wanted;
            if (talking || targetInRange)
            {
                State = talking ? NpcLookState.Talking : NpcLookState.Watching;
                _glancing = false;
                _glanceOffset = 0f;
                _timer = NextPause();
                wanted = targetYaw;
            }
            else
            {
                State = NpcLookState.Idle;
                UpdateGlance(dt);
                wanted = HomeYaw + _glanceOffset;
            }

            Yaw = MoveTowardsAngle(Yaw, wanted, _turnSpeed * dt);
            return Yaw;
        }

        /// <summary>Yaw from one point to another on the ground (0 = +Z, positive = right).</summary>
        /// <param name="fromX">From X.</param>
        /// <param name="fromZ">From Z.</param>
        /// <param name="toX">To X.</param>
        /// <param name="toZ">To Z.</param>
        public static float YawTowards(float fromX, float fromZ, float toX, float toZ)
        {
            return (float)Math.Atan2(toX - fromX, toZ - fromZ) * RadToDeg;
        }

        /// <summary>Shortest signed angle from one yaw to another (-180 .. 180].</summary>
        /// <param name="from">From.</param>
        /// <param name="to">To.</param>
        public static float DeltaAngle(float from, float to)
        {
            float delta = (to - from) % 360f;
            if (delta <= -180f)
            {
                delta += 360f;
            }
            else if (delta > 180f)
            {
                delta -= 360f;
            }

            return delta;
        }

        /// <summary>Turns from one yaw towards another by at most <paramref name="maxDelta"/> degrees.</summary>
        /// <param name="current">Current yaw.</param>
        /// <param name="target">Target yaw.</param>
        /// <param name="maxDelta">Largest step.</param>
        public static float MoveTowardsAngle(float current, float target, float maxDelta)
        {
            float delta = DeltaAngle(current, target);
            if (Math.Abs(delta) <= maxDelta)
            {
                return current + delta;
            }

            return current + Math.Sign(delta) * maxDelta;
        }

        private void UpdateGlance(float dt)
        {
            if (_glanceAngle <= 0f)
            {
                return;
            }

            _timer -= dt;
            if (_timer > 0f)
            {
                return;
            }

            if (_glancing)
            {
                _glancing = false;
                _glanceOffset = 0f;
                _timer = NextPause();
                return;
            }

            _glancing = true;
            float size = MinGlanceAngle + NextFloat() * Math.Max(0f, _glanceAngle - MinGlanceAngle);
            _glanceOffset = NextFloat() < 0.5f ? -size : size;
            _timer = GlanceHoldSeconds;
        }

        private float NextPause()
        {
            return _glanceMin + NextFloat() * (_glanceMax - _glanceMin);
        }

        private float NextFloat()
        {
            // xorshift32: small, deterministic, no allocation.
            uint x = _random;
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            _random = x;
            return (x >> 8) / 16777216f;
        }
    }
}
