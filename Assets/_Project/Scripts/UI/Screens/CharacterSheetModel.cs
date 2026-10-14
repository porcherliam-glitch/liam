using System;
using System.Collections.Generic;
using System.Globalization;
using Aetherfall.Progression;
using Aetherfall.Stats;
using Aetherfall.UI.Framework;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Texts and rows of the character page (GDD 05 1.3 "Charakter", GDD 03 11.3 and 12), pure logic: level, experience
    /// "120 / 460 EP", free points, the six attributes with their final values and the points placed while the menu is open,
    /// and the main derived values.
    /// </summary>
    /// <remarks>TODO (later steps): resistances, corruption, titles and paragon of GDD 05 1.3 follow with their systems.</remarks>
    public static class CharacterSheetModel
    {
        /// <summary>Shown when a value is unknown (no player stats bound).</summary>
        public const string Unknown = "–";

        private static readonly StatId[] DerivedStats =
        {
            StatId.MaxHealth, StatId.MaxStamina, StatId.MaxMana, StatId.Armor, StatId.Poise, StatId.CritChance, StatId.CarryCapacity
        };

        private static readonly string[] DerivedKeys =
        {
            "derived-health", "derived-stamina", "derived-mana", "derived-armor", "derived-poise", "derived-crit", "derived-carry"
        };

        /// <summary>"Stufe 2".</summary>
        /// <param name="progression">Progression (null = unknown).</param>
        public static string LevelText(IProgressionService progression)
        {
            return UiTexts.Format(UiTextKeys.CharacterLevel, progression != null ? Number(progression.Level) : Unknown);
        }

        /// <summary>"120 / 460 EP", or "Höchststufe erreicht" at the maximum level.</summary>
        /// <param name="progression">Progression (null = unknown).</param>
        public static string XpText(IProgressionService progression)
        {
            if (progression == null)
            {
                return UiTexts.Format(UiTextKeys.CharacterXp, Unknown, Unknown);
            }

            return progression.IsMaxLevel
                ? UiTexts.Get(UiTextKeys.CharacterXpMax)
                : UiTexts.Format(UiTextKeys.CharacterXp, Number(progression.XpIntoLevel), Number(progression.XpForNextLevel));
        }

        /// <summary>Fill of the experience bar 0..1 (full at the maximum level).</summary>
        /// <param name="progression">Progression (null = 0).</param>
        public static float XpFill(IProgressionService progression)
        {
            if (progression == null)
            {
                return 0f;
            }

            return progression.IsMaxLevel ? 1f : progression.LevelProgress01;
        }

        /// <summary>"Freie Attributpunkte: 1 · Freie Skillpunkte: 1".</summary>
        /// <param name="progression">Progression (null = unknown).</param>
        public static string PointsText(IProgressionService progression)
        {
            return progression != null
                ? UiTexts.Format(UiTextKeys.CharacterPoints, Number(progression.UnspentAttributePoints), Number(progression.UnspentSkillPoints))
                : UiTexts.Format(UiTextKeys.CharacterPoints, Unknown, Unknown);
        }

        /// <summary>Text key of the German attribute name (<c>attr-strength</c>).</summary>
        /// <param name="stat">Attribute.</param>
        public static string AttributeNameKey(StatId stat)
        {
            return "attr-" + AttributeId(stat);
        }

        /// <summary>Colour class of an attribute (<c>af-attr--strength</c>, GDD 05 1.1).</summary>
        /// <param name="stat">Attribute.</param>
        public static string AttributeColorClass(StatId stat)
        {
            return "af-attr--" + AttributeId(stat);
        }

        /// <summary>Fills the six attribute rows (order of <see cref="StatIds.Attributes"/>).</summary>
        /// <param name="progression">Progression (null = unknown values, nothing can be placed).</param>
        /// <param name="results">Cleared and filled.</param>
        public static void CollectAttributes(IProgressionService progression, List<CharacterAttributeRow> results)
        {
            if (results == null)
            {
                throw new ArgumentNullException(nameof(results));
            }

            results.Clear();
            StatCollection stats = progression != null ? progression.PlayerStats : null;
            StatId[] attributes = StatIds.Attributes;
            for (int i = 0; i < attributes.Length; i++)
            {
                StatId stat = attributes[i];
                int refundable = progression != null ? progression.GetRefundablePoints(stat) : 0;
                bool canSpend = progression != null && progression.CanSpendAttributePoint(stat, out _);
                string value = stats != null ? Number((int)Math.Round(stats.Get(stat))) : Unknown;
                string bonus = refundable > 0 ? UiTexts.Format(UiTextKeys.AttributeBonus, Number(refundable)) : string.Empty;
                results.Add(new CharacterAttributeRow(stat, UiTexts.Get(AttributeNameKey(stat)), AttributeColorClass(stat), value, bonus, canSpend, refundable > 0));
            }
        }

        /// <summary>Fills the derived values (health, stamina, mana, armour, poise, crit chance, carry capacity).</summary>
        /// <param name="progression">Progression (null = unknown values).</param>
        /// <param name="results">Cleared and filled.</param>
        public static void CollectDerived(IProgressionService progression, List<CharacterValueRow> results)
        {
            if (results == null)
            {
                throw new ArgumentNullException(nameof(results));
            }

            results.Clear();
            StatCollection stats = progression != null ? progression.PlayerStats : null;
            for (int i = 0; i < DerivedStats.Length; i++)
            {
                string value = stats != null ? FormatDerived(DerivedStats[i], stats.Get(DerivedStats[i])) : Unknown;
                results.Add(new CharacterValueRow(UiTexts.Get(DerivedKeys[i]), value));
            }
        }

        /// <summary>German text of a derived value: percent with one decimal for the crit chance, kilograms for the carry capacity.</summary>
        /// <param name="stat">Stat.</param>
        /// <param name="value">Value (percent values as fractions).</param>
        public static string FormatDerived(StatId stat, float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value))
            {
                return Unknown;
            }

            switch (stat)
            {
                case StatId.CritChance:
                    return (value * 100f).ToString("0.0", CultureInfo.InvariantCulture).Replace('.', ',') + " %";
                case StatId.CarryCapacity:
                    return UiTexts.Format(UiTextKeys.ValueKg, Number((int)Math.Round(value)));
                default:
                    return Number((int)Math.Round(value));
            }
        }

        /// <summary>Whole number with German thousands dots ("12.500").</summary>
        /// <param name="value">Value.</param>
        public static string Number(int value)
        {
            return value.ToString("#,0", CultureInfo.InvariantCulture).Replace(',', '.');
        }

        private static string AttributeId(StatId stat)
        {
            switch (stat)
            {
                case StatId.Strength: return "strength";
                case StatId.Dexterity: return "dexterity";
                case StatId.Intelligence: return "intelligence";
                case StatId.Wisdom: return "wisdom";
                case StatId.Constitution: return "constitution";
                case StatId.Charisma: return "charisma";
                default: return "none";
            }
        }
    }
}
