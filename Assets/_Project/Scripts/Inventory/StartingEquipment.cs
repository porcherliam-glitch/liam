using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Starting equipment of a new game (configuration asset, GDD 03 11.2: warrior with iron one-handed sword, wooden shield,
    /// gambeson for chest and legs, leather boots, 3 small healing potions). Referenced by <see cref="InventoryInstaller"/>.
    /// </summary>
    /// <remarks>TODO (progression step): moves into the class definition (<c>class.krieger</c>), chosen after the prologue.</remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Items/Startausrüstung", fileName = "StartingEquipment", order = 33)]
    public sealed class StartingEquipment : ScriptableObject
    {
        [Tooltip("Items des neuen Spiels mit Startplatz (angelegt, Rucksack oder Schnellslot).")]
        [SerializeField] private List<StartingEquipmentEntry> items = new List<StartingEquipmentEntry>();

        [Tooltip("Gold zu Beginn.")]
        [Min(0)] [SerializeField] private int gold = 0;

        /// <summary>Creates the pure kit.</summary>
        public StartingKit CreateKit()
        {
            var list = new List<StartingKitItem>(items.Count);
            for (int i = 0; i < items.Count; i++)
            {
                if (items[i] != null)
                {
                    list.Add(items[i].CreateItem());
                }
            }

            return new StartingKit(list, gold);
        }
    }
}
