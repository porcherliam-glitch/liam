using Aetherfall.Combat;

namespace Aetherfall.AI
{
    /// <summary>
    /// One attack of an enemy type for the attack choice (architecture 11.10 "EnemyBrainDefinition.attacks[]": range,
    /// angle, cooldown, weight; the wind-up of the attack is the telegraph, GDD 03 9.5). Plain data.
    /// </summary>
    public sealed class EnemyAttackOption
    {
        /// <summary>The attack (time line, hitbox, multipliers).</summary>
        public AttackSpec Attack { get; set; }

        /// <summary>Smallest distance to the target in metres.</summary>
        public float MinRange { get; set; }

        /// <summary>Largest distance to the target in metres.</summary>
        public float MaxRange { get; set; } = 2f;

        /// <summary>Largest angle between facing and target in degrees to start the attack.</summary>
        public float MaxAngle { get; set; } = 30f;

        /// <summary>Cooldown after the attack in seconds.</summary>
        public float Cooldown { get; set; } = 1.5f;

        /// <summary>Weight of the random choice.</summary>
        public float Weight { get; set; } = 1f;

        /// <summary>True if <paramref name="distance"/> lies in the range.</summary>
        /// <param name="distance">Distance to the target.</param>
        public bool InRange(float distance)
        {
            return distance >= MinRange && distance <= MaxRange;
        }
    }
}
