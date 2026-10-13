using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Hit feel values of GDD 03 4.11 (hitstop in seconds, camera shake amplitude in impulse units ≈ metres and duration)
    /// and the rule which row a hit belongs to. Pure data and logic; attack assets may override hitstop and shake.
    /// </summary>
    public sealed class HitFeedbackTable
    {
        private readonly float[] _hitStop = new float[12];
        private readonly float[] _shakeAmplitude = new float[12];
        private readonly float[] _shakeDuration = new float[12];

        /// <summary>Creates the table with the values of GDD 03 4.11.</summary>
        public HitFeedbackTable()
        {
            Set(HitFeedbackKind.LightHit, 0.06f, 0f, 0f);
            Set(HitFeedbackKind.ComboFinisher, 0.08f, 0.02f, 0.12f);
            Set(HitFeedbackKind.HeavyHit, 0.09f, 0.04f, 0.18f);
            Set(HitFeedbackKind.CriticalHit, 0.11f, 0.06f, 0.22f);
            Set(HitFeedbackKind.PerfectParry, 0.12f, 0.03f, 0.10f);
            Set(HitFeedbackKind.PoiseBreak, 0.12f, 0.07f, 0.25f);
            Set(HitFeedbackKind.Finisher, 0f, 0.05f, 0.2f);
            Set(HitFeedbackKind.Blocked, 0.05f, 0.02f, 0.1f);
            Set(HitFeedbackKind.GuardBreak, 0.10f, 0.06f, 0.2f);
            Set(HitFeedbackKind.PlayerHitLight, 0.04f, 0.03f, 0.12f);
            Set(HitFeedbackKind.PlayerHitHeavy, 0.07f, 0.08f, 0.30f);
        }

        /// <summary>Replaces the values of one row.</summary>
        /// <param name="kind">Row.</param>
        /// <param name="hitStopSeconds">Hitstop.</param>
        /// <param name="shakeAmplitude">Shake amplitude.</param>
        /// <param name="shakeDuration">Shake duration.</param>
        public void Set(HitFeedbackKind kind, float hitStopSeconds, float shakeAmplitude, float shakeDuration)
        {
            int index = (int)kind;
            if (index <= 0 || index >= _hitStop.Length)
            {
                return;
            }

            _hitStop[index] = Math.Max(0f, hitStopSeconds);
            _shakeAmplitude[index] = Math.Max(0f, shakeAmplitude);
            _shakeDuration[index] = Math.Max(0f, shakeDuration);
        }

        /// <summary>Hitstop of a row in seconds.</summary>
        /// <param name="kind">Row.</param>
        public float HitStopOf(HitFeedbackKind kind)
        {
            int index = (int)kind;
            return index > 0 && index < _hitStop.Length ? _hitStop[index] : 0f;
        }

        /// <summary>Shake amplitude of a row.</summary>
        /// <param name="kind">Row.</param>
        public float ShakeAmplitudeOf(HitFeedbackKind kind)
        {
            int index = (int)kind;
            return index > 0 && index < _shakeAmplitude.Length ? _shakeAmplitude[index] : 0f;
        }

        /// <summary>Shake duration of a row in seconds.</summary>
        /// <param name="kind">Row.</param>
        public float ShakeDurationOf(HitFeedbackKind kind)
        {
            int index = (int)kind;
            return index > 0 && index < _shakeDuration.Length ? _shakeDuration[index] : 0f;
        }

        /// <summary>
        /// Row of a hit: defense first (evaded, parried, blocked, guard break), then poise break, then player hits, then
        /// the attack kind (critical and charged II above heavy above combo finisher above light).
        /// </summary>
        /// <param name="attack">The attack (kind, charge level).</param>
        /// <param name="defense">How the defender met the hit.</param>
        /// <param name="critical">The hit was critical.</param>
        /// <param name="poiseBroken">The hit broke the target's poise.</param>
        /// <param name="guardBroken">The blocked hit broke the guard.</param>
        /// <param name="targetIsPlayer">The target is the player.</param>
        /// <param name="heavyOnPlayer">For hits on the player: staggered or knocked down (heavy reaction).</param>
        public static HitFeedbackKind Classify(AttackSpec attack, DefenseOutcome defense, bool critical, bool poiseBroken, bool guardBroken,
            bool targetIsPlayer, bool heavyOnPlayer)
        {
            switch (defense)
            {
                case DefenseOutcome.Evaded:
                case DefenseOutcome.Ignored:
                    return HitFeedbackKind.None;
                case DefenseOutcome.Parried:
                    return HitFeedbackKind.PerfectParry;
                case DefenseOutcome.Blocked:
                    return guardBroken ? HitFeedbackKind.GuardBreak : HitFeedbackKind.Blocked;
            }

            if (poiseBroken)
            {
                return HitFeedbackKind.PoiseBreak;
            }

            if (targetIsPlayer)
            {
                return heavyOnPlayer ? HitFeedbackKind.PlayerHitHeavy : HitFeedbackKind.PlayerHitLight;
            }

            if (attack == null)
            {
                return HitFeedbackKind.LightHit;
            }

            if (attack.Kind == AttackKind.Finisher)
            {
                return HitFeedbackKind.Finisher;
            }

            if (critical || attack.ChargeLevel >= 2)
            {
                return HitFeedbackKind.CriticalHit;
            }

            switch (attack.Kind)
            {
                case AttackKind.Heavy:
                case AttackKind.Counter:
                    return HitFeedbackKind.HeavyHit;
                case AttackKind.ComboFinisher:
                case AttackKind.Sprint:
                case AttackKind.Jump:
                    return HitFeedbackKind.ComboFinisher;
                default:
                    return HitFeedbackKind.LightHit;
            }
        }
    }
}
