using Aetherfall.Events;
using Aetherfall.Stats;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Resistances of a defender per damage type (fractions: 0.25 = 25 % less damage, −0.5 = weakness, 50 % more) and
    /// immunities ("immun" is a separate trait, GDD 03 8.2 step 7). Immutable value type.
    /// </summary>
    public readonly struct ResistanceProfile
    {
        private readonly DamageTypeValues _values;
        private readonly int _immuneMask;

        private ResistanceProfile(DamageTypeValues values, int immuneMask)
        {
            _values = values;
            _immuneMask = immuneMask;
        }

        /// <summary>Resistance of one type (unclamped; the calculator clamps).</summary>
        /// <param name="type">Damage type.</param>
        public float Get(DamageType type)
        {
            return _values.Get(type);
        }

        /// <summary>True if the defender is immune to the type.</summary>
        /// <param name="type">Damage type.</param>
        public bool IsImmune(DamageType type)
        {
            return (_immuneMask & (1 << (int)type)) != 0;
        }

        /// <summary>Copy with the resistance of one type replaced.</summary>
        /// <param name="type">Damage type.</param>
        /// <param name="resistance">Fraction (may be negative).</param>
        public ResistanceProfile With(DamageType type, float resistance)
        {
            return new ResistanceProfile(_values.With(type, resistance), _immuneMask);
        }

        /// <summary>Copy that is immune (or no longer immune) to one type.</summary>
        /// <param name="type">Damage type.</param>
        /// <param name="immune">True = immune.</param>
        public ResistanceProfile WithImmunity(DamageType type, bool immune = true)
        {
            int bit = 1 << (int)type;
            return new ResistanceProfile(_values, immune ? _immuneMask | bit : _immuneMask & ~bit);
        }

        /// <summary>Reads the nine resistance stats (<see cref="StatId.ResistSlash"/> …) of a character.</summary>
        /// <param name="stats">Stats of the defender.</param>
        public static ResistanceProfile FromStats(IStatReader stats)
        {
            var profile = default(ResistanceProfile);
            for (int i = 0; i < DamageTypes.Count; i++)
            {
                var type = (DamageType)i;
                profile = profile.With(type, stats.Get(DamageTypes.ResistanceStat(type)));
            }

            return profile;
        }
    }
}
