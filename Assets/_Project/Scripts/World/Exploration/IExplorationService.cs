using System;
using UnityEngine;

namespace Aetherfall.World.Exploration
{
    /// <summary>
    /// Exploration of the world (S34, GDD 01 6.6): the map of the current scene, the fog that clears around the player, the
    /// discovered places and the viewpoints. Registered by the World installer; the scene's <see cref="RegionMapAnchor"/> sets
    /// the active map and feeds the player position, location triggers (<c>AreaEntered</c>) discover places, a
    /// <see cref="ViewpointZone"/> on top of a viewpoint activates it. Sends <c>LocationDiscovered</c>, <c>ViewpointActivated</c>
    /// and <c>RegionDiscovered</c>; saved in the section <c>world</c>.
    /// </summary>
    public interface IExplorationService
    {
        /// <summary>The map of the current scene, or null (crypt, main menu).</summary>
        RegionMapDefinition ActiveMap { get; }

        /// <summary>Exploration of the active map, or null.</summary>
        ExplorationState ActiveState { get; }

        /// <summary>Counts up whenever fog, places or viewpoints change (the map page redraws then).</summary>
        int Revision { get; }

        /// <summary>Raised after every change (main thread).</summary>
        event Action Changed;

        /// <summary>Makes a map the active one (scene start).</summary>
        /// <param name="map">The map of the scene.</param>
        void SetActiveMap(RegionMapDefinition map);

        /// <summary>Clears the active map if it is this one (scene unload).</summary>
        /// <param name="map">The map of the scene.</param>
        void ClearActiveMap(RegionMapDefinition map);

        /// <summary>The player stands here (called a few times per second while playing): clears the fog around it.</summary>
        /// <param name="position">Feet position.</param>
        void Tick(Vector3 position);

        /// <summary>Activates a viewpoint of the active map.</summary>
        /// <param name="placeId">Location id of the viewpoint.</param>
        /// <returns>False if it is unknown or already active.</returns>
        bool ActivateViewpoint(string placeId);

        /// <summary>Clears the whole fog of the active map (debug).</summary>
        void RevealAll();

        /// <summary>Snapshot of all explored maps for the save.</summary>
        ExplorationDto Capture();

        /// <summary>Replaces everything with a saved state (null: new game). Sends no events.</summary>
        /// <param name="data">Saved exploration or null.</param>
        void Restore(ExplorationDto data);
    }
}
