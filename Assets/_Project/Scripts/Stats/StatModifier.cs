using System;

namespace Aetherfall.Stats
{
    /// <summary>
    /// One change of a stat (architecture 11.5): target stat, kind, value, source and order. The source id (e.g.
    /// <c>item:&lt;instanceId&gt;</c>, see <see cref="StatSourceIds"/>) allows removing everything a source added with
    /// <see cref="StatCollection.RemoveAllFromSource"/>.
    /// </summary>
    /// <remarks>
    /// <para>Percent values are fractions: <c>0.15</c> means +15 %. A <see cref="StatModifierKind.PercentMult"/> of
    /// <c>0.10</c> multiplies by 1.10, one of <c>-0.5</c> halves the value.</para>
    /// <para>Modifiers are not saved: they are rebuilt from equipment, skills and effects when loading (architecture 11.5).</para>
    /// </remarks>
    public readonly struct StatModifier : IEquatable<StatModifier>
    {
        /// <summary>Stat this modifier changes.</summary>
        public readonly StatId Stat;

        /// <summary>How the value is applied.</summary>
        public readonly StatModifierKind Kind;

        /// <summary>Amount (flat) or fraction (percent kinds).</summary>
        public readonly float Value;

        /// <summary>Stable id of the source (never null; empty for anonymous modifiers).</summary>
        public readonly string SourceId;

        /// <summary>
        /// Order among multiplicative modifiers of the same stat: lower first. Only the first
        /// <see cref="StatCalculator.MaxMultiplicativeModifiers"/> multiplicative modifiers count (GDD 03 10.4).
        /// </summary>
        public readonly int Order;

        /// <summary>Creates a modifier.</summary>
        /// <param name="stat">Target stat.</param>
        /// <param name="kind">Kind.</param>
        /// <param name="value">Amount or fraction.</param>
        /// <param name="sourceId">Source id (see <see cref="StatSourceIds"/>); null is stored as empty.</param>
        /// <param name="order">Order among multiplicative modifiers (default 0).</param>
        public StatModifier(StatId stat, StatModifierKind kind, float value, string sourceId, int order = 0)
        {
            Stat = stat;
            Kind = kind;
            Value = value;
            SourceId = sourceId ?? string.Empty;
            Order = order;
        }

        /// <summary>Creates a flat modifier.</summary>
        /// <param name="stat">Target stat.</param>
        /// <param name="value">Amount added to the base value.</param>
        /// <param name="sourceId">Source id.</param>
        public static StatModifier Flat(StatId stat, float value, string sourceId)
        {
            return new StatModifier(stat, StatModifierKind.Flat, value, sourceId);
        }

        /// <summary>Creates an additive percent modifier (0.15 = +15 %).</summary>
        /// <param name="stat">Target stat.</param>
        /// <param name="fraction">Fraction added to the percent sum.</param>
        /// <param name="sourceId">Source id.</param>
        public static StatModifier PercentAdd(StatId stat, float fraction, string sourceId)
        {
            return new StatModifier(stat, StatModifierKind.PercentAdd, fraction, sourceId);
        }

        /// <summary>Creates a multiplicative percent modifier (0.10 = × 1.10).</summary>
        /// <param name="stat">Target stat.</param>
        /// <param name="fraction">Fraction; the value is multiplied by 1 + fraction.</param>
        /// <param name="sourceId">Source id.</param>
        /// <param name="order">Order among multiplicative modifiers.</param>
        public static StatModifier PercentMult(StatId stat, float fraction, string sourceId, int order = 0)
        {
            return new StatModifier(stat, StatModifierKind.PercentMult, fraction, sourceId, order);
        }

        /// <inheritdoc />
        public bool Equals(StatModifier other)
        {
            return Stat == other.Stat && Kind == other.Kind && Value.Equals(other.Value) &&
                   string.Equals(SourceId, other.SourceId, StringComparison.Ordinal) && Order == other.Order;
        }

        /// <inheritdoc />
        public override bool Equals(object obj)
        {
            return obj is StatModifier other && Equals(other);
        }

        /// <inheritdoc />
        public override int GetHashCode()
        {
            unchecked
            {
                int hash = (int)Stat;
                hash = hash * 31 + (int)Kind;
                hash = hash * 31 + Value.GetHashCode();
                hash = hash * 31 + (SourceId ?? string.Empty).GetHashCode();
                return hash * 31 + Order;
            }
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "StatModifier(" + Stat + " " + Kind + " " + Value + ", source '" + SourceId + "', order " + Order + ")";
        }
    }
}
