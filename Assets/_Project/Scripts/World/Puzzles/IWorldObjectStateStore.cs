using System;
using System.Collections.Generic;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// States of world objects by stable id (architecture 9.7 "WorldObjectStateStore": "Truhe geoeffnet, Tuer offen, Hebel,
    /// Raetsel geloest" – here also boss beaten, item taken): one number per id, 0 = default and not stored. Puzzles, doors,
    /// levers, cages, rewards and the boss arena read and write it; the save section <c>worldobjects</c> (LoadOrder 85)
    /// stores it. Main thread only.
    /// </summary>
    /// <remarks>
    /// Registered by <see cref="WorldObjectsInstaller"/>; saved by the save bridge of <c>Aetherfall.World.Gameplay</c>. Events
    /// with object references stay local (architecture 4.3): <see cref="StateChanged"/> for one id, <see cref="StatesReplaced"/>
    /// after loading or a new game.
    /// </remarks>
    public interface IWorldObjectStateStore
    {
        /// <summary>Number of stored (non-zero) states.</summary>
        int Count { get; }

        /// <summary>Raised after one state changed (id).</summary>
        event Action<string> StateChanged;

        /// <summary>Raised after all states were replaced (load, new game, end of session).</summary>
        event Action StatesReplaced;

        /// <summary>State of an id (0 if unknown).</summary>
        /// <param name="id">Object id.</param>
        int GetState(string id);

        /// <summary>True if a non-zero state is stored.</summary>
        /// <param name="id">Object id.</param>
        /// <param name="state">State.</param>
        bool TryGetState(string id, out int state);

        /// <summary>Sets a state (0 removes it). Raises <see cref="StateChanged"/> only if the value changed.</summary>
        /// <param name="id">Object id (not empty).</param>
        /// <param name="state">State number.</param>
        /// <returns>True if the value changed.</returns>
        bool SetState(string id, int state);

        /// <summary>Copy of all stored states (save).</summary>
        Dictionary<string, int> Snapshot();

        /// <summary>Replaces all states (load; null = empty) and raises <see cref="StatesReplaced"/>.</summary>
        /// <param name="states">States by id.</param>
        void Restore(IReadOnlyDictionary<string, int> states);
    }
}
