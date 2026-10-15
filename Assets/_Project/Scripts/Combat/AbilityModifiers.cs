using System;
using System.Collections.Generic;
using Aetherfall.Events;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Everything the skill tree changes on the abilities of a character (GDD 03 11.3–11.5): damage per element and for all
    /// abilities, status build-up per element and upgrades per ability. The ability caster applies it. Pure C#.
    /// </summary>
    public sealed class AbilityModifiers
    {
        private const int ElementCount = 9;
        private readonly float[] _elementDamage = new float[ElementCount];
        private readonly float[] _elementBuildup = new float[ElementCount];
        private readonly Dictionary<string, AbilityUpgrade> _upgrades = new Dictionary<string, AbilityUpgrade>(StringComparer.Ordinal);

        /// <summary>Damage bonus of every ability (0.05 = +5 %).</summary>
        public float AllDamage { get; set; }

        /// <summary>Upgrades by ability id.</summary>
        public IReadOnlyDictionary<string, AbilityUpgrade> Upgrades => _upgrades;

        /// <summary>Damage bonus of the abilities of one element (0.06 = +6 %).</summary>
        /// <param name="element">Element.</param>
        public float ElementDamage(DamageType element)
        {
            int index = (int)element;
            return index >= 0 && index < ElementCount ? _elementDamage[index] : 0f;
        }

        /// <summary>Build-up bonus of the abilities of one element (0.25 = +25 %).</summary>
        /// <param name="element">Element.</param>
        public float ElementBuildup(DamageType element)
        {
            int index = (int)element;
            return index >= 0 && index < ElementCount ? _elementBuildup[index] : 0f;
        }

        /// <summary>Damage factor of an ability: 1 + all + element bonus.</summary>
        /// <param name="element">Element of the ability.</param>
        public float DamageFactor(DamageType element)
        {
            return Math.Max(0f, 1f + AllDamage + ElementDamage(element));
        }

        /// <summary>Adds a damage bonus for an element.</summary>
        /// <param name="element">Element.</param>
        /// <param name="value">Bonus.</param>
        public void AddElementDamage(DamageType element, float value)
        {
            int index = (int)element;
            if (index >= 0 && index < ElementCount)
            {
                _elementDamage[index] += value;
            }
        }

        /// <summary>Adds a build-up bonus for an element.</summary>
        /// <param name="element">Element.</param>
        /// <param name="value">Bonus.</param>
        public void AddElementBuildup(DamageType element, float value)
        {
            int index = (int)element;
            if (index >= 0 && index < ElementCount)
            {
                _elementBuildup[index] += value;
            }
        }

        /// <summary>The upgrade of an ability, created on first use.</summary>
        /// <param name="abilityId">Ability id.</param>
        public AbilityUpgrade Upgrade(string abilityId)
        {
            if (!_upgrades.TryGetValue(abilityId, out AbilityUpgrade upgrade))
            {
                upgrade = new AbilityUpgrade();
                _upgrades[abilityId] = upgrade;
            }

            return upgrade;
        }

        /// <summary>The ability as the skill tree changed it (or the base data if nothing changes).</summary>
        /// <param name="spec">Base data.</param>
        public AbilitySpec Apply(AbilitySpec spec)
        {
            AbilitySpec result = spec;
            if (_upgrades.TryGetValue(spec.Id, out AbilityUpgrade upgrade) && !upgrade.IsEmpty)
            {
                result = upgrade.ApplyTo(spec);
            }

            float buildup = ElementBuildup(spec.Element);
            if (buildup != 0f && result.Buildup > 0f)
            {
                if (ReferenceEquals(result, spec))
                {
                    result = spec.Clone();
                }

                result.Buildup = Math.Max(0f, result.Buildup * (1f + buildup));
            }

            return result;
        }

        /// <summary>Removes every bonus.</summary>
        public void Clear()
        {
            Array.Clear(_elementDamage, 0, ElementCount);
            Array.Clear(_elementBuildup, 0, ElementCount);
            _upgrades.Clear();
            AllDamage = 0f;
        }
    }
}
