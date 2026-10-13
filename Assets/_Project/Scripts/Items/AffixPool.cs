using System;
using System.Collections.Generic;
using Aetherfall.Data;
using Aetherfall.Utilities;

namespace Aetherfall.Items
{
    /// <summary>
    /// The affixes that can roll on items (GDD 04 4.4) and the roll rules of 4.3: weighted choice among the affixes allowed
    /// for the item's slot, at most 2 prefixes and 2 suffixes, and the exclusion rules 1 (no affix twice), 2 (one per family,
    /// resistances: 2 different ones), 3 (allowed slots only), 4/5 (explicit exclusions such as "des Blutegels" and "der
    /// Dornen"). Rule 6 (caps) applies to the sum in the stats, not to the roll.
    /// </summary>
    /// <remarks>Pure C#. TODO: smart loot (30 % of the rolls ×3 for the player's attributes) is an open decision of GDD 04 4.3.</remarks>
    public sealed class AffixPool
    {
        /// <summary>At most this many prefixes and this many suffixes per item (GDD 04 4.3).</summary>
        public const int MaxPerKind = 2;

        private readonly ContentIndex<AffixSpec> _affixes = new ContentIndex<AffixSpec>();
        private readonly List<AffixSpec> _candidates = new List<AffixSpec>();

        /// <summary>Creates an empty pool.</summary>
        public AffixPool()
        {
        }

        /// <summary>Creates a pool with affixes (invalid and duplicate ones are skipped).</summary>
        /// <param name="affixes">Affixes.</param>
        public AffixPool(IEnumerable<AffixSpec> affixes)
        {
            if (affixes == null)
            {
                return;
            }

            foreach (AffixSpec affix in affixes)
            {
                Add(affix);
            }
        }

        /// <summary>All affixes in registration order.</summary>
        public IReadOnlyList<AffixSpec> All => _affixes.Entries;

        /// <summary>Adds an affix.</summary>
        /// <param name="affix">Affix.</param>
        /// <returns>False if it is invalid or its id is used already.</returns>
        public bool Add(AffixSpec affix)
        {
            return affix != null && affix.Validate().Length == 0 && _affixes.TryAdd(affix.Id, affix);
        }

        /// <summary>Finds an affix by id.</summary>
        /// <param name="id">Affix id.</param>
        /// <param name="affix">Affix or null.</param>
        public bool TryGet(string id, out AffixSpec affix)
        {
            return _affixes.TryGet(id, out affix);
        }

        /// <summary>
        /// Rolls up to <paramref name="count"/> affixes for an item into <paramref name="result"/> (fewer if the rules leave no
        /// candidate). Each affix gets a tier and a value (<see cref="AffixTiers"/>).
        /// </summary>
        /// <param name="item">Item the affixes are for (decides the allowed slot).</param>
        /// <param name="itemLevel">Item level (decides the tier).</param>
        /// <param name="count">Wanted number of affixes.</param>
        /// <param name="random">Random source.</param>
        /// <param name="worldTier">World tier 0–10.</param>
        /// <param name="mythic">True for mythic items (highest tier, upper half).</param>
        /// <param name="result">Receives the rolls (appended).</param>
        public void Roll(ItemSpec item, int itemLevel, int count, IRandom random, int worldTier, bool mythic, List<AffixRoll> result)
        {
            if (item == null || random == null || result == null || count <= 0)
            {
                return;
            }

            AffixSlots slot = item.AffixSlot;
            if (slot == AffixSlots.None)
            {
                return;
            }

            int maxTier = AffixTiers.MaxTier(itemLevel, worldTier, mythic);
            int start = result.Count;
            for (int n = 0; n < count; n++)
            {
                CollectCandidates(slot, result, start);
                AffixSpec chosen = PickWeighted(random);
                if (chosen == null)
                {
                    return;
                }

                int tier = AffixTiers.ChooseTier(maxTier, random, mythic);
                result.Add(new AffixRoll(chosen.Id, tier, AffixTiers.RollValue(chosen, tier, random, worldTier, mythic)));
            }
        }

        /// <summary>
        /// True if <paramref name="candidate"/> may join the affixes already chosen (rules 1, 2, 4, 5 and the 2+2 limit).
        /// </summary>
        /// <param name="candidate">Affix to check.</param>
        /// <param name="chosen">Rolls already on the item.</param>
        /// <param name="start">First index of <paramref name="chosen"/> that belongs to the item.</param>
        public bool IsCompatible(AffixSpec candidate, IReadOnlyList<AffixRoll> chosen, int start = 0)
        {
            int sameKind = 0;
            int sameFamily = 0;
            for (int i = start; i < chosen.Count; i++)
            {
                string id = chosen[i].AffixId;
                if (string.Equals(id, candidate.Id, StringComparison.Ordinal))
                {
                    return false;
                }

                if (!_affixes.TryGet(id, out AffixSpec other))
                {
                    continue;
                }

                if (candidate.Excludes(other.Id) || other.Excludes(candidate.Id))
                {
                    return false;
                }

                if (other.Kind == candidate.Kind)
                {
                    sameKind++;
                }

                if (candidate.FamilyId.Length > 0 && string.Equals(other.FamilyId, candidate.FamilyId, StringComparison.Ordinal))
                {
                    sameFamily++;
                }
            }

            return sameKind < MaxPerKind && sameFamily < Math.Max(1, candidate.FamilyLimit);
        }

        private void CollectCandidates(AffixSlots slot, List<AffixRoll> chosen, int start)
        {
            _candidates.Clear();
            IReadOnlyList<AffixSpec> all = _affixes.Entries;
            for (int i = 0; i < all.Count; i++)
            {
                AffixSpec affix = all[i];
                if (affix.Weight > 0 && (affix.AllowedSlots & slot) != 0 && IsCompatible(affix, chosen, start))
                {
                    _candidates.Add(affix);
                }
            }
        }

        private AffixSpec PickWeighted(IRandom random)
        {
            long total = 0;
            for (int i = 0; i < _candidates.Count; i++)
            {
                total += _candidates[i].Weight;
            }

            if (total <= 0)
            {
                return null;
            }

            double roll = random.NextDouble() * total;
            for (int i = 0; i < _candidates.Count; i++)
            {
                roll -= _candidates[i].Weight;
                if (roll < 0)
                {
                    return _candidates[i];
                }
            }

            return _candidates[_candidates.Count - 1];
        }
    }
}
