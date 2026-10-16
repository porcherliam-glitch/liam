using System.Collections.Generic;
using UnityEngine.Scripting;

namespace Aetherfall.World.Exploration
{
    /// <summary>
    /// Save section <c>world</c> (architecture 9.2, load order 80; S34): what the player has explored, per map.
    /// </summary>
    [Preserve]
    public sealed class ExplorationDto
    {
        /// <summary>Explored maps.</summary>
        public List<MapExplorationDto> Maps = new List<MapExplorationDto>();
    }

    /// <summary>Exploration of one map: fog bits with the grid they belong to, discovered and revealed places, viewpoints.</summary>
    [Preserve]
    public sealed class MapExplorationDto
    {
        /// <summary>Map id.</summary>
        public string MapId = string.Empty;

        /// <summary>West edge of the fog grid in world metres.</summary>
        public float FogOriginX;

        /// <summary>South edge of the fog grid in world metres.</summary>
        public float FogOriginZ;

        /// <summary>Fog cell size in metres.</summary>
        public float FogCellSize = 4f;

        /// <summary>Fog columns.</summary>
        public int FogColumns;

        /// <summary>Fog rows.</summary>
        public int FogRows;

        /// <summary>Fog bits (Base64, rows from south to north, lowest bit first).</summary>
        public string FogBits = string.Empty;

        /// <summary>Discovered places (location ids).</summary>
        public List<string> Discovered = new List<string>();

        /// <summary>Places seen from a viewpoint but not visited yet ("?").</summary>
        public List<string> Revealed = new List<string>();

        /// <summary>Activated viewpoints.</summary>
        public List<string> Viewpoints = new List<string>();

        /// <summary>True once the "Region entdeckt" message was shown.</summary>
        public bool Announced;
    }
}
