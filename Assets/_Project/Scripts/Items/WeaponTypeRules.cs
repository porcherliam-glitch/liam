namespace Aetherfall.Items
{
    /// <summary>
    /// Base values per weapon type (GDD 04 4.2 "Basis_Typ bei iLvl 1", weights; GDD 03 5.1 tempo; GDD 04 8.6 value
    /// category V_Kat) and the slot each type fits. Used by the test ground menu to fill item assets and by tests.
    /// </summary>
    public static class WeaponTypeRules
    {
        /// <summary>
        /// Basis_Typ at item level 1: weapon damage W (staff and spellbook: spell power; shield: armor). One-handed sword 20
        /// (canon of GDD 03), two-handed sword 30, daggers 13, axe 22, mace 21, war hammer 34, spear 23, fist weapons 12,
        /// bow 18, crossbow 29, staff 20, spellbook 12, shield 6.
        /// </summary>
        /// <param name="type">Weapon type.</param>
        public static float BaseValue(WeaponType type)
        {
            switch (type)
            {
                case WeaponType.OneHandedSword: return 20f;
                case WeaponType.TwoHandedSword: return 30f;
                case WeaponType.Daggers: return 13f;
                case WeaponType.Axe: return 22f;
                case WeaponType.Mace: return 21f;
                case WeaponType.WarHammer: return 34f;
                case WeaponType.Spear: return 23f;
                case WeaponType.FistWeapons: return 12f;
                case WeaponType.Bow: return 18f;
                case WeaponType.Crossbow: return 29f;
                case WeaponType.Staff: return 20f;
                case WeaponType.Spellbook: return 12f;
                case WeaponType.Shield: return 6f;
                default: return 0f;
            }
        }

        /// <summary>Weight in kg (GDD 04 4.2; shield: wooden 4 kg).</summary>
        /// <param name="type">Weapon type.</param>
        public static float Weight(WeaponType type)
        {
            switch (type)
            {
                case WeaponType.OneHandedSword: return 2.5f;
                case WeaponType.TwoHandedSword: return 5f;
                case WeaponType.Daggers: return 1f;
                case WeaponType.Axe: return 3f;
                case WeaponType.Mace: return 3.5f;
                case WeaponType.WarHammer: return 7f;
                case WeaponType.Spear: return 4f;
                case WeaponType.FistWeapons: return 1.5f;
                case WeaponType.Bow: return 1.5f;
                case WeaponType.Crossbow: return 4f;
                case WeaponType.Staff: return 2f;
                case WeaponType.Spellbook: return 1.5f;
                case WeaponType.Shield: return 4f;
                default: return 0f;
            }
        }

        /// <summary>Slot kind of the type: one-handed (sword, axe, mace), two-handed or paired, off hand (shield, book), ranged.</summary>
        /// <param name="type">Weapon type.</param>
        public static EquipKind EquipKindOf(WeaponType type)
        {
            switch (type)
            {
                case WeaponType.OneHandedSword:
                case WeaponType.Axe:
                case WeaponType.Mace:
                    return EquipKind.OneHanded;
                case WeaponType.TwoHandedSword:
                case WeaponType.Daggers:
                case WeaponType.WarHammer:
                case WeaponType.Spear:
                case WeaponType.FistWeapons:
                case WeaponType.Staff:
                    return EquipKind.TwoHanded;
                case WeaponType.Bow:
                case WeaponType.Crossbow:
                    return EquipKind.Ranged;
                case WeaponType.Spellbook:
                case WeaponType.Shield:
                    return EquipKind.OffHand;
                default:
                    return EquipKind.None;
            }
        }

        /// <summary>Value category V_Kat (GDD 04 8.6): one-handed 40, two-handed 55, ranged 45, shield 35, spellbook 40.</summary>
        /// <param name="type">Weapon type.</param>
        public static float ValueCategory(WeaponType type)
        {
            switch (EquipKindOf(type))
            {
                case EquipKind.OneHanded: return 40f;
                case EquipKind.TwoHanded: return 55f;
                case EquipKind.Ranged: return 45f;
                case EquipKind.OffHand: return type == WeaponType.Shield ? 35f : 40f;
                default: return 0f;
            }
        }

        /// <summary>Tempo of a light hit in ms (GDD 03 5.1; bow: full draw, crossbow: cycle).</summary>
        /// <param name="type">Weapon type.</param>
        public static int TempoMilliseconds(WeaponType type)
        {
            switch (type)
            {
                case WeaponType.OneHandedSword: return 450;
                case WeaponType.TwoHandedSword: return 750;
                case WeaponType.Daggers: return 280;
                case WeaponType.Axe: return 550;
                case WeaponType.Mace: return 600;
                case WeaponType.WarHammer: return 900;
                case WeaponType.Spear: return 520;
                case WeaponType.FistWeapons: return 300;
                case WeaponType.Bow: return 800;
                case WeaponType.Crossbow: return 1400;
                case WeaponType.Staff: return 500;
                case WeaponType.Spellbook: return 600;
                default: return 0;
            }
        }

        /// <summary>True for melee weapon types (affix slot code WN).</summary>
        /// <param name="type">Weapon type.</param>
        public static bool IsMelee(WeaponType type)
        {
            switch (type)
            {
                case WeaponType.OneHandedSword:
                case WeaponType.TwoHandedSword:
                case WeaponType.Daggers:
                case WeaponType.Axe:
                case WeaponType.Mace:
                case WeaponType.WarHammer:
                case WeaponType.Spear:
                case WeaponType.FistWeapons:
                    return true;
                default:
                    return false;
            }
        }

        /// <summary>True for staff and spellbook (affix slot code WM, base value is spell power).</summary>
        /// <param name="type">Weapon type.</param>
        public static bool IsMagic(WeaponType type)
        {
            return type == WeaponType.Staff || type == WeaponType.Spellbook;
        }

        /// <summary>German name for debug views. TODO (localization step): string table key.</summary>
        /// <param name="type">Weapon type.</param>
        public static string GermanName(WeaponType type)
        {
            switch (type)
            {
                case WeaponType.OneHandedSword: return "Einhandschwert";
                case WeaponType.TwoHandedSword: return "Zweihandschwert";
                case WeaponType.Daggers: return "Dolche";
                case WeaponType.Axe: return "Axt";
                case WeaponType.Mace: return "Einhand-Streitkolben";
                case WeaponType.WarHammer: return "Zweihand-Hammer";
                case WeaponType.Spear: return "Speer";
                case WeaponType.FistWeapons: return "Faustwaffen";
                case WeaponType.Bow: return "Bogen";
                case WeaponType.Crossbow: return "Armbrust";
                case WeaponType.Staff: return "Zauberstab";
                case WeaponType.Spellbook: return "Zauberbuch";
                case WeaponType.Shield: return "Schild";
                default: return "–";
            }
        }
    }
}
