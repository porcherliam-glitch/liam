namespace Aetherfall.World
{
    /// <summary>Condition of a field (JSON <c>state</c>).</summary>
    public enum FieldState
    {
        /// <summary><c>ripe</c>: Ripe, ready for the harvest.</summary>
        Ripe = 0,

        /// <summary><c>burned</c>: Burned down.</summary>
        Burned = 1,

        /// <summary><c>stubble</c>: Already harvested, stubble only.</summary>
        Stubble = 2
    }
}
