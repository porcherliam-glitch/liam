using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Stats;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary>
    /// Test data of the inventory tests, built like the test ground (GDD 03 11.2, GDD 04 4.2): weapons, plate and leather
    /// pieces, a ring, potion (stack 20), wolf fur (stack 99), the 25 kg ballast stone, two affixes, the wolf loot table and a
    /// chest table; plus the warrior's starting kit (rare sword and wooden shield, plate chest, leather boots, 3 potions).
    /// </summary>
    public static class InventoryTestItems
    {
        /// <summary>Iron one-handed sword.</summary>
        public const string Sword = "item.weapon.einhandschwert_eisen";

        /// <summary>Iron two-handed sword.</summary>
        public const string TwoHandedSword = "item.weapon.zweihandschwert_eisen";

        /// <summary>Wooden shield.</summary>
        public const string WoodenShield = "item.weapon.holzschild";

        /// <summary>Plate chest (10 kg).</summary>
        public const string PlateChest = "item.armor.plattenharnisch";

        /// <summary>Plate legs.</summary>
        public const string PlateLegs = "item.armor.plattenbeinschienen";

        /// <summary>Iron helmet.</summary>
        public const string IronHelmet = "item.armor.eisenhelm";

        /// <summary>Leather boots.</summary>
        public const string LeatherBoots = "item.armor.lederstiefel";

        /// <summary>Iron ring.</summary>
        public const string IronRing = "item.trinket.eisenring";

        /// <summary>Small healing potion.</summary>
        public const string Potion = "item.potion.heiltrank_schwach";

        /// <summary>Wolf fur.</summary>
        public const string WolfFur = "item.material.wolfsfell";

        /// <summary>Developer ballast stone (25 kg, stack 10).</summary>
        public const string Ballast = "item.misc.ballaststein";

        /// <summary>Loot table of the grey wolf (fur guaranteed, gold or nothing).</summary>
        public const string WolfTable = "loot.enemy.wolf.grauwolf";

        /// <summary>Loot table of the test chest (gold and one item of equipment).</summary>
        public const string ChestTable = "loot.chest.holz";

        /// <summary>Prefix "Vital" (+max. health).</summary>
        public const string Vital = "affix.vital";

        /// <summary>Suffix "der Standhaftigkeit" (+poise).</summary>
        public const string Steadfast = "affix.standhaftigkeit";

        /// <summary>Creates the catalog.</summary>
        public static ItemCatalog CreateCatalog()
        {
            var catalog = new ItemCatalog();
            Add(catalog.AddItem(Weapon(Sword, WeaponType.OneHandedSword)));
            Add(catalog.AddItem(Weapon(TwoHandedSword, WeaponType.TwoHandedSword)));
            Add(catalog.AddItem(Weapon(WoodenShield, WeaponType.Shield)));
            Add(catalog.AddItem(Armor(PlateChest, EquipKind.Chest, ArmorClass.Heavy)));
            Add(catalog.AddItem(Armor(PlateLegs, EquipKind.Legs, ArmorClass.Heavy)));
            Add(catalog.AddItem(Armor(IronHelmet, EquipKind.Head, ArmorClass.Heavy)));
            Add(catalog.AddItem(Armor(LeatherBoots, EquipKind.Feet, ArmorClass.Medium)));
            Add(catalog.AddItem(new ItemSpec
            {
                Id = IronRing, DisplayName = "Eisenring", Category = ItemCategory.Jewelry, EquipKind = EquipKind.Ring, Weight = 0.1f, Value = 50f,
                ImplicitStat = StatId.Armor, ImplicitAtLevel1 = 2f, ImplicitAtLevel80 = 30f, RandomDrop = true
            }));
            Add(catalog.AddItem(Simple(Potion, ItemCategory.Consumable, EquipKind.QuickUse, 20, 0.3f)));
            Add(catalog.AddItem(Simple(WolfFur, ItemCategory.Material, EquipKind.None, 99, 1f)));
            Add(catalog.AddItem(Simple(Ballast, ItemCategory.Misc, EquipKind.None, 10, 25f)));
            Add(catalog.AddAffix(new AffixSpec
            {
                Id = Vital, Kind = AffixKind.Prefix, FamilyId = "leben", Stat = StatId.MaxHealth, TierOneMin = 10, TierOneMax = 15, TierSixMin = 160,
                TierSixMax = 220, AllowedSlots = AffixSlots.AllArmor | AffixSlots.Shield | AffixSlots.Ring | AffixSlots.Amulet
            }));
            Add(catalog.AddAffix(new AffixSpec
            {
                Id = Steadfast, Kind = AffixKind.Suffix, FamilyId = "standfestigkeit", Stat = StatId.Poise, TierOneMin = 2, TierOneMax = 3,
                TierSixMin = 12, TierSixMax = 16, AllowedSlots = AffixSlots.Chest | AffixSlots.Legs | AffixSlots.Feet | AffixSlots.Shield
            }));

            var wolf = new LootTableSpec { Id = WolfTable, MinRolls = 1, MaxRolls = 1 };
            wolf.Entries.Add(new LootEntrySpec { Kind = LootEntryKind.Item, RefId = WolfFur, Weight = 0, Flags = LootEntryFlags.Guaranteed });
            wolf.Entries.Add(new LootEntrySpec { Kind = LootEntryKind.Gold, Weight = 100, GoldFactorMin = 0.05f, GoldFactorMax = 0.15f });
            wolf.Entries.Add(new LootEntrySpec { Kind = LootEntryKind.Equipment, Weight = 100 });
            Add(catalog.AddLootTable(wolf));

            var chest = new LootTableSpec { Id = ChestTable, MinRolls = 0, MaxRolls = 0 };
            chest.Entries.Add(new LootEntrySpec { Kind = LootEntryKind.Gold, Weight = 0, GoldFactorMin = 0.25f, GoldFactorMax = 0.25f, Flags = LootEntryFlags.Guaranteed });
            chest.Entries.Add(new LootEntrySpec { Kind = LootEntryKind.Equipment, Weight = 0, Flags = LootEntryFlags.Guaranteed });
            Add(catalog.AddLootTable(chest));
            return catalog;
        }

        /// <summary>The warrior's starting kit of the test ground (item level 10).</summary>
        public static StartingKitItem[] WarriorKit()
        {
            return new[]
            {
                new StartingKitItem(Sword, 1, 10, ItemRarity.Rare, EquipmentSlot.MainHand),
                new StartingKitItem(WoodenShield, 1, 10, ItemRarity.Common, EquipmentSlot.OffHand),
                new StartingKitItem(PlateChest, 1, 10, ItemRarity.Common, EquipmentSlot.Chest),
                new StartingKitItem(LeatherBoots, 1, 10, ItemRarity.Common, EquipmentSlot.Feet),
                new StartingKitItem(Potion, 3, 1, ItemRarity.Common, EquipmentSlot.QuickSlot1)
            };
        }

        private static ItemSpec Weapon(string id, WeaponType type)
        {
            return new ItemSpec
            {
                Id = id, DisplayName = id, Category = ItemCategory.Weapon, EquipKind = WeaponTypeRules.EquipKindOf(type), WeaponType = type,
                Weight = WeaponTypeRules.Weight(type), Value = WeaponTypeRules.ValueCategory(type), BaseStat = WeaponTypeRules.BaseValue(type),
                RandomDrop = true
            };
        }

        private static ItemSpec Armor(string id, EquipKind kind, ArmorClass armorClass)
        {
            return new ItemSpec
            {
                Id = id, DisplayName = id, Category = ItemCategory.Armor, EquipKind = kind, ArmorClass = armorClass, Weight = ArmorRules.Weight(kind, armorClass),
                Value = ArmorRules.ValueCategory(kind), BaseStat = ArmorRules.BaseArmor(kind, armorClass), RandomDrop = true
            };
        }

        private static ItemSpec Simple(string id, ItemCategory category, EquipKind kind, int stackSize, float weight)
        {
            return new ItemSpec { Id = id, DisplayName = id, Category = category, EquipKind = kind, StackSize = stackSize, Weight = weight, Value = 1f };
        }

        private static void Add(string problem)
        {
            if (!string.IsNullOrEmpty(problem))
            {
                throw new System.InvalidOperationException("Inventory test catalog: " + problem);
            }
        }
    }
}
