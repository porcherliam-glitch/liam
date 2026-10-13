using System.Collections.Generic;
using Aetherfall.Inventory;
using Aetherfall.Items;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.Inventory
{
    /// <summary><see cref="ILootSpawner"/> test double: records the drops that would be placed in the world.</summary>
    public sealed class RecordingLootSpawner : ILootSpawner
    {
        private readonly List<LootDrop> _drops = new List<LootDrop>();

        /// <summary>All drops spawned so far.</summary>
        public IReadOnlyList<LootDrop> Drops => _drops;

        /// <summary>Source id of the last call.</summary>
        public string LastSourceId { get; private set; } = string.Empty;

        /// <summary>Number of <see cref="ClearAll"/> calls.</summary>
        public int ClearCount { get; private set; }

        /// <inheritdoc />
        public void SpawnDrops(IReadOnlyList<LootDrop> drops, Vector3 origin, string sourceId)
        {
            for (int i = 0; i < drops.Count; i++)
            {
                _drops.Add(drops[i]);
            }

            LastSourceId = sourceId;
        }

        /// <inheritdoc />
        public void ClearAll()
        {
            _drops.Clear();
            ClearCount++;
        }
    }
}
