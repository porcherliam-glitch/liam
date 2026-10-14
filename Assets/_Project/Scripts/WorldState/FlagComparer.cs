namespace Aetherfall.WorldState
{
    /// <summary>Evaluation and display of <see cref="FlagComparison"/>. Stateless.</summary>
    public static class FlagComparer
    {
        /// <summary>True if <paramref name="actual"/> compared with <paramref name="value"/> holds.</summary>
        /// <param name="actual">Current flag value.</param>
        /// <param name="comparison">Comparison.</param>
        /// <param name="value">Value from the data.</param>
        public static bool Matches(int actual, FlagComparison comparison, int value)
        {
            switch (comparison)
            {
                case FlagComparison.Equal:
                    return actual == value;
                case FlagComparison.NotEqual:
                    return actual != value;
                case FlagComparison.Greater:
                    return actual > value;
                case FlagComparison.GreaterOrEqual:
                    return actual >= value;
                case FlagComparison.Less:
                    return actual < value;
                case FlagComparison.LessOrEqual:
                    return actual <= value;
                default:
                    return false;
            }
        }

        /// <summary>Operator symbol for descriptions (<c>=</c>, <c>≠</c>, <c>&gt;</c> …).</summary>
        /// <param name="comparison">Comparison.</param>
        public static string Symbol(FlagComparison comparison)
        {
            switch (comparison)
            {
                case FlagComparison.Equal:
                    return "=";
                case FlagComparison.NotEqual:
                    return "≠";
                case FlagComparison.Greater:
                    return ">";
                case FlagComparison.GreaterOrEqual:
                    return "≥";
                case FlagComparison.Less:
                    return "<";
                case FlagComparison.LessOrEqual:
                    return "≤";
                default:
                    return "?";
            }
        }
    }
}
