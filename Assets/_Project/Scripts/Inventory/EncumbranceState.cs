namespace Aetherfall.Inventory
{
    /// <summary>Current load of the player: carried weight, capacity, share and stage (GDD 04 1.3).</summary>
    public readonly struct EncumbranceState
    {
        /// <summary>Carried weight in kg (bag and equipment).</summary>
        public readonly float Load;

        /// <summary>Carry capacity in kg (stat <c>CarryCapacity</c>).</summary>
        public readonly float Capacity;

        /// <summary>Stage.</summary>
        public readonly EncumbranceLevel Level;

        /// <summary>Creates the state.</summary>
        /// <param name="load">Carried weight.</param>
        /// <param name="capacity">Capacity.</param>
        public EncumbranceState(float load, float capacity)
        {
            Load = load;
            Capacity = capacity;
            Level = EncumbranceRules.LevelFor(load, capacity);
        }

        /// <summary>Load ÷ capacity (0 if the capacity is 0).</summary>
        public float Ratio => Capacity > 0f ? Load / Capacity : 0f;
    }
}
