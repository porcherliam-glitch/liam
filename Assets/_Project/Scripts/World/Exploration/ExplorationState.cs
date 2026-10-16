using System;
using System.Collections.Generic;

namespace Aetherfall.World.Exploration
{
    /// <summary>
    /// What the player has explored on one map (S34, GDD 01 6.6): the fog, the discovered places, the places seen from a
    /// viewpoint ("?", not visited yet) and the activated viewpoints. Pure logic; the exploration service sends the events.
    /// </summary>
    /// <remarks>
    /// Rules: only places shown on the map count as discovered; a viewpoint is found only by activating it at the top (walking
    /// past its foot is not enough); activating clears the fog within its reveal radius and marks the places there with "?".
    /// </remarks>
    public sealed class ExplorationState
    {
        private readonly HashSet<string> _discovered = new HashSet<string>(StringComparer.Ordinal);
        private readonly HashSet<string> _revealed = new HashSet<string>(StringComparer.Ordinal);
        private readonly HashSet<string> _viewpoints = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>Creates the state of a map: everything in fog, nothing found.</summary>
        /// <param name="map">The map.</param>
        public ExplorationState(RegionMapDefinition map)
        {
            Map = map ?? throw new ArgumentNullException(nameof(map));
            Fog = map.CreateFog();
        }

        /// <summary>The map.</summary>
        public RegionMapDefinition Map { get; }

        /// <summary>The fog.</summary>
        public FogGrid Fog { get; }

        /// <summary>True once the "Region entdeckt" message was shown.</summary>
        public bool Announced { get; set; }

        /// <summary>True if the place was discovered (visited, or a viewpoint activated).</summary>
        /// <param name="placeId">Location id.</param>
        public bool IsDiscovered(string placeId)
        {
            return placeId != null && _discovered.Contains(placeId);
        }

        /// <summary>True if the place was seen from a viewpoint but not visited yet ("?").</summary>
        /// <param name="placeId">Location id.</param>
        public bool IsRevealed(string placeId)
        {
            return placeId != null && _revealed.Contains(placeId) && !_discovered.Contains(placeId);
        }

        /// <summary>True if the viewpoint was activated.</summary>
        /// <param name="placeId">Location id of the viewpoint.</param>
        public bool IsViewpointActivated(string placeId)
        {
            return placeId != null && _viewpoints.Contains(placeId);
        }

        /// <summary>
        /// True if the place is an unlocked fast travel point (S50): a place with a waypoint that was discovered, or a viewpoint
        /// that was activated.
        /// </summary>
        /// <param name="placeId">Location id.</param>
        public bool IsWaypointUnlocked(string placeId)
        {
            if (!Map.TryGetPlace(placeId, out MapPlace place) || !place.HasWaypoint)
            {
                return false;
            }

            return place.IsViewpoint ? _viewpoints.Contains(place.Id) : _discovered.Contains(place.Id);
        }

        /// <summary>The unlocked fast travel points in the order of the map's places.</summary>
        /// <param name="result">Filled with the places (cleared first).</param>
        public void CollectWaypoints(List<MapPlace> result)
        {
            result.Clear();
            foreach (MapPlace place in Map.Places)
            {
                if (place != null && IsWaypointUnlocked(place.Id))
                {
                    result.Add(place);
                }
            }
        }

        /// <summary>Clears the fog around a point.</summary>
        /// <param name="x">World x.</param>
        /// <param name="z">World z.</param>
        /// <param name="radius">Radius in metres.</param>
        /// <returns>Number of newly revealed cells.</returns>
        public int RevealAround(float x, float z, float radius)
        {
            return Fog.Reveal(x, z, radius);
        }

        /// <summary>The player entered a place: discovers it if the map shows it (viewpoints only through activation).</summary>
        /// <param name="placeId">Location id.</param>
        /// <param name="place">The discovered place.</param>
        /// <returns>True if it was new.</returns>
        public bool Discover(string placeId, out MapPlace place)
        {
            if (!Map.TryGetPlace(placeId, out place) || !place.ShowOnMap || place.IsViewpoint)
            {
                place = null;
                return false;
            }

            return _discovered.Add(place.Id);
        }

