using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// Chooses the interaction target "in front of the player" (pure logic): candidates within <c>range</c> whose direction
    /// deviates at most <c>halfAngle</c> from the facing, or that are very close (<see cref="CloseRange"/>, any direction).
    /// Higher priority wins; among equal priority the lowest cost <c>distance × (1 + angle / 90°)</c> wins, so a slightly
    /// farther object straight ahead beats a near one at the side.
    /// </summary>
    /// <remarks>
    /// Yaw convention like Unity and <c>Aetherfall.Player</c>: yaw 0 looks along +Z, positive yaw turns right. Range in
    /// metres (architecture 11.3: 2 m), angles in degrees. Allocation-free.
    /// </remarks>
    public static class InteractionSelector
    {
        /// <summary>Query radius of the interactor (architecture 11.3: OverlapSphere 2 m).</summary>
        public const float DefaultRange = 2f;

        /// <summary>Half opening angle of the "in front" cone (Vorschlag: 70°, i.e. a 140° cone).</summary>
        public const float DefaultHalfAngle = 70f;

        /// <summary>Within this distance an object counts regardless of the angle (standing on loot).</summary>
        public const float CloseRange = 0.8f;

        private const float RadToDeg = (float)(180.0 / Math.PI);
        private const float DegToRad = (float)(Math.PI / 180.0);

        /// <summary>Returns the index of the best candidate, or −1 if none qualifies.</summary>
        /// <param name="candidates">Candidates (only the first <paramref name="count"/> are read).</param>
        /// <param name="count">Number of valid entries.</param>
        /// <param name="originX">World X of the interactor.</param>
        /// <param name="originY">World Y of the interactor (feet).</param>
        /// <param name="originZ">World Z of the interactor.</param>
        /// <param name="facingYaw">Facing of the interactor in degrees.</param>
        /// <param name="range">Maximum distance (3D) in metres.</param>
        /// <param name="halfAngle">Maximum horizontal deviation from the facing in degrees.</param>
        public static int SelectBest(IReadOnlyList<InteractionCandidate> candidates, int count, float originX, float originY, float originZ,
            float facingYaw, float range, float halfAngle)
        {
            if (candidates == null)
            {
                return -1;
            }

            count = Math.Min(count, candidates.Count);
            float forwardX = (float)Math.Sin(facingYaw * DegToRad);
            float forwardZ = (float)Math.Cos(facingYaw * DegToRad);
            int best = -1;
            int bestPriority = int.MinValue;
            float bestCost = float.PositiveInfinity;
            for (int i = 0; i < count; i++)
            {
                InteractionCandidate candidate = candidates[i];
                if (!candidate.Available)
                {
                    continue;
                }

                float dx = candidate.X - originX;
                float dy = candidate.Y - originY;
                float dz = candidate.Z - originZ;
                float distance = (float)Math.Sqrt(dx * dx + dy * dy + dz * dz);
                if (distance > range)
                {
                    continue;
                }

                float angle = HorizontalAngle(dx, dz, forwardX, forwardZ);
                if (angle > halfAngle && distance > CloseRange)
                {
                    continue;
                }

                float cost = distance * (1f + angle / 90f);
                if (candidate.Priority > bestPriority || (candidate.Priority == bestPriority && cost < bestCost))
                {
                    best = i;
                    bestPriority = candidate.Priority;
                    bestCost = cost;
                }
            }

            return best;
        }

        /// <summary>Horizontal angle in degrees (0–180) between a direction and the forward vector; 0 for a zero direction.</summary>
        /// <param name="dx">Direction X.</param>
        /// <param name="dz">Direction Z.</param>
        /// <param name="forwardX">Normalized forward X.</param>
        /// <param name="forwardZ">Normalized forward Z.</param>
        public static float HorizontalAngle(float dx, float dz, float forwardX, float forwardZ)
        {
            float length = (float)Math.Sqrt(dx * dx + dz * dz);
            if (length < 1e-4f)
            {
                return 0f;
            }

            float dot = (dx * forwardX + dz * forwardZ) / length;
            dot = Math.Max(-1f, Math.Min(1f, dot));
            return (float)Math.Acos(dot) * RadToDeg;
        }
    }
}
