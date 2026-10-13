using System;
using System.Collections.Generic;

namespace Aetherfall.Stats
{
    /// <summary>
    /// All stats of one character (architecture 11.5, GDD §10.3): the same class for player, companions and enemies.
    /// Base values, modifiers with source ids, derived values from a <see cref="StatFormulaSet"/>, caps from a
    /// <see cref="StatRuleSet"/>, lazy recalculation and a bundled change event.
    /// </summary>
    /// <remarks>
    /// <para><b>Dirty flags:</b> every change only marks the stat and all derived stats that depend on it (transitively);
    /// the next <see cref="Get"/> recalculates once. Reading clean values does not allocate.</para>
    /// <para><b>Change event:</b> <see cref="Changed"/> is raised by <see cref="FlushChanges"/>, which the owner calls once
    /// per frame (architecture 11.5: "einmal pro Frame gebuendelt"). Each stat is reported at most once per flush with
    /// its value before the first change and after the last one; stats that ended up unchanged are not reported. While
    /// nobody subscribes, no changes are tracked.</para>
    /// <para>Pure C#, not thread-safe (main thread only).</para>
    /// </remarks>
    public sealed class StatCollection : IStatReader
    {
        private readonly Stat[] _stats = new Stat[StatIds.Capacity];
        private readonly StatFormula[] _formulas = new StatFormula[StatIds.Capacity];
        private readonly bool[] _formulaDirty = new bool[StatIds.Capacity];
        private readonly StatId[][] _dependents = new StatId[StatIds.Capacity][];
        private readonly bool[] _pending = new bool[StatIds.Capacity];
        private readonly float[] _pendingOldValue = new float[StatIds.Capacity];
        private readonly int[] _pendingQueue = new int[StatIds.Capacity];
        private readonly int[] _flushIds = new int[StatIds.Capacity];
        private readonly float[] _flushOld = new float[StatIds.Capacity];
        private readonly float[] _flushNew = new float[StatIds.Capacity];
        private int _pendingCount;

        /// <summary>Creates a collection with all base values 0.</summary>
        /// <param name="formulas">Formulas of the derived stats; null = <see cref="StatFormulaSet.CreateDefault"/>.</param>
        /// <param name="rules">Caps and limits; null = rules for <see cref="StatActorKind.Player"/>.</param>
        /// <exception cref="ArgumentException">The formulas contain a dependency cycle.</exception>
        public StatCollection(StatFormulaSet formulas = null, StatRuleSet rules = null)
        {
            formulas = formulas ?? StatFormulaSet.CreateDefault();
            Rules = rules ?? StatRuleSet.Create(StatActorKind.Player);
            if (!formulas.Validate(out string problem))
            {
                throw new ArgumentException(problem, nameof(formulas));
            }

            var dependents = new List<StatId>[StatIds.Capacity];
            var scratch = new List<StatId>();
            for (int i = 1; i < StatIds.Capacity; i++)
            {
                var id = (StatId)i;
                _stats[i] = new Stat(id, 0f, Rules.Get(id));
                StatFormula formula = formulas.Get(id);
                if (formula == null)
                {
                    continue;
                }

                _formulas[i] = formula;
                _formulaDirty[i] = true;
                scratch.Clear();
                formula.CollectDependencies(scratch);
                for (int d = 0; d < scratch.Count; d++)
                {
                    int dependency = (int)scratch[d];
                    if (dependents[dependency] == null)
                    {
                        dependents[dependency] = new List<StatId>();
                    }

                    if (!dependents[dependency].Contains(id))
                    {
                        dependents[dependency].Add(id);
                    }
                }
            }

            for (int i = 0; i < StatIds.Capacity; i++)
            {
                _dependents[i] = dependents[i] != null ? dependents[i].ToArray() : Array.Empty<StatId>();
            }
        }

        /// <summary>
        /// Raised by <see cref="FlushChanges"/> once per changed stat: (stat, value before, value after).
        /// Subscribe only in OnEnable/PostInitialize and unsubscribe again (architecture 4.3 discipline).
        /// </summary>
        public event Action<StatId, float, float> Changed;

        /// <summary>Caps and limits used by this collection.</summary>
        public StatRuleSet Rules { get; }

        /// <summary>Number of stats with a change that <see cref="FlushChanges"/> has not reported yet.</summary>
        public int PendingChangeCount => _pendingCount;

        /// <inheritdoc />
        public float Get(StatId id)
        {
            int index = CheckedIndex(id);
            Stat stat = _stats[index];
            if (_formulaDirty[index])
            {
                // Clear first: a formula never reads its own stat (validated), so there is no recursion into this branch.
                _formulaDirty[index] = false;
                stat.BaseValue = _formulas[index].Evaluate(this);
            }

            return stat.Value;
        }

        /// <summary>Base value before modifiers (for derived stats: the formula result).</summary>
        /// <param name="id">Stat.</param>
        public float GetBase(StatId id)
        {
            int index = CheckedIndex(id);
            if (_formulaDirty[index])
            {
                Get(id);
            }

            return _stats[index].BaseValue;
        }

        /// <summary>True if the stat's base value comes from a formula.</summary>
        /// <param name="id">Stat.</param>
        public bool IsDerived(StatId id)
        {
            return _formulas[CheckedIndex(id)] != null;
        }

