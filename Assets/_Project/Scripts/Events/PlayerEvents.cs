// Global events of the player character (architecture 4.3, event #8). Several event structs of one area may share a
// file (architecture 15.2, rule 18).

using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.Events
{
    /// <summary>
    /// The player character was placed in the world (spawn point, loaded save, fast travel). Receivers: world streaming,
    /// camera, UI. Only values, no object references (architecture 4.3).
    /// </summary>
    public readonly struct PlayerSpawned : IGameEvent
    {
        /// <summary>World position of the player's feet after spawning.</summary>
        public readonly Vector3 Position;

        /// <summary>ID of the world space the player is in (e.g. <c>worldspace.test.testgelaende</c>).</summary>
        public readonly string WorldSpaceId;

        /// <summary>Creates the event.</summary>
        /// <param name="position">World position of the player's feet after spawning.</param>
        /// <param name="worldSpaceId">ID of the world space the player is in.</param>
        public PlayerSpawned(Vector3 position, string worldSpaceId)
        {
            Position = position;
            WorldSpaceId = worldSpaceId;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "PlayerSpawned(" + Position + ", " + WorldSpaceId + ")";
        }
    }
}
