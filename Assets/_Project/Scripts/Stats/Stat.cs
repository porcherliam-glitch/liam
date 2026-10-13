using System;
using System.Collections.Generic;

namespace Aetherfall.Stats
{
    /// <summary>
    /// One value with base value and modifiers (architecture 11.5). The value is recalculated lazily: changes only set a
    /// dirty flag, the next read of <see cref="Value"/> computes it once (<see cref="StatCalculator.Compute"/>). Reading a
    /// clean value does not allocate.
    /// </summary>
    /// <remarks>Usually owned by a <see cref="StatCollection"/>, which adds derived values and change events.</remarks>
    public sealed class Stat
    {
        private readonly List<StatModifier> _modifiers = new List<StatModifier>(4);
        private float _baseValue;
        private float _value;
        private bool _dirty = true;

        /// <summary>Creates a stat.</summary>
        /// <param name="id">Key of the stat.</param>
        /// <param name="baseValue">Initial base value.</param>
        /// <param name="rule">Soft cap and limits.</param>
        public Stat(StatId id, float baseValue, StatRule rule)
        {
            Id = id;
            _baseValue = baseValue;
            Rule = rule;
        }

        /// <summary>Key of the stat.</summary>
        public StatId Id { get; }

        /// <summary>Soft cap and limits applied after the modifiers.</summary>
        public StatRule Rule { get; }

        /// <summary>Base value before modifiers. Setting a different value marks the stat dirty.</summary>
        public float BaseValue
        {
            get => _baseValue;
            set
            {
                if (_baseValue.Equals(value))
                {
                    return;
                }

                _baseValue = value;
                _dirty = true;
            }
        }

        /// <summary>Final value: base value with all modifiers, soft cap and limits (cached until the next change).</summary>
        public float Value
        {
            get
            {
                if (_dirty)
                {
                    _value = StatCalculator.Compute(_baseValue, _modifiers, Rule);
                    _dirty = false;
                }

                return _value;
            }
        }

        /// <summary>True if the next read of <see cref="Value"/> recalculates.</summary>
        public bool IsDirty => _dirty;

        /// <summary>The modifiers, sorted by <see cref="StatModifier.Order"/> (stable, in insertion order for equal orders).</summary>
        public IReadOnlyList<StatModifier> Modifiers => _modifiers;

        /// <summary>Forces a recalculation on the next read.</summary>
        public void MarkDirty()
        {
            _dirty = true;
        }

        /// <summary>Adds a modifier (sorted by its order, after existing ones with the same order).</summary>
        /// <param name="modifier">Modifier; its <see cref="StatModifier.Stat"/> must be this stat.</param>
        /// <exception cref="ArgumentException">The modifier targets another stat.</exception>
        public void AddModifier(in StatModifier modifier)
        {
            if (modifier.Stat != Id)
            {
                throw new ArgumentException("Modifier for " + modifier.Stat + " added to stat " + Id + ".", nameof(modifier));
            }

            int index = _modifiers.Count;
            while (index > 0 && _modifiers[index - 1].Order > modifier.Order)
            {
                index--;
            }

            _modifiers.Insert(index, modifier);
            _dirty = true;
        }

        /// <summary>Removes the first modifier equal to <paramref name="modifier"/>.</summary>
        /// <param name="modifier">Modifier to remove.</param>
        /// <returns>True if one was removed.</returns>
        public bool RemoveModifier(in StatModifier modifier)
        {
            for (int i = 0; i < _modifiers.Count; i++)
            {
                if (_modifiers[i].Equals(modifier))
                {
                    _modifiers.RemoveAt(i);
                    _dirty = true;
                    return true;
                }
            }

            return false;
        }

        /// <summary>Removes every modifier with the given source id.</summary>
        /// <param name="sourceId">Source id, e.g. <c>item:abc123</c>.</param>
        /// <returns>Number of removed modifiers.</returns>
        public int RemoveAllFromSource(string sourceId)
        {
            if (string.IsNullOrEmpty(sourceId))
            {
                return 0;
            }

            int removed = 0;
            for (int i = _modifiers.Count - 1; i >= 0; i--)
            {
                if (string.Equals(_modifiers[i].SourceId, sourceId, StringComparison.Ordinal))
                {
                    _modifiers.RemoveAt(i);
                    removed++;
                }
            }

            if (removed > 0)
            {
                _dirty = true;
            }

            return removed;
        }

        /// <summary>True if at least one modifier has the given source id.</summary>
        /// <param name="sourceId">Source id.</param>
        public bool HasModifiersFrom(string sourceId)
        {
            for (int i = 0; i < _modifiers.Count; i++)
            {
                if (string.Equals(_modifiers[i].SourceId, sourceId, StringComparison.Ordinal))
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>Removes all modifiers.</summary>
        public void ClearModifiers()
        {
            if (_modifiers.Count == 0)
            {
                return;
            }

            _modifiers.Clear();
            _dirty = true;
        }
    }
}
