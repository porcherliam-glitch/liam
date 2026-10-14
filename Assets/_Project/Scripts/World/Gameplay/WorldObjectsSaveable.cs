using System;
using System.Collections.Generic;
using Aetherfall.SaveSystem;
using Aetherfall.World.Puzzles;

namespace Aetherfall.World.Gameplay
{
    /// <summary>
    /// Saves and restores the world object states (section <c>worldobjects</c>, architecture 9.2, load order 85). A new game
    /// (data null) clears every state: puzzles unsolved, doors closed, the boss alive. Restoring raises
    /// <see cref="IWorldObjectStateStore.StatesReplaced"/>; the scene objects re-apply their state without animation.
    /// </summary>
    public sealed class WorldObjectsSaveable : Saveable<WorldObjectsDto>
    {
        /// <summary>Save key (table 9.2).</summary>
        public const string Key = "worldobjects";

        /// <summary>Load order (table 9.2).</summary>
        public const int Order = 85;

        private readonly IWorldObjectStateStore _store;

        /// <summary>Creates the saveable.</summary>
        /// <param name="store">The registered store.</param>
        public WorldObjectsSaveable(IWorldObjectStateStore store) : base(Key, Order)
        {
            _store = store ?? throw new ArgumentNullException(nameof(store));
        }

        /// <inheritdoc />
        protected override WorldObjectsDto Capture()
        {
            var dto = new WorldObjectsDto();
            Dictionary<string, int> snapshot = _store.Snapshot();
            var keys = new List<string>(snapshot.Keys);
            keys.Sort(StringComparer.Ordinal);
            for (int i = 0; i < keys.Count; i++)
            {
                dto.States[keys[i]] = snapshot[keys[i]];
            }

            return dto;
        }

        /// <inheritdoc />
        protected override void Restore(WorldObjectsDto data, in LoadContext ctx)
        {
            _store.Restore(data != null ? data.States : null);
        }
    }
}
