using Aetherfall.Items;
using Aetherfall.Stats;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Test data of the item and loot tests, built like the test ground assets (GDD 04 4.2/4.4): iron one- and two-handed
    /// sword, wooden shield, plate, leather and a cloak, an iron ring, the small healing potion, wolf fur and 14 affixes of
    /// the GDD pool (incl. "Lodernd", "des Blutegels" / "der Dornen" with their exclusion, three resistances).
    /// </summary>
    public static class ItemTestCatalog
    {
        /// <summary>Iron one-handed sword (base 20).</summary>
        public const string Sword = "item.weapon.einhandschwert_eisen";

        /// <summary>Iron two-handed sword (base 30).</summary>
        public const string TwoHandedSword = "item.weapon.zweihandschwert_eisen";

        /// <summary>Wooden shield (armor 6).</summary>
        public const string WoodenShield = "item.weapon.holzschild";

        /// <summary>Plate chest (armor 9, 10 kg).</summary>
        public const string PlateChest = "item.armor.plattenharnisch";

        /// <summary>Plate legs (armor 6).</summary>
        public const string PlateLegs = "item.armor.plattenbeinschienen";

        /// <summary>Iron helmet (armor 5).</summary>
        public const string IronHelmet = "item.armor.eisenhelm";

        /// <summary>Leather gloves (armor 2).</summary>
        public const string LeatherGloves = "item.armor.lederhandschuhe";

        /// <summary>Leather boots (armor 3).</summary>
        public const string LeatherBoots = "item.armor.lederstiefel";

        /// <summary>Wool cloak (armor 1, no class).</summary>
        public const string WoolCloak = "item.armor.wollumhang";

        /// <summary>Iron ring (implicit armor 2 to 30).</summary>
        public const string IronRing = "item.trinket.eisenring";

        /// <summary>Small healing potion (stack 20).</summary>
        public const string Potion = "item.potion.heiltrank_schwach";

        /// <summary>Wolf fur (stack 99, 1 kg).</summary>
        public const string WolfFur = "item.material.wolfsfell";

        /// <summary>Prefix "Scharf" (weapon damage 5–8 / 25–35 %).</summary>
        public const string Sharp = "affix.scharf";

        /// <summary>Prefix "Lodernd" (4–6 / 16–22 %).</summary>
        public const string Blazing = "affix.lodernd";

        /// <summary>Prefix "Grausam".</summary>
        public const string Cruel = "affix.grausam";

        /// <summary>Prefix "Gepanzert" (3–5 / 60–80).</summary>
        public const string Armored = "affix.gepanzert";

        /// <summary>Prefix "Vital" (10–15 / 160–220).</summary>
        public const string Vital = "affix.vital";

        /// <summary>Suffix "des Blutegels" (excludes "der Dornen").</summary>
        public const string Leech = "affix.blutegel";

        /// <summary>Suffix "der Dornen".</summary>
        public const string Thorns = "affix.dornen";

        /// <summary>Suffix "des Feuerschutzes" (resistance family, limit 2).</summary>
        public const string FireWard = "affix.feuerschutz";

        /// <summary>Suffix "der Eiswehr" (resistance family).</summary>
        public const string IceWard = "affix.eiswehr";

        /// <summary>Suffix "des Blitzableiters" (resistance family).</summary>
        public const string LightningWard = "affix.blitzableiter";

        /// <summary>Suffix "der Ausdauer".</summary>
        public const string Endurance = "affix.ausdauer";

        /// <summary>Suffix "der Standhaftigkeit".</summary>
        public const string Steadfast = "affix.standhaftigkeit";

        /// <summary>Suffix "der Staerke" (attribute family).</summary>
        public const string Strength = "affix.staerke";

        /// <summary>Suffix "des Gluecks".</summary>
        public const string Luck = "affix.glueck";

        /// <summary>Creates a catalog with all items and affixes (no loot tables).</summary>
        public static ItemCatalog Create()
        {
            var catalog = new ItemCatalog();
            ItemSpec[] items =
            {
                Weapon(Sword, WeaponType.OneHandedSword), Weapon(TwoHandedSword, WeaponType.TwoHandedSword), Weapon(WoodenShield, WeaponType.Shield),
                Armor(PlateChest, EquipKind.Chest, ArmorClass.Heavy), Armor(PlateLegs, EquipKind.Legs, ArmorClass.Heavy),
                Armor(IronHelmet, EquipKind.Head, ArmorClass.Heavy), Armor(LeatherGloves, EquipKind.Hands, ArmorClass.Medium),
                Armor(LeatherBoots, EquipKind.Feet, ArmorClass.Medium), Armor(WoolCloak, EquipKind.Cloak, ArmorClass.None), Ring(IronRing),
                Simple(Potion, ItemCategory.Consumable, EquipKind.QuickUse, 20, 0.3f, 30f), Simple(WolfFur, ItemCategory.Material, EquipKind.None, 99, 1f, 4f)
            };
            for (int i = 0; i < items.Length; i++)
            {
                Expect(catalog.AddItem(items[i]));
            }

            AffixSlots weapons = AffixSlots.AllWeapons;
            AffixSlots jewelry = AffixSlots.Ring | AffixSlots.Amulet;
            AffixSpec[] affixes =
            {
                Affix(Sharp, AffixKind.Prefix, "waffenschaden", StatId.DamageBonus, 5, 8, 25, 35, AffixSlots.MeleeWeapon | AffixSlots.RangedWeapon),
                Affix(Blazing, AffixKind.Prefix, "element_zusatz", StatId.None, 4, 6, 16, 22, weapons),
                Affix(Cruel, AffixKind.Prefix, "krit_schaden", StatId.CritDamage, 5, 8, 25, 35, weapons | AffixSlots.Hands | jewelry),
                Affix(Armored, AffixKind.Prefix, "ruestung", StatId.Armor, 3, 5, 60, 80, AffixSlots.AllArmor | AffixSlots.Shield),
                Affix(Vital, AffixKind.Prefix, "leben", StatId.MaxHealth, 10, 15, 160, 220, AffixSlots.AllArmor | AffixSlots.Shield | jewelry),
                Affix(Leech, AffixKind.Suffix, "lebensraub", StatId.None, 1, 2, 12, 18, AffixSlots.MeleeWeapon | AffixSlots.Hands, 1, Thorns),
                Affix(Thorns, AffixKind.Suffix, "dornen", StatId.None, 5, 8, 20, 30, AffixSlots.Chest | AffixSlots.Shield),
                Affix(FireWard, AffixKind.Suffix, "resistenz", StatId.ResistFire, 3, 5, 15, 20, AffixSlots.AllArmor | AffixSlots.Shield | jewelry, 2),
                Affix(IceWard, AffixKind.Suffix, "resistenz", StatId.ResistIce, 3, 5, 15, 20, AffixSlots.AllArmor | AffixSlots.Shield | jewelry, 2),
                Affix(LightningWard, AffixKind.Suffix, "resistenz", StatId.ResistLightning, 3, 5, 15, 20, AffixSlots.AllArmor | AffixSlots.Shield | jewelry, 2),
                Affix(Endurance, AffixKind.Suffix, "ausdauer", StatId.MaxStamina, 3, 5, 20, 28, AffixSlots.Chest | AffixSlots.Legs | AffixSlots.Feet | AffixSlots.Cloak),
                Affix(Steadfast, AffixKind.Suffix, "standfestigkeit", StatId.Poise, 2, 3, 12, 16, AffixSlots.Chest | AffixSlots.Legs | AffixSlots.Feet | AffixSlots.Shield),
                Affix(Strength, AffixKind.Suffix, "attribut", StatId.Strength, 1, 1, 5, 6, AffixSlots.Head | AffixSlots.Chest | AffixSlots.Legs | jewelry),
                Affix(Luck, AffixKind.Suffix, "glueck", StatId.Luck, 2, 3, 10, 14, AffixSlots.Head | AffixSlots.Cloak | jewelry)
            };
            for (int i = 0; i < affixes.Length; i++)
            {
                Expect(catalog.AddAffix(affixes[i]));
            }

            return catalog;
        }

        /// <summary>A weapon or shield with the base values of GDD 04 4.2.</summary>
        /// <param name="id">Item id.</param>
        /// <param name="type">Weapon type.</param>
        public static ItemSpec Weapon(string id, WeaponType type)
        {
            return new ItemSpec
            {
                Id = id,
                DisplayName = id,
                Category = ItemCategory.Weapon,
                EquipKind = WeaponTypeRules.EquipKindOf(type),
                WeaponType = type,
                Weight = WeaponTypeRules.Weight(type),
                Value = WeaponTypeRules.ValueCategory(type),
                BaseStat = WeaponTypeRules.BaseValue(type),
                RandomDrop = true,
                DropWeight = 100
            };
        }

        /// <summary>An armor piece with base armor and weight of GDD 04 4.2.</summary>
        /// <param name="id">Item id.</param>
        /// <param name="kind">Slot kind.</param>
        /// <param name="armorClass">Armor class.</param>
        public static ItemSpec Armor(string id, EquipKind kind, ArmorClass armorClass)
        {
            return new ItemSpec
            {
                Id = id,
                DisplayName = id,
                Category = ItemCategory.Armor,
                EquipKind = kind,
                ArmorClass = armorClass,
                Weight = ArmorRules.Weight(kind, armorClass),
                Value = ArmorRules.ValueCategory(kind),
                BaseStat = ArmorRules.BaseArmor(kind, armorClass),
                RandomDrop = true,
                DropWeight = 100
            };
        }

        /// <summary>A ring with the implicit "+2 → +30 armor".</summary>
        /// <param name="id">Item id.</param>
        public static ItemSpec Ring(string id)
        {
            return new ItemSpec
            {
                Id = id,
                DisplayName = id,
                Category = ItemCategory.Jewelry,
                EquipKind = EquipKind.Ring,
                Weight = 0.1f,
                Value = ArmorRules.ValueCategory(EquipKind.Ring),
                ImplicitStat = StatId.Armor,
                ImplicitKind = StatModifierKind.Flat,
                ImplicitAtLevel1 = 2f,
                ImplicitAtLevel80 = 30f,
                RandomDrop = true,
                DropWeight = 100
            };
        }

        /// <summary>A non-equipment item.</summary>
        /// <param name="id">Item id.</param>
        /// <param name="category">Category.</param>
        /// <param name="kind">Equip kind (QuickUse for consumables).</param>
        /// <param name="stackSize">Stack size.</param>
        /// <param name="weight">Weight per piece.</param>
        /// <param name="value">Value per piece.</param>
        public static ItemSpec Simple(string id, ItemCategory category, EquipKind kind, int stackSize, float weight, float value)
        {
            return new ItemSpec
            {
                Id = id,
                DisplayName = id,
                Category = category,
                EquipKind = kind,
                StackSize = stackSize,
                Weight = weight,
                Value = value
            };
        }

        /// <summary>An affix with the ranges of tier I and VI.</summary>
        /// <param name="id">Affix id.</param>
        /// <param name="kind">Prefix or suffix.</param>
        /// <param name="family">Family id.</param>
        /// <param name="stat">Stat (None = effect without stat yet).</param>
        /// <param name="oneMin">Tier I lower bound.</param>
        /// <param name="oneMax">Tier I upper bound.</param>
        /// <param name="sixMin">Tier VI lower bound.</param>
        /// <param name="sixMax">Tier VI upper bound.</param>
        /// <param name="slots">Allowed slots.</param>
        /// <param name="familyLimit">Affixes of the family per item.</param>
        /// <param name="excluded">Affix ids that never appear together with this one.</param>
        public static AffixSpec Affix(string id, AffixKind kind, string family, StatId stat, float oneMin, float oneMax, float sixMin, float sixMax,
            AffixSlots slots, int familyLimit = 1, params string[] excluded)
        {
            return new AffixSpec
            {
                Id = id,
                DisplayName = id,
                Kind = kind,
                FamilyId = family,
                FamilyLimit = familyLimit,
                Stat = stat,
                TierOneMin = oneMin,
                TierOneMax = oneMax,
                TierSixMin = sixMin,
                TierSixMax = sixMax,
                AllowedSlots = slots,
                ExcludedAffixIds = excluded ?? new string[0]
            };
        }

        /// <summary>A weighted loot entry.</summary>
        /// <param name="kind">Entry kind.</param>
        /// <param name="weight">Weight.</param>
        /// <param name="refId">Item, table or currency id.</param>
        /// <param name="min">Minimum count.</param>
        /// <param name="max">Maximum count.</param>
        public static LootEntrySpec Entry(LootEntryKind kind, int weight, string refId = "", int min = 1, int max = 1)
        {
            return new LootEntrySpec { Kind = kind, Weight = weight, RefId = refId ?? string.Empty, MinCount = min, MaxCount = max };
        }

        /// <summary>A loot table.</summary>
        /// <param name="id">Table id.</param>
        /// <param name="minRolls">Minimum rolls.</param>
        /// <param name="maxRolls">Maximum rolls.</param>
        /// <param name="entries">Entries.</param>
        public static LootTableSpec Table(string id, int minRolls, int maxRolls, params LootEntrySpec[] entries)
        {
            var table = new LootTableSpec { Id = id, MinRolls = minRolls, MaxRolls = maxRolls };
            table.Entries.AddRange(entries);
            return table;
        }

        private static void Expect(string problem)
        {
            if (!string.IsNullOrEmpty(problem))
            {
                throw new System.InvalidOperationException("Test catalog: " + problem);
            }
        }
    }
}
