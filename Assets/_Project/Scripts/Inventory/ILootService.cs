using System;
using Aetherfall.Items;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Loot output (architecture 11.6 "LootDropService"): reacts to <c>EnemyKilled</c> with a loot table id (roll, pickups in
    /// the world, <c>LootDropped</c>), opens chests once, collects pickups into the inventory, drops items from the bag into
    /// the world, keeps the bad luck counters, the save seed and the opened chests. Registered by <see cref="InventoryInstaller"/>.
    /// </summary>
    public interface ILootService
    {
        /// <summary>Raised when the set of opened chests changes (opened, loaded) so chest visuals can update.</summary>
        event Action ChestsChanged;

        /// <summary>Bad luck counters (read-only use: developer overlay).</summary>
        PityState Pity { get; }

        /// <summary>Current option "Automatisch aufheben".</summary>
        AutoPickupMode AutoPickup { get; set; }

        /// <summary>True if a spawner is registered (drops appear in the world; otherwise they go straight into the bag).</summary>
        bool HasSpawner { get; }

        /// <summary>True if the chest was opened before.</summary>
        /// <param name="chestId">Stable chest id.</param>
        bool IsChestOpened(string chestId);

        /// <summary>
        /// Opens a chest the first time: rolls its table (seeded by save seed and chest id), puts the content into the bag
        /// ("Alles nehmen" until the loot window exists), marks it opened, sends <c>LootDropped</c>.
        /// </summary>
        /// <param name="chestId">Stable chest id (<c>obj.*</c>).</param>
        /// <param name="lootTableId">Loot table.</param>
        /// <param name="tier">Chest tier (loot quality, item level delta).</param>
        /// <param name="areaLevel">Level of the area (item level of the content).</param>
        /// <param name="result">Rolled content (null if already opened).</param>
        bool TryOpenChest(string chestId, string lootTableId, ChestTier tier, int areaLevel, out LootResult result);

        /// <summary>Puts a picked up drop into the player's bag or wallet (sends the inventory events).</summary>
        /// <param name="drop">Drop of a pickup.</param>
        /// <param name="sourceId">Source for <c>ItemPickedUp</c>.</param>
        bool TryCollect(in LootDrop drop, string sourceId);

        /// <summary>True if the drop is collected automatically now (<see cref="AutoPickupRules"/> with the player's load).</summary>
        /// <param name="drop">Drop.</param>
        /// <param name="distance">Distance to the player in metres.</param>
        /// <param name="inCombat">True while the player is in combat.</param>
        bool ShouldAutoCollect(in LootDrop drop, float distance, bool inCombat);

        /// <summary>Takes pieces out of the bag and drops them as a pickup at a position.</summary>
        /// <param name="instanceId">Instance id in the bag.</param>
        /// <param name="count">Pieces.</param>
        /// <param name="position">World position.</param>
        /// <param name="reason">German reason on failure.</param>
        bool DropFromInventory(string instanceId, int count, Vector3 position, out string reason);

        /// <summary>Developer cheat: drops one random piece of equipment per rarity (common to legendary) at a position.</summary>
        /// <param name="position">World position.</param>
        /// <returns>Number of dropped items.</returns>
        int SpawnDebugLoot(Vector3 position);

        /// <summary>Registers the scene spawner of pickups.</summary>
        /// <param name="spawner">Spawner.</param>
        void RegisterSpawner(ILootSpawner spawner);

        /// <summary>Removes the spawner (scene unloaded).</summary>
        /// <param name="spawner">Spawner.</param>
        void UnregisterSpawner(ILootSpawner spawner);
    }
}
