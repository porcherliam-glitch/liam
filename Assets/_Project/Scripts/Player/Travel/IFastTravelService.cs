using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Fast travel (S50): to the discovered travel points of the current map, with the game clock jumping by the travel time.
    /// Registered by the Player installer; the map page of the journal offers the targets.
    /// </summary>
    public interface IFastTravelService
    {
        /// <summary>True while a travel runs.</summary>
        bool IsTravelling { get; }

        /// <summary>Checks whether travelling to a place is possible now.</summary>
        /// <param name="placeId">Location id of the travel point.</param>
        /// <param name="reasonKey">For <see cref="FastTravelBlock.SaveLocked"/>: the save lock reason key, otherwise empty.</param>
        FastTravelBlock Check(string placeId, out string reasonKey);

        /// <summary>Game hours the travel to a place would take from where the player stands.</summary>
        /// <param name="placeId">Location id of the travel point.</param>
        double HoursTo(string placeId);

        /// <summary>Travels to a place (loading screen, clock jump, arrival). Returns false if refused or failed.</summary>
        /// <param name="placeId">Location id of the travel point.</param>
        Awaitable<bool> TravelAsync(string placeId);
    }
}
