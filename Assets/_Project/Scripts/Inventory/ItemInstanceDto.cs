using System.Collections.Generic;
using UnityEngine.Scripting;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Save form of an item instance (architecture 5.1 "identisch, nur IDs und Zahlen"; GDD 04 4.9): instance id, item id,
    /// item level, rarity id, base roll, count, affixes and flag ids. TODO: sockets, quality, transmog, enchant state.
    /// </summary>
    [Preserve]
    public sealed class ItemInstanceDto
    {
        /// <summary>Instance id (16 hex digits).</summary>
        public string InstanceId;

        /// <summary>Item id.</summary>
        public string ItemId;

        /// <summary>Item level.</summary>
        public int ItemLevel;

        /// <summary>Rarity id (<c>gewoehnlich</c> … <c>set</c>).</summary>
        public string Rarity;

        /// <summary>Spread of the base value.</summary>
        public float BaseRoll;

        /// <summary>Count.</summary>
        public int Count;

        /// <summary>Affix rolls.</summary>
        public List<AffixRollDto> Affixes = new List<AffixRollDto>();

        /// <summary>Flag ids (<c>neu</c>, <c>favorit</c>, <c>gesperrt</c>, <c>gestohlen</c>).</summary>
        public List<string> Flags = new List<string>();
    }
}
