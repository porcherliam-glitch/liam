using System.Collections.Generic;
using Aetherfall.Items;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Puts loot into the world as pickups (implemented by <see cref="LootWorldSpawner"/> in the gameplay scene, which
    /// registers itself with <see cref="ILootService.RegisterSpawner"/>). Keeps the pure loot service free of scene objects.
    /// </summary>
    public interface ILootSpawner
    {
        /// <summary>Spawns pickups for drops around a position (scattered, with beams in the rarity colour).</summary>
        /// <param name="drops">Drops.</param>
        /// <param name="origin">Centre (enemy position, drop position).</param>
        /// <param name="sourceId">Source for <c>ItemPickedUp</c> (loot table id, <c>drop</c>).</param>
        void SpawnDrops(IReadOnlyList<LootDrop> drops, Vector3 origin, string sourceId);

        /// <summary>Removes every pickup (loading a save: loot in the world is not saved yet).</summary>
        void ClearAll();
    }
}
