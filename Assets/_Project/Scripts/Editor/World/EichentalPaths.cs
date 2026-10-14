using Aetherfall.EditorTools.Core;

namespace Aetherfall.EditorTools.World
{
    /// <summary>Paths and names used by the Eichental generator (<see cref="EichentalMenu"/>).</summary>
    public static class EichentalPaths
    {
        /// <summary>The layout file, the single data source of scene and Blender preview (architecture 3.1: Data/Regions).</summary>
        public const string LayoutPath = SetupPaths.ProjectFolder + "/Data/Regions/Eichental/eichental_layout.json";

        /// <summary>Folder of world scenes (architecture 3.1: Scenes/World).</summary>
        public const string SceneFolder = SetupPaths.ProjectFolder + "/Scenes/World";

        /// <summary>The Eichental scene of the mini slice (one scene, architecture 10: streaming comes later).</summary>
        public const string ScenePath = SceneFolder + "/Eichental.unity";

        /// <summary>Materials generated from the layout palette.</summary>
        public const string MaterialFolder = SetupPaths.ProjectFolder + "/Art/Materials/Eichental";

        /// <summary>Terrain layers and their generated textures (architecture 3.1: Art/Terrain).</summary>
        public const string TerrainFolder = SetupPaths.ProjectFolder + "/Art/Terrain/Eichental";

        /// <summary>Folder of the terrain data (architecture 10.5: Art/Terrain/Data/&lt;region&gt;).</summary>
        public const string TerrainDataFolder = SetupPaths.ProjectFolder + "/Art/Terrain/Data/eichental";

        /// <summary>Terrain data of the mini slice (one cell of 512 m).</summary>
        public const string TerrainDataPath = TerrainDataFolder + "/TD_Eichental_MiniSlice.asset";

        /// <summary>Folder of generated placeholder meshes.</summary>
        public const string MeshFolder = SetupPaths.ProjectFolder + "/Art/Models/Generated/Eichental";

        /// <summary>All generated meshes as sub-assets of one file (roofs, trees, rocks, fences, fields, water).</summary>
        public const string MeshLibraryPath = MeshFolder + "/EichentalMeshes.asset";

        /// <summary>Terrain layer (architecture 2.8: layer 12, collides with all movement layers).</summary>
        public const int TerrainLayerIndex = 12;

        /// <summary>Name of the terrain layer.</summary>
        public const string TerrainLayerName = "Terrain";

        /// <summary>Unity's built-in water layer (architecture 2.8: layer 4).</summary>
        public const int WaterLayerIndex = 4;

        /// <summary>Region id for death events (PlayerRespawn).</summary>
        public const string RegionId = "region.eichental";
    }
}
