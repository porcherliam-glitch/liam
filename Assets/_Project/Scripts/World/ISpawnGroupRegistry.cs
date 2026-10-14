using System.Collections.Generic;

namespace Aetherfall.World
{
    /// <summary>
    /// Knows the enemy groups of the loaded scenes and which quest groups are switched on (quest action
    /// <c>Gegner+(spawn-id)</c>, <see cref="SpawnEncounter"/>) or already defeated. Markers register themselves, so nobody has to
    /// search the scene. The state is saved in the section <c>spawners</c> (architecture 9.2).
    /// </summary>
    public interface ISpawnGroupRegistry
    {
        /// <summary>Number of registered groups.</summary>
        int RegisteredCount { get; }

        /// <summary>Ids of the activated quest groups (sorted).</summary>
        IReadOnlyList<string> ActivatedIds { get; }

        /// <summary>Ids of the defeated quest groups (sorted).</summary>
        IReadOnlyList<string> ClearedIds { get; }

        /// <summary>Registers a group of a loaded scene and applies the current state to it.</summary>
        /// <param name="group">Group.</param>
        void Register(ISpawnGroup group);

        /// <summary>Removes a group (scene unloaded or object disabled).</summary>
        /// <param name="group">Group.</param>
        void Unregister(ISpawnGroup group);

        /// <summary>
        /// Switches a quest group on. Works also before its scene is loaded: the group appears when it registers.
        /// </summary>
        /// <param name="spawnId">Spawner id.</param>
        /// <returns>True if a registered group has this id.</returns>
        bool Activate(string spawnId);

        /// <summary>Marks a quest group as defeated: it stays away, also after loading.</summary>
        /// <param name="spawnId">Spawner id.</param>
        void MarkCleared(string spawnId);

        /// <summary>True if the quest group was switched on.</summary>
        /// <param name="spawnId">Spawner id.</param>
        bool IsActivated(string spawnId);

        /// <summary>True if the quest group was defeated.</summary>
        /// <param name="spawnId">Spawner id.</param>
        bool IsCleared(string spawnId);

        /// <summary>Sets the saved state (null = new game) and applies it to all registered groups.</summary>
        /// <param name="activated">Activated ids or null.</param>
        /// <param name="cleared">Defeated ids or null.</param>
        void Restore(IEnumerable<string> activated, IEnumerable<string> cleared);
    }
}
