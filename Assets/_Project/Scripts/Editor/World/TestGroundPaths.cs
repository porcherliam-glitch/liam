using Aetherfall.EditorTools.Core;

namespace Aetherfall.EditorTools.World
{
    /// <summary>Paths and names used by the test ground menu (<see cref="TestGroundMenu"/>).</summary>
    public static class TestGroundPaths
    {
        /// <summary>Folder of test scenes (architecture 3.1: Scenes/Test).</summary>
        public const string SceneFolder = SetupPaths.ProjectFolder + "/Scenes/Test";

        /// <summary>The test ground scene.</summary>
        public const string ScenePath = SceneFolder + "/Testgelaende.unity";

        /// <summary>Folder of the coloured test materials.</summary>
        public const string MaterialFolder = SetupPaths.ProjectFolder + "/Art/Materials/Test";

        /// <summary>Folder of player settings assets.</summary>
        public const string PlayerSettingsFolder = SetupPaths.ProjectFolder + "/Settings/Player";

        /// <summary>Movement tuning asset of the player.</summary>
        public const string MovementSettingsPath = PlayerSettingsFolder + "/PlayerMovementSettings.asset";

        /// <summary>Installer asset of the input service (added to the BootConfig after the GameState installer).</summary>
        public const string InputInstallerPath = SetupPaths.BootSettingsFolder + "/InputInstaller.asset";

        /// <summary>Layer of the player character (architecture 2.8: layer 6).</summary>
        public const int PlayerLayerIndex = 6;

        /// <summary>Name of the player layer.</summary>
        public const string PlayerLayerName = "Player";

        /// <summary>Layer of static level geometry and camera collision (architecture 2.8: layer 11).</summary>
        public const int EnvironmentLayerIndex = 11;

        /// <summary>Name of the environment layer.</summary>
        public const string EnvironmentLayerName = "Environment";

        /// <summary>World space ID published with PlayerSpawned (ID rules, architecture 6.1).</summary>
        public const string WorldSpaceId = "worldspace.test.testgelaende";
    }
}
