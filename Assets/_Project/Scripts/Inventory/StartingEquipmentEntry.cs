using System;
using Aetherfall.Data;
using Aetherfall.Items;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>One line of a <see cref="StartingEquipment"/> asset in the inspector.</summary>
    [Serializable]
    public sealed class StartingEquipmentEntry
    {
        [Tooltip("Item-ID, z. B. item.weapon.einhandschwert_eisen.")]
        [SerializeField, IdRef("item.")] private string itemId = string.Empty;

        [Tooltip("Anzahl (Tränke z. B. 3).")]
        [Min(1)] [SerializeField] private int count = 1;

        [Tooltip("Item-Level (bei Items mit festem Level gilt deren Level).")]
        [Range(1, 80)] [SerializeField] private int itemLevel = 1;

        [Tooltip("Seltenheit.")]
        [SerializeField] private ItemRarity rarity = ItemRarity.Common;

        [Tooltip("Startplatz: Keiner = Rucksack; ein Ausrüstungsplatz = angelegt; Schnellslot = Rucksack und Schnellslot.")]
        [SerializeField] private EquipmentSlot slot = EquipmentSlot.None;

        /// <summary>Creates the pure entry.</summary>
        public StartingKitItem CreateItem()
        {
            return new StartingKitItem(itemId, count, itemLevel, rarity, slot);
        }
    }
}
