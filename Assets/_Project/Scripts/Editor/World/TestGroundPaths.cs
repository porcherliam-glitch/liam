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

        /// <summary>Installer asset of the save system (added to the BootConfig after the GameState and Input installers, architecture 4.1 step 9).</summary>
        public const string SaveInstallerPath = SetupPaths.BootSettingsFolder + "/SaveInstaller.asset";

        /// <summary>Installer asset of the playtime clock (added directly after the save installer, architecture 4.1 step 10).</summary>
        public const string GameTimeInstallerPath = SetupPaths.BootSettingsFolder + "/GameTimeInstaller.asset";

        /// <summary>Folder of the attack assets (architecture 3.1: Data/…).</summary>
        public const string AttackFolder = SetupPaths.ProjectFolder + "/Data/Combat/Attacks";

        /// <summary>Folder of combo, weapon and shield assets.</summary>
        public const string WeaponFolder = SetupPaths.ProjectFolder + "/Data/Combat/Weapons";

        /// <summary>Folder of the enemy type assets (architecture 3.1: Data/Enemies).</summary>
        public const string EnemyFolder = SetupPaths.ProjectFolder + "/Data/Enemies";

        /// <summary>Folder of the combat settings.</summary>
        public const string CombatSettingsFolder = SetupPaths.ProjectFolder + "/Settings/Combat";

        /// <summary>Combat rules asset (GDD 03 values).</summary>
        public const string CombatSettingsPath = CombatSettingsFolder + "/CombatSettings.asset";

        /// <summary>Installer asset of the combat service (BootConfig, architecture 4.1 step 12).</summary>
        public const string CombatInstallerPath = SetupPaths.BootSettingsFolder + "/CombatInstaller.asset";

        /// <summary>Installer asset of the AI services (BootConfig, architecture 4.1 step 13).</summary>
        public const string AIInstallerPath = SetupPaths.BootSettingsFolder + "/AIInstaller.asset";

        /// <summary>Layer of the movement colliders of enemies (architecture 2.8: layer 7).</summary>
        public const int EnemyLayerIndex = 7;

        /// <summary>Name of the enemy layer.</summary>
        public const string EnemyLayerName = "Enemy";

        /// <summary>Layer of the hit zones (architecture 2.8: layer 9, collides with nothing).</summary>
        public const int HurtboxLayerIndex = 9;

        /// <summary>Name of the hurtbox layer.</summary>
        public const string HurtboxLayerName = "Hurtbox";

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
