namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Remembers where the player arrives after a scene change (architecture 10.8: "Spieler am Eingangs-Anker" when entering a
    /// dungeon, at the entrance again when leaving): a <see cref="DungeonPortal"/> sets the arrival anchor before it changes the
    /// world space; the <see cref="ArrivalAnchor"/> with that id moves the spawn point of the new scene to itself in Awake.
    /// </summary>
    public interface IWorldTravelService
    {
        /// <summary>Anchor id the player should arrive at, or empty.</summary>
        string PendingAnchorId { get; }

        /// <summary>Sets the arrival anchor of the next scene.</summary>
        /// <param name="anchorId">Anchor id (empty clears it).</param>
        void SetPendingAnchor(string anchorId);

        /// <summary>Returns and clears the pending anchor if it equals <paramref name="anchorId"/>.</summary>
        /// <param name="anchorId">Anchor id of the caller.</param>
        /// <returns>True if the player arrives at this anchor.</returns>
        bool TryConsume(string anchorId);
    }
}