        /// <summary>
        /// Activates a viewpoint: clears the fog within its reveal radius, marks the places in that radius that are not discovered
        /// yet with "?" and discovers the viewpoint itself.
        /// </summary>
        /// <param name="placeId">Location id of the viewpoint.</param>
        /// <param name="newlyRevealed">Number of places newly marked with "?".</param>
        /// <returns>False if it is no viewpoint of this map or already activated.</returns>
        public bool ActivateViewpoint(string placeId, out int newlyRevealed)
        {
            newlyRevealed = 0;
            if (!Map.TryGetPlace(placeId, out MapPlace viewpoint) || !viewpoint.IsViewpoint || !_viewpoints.Add(viewpoint.Id))
            {
                return false;
            }

            _discovered.Add(viewpoint.Id);
            float radius = viewpoint.RevealRadius;
            Fog.Reveal(viewpoint.X, viewpoint.Z, radius);
            foreach (MapPlace place in Map.Places)
            {
                if (place == null || !place.ShowOnMap || place.Id == viewpoint.Id || _discovered.Contains(place.Id))
                {
                    continue;
                }

                float dx = place.X - viewpoint.X;
                float dz = place.Z - viewpoint.Z;
                if (dx * dx + dz * dz <= radius * radius && _revealed.Add(place.Id))
                {
                    newlyRevealed++;
                }
            }

            return true;
        }

        /// <summary>Counts the places shown on the map (without viewpoints): found and total.</summary>
        /// <param name="found">Discovered places.</param>
        /// <param name="total">All places shown on the map.</param>
        public void CountPlaces(out int found, out int total)
        {
            found = 0;
            total = 0;
            foreach (MapPlace place in Map.Places)
            {
                if (place != null && place.ShowOnMap && !place.IsViewpoint)
                {
                    total++;
                    if (_discovered.Contains(place.Id))
                    {
                        found++;
                    }
                }
            }
        }

        /// <summary>Counts the viewpoints: activated and total.</summary>
        /// <param name="found">Activated viewpoints.</param>
        /// <param name="total">All viewpoints of the map.</param>
        public void CountViewpoints(out int found, out int total)
        {
            found = 0;
            total = 0;
            foreach (MapPlace place in Map.Places)
            {
                if (place != null && place.IsViewpoint)
                {
                    total++;
                    if (_viewpoints.Contains(place.Id))
                    {
                        found++;
                    }
                }
            }
        }

        /// <summary>Snapshot for the save.</summary>
        public MapExplorationDto ToDto()
        {
            var dto = new MapExplorationDto
            {
                MapId = Map.MapId,
                FogOriginX = Fog.OriginX,
                FogOriginZ = Fog.OriginZ,
                FogCellSize = Fog.CellSize,
                FogColumns = Fog.Columns,
                FogRows = Fog.Rows,
                FogBits = Fog.ToBase64(),
                Announced = Announced
            };
            dto.Discovered.AddRange(Sorted(_discovered));
            dto.Revealed.AddRange(Sorted(_revealed));
            dto.Viewpoints.AddRange(Sorted(_viewpoints));
            return dto;
        }

        /// <summary>Replaces the state with a saved one (null: nothing explored).</summary>
        /// <param name="dto">Saved exploration of this map or null.</param>
        public void Load(MapExplorationDto dto)
        {
            _discovered.Clear();
            _revealed.Clear();
            _viewpoints.Clear();
            Announced = false;
            if (dto == null)
            {
                Fog.Load(null, Fog.OriginX, Fog.OriginZ, Fog.CellSize, Fog.Columns, Fog.Rows);
                return;
            }

            Fog.Load(dto.FogBits, dto.FogOriginX, dto.FogOriginZ, dto.FogCellSize, dto.FogColumns, dto.FogRows);
            AddAll(_discovered, dto.Discovered);
            AddAll(_revealed, dto.Revealed);
            AddAll(_viewpoints, dto.Viewpoints);
            Announced = dto.Announced;
        }

        private static void AddAll(HashSet<string> target, List<string> source)
        {
            if (source == null)
            {
                return;
            }

            foreach (string id in source)
            {
                if (!string.IsNullOrEmpty(id))
                {
                    target.Add(id);
                }
            }
        }

        private static List<string> Sorted(HashSet<string> set)
        {
            var list = new List<string>(set);
            list.Sort(StringComparer.Ordinal);
            return list;
        }
    }
}
