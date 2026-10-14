using System;
using System.Collections.Generic;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Phases of a boss by health thresholds (GDD 03 9.6 "Phasenwechsel bei LP-Schwellen"; GDD 02 11.7: phase 1 100–50 %,
    /// phase 2 below 50 %). Thresholds are the health fractions at which a phase starts, e.g. <c>[1.0, 0.5]</c>. Phases only go
    /// up; a big hit can skip a phase (the tracker then reports the highest reached phase once). Pure logic.
    /// </summary>
    public sealed class BossPhaseTracker
    {
        private readonly float[] _thresholds;

        /// <summary>Creates the tracker.</summary>
        /// <param name="thresholds">Start fraction of each phase, phase 1 first (descending, the first one is 1).</param>
        /// <exception cref="ArgumentException">Empty, not descending or outside 0..1.</exception>
        public BossPhaseTracker(IReadOnlyList<float> thresholds)
        {
            string problem = Validate(thresholds);
            if (problem.Length > 0)
            {
                throw new ArgumentException(problem, nameof(thresholds));
            }

            _thresholds = new float[thresholds.Count];
            for (int i = 0; i < thresholds.Count; i++)
            {
                _thresholds[i] = thresholds[i];
            }

            Phase = 1;
        }

        /// <summary>Current phase (1-based).</summary>
        public int Phase { get; private set; }

        /// <summary>Number of phases.</summary>
        public int PhaseCount => _thresholds.Length;

        /// <summary>Start fraction of a phase.</summary>
        /// <param name="phase">Phase (1-based).</param>
        public float ThresholdOf(int phase)
        {
            return _thresholds[Math.Max(1, Math.Min(phase, _thresholds.Length)) - 1];
        }

        /// <summary>The phase that belongs to a health fraction (ignores the current phase).</summary>
        /// <param name="healthFraction">Health from 0 to 1.</param>
        public int PhaseFor(float healthFraction)
        {
            int phase = 1;
            for (int i = 1; i < _thresholds.Length; i++)
            {
                if (healthFraction < _thresholds[i])
                {
                    phase = i + 1;
                }
            }

            return phase;
        }

        /// <summary>Advances the phase if the health fell below a later threshold.</summary>
        /// <param name="healthFraction">Health from 0 to 1.</param>
        /// <param name="newPhase">The new phase.</param>
        /// <returns>True if the phase went up.</returns>
        public bool TryAdvance(float healthFraction, out int newPhase)
        {
            int target = PhaseFor(healthFraction);
            if (target > Phase)
            {
                Phase = target;
                newPhase = target;
                return true;
            }

            newPhase = Phase;
            return false;
        }

        /// <summary>Back to phase 1 (reset after the player died).</summary>
        public void Reset()
        {
            Phase = 1;
        }

        /// <summary>Checks a threshold list.</summary>
        /// <param name="thresholds">Thresholds.</param>
        /// <returns>Empty if valid, otherwise an English problem text.</returns>
        public static string Validate(IReadOnlyList<float> thresholds)
        {
            if (thresholds == null || thresholds.Count == 0)
            {
                return "At least one phase threshold is required.";
            }

            if (!(Math.Abs(thresholds[0] - 1f) < 0.0001f))
            {
                return "The first phase must start at 1.0 (full health).";
            }

            for (int i = 1; i < thresholds.Count; i++)
            {
                if (!(thresholds[i] > 0f && thresholds[i] < thresholds[i - 1]))
                {
                    return "Phase thresholds must be descending and greater than 0.";
                }
            }

            return string.Empty;
        }
    }
}
