using System.Collections.Generic;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// The inventory of a new game (pure data): items with their start slots and the start gold. Built from
    /// <see cref="StartingEquipment"/>; empty kit = empty inventory.
    /// </summary>
    public sealed class StartingKit
    {
        /// <summary>Creates a kit.</summary>
        /// <param name="items">Items (copied; null = none).</param>
        /// <param name="gold">Start gold.</param>
        public StartingKit(IEnumerable<StartingKitItem> items, int gold)
        {
            Items = items != null ? new List<StartingKitItem>(items) : new List<StartingKitItem>();
            Gold = gold < 0 ? 0 : gold;
        }

        /// <summary>An empty kit.</summary>
        public static StartingKit Empty => new StartingKit(null, 0);

        /// <summary>Items with their start slots.</summary>
        public IReadOnlyList<StartingKitItem> Items { get; }

        /// <summary>Start gold.</summary>
        public int Gold { get; }
    }
}
