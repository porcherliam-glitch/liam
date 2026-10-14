namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// The common state numbers of <see cref="IWorldObjectStateStore"/>. Objects store 0 (nothing happened, the default and
    /// never saved) or 1 (solved, open, on, freed, taken, beaten); mirrors store their <see cref="GridDirection"/> + 1 so that
    /// 0 still means "start position". Saved as numbers: never renumber.
    /// </summary>
    public static class WorldObjectStates
    {
        /// <summary>Default: nothing happened.</summary>
        public const int Initial = 0;

        /// <summary>Puzzle solved, door open, lever on, cage open, item taken, boss beaten, clue inspected.</summary>
        public const int Done = 1;

        /// <summary>Explicitly closed (doors set by a quest action against their own rule).</summary>
        public const int Closed = 2;

        /// <summary>State number of a mirror direction.</summary>
        /// <param name="direction">Direction.</param>
        public static int FromDirection(GridDirection direction)
        {
            return (int)direction + 1;
        }

        /// <summary>Mirror direction of a state number; false for 0 (start position) and invalid values.</summary>
        /// <param name="state">State number.</param>
        /// <param name="direction">Direction.</param>
        public static bool TryGetDirection(int state, out GridDirection direction)
        {
            direction = GridDirection.North;
            if (state < 1 || state > GridDirections.Count)
            {
                return false;
            }

            direction = (GridDirection)(state - 1);
            return true;
        }
    }
}
