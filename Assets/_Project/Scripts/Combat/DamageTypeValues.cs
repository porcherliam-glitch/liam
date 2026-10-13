using Aetherfall.Events;

namespace Aetherfall.Combat
{
    /// <summary>One float per <see cref="DamageType"/> (immutable, any sign). Storage of packets and resistance profiles.</summary>
    public readonly struct DamageTypeValues
    {
        private readonly float _slash;
        private readonly float _stab;
        private readonly float _blunt;
        private readonly float _fire;
        private readonly float _ice;
        private readonly float _lightning;
        private readonly float _poison;
        private readonly float _shadow;
        private readonly float _aether;

        private DamageTypeValues(float slash, float stab, float blunt, float fire, float ice, float lightning, float poison, float shadow, float aether)
        {
            _slash = slash;
            _stab = stab;
            _blunt = blunt;
            _fire = fire;
            _ice = ice;
            _lightning = lightning;
            _poison = poison;
            _shadow = shadow;
            _aether = aether;
        }

        /// <summary>Value of one type.</summary>
        /// <param name="type">Damage type.</param>
        public float Get(DamageType type)
        {
            switch (type)
            {
                case DamageType.Slash: return _slash;
                case DamageType.Stab: return _stab;
                case DamageType.Blunt: return _blunt;
                case DamageType.Fire: return _fire;
                case DamageType.Ice: return _ice;
                case DamageType.Lightning: return _lightning;
                case DamageType.Poison: return _poison;
                case DamageType.Shadow: return _shadow;
                case DamageType.Aether: return _aether;
                default: return 0f;
            }
        }

        /// <summary>Copy with the value of one type replaced.</summary>
        /// <param name="type">Damage type.</param>
        /// <param name="value">New value.</param>
        public DamageTypeValues With(DamageType type, float value)
        {
            return new DamageTypeValues(
                type == DamageType.Slash ? value : _slash,
                type == DamageType.Stab ? value : _stab,
                type == DamageType.Blunt ? value : _blunt,
                type == DamageType.Fire ? value : _fire,
                type == DamageType.Ice ? value : _ice,
                type == DamageType.Lightning ? value : _lightning,
                type == DamageType.Poison ? value : _poison,
                type == DamageType.Shadow ? value : _shadow,
                type == DamageType.Aether ? value : _aether);
        }

        /// <summary>Copy with every value multiplied by <paramref name="factor"/>.</summary>
        /// <param name="factor">Factor.</param>
        public DamageTypeValues Scaled(float factor)
        {
            return new DamageTypeValues(_slash * factor, _stab * factor, _blunt * factor, _fire * factor, _ice * factor,
                _lightning * factor, _poison * factor, _shadow * factor, _aether * factor);
        }

        /// <summary>Sum of all values.</summary>
        public float Sum => _slash + _stab + _blunt + _fire + _ice + _lightning + _poison + _shadow + _aether;
    }
}
