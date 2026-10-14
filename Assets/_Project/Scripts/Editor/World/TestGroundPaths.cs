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

        /// <summary>Folder of the item definitions (architecture 3.1: Data/Items).</summary>
        public const string ItemFolder = SetupPaths.ProjectFolder + "/Data/Items";

        /// <summary>Folder of the affix definitions.</summary>
        public const string AffixFolder = ItemFolder + "/Affixes";

        /// <summary>Folder of the loot tables (architecture 3.1: Data/LootTables).</summary>
        public const string LootTableFolder = SetupPaths.ProjectFolder + "/Data/LootTables";

        /// <summary>Catalog of all definitions that the content installer registers.</summary>
        public const string ContentCatalogPath = SetupPaths.ProjectFolder + "/Data/ContentCatalog.asset";

        /// <summary>Folder of item settings (starting equipment).</summary>
        public const string ItemSettingsFolder = SetupPaths.ProjectFolder + "/Settings/Items";

        /// <summary>Starting equipment of the warrior (GDD 03 11.2).</summary>
        public const string StartingEquipmentPath = ItemSettingsFolder + "/Startausruestung_Krieger.asset";

        /// <summary>Installer asset of the content database (BootConfig, architecture 4.1 step 7).</summary>
        public const string ContentInstallerPath = SetupPaths.BootSettingsFolder + "/ContentInstaller.asset";

        /// <summary>Installer asset of inventory and loot (BootConfig, architecture 4.1 step 12).</summary>
        public const string InventoryInstallerPath = SetupPaths.BootSettingsFolder + "/InventoryInstaller.asset";

        /// <summary>Layer of interaction colliders (architecture 2.8: layer 10, collides with nothing).</summary>
        public const int InteractableLayerIndex = 10;

        /// <summary>Name of the interactable layer.</summary>
        public const string InteractableLayerName = "Interactable";

        /// <summary>Layer of loot in the world (architecture 2.8: layer 16).</summary>
        public const int PickupLayerIndex = 16;

        /// <summary>Name of the pickup layer.</summary>
        public const string PickupLayerName = "Pickup";

        /// <summary>Area level of the test ground (item level of chest content and starting equipment, GDD 04 4.1).</summary>
        public const int AreaLevel = Aetherfall.EditorTools.Narrative.TestGroundLevels.AreaLevel;

        /// <summary>Installer asset of the condition watcher (BootConfig, architecture 4.1 step 11).</summary>
        public const string ConditionsInstallerPath = SetupPaths.BootSettingsFolder + "/ConditionsInstaller.asset";

        /// <summary>Installer asset of the world state (BootConfig, architecture 4.1 step 11).</summary>
        public const string WorldStateInstallerPath = SetupPaths.BootSettingsFolder + "/WorldStateInstaller.asset";

        /// <summary>Installer asset of the progression (BootConfig, architecture 4.1 step 12).</summary>
        public const string ProgressionInstallerPath = SetupPaths.BootSettingsFolder + "/ProgressionInstaller.asset";

        /// <summary>Installer asset of the quest system (BootConfig, architecture 4.1 step 13).</summary>
        public const string QuestInstallerPath = SetupPaths.BootSettingsFolder + "/QuestInstaller.asset";

        /// <summary>Installer asset of the dialogue system.</summary>
        public const string DialogueInstallerPath = SetupPaths.BootSettingsFolder + "/DialogueInstaller.asset";

        /// <summary>Installer asset of the NPC system.</summary>
        public const string NpcInstallerPath = SetupPaths.BootSettingsFolder + "/NpcInstaller.asset";

        /// <summary>Installer asset of the world services (enemy group registry; BootConfig before the quest installer).</summary>
        public const string WorldInstallerPath = SetupPaths.BootSettingsFolder + "/WorldInstaller.asset";

        /// <summary>Folder of the test quests (architecture 3.1: Data/Quests).</summary>
        public const string QuestFolder = SetupPaths.ProjectFolder + "/Data/Quests/Test";

        /// <summary>Folder of the flag definitions of the test quests (architecture 3.1: Data/WorldState).</summary>
        public const string FlagFolder = SetupPaths.ProjectFolder + "/Data/WorldState/Test";

        /// <summary>Layer of location, region and music zones (architecture 2.8: layer 14, collides with Player and NPC only).</summary>
        public const int TriggerVolumeLayerIndex = 14;

        /// <summary>Name of the trigger volume layer.</summary>
        public const string TriggerVolumeLayerName = "TriggerVolume";

        /// <summary>Position of the notice board of the test quests (north-west of the spawn, the front facing it).</summary>
        public static readonly UnityEngine.Vector3 NoticeBoardPosition = new UnityEngine.Vector3(-4f, 0f, 4f);

        /// <summary>Seconds after which a dead arena wolf comes back (the wolf hunt needs three kills after accepting it).</summary>
        public const float ArenaRespawnSeconds = 45f;
    }
}
