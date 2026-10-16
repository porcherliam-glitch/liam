using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.World.Exploration
{
    /// <summary>
    /// The world map of one world space (S63): the painted map picture, how it lies over the world, the playable area with the
    /// fog grid and the places of the region. Created by the region generator ("Aetherfall > Eichental erstellen") from the
    /// layout file; the scene points to it through a <see cref="RegionMapAnchor"/>.
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Welt/Regionskarte", fileName = "RM_Region")]
    public sealed class RegionMapDefinition : ScriptableObject
    {
        [Tooltip("ID der Karte, Schlüssel im Spielstand (z. B. map.eichental.mini_slice).")]
        [SerializeField] private string mapId = "map.region.name";

        [Tooltip("Regions-ID (z. B. region.eichental).")]
        [SerializeField] private string regionId = "region.name";

        [Tooltip("Name der Region auf der Karte und in der Meldung „Region entdeckt“.")]
        [SerializeField] private string regionName = "Region";

        [Tooltip("Weltraum-ID der Szene (z. B. worldspace.eichental.mini_slice).")]
        [SerializeField] private string worldSpaceId = "worldspace.region";

        [Tooltip("Gemaltes Kartenbild (quadratisch, Norden oben).")]
        [SerializeField] private Texture2D mapImage = null;

        [Tooltip("Westrand des Kartenbilds in Weltmetern.")]
        [SerializeField] private float originX;

        [Tooltip("Südrand des Kartenbilds in Weltmetern.")]
        [SerializeField] private float originZ;

        [Tooltip("Seitenlänge des Kartenbilds in Metern.")]
        [SerializeField] private float extent = 512f;

        [Tooltip("Begehbarer Bereich: Südwest-Ecke (x, z).")]
        [SerializeField] private Vector2 playableMin = new Vector2(-200f, -200f);

        [Tooltip("Begehbarer Bereich: Nordost-Ecke (x, z).")]
        [SerializeField] private Vector2 playableMax = new Vector2(200f, 200f);

        [Tooltip("Zellgröße des Kartennebels in Metern.")]
        [Min(1f)] [SerializeField] private float fogCellSize = 4f;

        [Tooltip("So weit lichtet sich der Nebel um den Spieler (GDD 01 6.6: 60 m).")]
        [Min(1f)] [SerializeField] private float revealRadius = 60f;

        [Tooltip("Orte der Region (aus der Layout-Datei).")]
        [SerializeField] private List<MapPlace> places = new List<MapPlace>();

        /// <summary>Map id (save key).</summary>
        public string MapId => mapId ?? string.Empty;

        /// <summary>Region id.</summary>
        public string RegionId => regionId ?? string.Empty;

        /// <summary>Name of the region.</summary>
        public string RegionName => regionName ?? string.Empty;

        /// <summary>World space id of the scene.</summary>
        public string WorldSpaceId => worldSpaceId ?? string.Empty;

        /// <summary>The map picture (may be null in tests).</summary>
        public Texture2D MapImage => mapImage;

        /// <summary>World ↔ picture.</summary>
        public MapProjection Projection => new MapProjection(originX, originZ, extent);

        /// <summary>South-west corner of the playable area.</summary>
        public Vector2 PlayableMin => playableMin;

        /// <summary>North-east corner of the playable area.</summary>
        public Vector2 PlayableMax => playableMax;

        /// <summary>Fog cell size in metres.</summary>
        public float FogCellSize => fogCellSize;

        /// <summary>Fog columns over the playable area.</summary>
        public int FogColumns => Mathf.Max(1, Mathf.CeilToInt((playableMax.x - playableMin.x) / fogCellSize));

        /// <summary>Fog rows over the playable area.</summary>
        public int FogRows => Mathf.Max(1, Mathf.CeilToInt((playableMax.y - playableMin.y) / fogCellSize));

        /// <summary>Fog radius around the player.</summary>
        public float RevealRadius => revealRadius;

        /// <summary>Places of the region.</summary>
        public IReadOnlyList<MapPlace> Places => places;

        /// <summary>Creates a fog grid of this map (all in fog).</summary>
        public FogGrid CreateFog()
        {
            return new FogGrid(playableMin.x, playableMin.y, fogCellSize, FogColumns, FogRows);
        }

        /// <summary>Finds a place by id.</summary>
        /// <param name="id">Location id.</param>
        /// <param name="place">The place or null.</param>
        public bool TryGetPlace(string id, out MapPlace place)
        {
            for (int i = 0; i < places.Count; i++)
            {
                if (places[i] != null && places[i].Id == id)
                {
                    place = places[i];
                    return true;
                }
            }

            place = null;
            return false;
        }

        /// <summary>Creates a definition in memory (generator, tests); the generator saves it as an asset.</summary>
        /// <param name="mapId">Map id.</param>
        /// <param name="regionId">Region id.</param>
        /// <param name="regionName">Name of the region.</param>
        /// <param name="worldSpaceId">World space id.</param>
        /// <param name="mapImage">Map picture or null.</param>
        /// <param name="projection">World ↔ picture.</param>
        /// <param name="playableMin">South-west corner of the playable area.</param>
        /// <param name="playableMax">North-east corner of the playable area.</param>
        /// <param name="fogCellSize">Fog cell size.</param>
        /// <param name="revealRadius">Fog radius around the player.</param>
        /// <param name="places">Places.</param>
        public static RegionMapDefinition Create(string mapId, string regionId, string regionName, string worldSpaceId, Texture2D mapImage,
            MapProjection projection, Vector2 playableMin, Vector2 playableMax, float fogCellSize, float revealRadius, IEnumerable<MapPlace> places)
        {
            RegionMapDefinition map = CreateInstance<RegionMapDefinition>();
            map.Apply(mapId, regionId, regionName, worldSpaceId, mapImage, projection, playableMin, playableMax, fogCellSize, revealRadius, places);
            return map;
        }

        /// <summary>Overwrites all values (the generator updates an existing asset, so references to it stay valid).</summary>
        /// <param name="newMapId">Map id.</param>
        /// <param name="newRegionId">Region id.</param>
        /// <param name="newRegionName">Name of the region.</param>
        /// <param name="newWorldSpaceId">World space id.</param>
        /// <param name="newMapImage">Map picture or null.</param>
        /// <param name="projection">World ↔ picture.</param>
        /// <param name="newPlayableMin">South-west corner of the playable area.</param>
        /// <param name="newPlayableMax">North-east corner of the playable area.</param>
        /// <param name="newFogCellSize">Fog cell size.</param>
        /// <param name="newRevealRadius">Fog radius around the player.</param>
        /// <param name="newPlaces">Places.</param>
        public void Apply(string newMapId, string newRegionId, string newRegionName, string newWorldSpaceId, Texture2D newMapImage,
            MapProjection projection, Vector2 newPlayableMin, Vector2 newPlayableMax, float newFogCellSize, float newRevealRadius,
            IEnumerable<MapPlace> newPlaces)
        {
            mapId = newMapId ?? string.Empty;
            regionId = newRegionId ?? string.Empty;
            regionName = newRegionName ?? string.Empty;
            worldSpaceId = newWorldSpaceId ?? string.Empty;
            mapImage = newMapImage;
            originX = projection.OriginX;
            originZ = projection.OriginZ;
            extent = projection.Extent;
            playableMin = newPlayableMin;
            playableMax = newPlayableMax;
            fogCellSize = Mathf.Max(1f, newFogCellSize);
            revealRadius = Mathf.Max(1f, newRevealRadius);
            places = newPlaces != null ? new List<MapPlace>(newPlaces) : new List<MapPlace>();
        }
    }
}
