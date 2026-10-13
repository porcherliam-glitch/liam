using System.Collections.Generic;
using Aetherfall.Items;
using Aetherfall.Stats;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Applies what the equipment and the load do to the player's stats (architecture 11.5/11.6): every equipped item adds
    /// its modifiers with the source <c>item:&lt;instanceId&gt;</c> (armor, implicit, affixes) and loses them again with
    /// <see cref="StatCollection.RemoveAllFromSource"/>; the armor class adds its poise bonus (source
    /// <see cref="ArmorClassSourceId"/>, GDD 03 4.9); the overload stage adds its penalties (source
    /// <see cref="EncumbranceRules.SourceId"/>). Modifiers are never saved: they are rebuilt from the loaded equipment.
    /// </summary>
    public sealed class PlayerStatBinding
    {
        /// <summary>Source id of the armor class poise bonus.</summary>
        public const string ArmorClassSourceId = "armorclass";

        private readonly IItemCatalog _catalog;
        private readonly HashSet<string> _appliedSources = new HashSet<string>();
        private readonly List<StatModifier> _scratch = new List<StatModifier>();
        private readonly List<KeyValuePair<EquipmentSlot, ItemInstance>> _equipped = new List<KeyValuePair<EquipmentSlot, ItemInstance>>();
        private StatCollection _stats;

        /// <summary>Creates the binding.</summary>
        /// <param name="catalog">Item data.</param>
        public PlayerStatBinding(IItemCatalog catalog)
        {
            _catalog = catalog;
        }

        /// <summary>The bound stats, or null.</summary>
        public StatCollection Stats => _stats;

        /// <summary>Binds stats and applies the current equipment, armor class and load stage.</summary>
        /// <param name="stats">Player stats.</param>
        /// <param name="equipment">Current equipment.</param>
        /// <param name="level">Current load stage.</param>
        public void Attach(StatCollection stats, Equipment equipment, EncumbranceLevel level)
        {
            if (_stats != null && !ReferenceEquals(_stats, stats))
            {
                Detach();
            }

            _stats = stats;
            Rebuild(equipment, level);
        }

        /// <summary>Removes every modifier this binding added and unbinds the stats.</summary>
        public void Detach()
        {
            if (_stats == null)
            {
                return;
            }

            RemoveAll();
            _stats = null;
        }

        /// <summary>Removes all item modifiers and applies those of the current equipment again (after loading).</summary>
        /// <param name="equipment">Current equipment.</param>
        /// <param name="level">Current load stage.</param>
        public void Rebuild(Equipment equipment, EncumbranceLevel level)
        {
            if (_stats == null)
            {
                return;
            }

            RemoveAll();
            if (equipment != null)
            {
                _equipped.Clear();
                equipment.CollectEquipped(_equipped);
                for (int i = 0; i < _equipped.Count; i++)
                {
                    ApplyItem(_equipped[i].Value);
                }

                ApplyArmorClass(equipment.ArmorClass);
            }

            ApplyEncumbrance(level);
        }

        /// <summary>Adds the modifiers of an equipped item.</summary>
        /// <param name="instance">Equipped instance.</param>
        public void ApplyItem(ItemInstance instance)
        {
            if (_stats == null || instance == null || !_catalog.TryGetItem(instance.ItemId, out ItemSpec spec))
            {
                return;
            }

            string source = StatSourceIds.Item(instance.InstanceId);
            _stats.RemoveAllFromSource(source);
            _scratch.Clear();
            ItemStats.CollectModifiers(spec, instance, _catalog.Affixes, source, _scratch);
            for (int i = 0; i < _scratch.Count; i++)
            {
                _stats.AddModifier(_scratch[i]);
            }

            _appliedSources.Add(source);
        }

        /// <summary>Removes the modifiers of an item that was taken off.</summary>
        /// <param name="instance">Instance.</param>
        public void RemoveItem(ItemInstance instance)
        {
            if (instance == null)
            {
                return;
            }

            string source = StatSourceIds.Item(instance.InstanceId);
            _appliedSources.Remove(source);
            if (_stats != null)
            {
                _stats.RemoveAllFromSource(source);
            }
        }

        /// <summary>Sets the poise bonus of the armor class (light 0, medium 15, heavy 30).</summary>
        /// <param name="armorClass">Armor class.</param>
        public void ApplyArmorClass(ArmorClass armorClass)
        {
            if (_stats == null)
            {
                return;
            }

            _stats.RemoveAllFromSource(ArmorClassSourceId);
            float bonus = ArmorRules.PoiseBonus(armorClass);
            if (bonus > 0f)
            {
                _stats.AddModifier(StatModifier.Flat(StatId.Poise, bonus, ArmorClassSourceId));
            }
        }

        /// <summary>Sets the penalties of the load stage (move speed, stamina regeneration).</summary>
        /// <param name="level">Load stage.</param>
        public void ApplyEncumbrance(EncumbranceLevel level)
        {
            if (_stats == null)
            {
                return;
            }

            _stats.RemoveAllFromSource(EncumbranceRules.SourceId);
            float move = EncumbranceRules.MoveSpeedPenalty(level);
            if (move != 0f)
            {
                _stats.AddModifier(StatModifier.PercentAdd(StatId.MoveSpeed, move, EncumbranceRules.SourceId));
            }

            float regen = EncumbranceRules.StaminaRegenPenalty(level);
            if (regen != 0f)
            {
                _stats.AddModifier(StatModifier.PercentAdd(StatId.StaminaRegen, regen, EncumbranceRules.SourceId));
            }
        }

        private void RemoveAll()
        {
            foreach (string source in _appliedSources)
            {
                _stats.RemoveAllFromSource(source);
            }

            _appliedSources.Clear();
            _stats.RemoveAllFromSource(ArmorClassSourceId);
            _stats.RemoveAllFromSource(EncumbranceRules.SourceId);
        }
    }
}
