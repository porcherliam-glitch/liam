using Aetherfall.Items;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Rules of automatic pickup (GDD 04 5.9): radius gold 5 m (magnet), everything else 3 m; never stolen goods; from 90 %
    /// load only gold, quest items and keys; in combat gold and materials, equipment only after the fight; mode "Gold und
    /// Materialien" (default) or "Alles" with a minimum rarity for equipment (default uncommon). Pure function.
    /// </summary>
    public static class AutoPickupRules
    {
        /// <summary>Magnet radius of gold in metres.</summary>
        public const float GoldRadius = 5f;

        /// <summary>Radius of all other items in metres.</summary>
        public const float ItemRadius = 3f;

        /// <summary>Id prefix of keys (picked up even when almost full).</summary>
        public const string KeyPrefix = "item.key.";

        /// <summary>Radius in which a drop may be collected automatically.</summary>
        /// <param name="drop">Drop.</param>
        public static float RadiusFor(in LootDrop drop)
        {
            return drop.IsCurrency ? GoldRadius : ItemRadius;
        }

        /// <summary>True if the drop is collected automatically.</summary>
        /// <param name="mode">Option.</param>
        /// <param name="drop">Drop lying in the world.</param>
        /// <param name="spec">Item data (null for currency).</param>
        /// <param name="distance">Distance to the player in metres.</param>
        /// <param name="load">Current load stage.</param>
        /// <param name="inCombat">True while the player is in combat.</param>
        /// <param name="minEquipmentRarity">Mode "All": equipment from this rarity on.</param>
        public static bool ShouldCollect(AutoPickupMode mode, in LootDrop drop, ItemSpec spec, float distance, EncumbranceLevel load, bool inCombat,
            ItemRarity minEquipmentRarity = ItemRarity.Uncommon)
        {
            if (mode == AutoPickupMode.Off || distance > RadiusFor(drop))
            {
                return false;
            }

            if (drop.IsCurrency)
            {
                return true;
            }

            ItemInstance item = drop.Item;
            if (spec == null || item.IsStolen)
            {
                return false;
            }

            if (load >= EncumbranceLevel.AlmostFull)
            {
                return spec.IsQuestItem || spec.Id.StartsWith(KeyPrefix, System.StringComparison.Ordinal);
            }

            if (spec.Category == ItemCategory.Material)
            {
                return true;
            }

            if (mode != AutoPickupMode.All)
            {
                return false;
            }

            if (spec.IsEquipment)
            {
                return !inCombat && RarityRules.Rank(item.Rarity) >= RarityRules.Rank(minEquipmentRarity);
            }

            return true;
        }
    }
}
