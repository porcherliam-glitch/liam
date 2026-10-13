namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Fixed project-relative paths and names used by the project setup (architecture 2, 3.1, 4.1).
    /// Asset paths use forward slashes, exactly as the AssetDatabase expects them.
    /// </summary>
    public static class SetupPaths
    {
        /// <summary>Root of all own content (§5).</summary>
        public const string ProjectFolder = "Assets/_Project";

        /// <summary>Folder of the boot assets: BootConfig, installers, log settings.</summary>
        public const string BootSettingsFolder = ProjectFolder + "/Settings/Boot";

        /// <summary>Target folder for the URP assets of the template (Assets/Settings is moved here).</summary>
        public const string RenderingSettingsFolder = ProjectFolder + "/Settings/Rendering";

        /// <summary>Target folder for input action assets.</summary>
        public const string InputSettingsFolder = ProjectFolder + "/Settings/Input";

        /// <summary>Folder of the boot scene.</summary>
        public const string BootSceneFolder = ProjectFolder + "/Scenes/Boot";

        /// <summary>The boot scene: build index 0 and the only scene in the scene list (architecture 4.1).</summary>
        public const string BootScenePath = BootSceneFolder + "/Boot.unity";

        /// <summary>Log levels applied at boot.</summary>
        public const string LogSettingsAssetPath = BootSettingsFolder + "/LogSettings.asset";

        /// <summary>First installer of the boot sequence.</summary>
        public const string LogInstallerAssetPath = BootSettingsFolder + "/LogInstaller.asset";

        /// <summary>Installer of the event bus.</summary>
        public const string EventBusInstallerAssetPath = BootSettingsFolder + "/EventBusInstaller.asset";

        /// <summary>Installer of the game state service and the time scale service.</summary>
        public const string GameStateInstallerAssetPath = BootSettingsFolder + "/GameStateInstaller.asset";

        /// <summary>Boot configuration with the ordered installer list.</summary>
        public const string BootConfigAssetPath = BootSettingsFolder + "/BootConfig.asset";

        /// <summary>Name of the GameObject carrying GameBootstrapper and TickRunner in the boot scene.</summary>
        public const string BootstrapperObjectName = "GameBootstrapper";

        /// <summary>Name of the GameObject carrying the developer overlay in the boot scene.</summary>
        public const string DevToolsObjectName = "DevTools";

        /// <summary>Folder outside of Assets for Blender/Photoshop sources (architecture 2.1, 2.9 #49).</summary>
        public const string ArtSourceFolder = "ArtSource";

        /// <summary>Placeholder file that keeps empty folders in Git. Unity ignores files starting with a dot.</summary>
        public const string GitKeepFileName = ".gitkeep";
    }
}
