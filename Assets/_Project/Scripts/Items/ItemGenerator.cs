using System;
using System.Collections.Generic;
using Aetherfall.Utilities;

namespace Aetherfall.Items
{
    /// <summary>
    /// Creates item instances (GDD 04 4, architecture 11.6 "Wuerfeln im ItemGenerator"): fixed pieces (materials, potions,
    /// start equipment) without rolls, and random equipment with spread 0.95–1.05, affixes by rarity (<see cref="AffixPool"/>
    /// with tiers and exclusion rules) and the automatic lock of legendary, mythic and set items (GDD 04 1.6).
    /// </summary>
    /// <remarks>Pure C#; all randomness comes from the passed <see cref="IRandom"/>. TODO: sockets (4.7), names (4.5), legendary effects (4.6).</remarks>
    public sealed class ItemGenerator
    {
        private readonly AffixPool _affixes;
        private readonly List<AffixRoll> _rolls = new List<AffixRoll>();

        /// <summary>Creates the generator.</summary>
        /// <param name="affixes">Affix pool; null = items get no affixes.</param>
        public ItemGenerator(AffixPool affixes)
        {
            _affixes = affixes ?? new AffixPool();
        }

        /// <summary>The affix pool in use.</summary>
        public AffixPool Affixes => _affixes;

        /// <summary>
        /// Creates a fixed piece without rolls (base roll 1.00, no affixes): materials, potions, quest items, start equipment.
        /// The item level of the definition wins over <paramref name="itemLevel"/> if it is set.
        /// </summary>
        /// <param name="spec">Item data.</param>
        /// <param name="itemLevel">Item level if the definition has none.</param>
        /// <param name="rarity">Rarity.</param>
        /// <param name="count">Count (at least 1).</param>
        /// <param name="random">Random source for the instance id.</param>
        /// <param name="flags">Markers (default: new).</param>
        public ItemInstance CreateFixed(ItemSpec spec, int itemLevel, ItemRarity rarity, int count, IRandom random, ItemFlags flags = ItemFlags.New)
        {
            if (spec == null)
            {
                throw new ArgumentNullException(nameof(spec));
            }

            int level = spec.FixedItemLevel > 0 ? spec.FixedItemLevel : Math.Max(1, itemLevel);
            if (RarityRules.LocksAutomatically(rarity) || spec.IsQuestItem)
            {
                flags |= ItemFlags.Locked;
            }

            return new ItemInstance(ItemInstanceIds.Create(random), spec.Id, level, rarity, 1f, Math.Max(1, count), flags, null);
        }

        /// <summary>
        /// Creates a random piece of equipment: spread 0.95–1.05 (two decimals), affixes by rarity (GDD 04 3.1: 0/1/2/3/3/4),
        /// marked new, locked automatically for legendary, mythic and set.
        /// </summary>
        /// <param name="spec">Item data (equipment).</param>
        /// <param name="itemLevel">Item level 1–80.</param>
        /// <param name="rarity">Rarity.</param>
        /// <param name="random">Random source.</param>
        /// <param name="worldTier">World tier 0–10 (affix floors).</param>
        public ItemInstance Generate(ItemSpec spec, int itemLevel, ItemRarity rarity, IRandom random, int worldTier = 0)
        {
            if (spec == null)
            {
                throw new ArgumentNullException(nameof(spec));
            }

            if (random == null)
            {
                throw new ArgumentNullException(nameof(random));
            }

            int level = spec.FixedItemLevel > 0 ? spec.FixedItemLevel : Math.Max(1, Math.Min(ItemFormulas.MaxItemLevel, itemLevel));
            string instanceId = ItemInstanceIds.Create(random);
            float spread = RollSpread(random);
            _rolls.Clear();
            if (spec.IsEquipment)
            {
                _affixes.Roll(spec, level, RarityRules.AffixCount(rarity), random, worldTier, rarity == ItemRarity.Mythic, _rolls);
            }

            ItemFlags flags = ItemFlags.New;
            if (RarityRules.LocksAutomatically(rarity))
            {
                flags |= ItemFlags.Locked;
            }

            return new ItemInstance(instanceId, spec.Id, level, rarity, spread, 1, flags, _rolls);
        }

        /// <summary>Rolls the spread of base values: uniform 0.95–1.05, rounded to two decimals (GDD 04 4.9 <c>baseRoll</c>).</summary>
        /// <param name="random">Random source.</param>
        public static float RollSpread(IRandom random)
        {
            int steps = random.Range(95, 106);
            return steps / 100f;
        }
    }
}
