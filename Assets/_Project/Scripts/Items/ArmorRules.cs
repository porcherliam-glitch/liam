using System;

namespace Aetherfall.Items
{
    /// <summary>
    /// Armor tables of GDD 04 4.2 (base armor at item level 1 and weight per slot and class), the value categories of
    /// GDD 04 8.6, the poise bonus of the armor class (GDD 03 4.9: light 0, medium 15, heavy 30) and the armor class rule
    /// (GDD 04 2.1: relative majority of head to feet, an empty slot counts as light, a tie goes to the heavier class).
    /// </summary>
    public static class ArmorRules
    {
        /// <summary>
        /// Base armor at item level 1: head 5/3/2, chest 9/6/3, hands 3/2/1, legs 6/4/2, feet 4/3/1 (plate/leather/cloth),
        /// cloak 1.
        /// </summary>
        /// <param name="kind">Armor slot kind (Head … Cloak).</param>
        /// <param name="armorClass">Armor class.</param>
        public static float BaseArmor(EquipKind kind, ArmorClass armorClass)
        {
            if (kind == EquipKind.Cloak)
            {
                return 1f;
            }

            int column = armorClass == ArmorClass.Heavy ? 0 : armorClass == ArmorClass.Medium ? 1 : 2;
            switch (kind)
            {
                case EquipKind.Head: return Pick(column, 5f, 3f, 2f);
                case EquipKind.Chest: return Pick(column, 9f, 6f, 3f);
                case EquipKind.Hands: return Pick(column, 3f, 2f, 1f);
                case EquipKind.Legs: return Pick(column, 6f, 4f, 2f);
                case EquipKind.Feet: return Pick(column, 4f, 3f, 1f);
                default: return 0f;
            }
        }

        /// <summary>Weight in kg: head 4.0/1.5/0.5, chest 10/4/1.5, hands 2.5/1.0/0.3, legs 7/3/1, feet 3.5/1.5/0.5, cloak 1.0.</summary>
        /// <param name="kind">Armor slot kind.</param>
        /// <param name="armorClass">Armor class.</param>
        public static float Weight(EquipKind kind, ArmorClass armorClass)
        {
            if (kind == EquipKind.Cloak)
            {
                return 1f;
            }

            int column = armorClass == ArmorClass.Heavy ? 0 : armorClass == ArmorClass.Medium ? 1 : 2;
            switch (kind)
            {
                case EquipKind.Head: return Pick(column, 4f, 1.5f, 0.5f);
                case EquipKind.Chest: return Pick(column, 10f, 4f, 1.5f);
                case EquipKind.Hands: return Pick(column, 2.5f, 1f, 0.3f);
                case EquipKind.Legs: return Pick(column, 7f, 3f, 1f);
                case EquipKind.Feet: return Pick(column, 3.5f, 1.5f, 0.5f);
                default: return 0f;
            }
        }

        /// <summary>Value category V_Kat (GDD 04 8.6): chest 40, legs 32, head 28, cloak 25, hands 22, feet 22, ring 50, amulet 70.</summary>
        /// <param name="kind">Slot kind.</param>
        public static float ValueCategory(EquipKind kind)
        {
            switch (kind)
            {
                case EquipKind.Chest: return 40f;
                case EquipKind.Legs: return 32f;
                case EquipKind.Head: return 28f;
                case EquipKind.Cloak: return 25f;
                case EquipKind.Hands: return 22f;
                case EquipKind.Feet: return 22f;
                case EquipKind.Ring: return 50f;
                case EquipKind.Amulet: return 70f;
                default: return 0f;
            }
        }

        /// <summary>Poise bonus of the armor class (GDD 03 4.9): light 0, medium 15, heavy 30.</summary>
        /// <param name="armorClass">Armor class.</param>
        public static float PoiseBonus(ArmorClass armorClass)
        {
            switch (armorClass)
            {
                case ArmorClass.Medium: return 15f;
                case ArmorClass.Heavy: return 30f;
                default: return 0f;
            }
        }

        /// <summary>
        /// Armor class of the character: relative majority of the five slots head to feet; an empty or classless slot
        /// counts as light; a tie goes to the heavier class (2 plate + 2 leather + 1 cloth = heavy).
        /// </summary>
        /// <param name="head">Class in the head slot (None = empty).</param>
        /// <param name="chest">Class in the chest slot.</param>
        /// <param name="hands">Class in the hands slot.</param>
        /// <param name="legs">Class in the legs slot.</param>
        /// <param name="feet">Class in the feet slot.</param>
        public static ArmorClass Resolve(ArmorClass head, ArmorClass chest, ArmorClass hands, ArmorClass legs, ArmorClass feet)
        {
            int light = 0;
            int medium = 0;
            int heavy = 0;
            Count(head, ref light, ref medium, ref heavy);
            Count(chest, ref light, ref medium, ref heavy);
            Count(hands, ref light, ref medium, ref heavy);
            Count(legs, ref light, ref medium, ref heavy);
            Count(feet, ref light, ref medium, ref heavy);
            int best = Math.Max(light, Math.Max(medium, heavy));
            if (heavy == best)
            {
                return ArmorClass.Heavy;
            }

            return medium == best ? ArmorClass.Medium : ArmorClass.Light;
        }

        /// <summary>German name: Stoff, Leder, Platte, klassenlos.</summary>
        /// <param name="armorClass">Armor class.</param>
        public static string GermanName(ArmorClass armorClass)
        {
            switch (armorClass)
            {
                case ArmorClass.Light: return "Stoff (leicht)";
                case ArmorClass.Medium: return "Leder (mittel)";
                case ArmorClass.Heavy: return "Platte (schwer)";
                default: return "klassenlos";
            }
        }

        private static void Count(ArmorClass value, ref int light, ref int medium, ref int heavy)
        {
            switch (value)
            {
                case ArmorClass.Heavy:
                    heavy++;
                    break;
                case ArmorClass.Medium:
                    medium++;
                    break;
                default:
                    light++;
                    break;
            }
        }

        private static float Pick(int column, float plate, float leather, float cloth)
        {
            return column == 0 ? plate : column == 1 ? leather : cloth;
        }
    }
}
