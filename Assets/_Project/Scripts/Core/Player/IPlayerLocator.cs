using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// The player character as other systems see it (map, compass, fast travel): where it stands, where it looks, in which world
    /// space, and how to place it. Implemented by the player's persistence component; reached through
    /// <see cref="IPlayerLocator"/>, so World, UI and NPC code need no reference to the Player assembly and no Find*.
    /// </summary>
    public interface IPlayerAnchor
    {
        /// <summary>Feet position in world metres.</summary>
        Vector3 Position { get; }

        /// <summary>Facing in degrees (0 = north, +Z).</summary>
        float Yaw { get; }

        /// <summary>World space id of the scene the player is in.</summary>
        string WorldSpaceId { get; }

        /// <summary>Places the character (fast travel, debug) and stops its movement.</summary>
        /// <param name="position">New feet position.</param>
        /// <param name="yaw">New facing in degrees.</param>
        void Place(Vector3 position, float yaw);
    }

    /// <summary>
    /// Service that knows the current player character (registered by the World installer): the player registers itself
    /// when it spawns and unregisters when it is destroyed.
    /// </summary>
    public interface IPlayerLocator
    {
        /// <summary>The current player character or null (main menu, loading).</summary>
        IPlayerAnchor Current { get; }

        /// <summary>Registers the player character (replaces an older one).</summary>
        /// <param name="anchor">The player.</param>
        void Register(IPlayerAnchor anchor);

        /// <summary>Unregisters it again (only if it is the current one).</summary>
        /// <param name="anchor">The player.</param>
        void Unregister(IPlayerAnchor anchor);
    }

    /// <summary>Default <see cref="IPlayerLocator"/>.</summary>
    public sealed class PlayerLocator : IPlayerLocator
    {
        /// <inheritdoc />
        public IPlayerAnchor Current { get; private set; }

        /// <inheritdoc />
        public void Register(IPlayerAnchor anchor)
        {
            if (anchor != null)
            {
                Current = anchor;
            }
        }

        /// <inheritdoc />
        public void Unregister(IPlayerAnchor anchor)
        {
            if (ReferenceEquals(Current, anchor))
            {
                Current = null;
            }
        }
    }
}