        /// <summary>Sets the base value of a stat that has no formula (attributes, level, armor, resistances ...).</summary>
        /// <param name="id">Stat.</param>
        /// <param name="value">New base value.</param>
        /// <exception cref="InvalidOperationException">The stat is derived; change it with modifiers instead.</exception>
        public void SetBase(StatId id, float value)
        {
            int index = CheckedIndex(id);
            if (_formulas[index] != null)
            {
                throw new InvalidOperationException(id + " is derived from a formula; its base value cannot be set. Use a modifier instead.");
            }

            if (_stats[index].BaseValue.Equals(value))
            {
                return;
            }

            BeforeChange(index);
            _stats[index].BaseValue = value;
            AfterChange(index);
        }

        /// <summary>Adds a modifier to the stat it targets.</summary>
        /// <param name="modifier">Modifier (see <see cref="StatModifier"/> factories).</param>
        public void AddModifier(in StatModifier modifier)
        {
            int index = CheckedIndex(modifier.Stat);
            BeforeChange(index);
            _stats[index].AddModifier(modifier);
            AfterChange(index);
        }

        /// <summary>Removes one modifier equal to <paramref name="modifier"/>.</summary>
        /// <param name="modifier">Modifier to remove.</param>
        /// <returns>True if it was found.</returns>
        public bool RemoveModifier(in StatModifier modifier)
        {
            int index = CheckedIndex(modifier.Stat);
            if (!ContainsModifier(_stats[index], modifier))
            {
                return false;
            }

            BeforeChange(index);
            _stats[index].RemoveModifier(modifier);
            AfterChange(index);
            return true;
        }

        /// <summary>
        /// Removes every modifier of a source from all stats (unequip <c>item:&lt;id&gt;</c>, buff expired ...).
        /// </summary>
        /// <param name="sourceId">Source id (see <see cref="StatSourceIds"/>).</param>
        /// <returns>Number of removed modifiers.</returns>
        public int RemoveAllFromSource(string sourceId)
        {
            if (string.IsNullOrEmpty(sourceId))
            {
                return 0;
            }

            int removed = 0;
            for (int i = 1; i < StatIds.Capacity; i++)
            {
                Stat stat = _stats[i];
                if (!stat.HasModifiersFrom(sourceId))
                {
                    continue;
                }

                BeforeChange(i);
                removed += stat.RemoveAllFromSource(sourceId);
                AfterChange(i);
            }

            return removed;
        }

        /// <summary>The modifiers of one stat (read-only view, sorted by order).</summary>
        /// <param name="id">Stat.</param>
        public IReadOnlyList<StatModifier> GetModifiers(StatId id)
        {
            return _stats[CheckedIndex(id)].Modifiers;
        }

        /// <summary>Reads the six main attributes at once.</summary>
        public AttributeSet GetAttributes()
        {
            return AttributeSet.From(this);
        }

        /// <summary>
        /// Raises <see cref="Changed"/> for every stat whose value differs from the value before its first change since the
        /// last flush. Call once per frame (e.g. from the owning component). Allocation-free.
        /// </summary>
        /// <returns>Number of raised events.</returns>
        public int FlushChanges()
        {
            int count = _pendingCount;
            if (count == 0)
            {
                return 0;
            }

            // Take the whole batch first: changes made by handlers below are captured anew (old value = value reported now)
            // and reported by the next flush.
            for (int i = 0; i < count; i++)
            {
                int index = _pendingQueue[i];
                _flushIds[i] = index;
                _flushOld[i] = _pendingOldValue[index];
                _flushNew[i] = Get((StatId)index);
                _pending[index] = false;
            }

            _pendingCount = 0;
            int raised = 0;
            for (int i = 0; i < count; i++)
            {
                if (_flushOld[i].Equals(_flushNew[i]))
                {
                    continue;
                }

                raised++;
                Action<StatId, float, float> handler = Changed;
                if (handler != null)
                {
                    handler((StatId)_flushIds[i], _flushOld[i], _flushNew[i]);
                }
            }

            return raised;
        }

        private void BeforeChange(int index)
        {
            if (Changed == null)
            {
                return;
            }

            Capture(index);
        }

        private void Capture(int index)
        {
            if (!_pending[index])
            {
                _pendingOldValue[index] = Get((StatId)index);
                _pending[index] = true;
                _pendingQueue[_pendingCount++] = index;
            }

            StatId[] dependents = _dependents[index];
            for (int i = 0; i < dependents.Length; i++)
            {
                Capture((int)dependents[i]);
            }
        }

        private void AfterChange(int index)
        {
            StatId[] dependents = _dependents[index];
            for (int i = 0; i < dependents.Length; i++)
            {
                int dependent = (int)dependents[i];
                _formulaDirty[dependent] = true;
                AfterChange(dependent);
            }
        }

        private static bool ContainsModifier(Stat stat, in StatModifier modifier)
        {
            IReadOnlyList<StatModifier> modifiers = stat.Modifiers;
            for (int i = 0; i < modifiers.Count; i++)
            {
                if (modifiers[i].Equals(modifier))
                {
                    return true;
                }
            }

            return false;
        }

        private static int CheckedIndex(StatId id)
        {
            int index = (int)id;
            if (index <= 0 || index >= StatIds.Capacity)
            {
                throw new ArgumentOutOfRangeException(nameof(id), "Unknown stat " + id + ".");
            }

            return index;
        }
    }
}
