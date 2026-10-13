using System.Collections.Generic;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// The folder structure of architecture 3.1 (§5 plus all folders marked "(V)"). Pure data; every call returns a
    /// new list. Parents always come before their children, so the folders can be created in list order.
    /// </summary>
    /// <remarks>
    /// Not created here: <c>Assets/TextMesh Pro/</c> and <c>Assets/AddressableAssetsData/</c> (the packages create them)
    /// and the region folders below <c>Scenes/World/Cells/</c> (created with the first cell of a region).
    /// </remarks>
    public static class ProjectFolderLayout
    {
        /// <summary>Creates the list of folders below <c>Assets/</c> (asset paths with forward slashes).</summary>
        public static IReadOnlyList<string> CreateAssetFolders()
        {
            var folders = new List<string>();
            const string root = SetupPaths.ProjectFolder;
            folders.Add(root);

            AddChildren(folders, root, "Art", "Audio", "Data", "Prefabs", "Scenes", "Scripts", "Settings", "Tests");

            AddChildren(folders, root + "/Art", "Models", "Materials", "Textures", "Animations", "VFX", "UI", "Shaders", "Terrain");
            AddChildren(folders, root + "/Art/Terrain", "Data");

            AddChildren(folders, root + "/Audio", "Music", "SFX", "Voice", "Mixer");

            AddChildren(folders, root + "/Data",
                "Quests", "Items", "Dialogues", "Enemies", "NPCs", "Skills", "Recipes", "Factions", "LootTables", "Regions",
                "Abilities", "WorldState", "Balancing", "Schedules", "Audio", "Localization", "Migration");
            AddChildren(folders, root + "/Data/Balancing", "Source");

            AddChildren(folders, root + "/Prefabs", "Characters", "Enemies", "Environment", "Items", "UI", "VFX");

            AddChildren(folders, root + "/Scenes", "Boot", "MainMenu", "World", "Dungeons", "Test");
            AddChildren(folders, root + "/Scenes/World", "Cells");

            AddChildren(folders, root + "/Scripts",
                "Core", "Player", "Combat", "Stats", "Inventory", "Items", "Quests", "Dialogue", "AI", "NPC",
                "Factions", "Crafting", "Housing", "Economy", "World", "SaveSystem", "UI", "Audio", "Input",
                "Camera", "Utilities", "Editor",
                "Events", "Data", "Conditions", "WorldState", "Time", "Options", "Progression",
                "Companions", "Cinematics", "DevTools");
            AddChildren(folders, root + "/Scripts/UI", "Framework", "Screens");
            AddChildren(folders, root + "/Scripts/Editor", "Core", "Data", "Narrative", "World", "Build");

            AddChildren(folders, root + "/Settings", "Boot", "Input", "Rendering", "Localization", "Build");

            AddChildren(folders, root + "/Tests", "EditMode", "PlayMode", "Shared", "TestData");

            folders.Add("Assets/ThirdParty");
            return folders;
        }

        /// <summary>Creates the list of folders outside of <c>Assets/</c>, relative to the project root.</summary>
        public static IReadOnlyList<string> CreateExternalFolders()
        {
            return new List<string> { SetupPaths.ArtSourceFolder };
        }

        private static void AddChildren(List<string> folders, string parent, params string[] names)
        {
            for (int i = 0; i < names.Length; i++)
            {
                folders.Add(parent + "/" + names[i]);
            }
        }
    }
}
