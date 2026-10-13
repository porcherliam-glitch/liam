using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Items;
using Aetherfall.Stats;
using Aetherfall.Utilities;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Default <see cref="ILootService"/> (architecture 11.6 "LootDropService ... liegen in Inventory (13)"): pure C# service,
    /// subscribes to <c>EnemyKilled</c> and <c>GameLoaded</c> in <see cref="PostInitialize"/>, unsubscribes in
    /// <see cref="Dispose"/>. Rolls with <see cref="LootRoller"/> and a generator seeded by
    /// <see cref="LootSeeds.Combine"/> (save seed, source id, counter), so reloading does not change the result.
    /// </summary>
    /// <remarks>
    /// <para>Enemy loot quality follows the variant (normal 1, elite 2 + 1 roll, champion 3, GDD 04 5.2). TODO (time of day
    /// step): +1 at night. TODO (world step): loot bags are announced to <c>IRuntimeSpawnRegistry</c> and saved (architecture
    /// 9.7); until then loot lying in the world is cleared when a save is loaded.</para>
    /// <para>Without a registered spawner (no scene component) drops go straight into the bag.</para>
    /// </remarks>
    public sealed class LootService : ILootService, IPostInitializable, IDisposable
    {
        /// <summary>Source id of items dropped from the bag.</summary>
        public const string DropSourceId = "drop";

        /// <summary>Source id of developer loot.</summary>
        public const string DebugSourceId = "debug";

        private readonly IEventBus _eventBus;
        private readonly IInventoryService _inventory;
        private readonly LootRoller _roller;
        private readonly IRandom _seedSource;
        private readonly IRandom _debugRandom;
        private readonly ChestRegistry _chests = new ChestRegistry();
        private readonly List<LootDrop> _single = new List<LootDrop>(1);
        private ILootSpawner _spawner;
        private bool _subscribed;

        /// <summary>Creates the service with a new save seed.</summary>
        /// <param name="eventBus">Event bus.</param>
        /// <param name="inventory">Inventory (receives collected loot, gives the player's luck and load).</param>
        /// <param name="roller">Loot roller.</param>
        /// <param name="seedSource">Source of new save seeds (new game) and developer drops.</param>
        /// <param name="autoPickup">Option "Automatisch aufheben".</param>
        public LootService(IEventBus eventBus, IInventoryService inventory, LootRoller roller, IRandom seedSource, AutoPickupMode autoPickup)
        {
            _eventBus = eventBus ?? throw new ArgumentNullException(nameof(eventBus));
            _inventory = inventory ?? throw new ArgumentNullException(nameof(inventory));
            _roller = roller ?? throw new ArgumentNullException(nameof(roller));
            _seedSource = seedSource ?? throw new ArgumentNullException(nameof(seedSource));
            _debugRandom = new Pcg32Random(((ulong)seedSource.NextUInt() << 32) | seedSource.NextUInt(), 7UL);
            AutoPickup = autoPickup;
            ResetForNewGame();
        }

        /// <inheritdoc />
        public event Action ChestsChanged;

        /// <inheritdoc />
        public PityState Pity { get; } = new PityState();

        /// <inheritdoc />
        public AutoPickupMode AutoPickup { get; set; }

        /// <inheritdoc />
        public bool HasSpawner => _spawner != null;

        /// <summary>Seed of the save game (part of every loot seed).</summary>
        public ulong SaveSeed { get; private set; }

        /// <summary>Number of enemy loot rolls in this save (part of their seeds).</summary>
        public long RollCounter { get; private set; }

        /// <summary>The opened chests.</summary>
        public ChestRegistry Chests => _chests;

        /// <inheritdoc />
        public void PostInitialize()
        {
            if (_subscribed)
            {
                return;
            }

            _eventBus.Subscribe<EnemyKilled>(OnEnemyKilled);
            _eventBus.Subscribe<GameLoaded>(OnGameLoaded);
            _subscribed = true;
        }

        /// <summary>Unsubscribes.</summary>
        public void Dispose()
        {
            if (!_subscribed)
            {
                return;
            }

            _eventBus.Unsubscribe<EnemyKilled>(OnEnemyKilled);
            _eventBus.Unsubscribe<GameLoaded>(OnGameLoaded);
            _subscribed = false;
        }

        /// <summary>New game: new save seed, counters 0, no chest opened.</summary>
        public void ResetForNewGame()
        {
            SaveSeed = ((ulong)_seedSource.NextUInt() << 32) | _seedSource.NextUInt();
            RollCounter = 0;
            Pity.Restore(0, 0);
            _chests.Restore(null);
            RaiseChestsChanged();
        }

        /// <summary>Sets the loaded state (no events except <see cref="ChestsChanged"/>).</summary>
        /// <param name="saveSeed">Save seed (0 = keep a new one).</param>
        /// <param name="rollCounter">Roll counter.</param>
        /// <param name="legendaryCounter">Z_L.</param>
        /// <param name="mythicCounter">Z_M.</param>
        /// <param name="openedChests">Opened chest ids.</param>
        public void LoadState(ulong saveSeed, long rollCounter, int legendaryCounter, int mythicCounter, IEnumerable<string> openedChests)
        {
            if (saveSeed != 0UL)
            {
                SaveSeed = saveSeed;
            }

            RollCounter = Math.Max(0L, rollCounter);
            Pity.Restore(legendaryCounter, mythicCounter);
            _chests.Restore(openedChests);
            RaiseChestsChanged();
        }

        /// <inheritdoc />
        public bool IsChestOpened(string chestId)
        {
            return _chests.IsOpened(chestId);
        }

        /// <inheritdoc />
        public bool TryOpenChest(string chestId, string lootTableId, ChestTier tier, int areaLevel, out LootResult result)
        {
            result = null;
            if (string.IsNullOrEmpty(chestId) || _chests.IsOpened(chestId))
            {
                return false;
            }

            var context = new LootContext(chestId, areaLevel, ChestTierRules.LootQuality(tier), PlayerLuck(), ChestTierRules.ItemLevelDelta(tier));
            result = _roller.Roll(lootTableId, context, Pity, new Pcg32Random(LootSeeds.Combine(SaveSeed, chestId, 0)));
            _chests.MarkOpened(chestId);
            IReadOnlyList<LootDrop> drops = result.Drops;
            for (int i = 0; i < drops.Count; i++)
            {
                TryCollect(drops[i], chestId);
            }

            PublishDropped(lootTableId, result);
            Log.Info(LogCategory.Data, "Chest '" + chestId + "' opened: " + drops.Count + " drop(s), best " + ItemRarityIds.ToId(result.BestRarity) + ".");
            RaiseChestsChanged();
            return true;
        }

        /// <inheritdoc />
        public bool TryCollect(in LootDrop drop, string sourceId)
        {
            if (drop.IsCurrency)
            {
                return _inventory.TryChangeCurrency(InventoryOwners.Player, drop.CurrencyId, drop.Amount, sourceId);
            }

            return _inventory.TryAdd(InventoryOwners.Player, drop.Item, sourceId);
        }

        /// <inheritdoc />
        public bool ShouldAutoCollect(in LootDrop drop, float distance, bool inCombat)
        {
            ItemSpec spec = null;
            if (!drop.IsCurrency)
            {
                _inventory.Catalog.TryGetItem(drop.Item.ItemId, out spec);
            }

            return AutoPickupRules.ShouldCollect(AutoPickup, drop, spec, distance, _inventory.PlayerEncumbrance.Level, inCombat);
        }

        /// <inheritdoc />
        public bool DropFromInventory(string instanceId, int count, Vector3 position, out string reason)
        {
            if (!_inventory.TryTakeForDrop(instanceId, count, out ItemInstance taken, out reason))
            {
                return false;
            }

            _single.Clear();
            _single.Add(LootDrop.ForItem(taken));
            Deliver(_single, position, DropSourceId);
            return true;
        }

        /// <inheritdoc />
        public int SpawnDebugLoot(Vector3 position)
        {
            int level = 1;
            StatCollection stats = _inventory.PlayerStats;
            if (stats != null)
            {
                level = Math.Max(1, (int)stats.Get(StatId.Level));
            }

            var context = new LootContext(DebugSourceId, level, 1, 0f);
            var drops = new List<LootDrop>();
            for (int r = (int)ItemRarity.Common; r <= (int)ItemRarity.Legendary; r++)
            {
                var group = (EquipmentGroup)(1 + r % 3);
                ItemInstance item = _roller.GenerateEquipment(group, context, null, _debugRandom, (ItemRarity)r);
                if (item != null)
                {
                    drops.Add(LootDrop.ForItem(item));
                }
            }

            Deliver(drops, position, DebugSourceId);
            return drops.Count;
        }

        /// <inheritdoc />
        public void RegisterSpawner(ILootSpawner spawner)
        {
            _spawner = spawner;
        }

        /// <inheritdoc />
        public void UnregisterSpawner(ILootSpawner spawner)
        {
            if (ReferenceEquals(_spawner, spawner))
            {
                _spawner = null;
            }
        }

        /// <summary>Rolls the loot of a killed enemy and puts it into the world (also used by tests without event bus round trip).</summary>
        /// <param name="evt">The event.</param>
        /// <returns>The roll, or null if the enemy has no loot table.</returns>
        public LootResult RollEnemyLoot(in EnemyKilled evt)
        {
            if (string.IsNullOrEmpty(evt.LootTableId))
            {
                return null;
            }

            int lootQuality = LootQualityRules.ForEnemyVariant(evt.VariantId);
            int extraRolls = LootQualityRules.ExtraRollsForEnemyVariant(evt.VariantId);
            string sourceId = string.IsNullOrEmpty(evt.UniqueId) ? evt.EnemyTypeId : evt.UniqueId;
            var context = new LootContext(sourceId, evt.EnemyLevel, lootQuality, PlayerLuck(), 0, 0, 0f, 0f, extraRolls);
            var random = new Pcg32Random(LootSeeds.Combine(SaveSeed, sourceId, RollCounter));
            RollCounter++;
            LootResult result = _roller.Roll(evt.LootTableId, context, Pity, random);
            Deliver(result.Drops, evt.Position, evt.LootTableId);
            PublishDropped(evt.LootTableId, result);
            return result;
        }

        private void OnEnemyKilled(EnemyKilled evt)
        {
            RollEnemyLoot(evt);
        }

        private void OnGameLoaded(GameLoaded evt)
        {
            if (_spawner != null)
            {
                _spawner.ClearAll();
            }
        }

        private void Deliver(IReadOnlyList<LootDrop> drops, Vector3 position, string sourceId)
        {
            if (drops.Count == 0)
            {
                return;
            }

            if (_spawner != null)
            {
                _spawner.SpawnDrops(drops, position, sourceId);
                return;
            }

            for (int i = 0; i < drops.Count; i++)
            {
                TryCollect(drops[i], sourceId);
            }
        }

        private void PublishDropped(string lootTableId, LootResult result)
        {
            if (result.Drops.Count == 0)
            {
                return;
            }

            var dropped = new LootDropped(lootTableId, ItemRarityIds.ToId(result.BestRarity));
            _eventBus.Publish(in dropped);
        }

        private float PlayerLuck()
        {
            StatCollection stats = _inventory.PlayerStats;
            return stats != null ? stats.Get(StatId.Luck) : 0f;
        }

        private void RaiseChestsChanged()
        {
            Action handler = ChestsChanged;
            if (handler != null)
            {
                handler();
            }
        }
    }
}
