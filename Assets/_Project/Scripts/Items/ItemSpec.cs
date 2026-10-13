using Aetherfall.Stats;

namespace Aetherfall.Items
{
    /// <summary>
    /// Plain data of an item definition (built from <see cref="ItemDefinition"/> or in tests, like the combat specs): id,
    /// name, category, slot kind, weapon type and armor class, weight, stack size, value, base rarity, fixed item level, base
    /// value (weapon damage, spell power or armor at item level 1), implicit stat, quest flag, random drop pool and the block
    /// values of shields. Pure C#, read-only by convention after creation.
    /// </summary>
    public sealed class ItemSpec
    {
        /// <summary>Item id, e.g. <c>item.weapon.einhandschwert_eisen</c>.</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>German base name, e.g. "Eisernes Einhandschwert". TODO (localization step): LocalizedString.</summary>
        public string DisplayName { get; set; } = string.Empty;

        /// <summary>Inventory category.</summary>
        public ItemCategory Category { get; set; }

        /// <summary>Slot kind (<see cref="EquipKind.None"/> = not equippable).</summary>
        public EquipKind EquipKind { get; set; }

        /// <summary>Weapon type (weapons and shields), otherwise <see cref="WeaponType.None"/>.</summary>
        public WeaponType WeaponType { get; set; }

        /// <summary>Armor class of armor pieces (cloak: <see cref="ArmorClass.None"/>).</summary>
        public ArmorClass ArmorClass { get; set; }

        /// <summary>Weight of one piece in kg (quest items 0, GDD 04 1.3).</summary>
        public float Weight { get; set; }

        /// <summary>Stack size (1 = single instance; potions 20, materials 99, GDD 04 1.1).</summary>
        public int StackSize { get; set; } = 1;

        /// <summary>Value: V_Kat for equipment (scaled with level and rarity, GDD 04 8.6), flat gold value for everything else.</summary>
        public float Value { get; set; }

        /// <summary>Rarity of fixed (not randomly generated) pieces, e.g. materials common.</summary>
        public ItemRarity BaseRarity { get; set; }

        /// <summary>Fixed item level (quest rewards, named items); 0 = the source decides (GDD 04 4.1).</summary>
        public int FixedItemLevel { get; set; }

        /// <summary>Basis_Typ at item level 1: weapon damage W, spell power (staff, book) or armor (armor, shield).</summary>
        public float BaseStat { get; set; }

        /// <summary>Implicit stat (jewelry, leather and cloth pieces, GDD 04 4.2); <see cref="StatId.None"/> = none.</summary>
        public StatId ImplicitStat { get; set; }

        /// <summary>Modifier kind of the implicit.</summary>
        public StatModifierKind ImplicitKind { get; set; }

        /// <summary>Factor from display units of the implicit to the modifier value (0.01 for percent on fraction stats).</summary>
        public float ImplicitScale { get; set; } = 1f;

        /// <summary>Implicit value at item level 1 (display units).</summary>
        public float ImplicitAtLevel1 { get; set; }

        /// <summary>Implicit value at item level 80 (display units).</summary>
        public float ImplicitAtLevel80 { get; set; }

        /// <summary>German implicit text with <c>{0}</c>, e.g. "+{0} Ruestung" (German text with umlauts).</summary>
        public string ImplicitText { get; set; } = string.Empty;

        /// <summary>True for quest items: 0 kg, not sellable, not droppable (GDD 04 1.8).</summary>
        public bool IsQuestItem { get; set; }

        /// <summary>True if the item is in the random equipment pool of the loot generator.</summary>
        public bool RandomDrop { get; set; }

        /// <summary>Weight within its group of the random equipment pool (default 100).</summary>
        public int DropWeight { get; set; } = 100;

        /// <summary>Shield: covered angle in degrees (wooden shield 150), 0 for other items.</summary>
        public float BlockAngle { get; set; }

        /// <summary>Shield: physical damage reduction (wooden 0.8).</summary>
        public float BlockPhysical { get; set; }

        /// <summary>Shield: elemental damage reduction (wooden 0.2).</summary>
        public float BlockElemental { get; set; }

        /// <summary>Shield: stability (wooden 0.4).</summary>
        public float BlockStability { get; set; }

        /// <summary>True if several pieces share one stack.</summary>
        public bool IsStackable => StackSize > 1;

        /// <summary>True for items of the equipment slots (not the quick slots).</summary>
        public bool IsEquipment => EquipKind != EquipKind.None && EquipKind != EquipKind.QuickUse;

        /// <summary>True for shields.</summary>
        public bool IsShield => WeaponType == WeaponType.Shield;

        /// <summary>True for weapons that deal weapon damage or carry spell power (not shields).</summary>
        public bool IsWeapon => WeaponType != WeaponType.None && WeaponType != WeaponType.Shield;

        /// <summary>True if the base stat is armor (armor pieces, cloaks, shields).</summary>
        public bool GivesArmor => Category == ItemCategory.Armor || IsShield;

        /// <summary>Group in the random equipment pool.</summary>
        public EquipmentGroup Group
        {
            get
            {
                switch (Category)
                {
                    case ItemCategory.Weapon: return EquipmentGroup.Weapon;
                    case ItemCategory.Armor: return EquipmentGroup.Armor;
                    case ItemCategory.Jewelry: return EquipmentGroup.Jewelry;
                    default: return EquipmentGroup.None;
                }
            }
        }

        /// <summary>Affix slot code of this item (GDD 04 4.4); <see cref="AffixSlots.None"/> if no affix can roll on it.</summary>
        public AffixSlots AffixSlot
        {
            get
            {
                switch (EquipKind)
                {
                    case EquipKind.Head: return AffixSlots.Head;
                    case EquipKind.Chest: return AffixSlots.Chest;
                    case EquipKind.Hands: return AffixSlots.Hands;
                    case EquipKind.Legs: return AffixSlots.Legs;
                    case EquipKind.Feet: return AffixSlots.Feet;
                    case EquipKind.Cloak: return AffixSlots.Cloak;
                    case EquipKind.Ring: return AffixSlots.Ring;
                    case EquipKind.Amulet: return AffixSlots.Amulet;
                }

                if (IsShield)
                {
                    return AffixSlots.Shield;
                }

                if (WeaponTypeRules.IsMagic(WeaponType))
                {
                    return AffixSlots.MagicWeapon;
                }

                if (WeaponType == WeaponType.Bow || WeaponType == WeaponType.Crossbow)
                {
                    return AffixSlots.RangedWeapon;
                }

                return WeaponTypeRules.IsMelee(WeaponType) ? AffixSlots.MeleeWeapon : AffixSlots.None;
            }
        }

        /// <summary>Returns an error text if the data is unusable, otherwise an empty string.</summary>
        public string Validate()
        {
            if (string.IsNullOrEmpty(Id))
            {
                return "Item without id.";
            }

            if (Category == ItemCategory.None)
            {
                return "Item '" + Id + "' has no category.";
            }

            if (StackSize < 1 || Weight < 0f || Value < 0f)
            {
                return "Item '" + Id + "': stack size must be at least 1, weight and value 0 or more.";
            }

            if (IsEquipment && IsStackable)
            {
                return "Item '" + Id + "': equipment cannot be stackable.";
            }

            return string.Empty;
        }
    }
}
