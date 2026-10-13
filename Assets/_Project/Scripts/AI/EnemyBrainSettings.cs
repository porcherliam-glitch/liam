using System;

namespace Aetherfall.AI
{
    /// <summary>
    /// Behaviour values of an enemy type for the <see cref="EnemyBrain"/> (GDD 03 9.1–9.4; built from
    /// <c>EnemyTypeDefinition</c>, or in tests). Times in seconds, distances in metres, speeds in m/s.
    /// </summary>
    public sealed class EnemyBrainSettings
    {
        /// <summary>Senses (GDD 03 9.2).</summary>
        public PerceptionSettings Perception { get; set; } = PerceptionSettings.Default;

        /// <summary>Patrol and search speed.</summary>
        public float WalkSpeed { get; set; } = 1.8f;

        /// <summary>Approach, return and flee speed.</summary>
        public float RunSpeed { get; set; } = 6f;

        /// <summary>Speed while circling or backing off.</summary>
        public float CircleSpeed { get; set; } = 2.5f;

        /// <summary>Inner radius of the waiting ring (GDD 03 9.3: 4–7 m without token).</summary>
        public float RingMin { get; set; } = 4f;

        /// <summary>Outer radius of the waiting ring.</summary>
        public float RingMax { get; set; } = 7f;

        /// <summary>Duration of "suspicious" without a new stimulus (GDD 03 9.1: 3 s).</summary>
        public float SuspiciousSeconds { get; set; } = 3f;

        /// <summary>Duration of "search" (GDD 03 9.1: 20 s).</summary>
        public float SearchSeconds { get; set; } = 20f;

        /// <summary>Search radius around the last known position (GDD 03 9.1: 12 m).</summary>
        public float SearchRadius { get; set; } = 12f;

        /// <summary>Combat turns into search after this long without sight (GDD 03 9.1: 5 s).</summary>
        public float LoseSightSeconds { get; set; } = 5f;

        /// <summary>Leash: return when further than this from the anchor (GDD 03 9.4: 40 m).</summary>
        public float LeashDistance { get; set; } = 40f;

        /// <summary>Leash: return after this long without reaching the target (GDD 03 9.4: 8 s).</summary>
        public float UnreachableSeconds { get; set; } = 8f;

        /// <summary>Health regeneration while returning, share of the maximum per second (GDD 03 9.4: 10 %).</summary>
        public float ReturnRegenPerSecond { get; set; } = 0.1f;

        /// <summary>No reaction to stimuli at the start of the return (GDD 03 9.4: 3 s).</summary>
        public float ReturnIgnoreSeconds { get; set; } = 3f;

        /// <summary>Flee below this health share (GDD 03 9.4: animals 25 %); 0 = never.</summary>
        public float FleeHealthFraction { get; set; }

        /// <summary>Duration of the flight before it decides again.</summary>
        public float FleeSeconds { get; set; } = 3f;

        /// <summary>Back-off time after an attack (recovery space, GDD 03 9.5).</summary>
        public float RetreatSeconds { get; set; } = 0.8f;

        /// <summary>Interval of the attack decision while circling.</summary>
        public float DecisionInterval { get; set; } = 0.4f;

        /// <summary>Gives the token back if it cannot start the attack within this time.</summary>
        public float EngageTimeout { get; set; } = 3f;

        /// <summary>Token cost (GDD 03 9.3: swarm and normal 1, elite 2, champion 3).</summary>
        public int TokenCost { get; set; } = 1;

        /// <summary>Token budget used (melee or ranged).</summary>
        public TokenKind TokenKind { get; set; } = TokenKind.Melee;

        /// <summary>Starts (and returns to) guarding instead of patrolling.</summary>
        public bool Guard { get; set; }

        /// <summary>A waypoint counts as reached within this distance.</summary>
        public float ArrivalDistance { get; set; } = 0.8f;

        /// <summary>Attacks of the type (3–4 for normal enemies, GDD 03 9.5).</summary>
        public EnemyAttackOption[] Attacks { get; set; } = Array.Empty<EnemyAttackOption>();

        /// <summary>Returns an error text if a value is out of range, otherwise an empty string.</summary>
        public string Validate()
        {
            if (!(WalkSpeed > 0f && RunSpeed > 0f && CircleSpeed > 0f))
            {
                return "Speeds must be greater than 0.";
            }

            if (!(RingMin > 0f && RingMax >= RingMin))
            {
                return "Ring distances must satisfy 0 < min <= max.";
            }

            if (Attacks == null || Attacks.Length == 0)
            {
                return "At least one attack is required.";
            }

            for (int i = 0; i < Attacks.Length; i++)
            {
                if (Attacks[i] == null || Attacks[i].Attack == null)
                {
                    return "Attack " + (i + 1) + " is missing.";
                }

                if (!(Attacks[i].MaxRange >= Attacks[i].MinRange))
                {
                    return "Attack " + (i + 1) + ": max range must be at least the min range.";
                }
            }

            return string.Empty;
        }
    }
}
