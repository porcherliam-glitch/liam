using System;
using System.Collections.Generic;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// Ids of the chests the player has opened (GDD 04 5.4: loot is rolled on the first opening only). Saved in the
    /// <c>inventory</c> section for now.
    /// </summary>
    /// <remarks>
    /// TODO (world objects step, architecture 9.7): opened chests become states of the <c>WorldObjectStateStore</c>
    /// (World 20, section <c>worldobjects</c>, key = UniqueId) through <c>IPersistentObject</c>; a save migration then moves
    /// <c>inventory.openedChests</c> there. World does not exist yet and Inventory may not reference it.
    /// </remarks>
    public sealed class ChestRegistry
    {
        private readonly HashSet<string> _opened = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>Number of opened chests.</summary>
        public int Count => _opened.Count;

        /// <summary>True if the chest was opened.</summary>
        /// <param name="chestId">Chest id.</param>
        public bool IsOpened(string chestId)
        {
            return !string.IsNullOrEmpty(chestId) && _opened.Contains(chestId);
        }

        /// <summary>Marks a chest as opened.</summary>
        /// <param name="chestId">Chest id.</param>
        /// <returns>False if it was opened before or the id is empty.</returns>
        public bool MarkOpened(string chestId)
        {
            return !string.IsNullOrEmpty(chestId) && _opened.Add(chestId);
        }

        /// <summary>Replaces the opened set (loading a save).</summary>
        /// <param name="chestIds">Opened chest ids (null = none).</param>
        public void Restore(IEnumerable<string> chestIds)
        {
            _opened.Clear();
            if (chestIds == null)
            {
                return;
            }

            foreach (string id in chestIds)
            {
                MarkOpened(id);
            }
        }

        /// <summary>Copies the opened ids into a new sorted list (for saving; sorted keeps save files stable).</summary>
        public List<string> ToSortedList()
        {
            var list = new List<string>(_opened);
            list.Sort(StringComparer.Ordinal);
            return list;
        }
    }
}
