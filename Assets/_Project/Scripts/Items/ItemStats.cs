using System;
using System.Collections.Generic;
using Aetherfall.Stats;

namespace Aetherfall.Items
{
    /// <summary>
    /// The values an item gives when it is equipped (GDD 03 8.2/10.3, GDD 04 4.2–4.4): weapon damage W, armor of armor pieces
    /// and shields, the implicit value and the affixes as <see cref="StatModifier"/>s with the source id
    /// <c>item:&lt;instanceId&gt;</c>. Weapon damage is no stat: the combat system reads it from the equipped weapon.
    /// </summary>
    /// <remarks>Pure functions. TODO (magic step): spell power of staffs and spellbooks replaces the formula without weapon.</remarks>
    public static class ItemStats
    {
        /// <summary>
        /// Weapon damage W = Basis_Typ × (1 + 0.12 × (iLvl − 1)) × rarity factor × base roll (GDD 03 8.2 step 1, GDD 04 4.2),
        /// rounded to a whole number (<see cref="RoundItemValue"/>); 0 for items that are not weapons.
        /// </summary>
        /// <param name="spec">Item data.</param>
        /// <param name="instance">Instance (level, rarity, base roll).</param>
        public static float WeaponDamage(ItemSpec spec, ItemInstance instance)
        {
            if (spec == null || instance == null || !spec.IsWeapon)
            {
                return 0f;
            }

            return RoundItemValue(ItemFormulas.BaseValue(spec.BaseStat, instance.ItemLevel, instance.Rarity, instance.BaseRoll));
        }

        /// <summary>Armor of armor pieces, cloaks and shields with the same formula (whole number); 0 for other items.</summary>
        /// <param name="spec">Item data.</param>
        /// <param name="instance">Instance.</param>
        public static float Armor(ItemSpec spec, ItemInstance instance)
        {
            if (spec == null || instance == null || !spec.GivesArmor)
            {
                return 0f;
            }

            return RoundItemValue(ItemFormulas.BaseValue(spec.BaseStat, instance.ItemLevel, instance.Rarity, instance.BaseRoll));
        }

        /// <summary>
        /// Rounds an item value to a whole number like the item card does (GDD 03 8.3: W = 49.92 → 50, used with 50 in the
        /// damage pipeline); at least 1 if the unrounded value is above 0.
        /// </summary>
        /// <param name="value">Unrounded value.</param>
        public static float RoundItemValue(float value)
        {
            if (!(value > 0f))
            {
                return 0f;
            }

            return Math.Max(1f, (float)Math.Round(value, MidpointRounding.AwayFromZero));
        }

        /// <summary>Implicit value in display units (linear from item level 1 to 80), 0 without implicit.</summary>
        /// <param name="spec">Item data.</param>
        /// <param name="instance">Instance.</param>
        public static float Implicit(ItemSpec spec, ItemInstance instance)
        {
            if (spec == null || instance == null || spec.ImplicitStat == StatId.None)
            {
                return 0f;
            }

            return ItemFormulas.ImplicitValue(spec.ImplicitAtLevel1, spec.ImplicitAtLevel80, instance.ItemLevel);
        }

        /// <summary>
        /// Appends every stat modifier of an equipped item: armor (flat), implicit and affixes, all with
        /// <paramref name="sourceId"/> so that <see cref="StatCollection.RemoveAllFromSource"/> removes them again.
        /// </summary>
        /// <param name="spec">Item data.</param>
        /// <param name="instance">Instance.</param>
        /// <param name="affixes">Affix pool to resolve the affix ids (null = affixes are skipped).</param>
        /// <param name="sourceId">Source id, normally <c>StatSourceIds.Item(instance.InstanceId)</c>.</param>
        /// <param name="result">Receives the modifiers (appended).</param>
        public static void CollectModifiers(ItemSpec spec, ItemInstance instance, AffixPool affixes, string sourceId, List<StatModifier> result)
        {
            if (spec == null || instance == null || result == null)
            {
                return;
            }

            float armor = Armor(spec, instance);
            if (armor > 0f)
            {
                result.Add(StatModifier.Flat(StatId.Armor, armor, sourceId));
            }

            if (spec.ImplicitStat != StatId.None)
            {
                float value = Implicit(spec, instance) * spec.ImplicitScale;
                if (value != 0f)
                {
                    result.Add(new StatModifier(spec.ImplicitStat, spec.ImplicitKind, value, sourceId));
                }
            }

            if (affixes == null)
            {
                return;
            }

            IReadOnlyList<AffixRoll> rolls = instance.Affixes;
            for (int i = 0; i < rolls.Count; i++)
            {
                if (!affixes.TryGet(rolls[i].AffixId, out AffixSpec affix) || affix.Stat == StatId.None)
                {
                    continue;
                }

                result.Add(new StatModifier(affix.Stat, affix.ModifierKind, rolls[i].Value * affix.ValueScale, sourceId));
            }
        }

        /// <summary>Trade value of one piece (equipment scaled with level and rarity, GDD 04 8.6; other items the flat value).</summary>
        /// <param name="spec">Item data.</param>
        /// <param name="instance">Instance.</param>
        public static float TradeValue(ItemSpec spec, ItemInstance instance)
        {
            if (spec == null || instance == null)
            {
                return 0f;
            }

            return spec.IsEquipment ? ItemFormulas.TradeValue(spec.Value, instance.ItemLevel, instance.Rarity) : spec.Value;
        }
    }
}
