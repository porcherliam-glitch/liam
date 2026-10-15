namespace Aetherfall.Combat
{
    /// <summary>
    /// Status build-up of one hit per effect (GDD 03 7.1: every source carries a status value, e.g. fire arrow 35 burning).
    /// The damage calculation passes it through (zero on a perfect parry, scaled by the difficulty factor when the player
    /// is hit); thresholds, resistances and environment factors ("Nass" × 0.5 …) belong to the status effect controller.
    /// </summary>
    public readonly struct StatusBuildup
    {
        private readonly float _burning;
        private readonly float _freezing;
        private readonly float _shock;
        private readonly float _poison;
        private readonly float _bleeding;
        private readonly float _stun;
        private readonly float _curse;
        private readonly float _aetherCorruption;

        private StatusBuildup(float burning, float freezing, float shock, float poison, float bleeding, float stun, float curse, float aetherCorruption)
        {
            _burning = burning;
            _freezing = freezing;
            _shock = shock;
            _poison = poison;
            _bleeding = bleeding;
            _stun = stun;
            _curse = curse;
            _aetherCorruption = aetherCorruption;
        }

        /// <summary>No build-up.</summary>
        public static StatusBuildup None => default;

        /// <summary>Build-up of one effect.</summary>
        /// <param name="effect">Effect.</param>
        public float Get(StatusEffectId effect)
        {
            switch (effect)
            {
                case StatusEffectId.Burning: return _burning;
                case StatusEffectId.Freezing: return _freezing;
                case StatusEffectId.Shock: return _shock;
                case StatusEffectId.Poison: return _poison;
                case StatusEffectId.Bleeding: return _bleeding;
                case StatusEffectId.Stun: return _stun;
                case StatusEffectId.Curse: return _curse;
                case StatusEffectId.AetherCorruption: return _aetherCorruption;
                default: return 0f;
            }
        }

        /// <summary>Copy with the build-up of one effect replaced.</summary>
        /// <param name="effect">Effect.</param>
        /// <param name="amount">Build-up (negative values count as 0).</param>
        public StatusBuildup With(StatusEffectId effect, float amount)
        {
            float value = amount > 0f ? amount : 0f;
            return new StatusBuildup(
                effect == StatusEffectId.Burning ? value : _burning,
                effect == StatusEffectId.Freezing ? value : _freezing,
                effect == StatusEffectId.Shock ? value : _shock,
                effect == StatusEffectId.Poison ? value : _poison,
                effect == StatusEffectId.Bleeding ? value : _bleeding,
                effect == StatusEffectId.Stun ? value : _stun,
                effect == StatusEffectId.Curse ? value : _curse,
                effect == StatusEffectId.AetherCorruption ? value : _aetherCorruption);
        }

        /// <summary>Copy with every effect multiplied by <paramref name="factor"/>.</summary>
        /// <param name="factor">Factor (negative values count as 0).</param>
        public StatusBuildup Scaled(float factor)
        {
            float f = factor > 0f ? factor : 0f;
            return new StatusBuildup(_burning * f, _freezing * f, _shock * f, _poison * f, _bleeding * f, _stun * f, _curse * f, _aetherCorruption * f);
        }

        /// <summary>Sum of both build-ups per effect.</summary>
        /// <param name="other">Other build-up.</param>
        public StatusBuildup Plus(in StatusBuildup other)
        {
            return new StatusBuildup(_burning + other._burning, _freezing + other._freezing, _shock + other._shock, _poison + other._poison,
                _bleeding + other._bleeding, _stun + other._stun, _curse + other._curse, _aetherCorruption + other._aetherCorruption);
        }

        /// <summary>True if no effect builds up.</summary>
        public bool IsEmpty => !(_burning + _freezing + _shock + _poison + _bleeding + _stun + _curse + _aetherCorruption > 0f);
    }
}
