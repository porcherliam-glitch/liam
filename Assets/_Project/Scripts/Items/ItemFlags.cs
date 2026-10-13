using System;

namespace Aetherfall.Items
{
    /// <summary>
    /// Markers of an item instance (GDD 04 1.6, 1.8; architecture 5.1): new, favourite, locked, stolen. Saved as the stable
    /// ids <c>neu</c>, <c>favorit</c>, <c>gesperrt</c>, <c>gestohlen</c> (<see cref="ItemFlagIds"/>).
    /// </summary>
    [Flags]
    public enum ItemFlags
    {
        /// <summary>No marker.</summary>
        None = 0,

        /// <summary>New (dot): set on pickup, removed when looked at.</summary>
        New = 1,

        /// <summary>Favourite (star): always on top of every sorting.</summary>
        Favorite = 2,

        /// <summary>Locked (lock): not sellable, not dismantlable, not droppable.</summary>
        Locked = 4,

        /// <summary>Stolen (hand): only sellable to a fence, never picked up automatically.</summary>
        Stolen = 8
    }
}
