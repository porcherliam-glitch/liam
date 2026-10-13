using System;
using System.Collections.Generic;
using System.Globalization;
using Aetherfall.Stats;

namespace Aetherfall.Items
{
    /// <summary>
    /// German texts of items for debug views and prompts (name with count, rarity, item level, core value, weight, implicit
    /// and affix lines). Placeholder until the inventory UI with localization (GDD 05; name building of GDD 04 4.5 needs
    /// genus-aware smart strings).
    /// </summary>
    public static class ItemTexts
    {
        /// <summary>Name with count, e.g. "Wolfsfell x3".</summary>
        /// <param name="spec">Item data (null = the item id is shown).</param>
        /// <param name="instance">Instance.</param>
        public static string Title(ItemSpec spec, ItemInstance instance)
        {
            string name = spec != null && !string.IsNullOrEmpty(spec.DisplayName) ? spec.DisplayName : instance != null ? instance.ItemId : "?";
            return instance != null && instance.Count > 1 ? name + " ×" + instance.Count : name;
        }

        /// <summary>
        /// One line with rarity, item level and core value, e.g. "Selten ◆◆◆ · Stufe 10 · Schaden 50 · 2,5 kg".
        /// </summary>
        /// <param name="spec">Item data.</param>
        /// <param name="instance">Instance.</param>
        public static string Summary(ItemSpec spec, ItemInstance instance)
        {
            if (spec == null || instance == null)
            {
                return string.Empty;
            }

            string text = RarityRules.GermanName(instance.Rarity) + " " + RarityRules.ShapeCode(instance.Rarity);
            if (spec.IsEquipment)
            {
                text += " · Stufe " + instance.ItemLevel;
            }

            if (spec.IsWeapon)
            {
                text += (WeaponTypeRules.IsMagic(spec.WeaponType) ? " · Zauberkraft " : " · Schaden ") + Floor(ItemStats.WeaponDamage(spec, instance));
            }
            else if (spec.GivesArmor)
            {
                text += " · Rüstung " + Floor(ItemStats.Armor(spec, instance));
            }

            if (spec.ArmorClass != ArmorClass.None)
            {
                text += " · " + ArmorRules.GermanName(spec.ArmorClass);
            }

            text += " · " + Kilograms(spec.Weight * instance.Count);
            return text;
        }

        /// <summary>Appends the implicit line and one line per affix ("+16 % Krit-Schaden (Grausam, Stufe III)").</summary>
        /// <param name="spec">Item data.</param>
        /// <param name="instance">Instance.</param>
        /// <param name="affixes">Affix pool (null = ids only).</param>
        /// <param name="lines">Receives the lines.</param>
        public static void Details(ItemSpec spec, ItemInstance instance, AffixPool affixes, List<string> lines)
        {
            if (spec == null || instance == null || lines == null)
            {
                return;
            }

            if (spec.ImplicitStat != StatId.None && !string.IsNullOrEmpty(spec.ImplicitText))
            {
                lines.Add(Format(spec.ImplicitText, ItemStats.Implicit(spec, instance)));
            }

            IReadOnlyList<AffixRoll> rolls = instance.Affixes;
            for (int i = 0; i < rolls.Count; i++)
            {
                AffixRoll roll = rolls[i];
                if (affixes != null && affixes.TryGet(roll.AffixId, out AffixSpec affix))
                {
                    lines.Add(affix.Describe(roll.Value) + " (" + affix.DisplayName + ", Stufe " + Roman(roll.Tier) + ")");
                }
                else
                {
                    lines.Add(roll.AffixId + " " + roll.Value.ToString("0.#", CultureInfo.InvariantCulture));
                }
            }
        }

        /// <summary>Weight like "2,5 kg" (German decimal comma).</summary>
        /// <param name="kilograms">Weight.</param>
        public static string Kilograms(float kilograms)
        {
            return kilograms.ToString("0.#", CultureInfo.GetCultureInfo("de-DE")) + " kg";
        }

        /// <summary>Roman tier number I–VI.</summary>
        /// <param name="tier">Tier 1–6.</param>
        public static string Roman(int tier)
        {
            switch (tier)
            {
                case 1: return "I";
                case 2: return "II";
                case 3: return "III";
                case 4: return "IV";
                case 5: return "V";
                case 6: return "VI";
                default: return tier.ToString(CultureInfo.InvariantCulture);
            }
        }

        private static string Format(string format, float value)
        {
            string number = Math.Round(value, 1).ToString("0.#", CultureInfo.InvariantCulture);
            try
            {
                return string.Format(CultureInfo.InvariantCulture, format, number);
            }
            catch (FormatException)
            {
                return format + " " + number;
            }
        }

        private static string Floor(float value)
        {
            // Item values are whole numbers already (ItemStats); the epsilon only absorbs float noise.
            return Math.Floor(value + 1e-3).ToString("0", CultureInfo.InvariantCulture);
        }
    }
}
