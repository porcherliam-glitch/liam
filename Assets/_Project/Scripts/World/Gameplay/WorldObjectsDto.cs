using System.Collections.Generic;
using UnityEngine.Scripting;

namespace Aetherfall.World.Gameplay
{
    /// <summary>
    /// Save section <c>worldobjects</c> (architecture 9.2, load order 85; 9.7 "Szenenobjekt mit Zustand"): the non-zero states
    /// of puzzles, doors, levers, cages, checkpoints, mirrors and beaten bosses by id.
    /// </summary>
    /// <remarks>
    /// Mini-Slice simplification: beaten bosses are stored here as well (architecture 9.7 plans them in the section
    /// <c>spawners</c>, which does not exist yet).
    /// </remarks>
    [Preserve]
    public sealed class WorldObjectsDto
    {
        /// <summary>States by id (only values different from 0).</summary>
        public Dictionary<string, int> States = new Dictionary<string, int>();
    }
}
