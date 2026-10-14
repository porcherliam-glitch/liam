using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Flight of one projectile (staff bolt, arrow; GDD 03 6.1, 6.3): straight or with gravity, until the range is used up.
    /// Only maths on vectors (no scene access), so the flight is tested without physics; <see cref="Projectile"/> sweeps the
    /// segment of each step for hits.
    /// </summary>
    public sealed class ProjectileFlight
    {
        /// <summary>Starts a flight.</summary>
        /// <param name="origin">Start point.</param>
        /// <param name="direction">Direction (normalised here).</param>
        /// <param name="speed">Speed in m/s.</param>
        /// <param name="gravity">Downward acceleration in m/s² (0 = straight).</param>
        /// <param name="range">Range in metres (path length).</param>
        public ProjectileFlight(Vector3 origin, Vector3 direction, float speed, float gravity, float range)
        {
            Position = origin;
            Velocity = (direction.sqrMagnitude > 1e-8f ? direction.normalized : Vector3.forward) * Mathf.Max(0f, speed);
            Gravity = Mathf.Max(0f, gravity);
            Range = Mathf.Max(0f, range);
        }

        /// <summary>Current position.</summary>
        public Vector3 Position { get; private set; }

        /// <summary>Current velocity.</summary>
        public Vector3 Velocity { get; private set; }

        /// <summary>Downward acceleration in m/s².</summary>
        public float Gravity { get; }

        /// <summary>Range in metres.</summary>
        public float Range { get; }

        /// <summary>Path length flown so far.</summary>
        public float Travelled { get; private set; }

        /// <summary>True once the range is used up.</summary>
        public bool Expired => Travelled >= Range;

        /// <summary>Moves on by one step and returns the segment flown (for the sweep).</summary>
        /// <param name="deltaTime">Seconds.</param>
        /// <param name="from">Position before the step.</param>
        /// <returns>Position after the step (the last step ends exactly at the range).</returns>
        public Vector3 Step(float deltaTime, out Vector3 from)
        {
            from = Position;
            float dt = Mathf.Max(0f, deltaTime);
            Vector3 velocity = Velocity + Vector3.down * (Gravity * dt);
            Vector3 to = from + (Velocity + velocity) * (0.5f * dt);
            float length = Vector3.Distance(from, to);
            float left = Range - Travelled;
            if (length > left && length > 1e-6f)
            {
                to = from + (to - from) * (left / length);
                length = left;
            }

            Travelled += length;
            Velocity = velocity;
            Position = to;
            return to;
        }

        /// <summary>
        /// Aim direction from a launch point to a target point: straight for flat flights; with gravity the direction is tilted up
        /// by the drop over the flight time, so the projectile arrives at about the aimed height.
        /// </summary>
        /// <param name="origin">Launch point.</param>
        /// <param name="target">Aimed point.</param>
        /// <param name="speed">Speed in m/s.</param>
        /// <param name="gravity">Downward acceleration in m/s².</param>
        public static Vector3 AimDirection(Vector3 origin, Vector3 target, float speed, float gravity)
        {
            Vector3 toTarget = target - origin;
            if (gravity > 0f && speed > 0f)
            {
                float time = toTarget.magnitude / speed;
                toTarget.y += 0.5f * gravity * time * time;
            }

            return toTarget.sqrMagnitude > 1e-8f ? toTarget.normalized : Vector3.forward;
        }
    }
}
