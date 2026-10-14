namespace Aetherfall.WorldState
{
    /// <summary>Comparison of a flag condition (<see cref="FlagIs"/>). Values are stored in assets: never renumber.</summary>
    public enum FlagComparison
    {
        /// <summary>Equal (=).</summary>
        Equal = 0,

        /// <summary>Not equal (≠).</summary>
        NotEqual = 1,

        /// <summary>Greater (&gt;).</summary>
        Greater = 2,

        /// <summary>Greater or equal (≥).</summary>
        GreaterOrEqual = 3,

        /// <summary>Less (&lt;).</summary>
        Less = 4,

        /// <summary>Less or equal (≤).</summary>
        LessOrEqual = 5
    }
}
