using Aetherfall.EditorTools.Core;

namespace Aetherfall.EditorTools.World
{
    /// <summary>Paths and ids of the crypt "Die vergessene Gruft" (GDD 02 11.7) for the menu <see cref="GruftMenu"/>.</summary>
    public static class GruftPaths
    {
        /// <summary>Layout data of the crypt (single source for the scene and the Blender preview).</summary>
        public const string LayoutPath = SetupPaths.ProjectFolder + "/Data/Regions/Eichental/gruft_layout.json";

        /// <summary>Folder of the dungeon scenes.</summary>
        public const string SceneFolder = SetupPaths.ProjectFolder + "/Scenes/Dungeons";

        /// <summary>Scene of the crypt.</summary>
        public const string ScenePath = SceneFolder + "/Gruft.unity";

        /// <summary>Materials of the crypt.</summary>
        public const string MaterialFolder = SetupPaths.ProjectFolder + "/Art/Materials/Gruft";

        /// <summary>Quest items (blade fragment, seal stone).</summary>
        public const string QuestItemFolder = TestGroundPaths.ItemFolder + "/Quest";

        /// <summary>Installer of the world object states and arrival anchors.</summary>
        public const string WorldObjectsInstallerPath = SetupPaths.BootSettingsFolder + "/WorldObjectsInstaller.asset";

        /// <summary>Installer that saves the world object states (Aetherfall.World.Gameplay).</summary>
        public const string WorldSaveInstallerPath = SetupPaths.BootSettingsFolder + "/WorldSaveInstaller.asset";

        /// <summary>Installer of the boss health bar.</summary>
        public const string BossInstallerPath = SetupPaths.BootSettingsFolder + "/BossInstaller.asset";

        /// <summary>Skeleton warrior (normal).</summary>
        public const string SkeletonPath = TestGroundPaths.EnemyFolder + "/Skelett_Krieger.asset";

        /// <summary>Skeleton warrior (elite with tower shield).</summary>
        public const string SkeletonElitePath = TestGroundPaths.EnemyFolder + "/Skelett_Krieger_Elite.asset";

        /// <summary>Skeleton warrior (champion: base of the boss).</summary>
        public const string SkeletonChampionPath = TestGroundPaths.EnemyFolder + "/Skelett_Krieger_Champion.asset";

        /// <summary>The boss "Der Wachende Ritter".</summary>
        public const string BossPath = TestGroundPaths.EnemyFolder + "/Boss_Wachender_Ritter.asset";

        /// <summary>Enemy type id of the skeleton warrior (GDD 01 11).</summary>
        public const string SkeletonTypeId = "enemy.untot.skelett_krieger";

        /// <summary>Loot table of the skeleton warriors.</summary>
        public const string SkeletonLootTableId = "loot.enemy.untot.skelett";

        /// <summary>Loot table of the boss (random part; the blade fragment is a guaranteed world reward).</summary>
        public const string BossLootTableId = "loot.boss.wachender_ritter";

        /// <summary>Blade fragment "Eidwahrer" (GDD 02 11.7, guaranteed boss loot).</summary>
        public const string BladeFragmentItemId = "item.quest.klingenfragment_eidwahrer";

        /// <summary>The seal stone of the crypt (GDD 02 11.7, stage s60).</summary>
        public const string SealStoneItemId = "item.quest.siegelstein_gruft";

        /// <summary>Gate id: the seal stone can be taken (condition gate).</summary>
        public const string SealStoneGateId = "gate.eichental.gruft_siegelstein";

        /// <summary>
        /// Level of the normal skeletons = area level of the crypt (gruft_layout.json "areaLevel") = level of the quest
        /// (<see cref="Narrative.MiniSliceQuestLibrary.CryptLevel"/>, Mini-Slice: 4 instead of 6).
        /// </summary>
        public const int SkeletonLevel = Narrative.MiniSliceQuestLibrary.CryptLevel;

        /// <summary>Level of the elite skeleton (GDD 03 9.7: elite +2).</summary>
        public const int EliteLevel = SkeletonLevel + 2;

        /// <summary>Level of the boss (champion +3).</summary>
        public const int BossLevel = SkeletonLevel + 3;
    }
}
