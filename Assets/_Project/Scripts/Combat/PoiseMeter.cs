using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Poise of an enemy (or training dummy) as pure logic (§9.2 "Haltungsbalken", GDD 03 4.9): poise damage builds up; when
    /// the build-up reaches the maximum the poise breaks and the target is stunned (open for a finisher, 4.10). After the
    /// stun the poise is full again (build-up 0). Without poise damage the build-up falls after a delay.
    /// </summary>
    /// <remarks>
    /// Maximum: <c>H_Typ × V × (1 + 0.025 × (Level − 1))</c> (see <c>EnemyScaling</c> in Aetherfall.AI). Allocation-free.
    /// </remarks>
    public sealed class PoiseMeter
    {
        private readonly float _baseMax;
        private readonly PoiseSettings _settings;
        private float _growth;
        private float _timeSinceDamage = float.PositiveInfinity;

        /// <summary>Creates a full poise meter (build-up 0).</summary>
        /// <param name="max">Maximum poise (greater than 0).</param>
        /// <param name="settings">Rules (<see cref="PoiseSettings.Normal"/> …).</param>
        public PoiseMeter(float max, in PoiseSettings settings)
        {
            if (!(max > 0f))
            {
                throw new ArgumentOutOfRangeException(nameof(max), max, "Maximum poise must be greater than 0.");
            }

            _baseMax = max;
            _settings = settings;
        }

        /// <summary>Current maximum (bosses grow per break).</summary>
        public float Max => _baseMax * (1f + _growth);

        /// <summary>Poise damage built up so far (0 = full poise).</summary>
        public float Buildup { get; private set; }

        /// <summary>Build-up relative to the maximum, 0–1.</summary>
        public float BuildupNormalized => Math.Min(1f, Buildup / Max);

        /// <summary>True while stunned after a break.</summary>
        public bool IsStunned => StunRemaining > 0f;

        /// <summary>Seconds of stun left.</summary>
        public float StunRemaining { get; private set; }

        /// <summary>True if the current stun came from a poise break (finisher allowed), false for other stuns.</summary>
        public bool StunAllowsFinisher { get; private set; }

        /// <summary>Number of breaks so far.</summary>
        public int BreakCount { get; private set; }

        /// <summary>The rules in use.</summary>
        public PoiseSettings Settings => _settings;

        /// <summary>Adds poise damage. While stunned nothing more builds up.</summary>
        /// <param name="amount">Poise damage (0 or less does nothing).</param>
        /// <returns>What the hit did.</returns>
        public PoiseOutcome ApplyDamage(float amount)
        {
            if (!(amount > 0f) || IsStunned)
            {
                return PoiseOutcome.None;
            }

            _timeSinceDamage = 0f;
            Buildup += amount;
            if (Buildup >= Max)
            {
                Break();
                return PoiseOutcome.Broken;
            }

            return amount >= Max * _settings.FlinchThresholdFraction ? PoiseOutcome.Flinch : PoiseOutcome.None;
        }

        /// <summary>
        /// Perfect parry against this target (GDD 03 4.8): loses <paramref name="fractionOfMax"/> of its poise (Normal 0.35).
        /// </summary>
        /// <param name="fractionOfMax">Share of the maximum.</param>
        /// <returns>What the parry did (a break leads directly to the finisher).</returns>
        public PoiseOutcome ApplyParry(float fractionOfMax)
        {
            return ApplyDamage(Math.Max(0f, fractionOfMax) * Max);
        }

        /// <summary>Stuns without a break (e.g. the crystal core of an Aether-corrupted enemy, GDD 01 11.2).</summary>
        /// <param name="seconds">Duration.</param>
        /// <param name="allowsFinisher">True if a finisher is allowed during this stun.</param>
        public void Stun(float seconds, bool allowsFinisher)
        {
            if (seconds > StunRemaining)
            {
                StunRemaining = seconds;
                StunAllowsFinisher = allowsFinisher;
            }
        }

        /// <summary>Ends the stun at once (e.g. the finisher killed or released the target).</summary>
        public void EndStun()
        {
            if (IsStunned)
            {
                StunRemaining = 0f;
                Buildup = 0f;
                StunAllowsFinisher = false;
            }
        }

        /// <summary>Advances stun and regeneration.</summary>
        /// <param name="deltaTime">Local combat time in seconds.</param>
        public void Tick(float deltaTime)
        {
            if (!(deltaTime > 0f))
            {
                return;
            }

            if (StunRemaining > 0f)
            {
                StunRemaining = Math.Max(0f, StunRemaining - deltaTime);
                if (StunRemaining <= 0f)
                {
                    // GDD 03 4.9: "Nach dem Bruch: Haltung voll".
                    Buildup = 0f;
                    StunAllowsFinisher = false;
                }

                return;
            }

            _timeSinceDamage += deltaTime;
            float active = Math.Min(deltaTime, _timeSinceDamage - _settings.RegenDelay);
            if (active > 0f && Buildup > 0f)
            {
                Buildup = Math.Max(0f, Buildup - Max * _settings.RegenFractionPerSecond * active);
            }
        }

        /// <summary>Full poise, no stun, no growth (respawn).</summary>
        public void Reset()
        {
            Buildup = 0f;
            StunRemaining = 0f;
            StunAllowsFinisher = false;
            BreakCount = 0;
            _growth = 0f;
            _timeSinceDamage = float.PositiveInfinity;
        }

        private void Break()
        {
            Buildup = Max;
            BreakCount++;
            StunRemaining = _settings.BreakStunSeconds;
            StunAllowsFinisher = true;
            if (_settings.MaxGrowthPerBreak > 0f)
            {
                _growth = Math.Min(_settings.MaxGrowthCap, _growth + _settings.MaxGrowthPerBreak);
            }
        }
    }
}
