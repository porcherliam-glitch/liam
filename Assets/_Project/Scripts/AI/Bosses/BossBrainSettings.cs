using System;
using System.Collections.Generic;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Values of a <see cref="BossBrain"/> (created from a <see cref="BossDefinition"/>; tests build them directly). Defaults
    /// follow GDD 02 11.7 and GDD 03 9.6 for "Der Wachende Ritter".
    /// </summary>
    public sealed class BossBrainSettings
    {
        /// <summary>Attacks of all phases.</summary>
        public BossAttackOption[] Attacks { get; set; } = new BossAttackOption[0];

        /// <summary>Start fraction of each phase (phase 1 first), e.g. 1.0 and 0.5.</summary>
        public float[] PhaseThresholds { get; set; } = { 1f, 0.5f };

        /// <summary>Adds summoned when a phase starts; index 0 = phase 1 (GDD 02 11.7: phase 2 calls 2 skeleton warriors).</summary>
        public int[] AddsPerPhase { get; set; } = { 0, 2 };

        /// <summary>Seconds to rise when the encounter starts (invulnerable).</summary>
        public float AwakenSeconds { get; set; } = 1.5f;

        /// <summary>Seconds of a phase change (GDD 03 9.6: at most 3 s, invulnerable).</summary>
        public float TransitionSeconds { get; set; } = 2.5f;

        /// <summary>Open guard after a parried shield bash.</summary>
        public float ParryOpenSeconds { get; set; } = 1.5f;

        /// <summary>Stun of the Aether beam (GDD 02 11.7: 5 s).</summary>
        public float BeamStunSeconds { get; set; } = 5f;

        /// <summary>Seconds after a beam stun before the beam can stun again.</summary>
        public float BeamCooldownSeconds { get; set; } = 8f;

        /// <summary>First phase in which the beam stuns.</summary>
        public int BeamFromPhase { get; set; } = 2;

        /// <summary>Pause after an attack before the next one (guard up).</summary>
        public float RecoverSeconds { get; set; } = 0.8f;

        /// <summary>Walking speed (m/s).</summary>
        public float WalkSpeed { get; set; } = 1.6f;

        /// <summary>Running speed when the target is far (m/s).</summary>
        public float RunSpeed { get; set; } = 3.6f;

        /// <summary>From this distance the boss runs instead of walking.</summary>
        public float RunDistance { get; set; } = 8f;

        /// <summary>Adds summoned when a phase starts.</summary>
        /// <param name="phase">Phase (1-based).</param>
        public int AddsFor(int phase)
        {
            int index = phase - 1;
            return AddsPerPhase != null && index >= 0 && index < AddsPerPhase.Length ? Math.Max(0, AddsPerPhase[index]) : 0;
        }

        /// <summary>Checks the values.</summary>
        /// <returns>Empty if valid, otherwise an English problem text.</returns>
        public string Validate()
        {
            string phases = BossPhaseTracker.Validate(PhaseThresholds);
            if (phases.Length > 0)
            {
                return phases;
            }

            if (Attacks == null || Attacks.Length == 0)
            {
                return "A boss needs at least one attack.";
            }

            var usable = new List<int>();
            for (int i = 0; i < Attacks.Length; i++)
            {
                BossAttackOption attack = Attacks[i];
                if (attack == null || attack.Option == null || attack.Option.Attack == null)
                {
                    return "Boss attack " + i + " is empty.";
                }

                string problem = attack.Option.Attack.Validate();
                if (problem.Length > 0)
                {
                    return problem;
                }

                if (attack.MinPhase <= 1)
                {
                    usable.Add(i);
                }
            }

            if (usable.Count == 0)
            {
                return "No boss attack is available in phase 1.";
            }

            if (!(AwakenSeconds >= 0f && TransitionSeconds >= 0f && TransitionSeconds <= 3f && ParryOpenSeconds > 0f && BeamStunSeconds > 0f &&
                  BeamCooldownSeconds >= 0f && RecoverSeconds >= 0f))
            {
                return "Boss timings must be 0 or more (phase change at most 3 s, GDD 03 9.6).";
            }

            if (!(WalkSpeed > 0f && RunSpeed >= WalkSpeed))
            {
                return "Boss speeds must be greater than 0 (run at least as fast as walk).";
            }

            return string.Empty;
        }
    }
}
