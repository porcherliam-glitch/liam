using System;
using System.IO;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Data;
using Aetherfall.EditorTools.Core;
using Aetherfall.GameTime;
using Aetherfall.Input;
using Aetherfall.Inventory;
using Aetherfall.Player;
using Aetherfall.Progression;
using Aetherfall.Quests;
using Aetherfall.SaveSystem;
using Aetherfall.WorldState;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Assets of the test ground: folders, coloured URP/Lit materials, the player movement settings and the installers
    /// of Input, Save, GameTime, Content, Inventory, Combat, AI, Conditions, WorldState, Progression and Quests in the
    /// BootConfig. Existing assets are reused and never overwritten.
    /// </summary>
    public static class TestGroundAssets
    {
        /// <summary>Shader of all test materials.</summary>
        public const string LitShaderName = "Universal Render Pipeline/Lit";

        private const string FallbackShaderName = "Standard";
        private const string InstallersField = "installers";

        /// <summary>Creates an asset folder and all missing parents. Returns false if that is impossible.</summary>
        /// <param name="folder">Folder path starting with "Assets".</param>
        /// <param name="report">Protocol.</param>
        public static bool EnsureFolder(string folder, TestGroundReport report)
        {
            if (AssetDatabase.IsValidFolder(folder))
            {
                return true;
            }

            int slash = folder.LastIndexOf('/');
            if (slash <= 0 || !EnsureFolder(folder.Substring(0, slash), report))
            {
                return false;
            }

            string parent = folder.Substring(0, slash);
            string name = folder.Substring(slash + 1);
            if (File.Exists(Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, folder)))
            {
                report.Warning("Ordner " + folder + " kann nicht angelegt werden: Es gibt eine Datei mit diesem Namen.");
                return false;
            }

            AssetDatabase.CreateFolder(parent, name);
            report.Info("Ordner angelegt: " + folder);
            return AssetDatabase.IsValidFolder(folder);
        }

        /// <summary>Loads or creates a coloured URP/Lit material in the test material folder.</summary>
        /// <param name="fileName">File name without extension, e.g. "TestGround".</param>
        /// <param name="color">Base colour of a newly created material.</param>
        /// <param name="report">Protocol.</param>
        public static Material EnsureMaterial(string fileName, Color color, TestGroundReport report)
        {
            string path = TestGroundPaths.MaterialFolder + "/" + fileName + ".mat";
            Material existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null)
            {
                return existing;
            }

            Shader shader = Shader.Find(LitShaderName);
            if (shader == null)
            {
                report.Warning("Shader „" + LitShaderName + "“ nicht gefunden (URP fehlt?). " + fileName + " nutzt „" + FallbackShaderName + "“.");
                shader = Shader.Find(FallbackShaderName);
            }

            var material = new Material(shader) { name = fileName };
            if (material.HasProperty("_BaseColor"))
            {
                material.SetColor("_BaseColor", color);
            }

            if (material.HasProperty("_Color"))
            {
                material.SetColor("_Color", color);
            }

            if (material.HasProperty("_Smoothness"))
            {
                material.SetFloat("_Smoothness", 0.2f);
            }

            AssetDatabase.CreateAsset(material, path);
            report.Info("Material angelegt: " + path);
            return material;
        }

        /// <summary>Loads or creates the movement settings asset (default values = GDD 03 3.1).</summary>
        /// <param name="report">Protocol.</param>
        public static PlayerMovementSettings EnsureMovementSettings(TestGroundReport report)
        {
            PlayerMovementSettings settings = AssetDatabase.LoadAssetAtPath<PlayerMovementSettings>(TestGroundPaths.MovementSettingsPath);
            if (settings != null)
            {
                report.Info("Vorhanden (unverändert): " + TestGroundPaths.MovementSettingsPath);
                return settings;
            }

            if (File.Exists(FullPath(TestGroundPaths.MovementSettingsPath)))
            {
                report.Warning(TestGroundPaths.MovementSettingsPath + " existiert, ist aber kein PlayerMovementSettings – bitte prüfen.");
                return null;
            }

            settings = ScriptableObject.CreateInstance<PlayerMovementSettings>();
            AssetDatabase.CreateAsset(settings, TestGroundPaths.MovementSettingsPath);
            report.Info("Angelegt: " + TestGroundPaths.MovementSettingsPath + " (Werte aus GDD 03, Abschnitt 3.1)");
            return settings;
        }

        /// <summary>
        /// Loads or creates the InputInstaller asset and inserts it into the BootConfig directly after the GameState
        /// installer, unless the list already contains an InputInstaller.
        /// </summary>
        /// <param name="report">Protocol.</param>
        /// <returns>True if the BootConfig contains an InputInstaller afterwards.</returns>
        public static bool EnsureInputInstallerInBootConfig(TestGroundReport report)
        {
            return EnsureInstallerInBootConfig<InputInstaller>(TestGroundPaths.InputInstallerPath, report, typeof(GameStateInstaller));
        }

        /// <summary>
        /// Loads or creates the SaveInstaller and GameTimeInstaller assets and puts them into the BootConfig in the order of
        /// architecture 4.1: SaveInstaller (step 9) behind the GameState and Input installers, GameTimeInstaller (step 10)
        /// directly behind the SaveInstaller. Idempotent: entries at a valid position stay where they are, entries in front
        /// of a required installer are moved behind it.
        /// </summary>
        /// <param name="report">Protocol.</param>
        /// <returns>True if both installers are in the BootConfig afterwards.</returns>
        public static bool EnsureSaveInstallersInBootConfig(TestGroundReport report)
        {
            bool save = EnsureInstallerInBootConfig<SaveInstaller>(TestGroundPaths.SaveInstallerPath, report,
                typeof(GameStateInstaller), typeof(InputInstaller));
            bool time = save && EnsureInstallerInBootConfig<GameTimeInstaller>(TestGroundPaths.GameTimeInstallerPath, report,
                typeof(SaveInstaller));
            return save && time;
        }

        /// <summary>
        /// Loads or creates the CombatInstaller and AIInstaller assets and puts them into the BootConfig in the order of
        /// architecture 4.1: CombatInstaller (step 12, domain services) behind the EventBus and GameTime installers, AIInstaller
        /// (step 13, token manager) directly behind the CombatInstaller. Fills the empty field "Settings" of the combat installer.
        /// </summary>
        /// <param name="settings">Combat settings for the combat installer (may be null).</param>
        /// <param name="report">Protocol.</param>
        /// <returns>True if both installers are in the BootConfig afterwards.</returns>
        public static bool EnsureCombatInstallersInBootConfig(CombatSettings settings, TestGroundReport report)
        {
            bool combat = EnsureInstallerInBootConfig<CombatInstaller>(TestGroundPaths.CombatInstallerPath, report, typeof(EventBusInstaller),
                typeof(GameTimeInstaller));
            if (combat && settings != null)
            {
                CombatInstaller installer = AssetDatabase.LoadAssetAtPath<CombatInstaller>(TestGroundPaths.CombatInstallerPath);
                if (installer != null)
                {
                    var serialized = new SerializedObject(installer);
                    SerializedProperty field = serialized.FindProperty("settings");
                    if (field != null && field.objectReferenceValue == null)
                    {
                        field.objectReferenceValue = settings;
                        serialized.ApplyModifiedPropertiesWithoutUndo();
                        EditorUtility.SetDirty(installer);
                    }
                }
            }

            bool ai = combat && EnsureInstallerInBootConfig<AIInstaller>(TestGroundPaths.AIInstallerPath, report, typeof(CombatInstaller));
            return combat && ai;
        }

        /// <summary>
        /// Loads or creates the ContentInstaller and InventoryInstaller assets and puts them into the BootConfig in the order
        /// of architecture 4.1: ContentInstaller (step 7, content database) behind the EventBus and Input installers,
        /// InventoryInstaller (step 12, Items/Loot and Inventory before the combat configuration) behind the Save, GameTime and
        /// Content installers. Adds the catalog to the content installer if it is missing and fills the empty field
        /// "Startausruestung" (starting equipment) of the inventory installer.
        /// </summary>
        /// <param name="catalog">Content catalog (may be null).</param>
        /// <param name="startingEquipment">Starting equipment of the warrior (may be null).</param>
        /// <param name="report">Protocol.</param>
        /// <returns>True if both installers are in the BootConfig afterwards.</returns>
        public static bool EnsureItemInstallersInBootConfig(ContentCatalog catalog, StartingEquipment startingEquipment, TestGroundReport report)
        {
            bool content = EnsureInstallerInBootConfig<ContentInstaller>(TestGroundPaths.ContentInstallerPath, report, typeof(EventBusInstaller),
                typeof(InputInstaller));
            if (content && catalog != null)
            {
                ContentInstaller installer = AssetDatabase.LoadAssetAtPath<ContentInstaller>(TestGroundPaths.ContentInstallerPath);
                if (installer != null)
                {
                    AddToList(installer, "catalogs", catalog, report);
                }
            }

            bool inventory = content && EnsureInstallerInBootConfig<InventoryInstaller>(TestGroundPaths.InventoryInstallerPath, report,
                typeof(SaveInstaller), typeof(GameTimeInstaller), typeof(ContentInstaller));
            if (inventory && startingEquipment != null)
            {
                InventoryInstaller installer = AssetDatabase.LoadAssetAtPath<InventoryInstaller>(TestGroundPaths.InventoryInstallerPath);
                if (installer != null)
                {
                    var serialized = new SerializedObject(installer);
                    SerializedProperty field = serialized.FindProperty("startingEquipment");
                    if (field != null && field.objectReferenceValue == null)
                    {
                        field.objectReferenceValue = startingEquipment;
                        serialized.ApplyModifiedPropertiesWithoutUndo();
                        EditorUtility.SetDirty(installer);
                        report.Info("InventoryInstaller: Startausrüstung " + TestGroundPaths.StartingEquipmentPath + " eingetragen.");
                    }
                }
            }

            return content && inventory;
        }

        /// <summary>
        /// Loads or creates the installers of conditions, world state, progression and quests and puts them into the BootConfig
        /// in the order of architecture 4.1 and guide 08, 11.1: ConditionsInstaller behind the EventBus and GameTime installers,
        /// WorldStateInstaller behind Conditions, Save, GameTime and Content, ProgressionInstaller behind EventBus, Save and
        /// Inventory, QuestInstaller behind WorldState, Inventory and Progression (quest rewards give items and experience).
        /// Idempotent like <see cref="EnsureInstallerInBootConfig{T}"/>.
        /// </summary>
        /// <param name="report">Protocol.</param>
        /// <returns>True if all four installers are in the BootConfig afterwards.</returns>
        public static bool EnsureNarrativeInstallersInBootConfig(TestGroundReport report)
        {
            bool conditions = EnsureInstallerInBootConfig<ConditionsInstaller>(TestGroundPaths.ConditionsInstallerPath, report,
                typeof(EventBusInstaller), typeof(GameTimeInstaller));
            bool worldState = conditions && EnsureInstallerInBootConfig<WorldStateInstaller>(TestGroundPaths.WorldStateInstallerPath, report,
                typeof(ConditionsInstaller), typeof(SaveInstaller), typeof(GameTimeInstaller), typeof(ContentInstaller));
            bool progression = EnsureInstallerInBootConfig<ProgressionInstaller>(TestGroundPaths.ProgressionInstallerPath, report,
                typeof(EventBusInstaller), typeof(SaveInstaller), typeof(InventoryInstaller));
            if (progression)
            {
                SetProgressionStartLevel(report);
            }

            bool quests = worldState && progression && EnsureInstallerInBootConfig<QuestInstaller>(TestGroundPaths.QuestInstallerPath, report,
                typeof(WorldStateInstaller), typeof(InventoryInstaller), typeof(ProgressionInstaller));
            return conditions && worldState && progression && quests;
        }

        /// <summary>
        /// Sets the field "Startstufe neues Spiel (nur Test)" of the ProgressionInstaller to the level of the test character
        /// (<see cref="Aetherfall.EditorTools.Narrative.TestGroundLevels.PlayerStartLevel"/>, warrior of GDD 03 8.3). Without it a
        /// new game would start at level 1: fewer health points than in guide 05, and the starting equipment and chest loot of
        /// item level 10 could not be equipped (GDD 04 2.4: player level ≥ item level − 3).
        /// </summary>
        /// <param name="report">Protocol.</param>
        private static void SetProgressionStartLevel(TestGroundReport report)
        {
            ProgressionInstaller installer = AssetDatabase.LoadAssetAtPath<ProgressionInstaller>(TestGroundPaths.ProgressionInstallerPath);
            if (installer == null)
            {
                return;
            }

            const int startLevel = Aetherfall.EditorTools.Narrative.TestGroundLevels.PlayerStartLevel;
            var serialized = new SerializedObject(installer);
            SerializedProperty field = serialized.FindProperty("newGameStartLevel");
            if (field == null)
            {
                report.Warning("ProgressionInstaller: Feld „newGameStartLevel“ nicht gefunden. Bitte „Startstufe neues Spiel (nur Test)“ " +
                               "von Hand auf " + startLevel + " stellen.");
                return;
            }

            if (field.intValue == startLevel)
            {
                return;
            }

            field.intValue = startLevel;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(installer);
            report.Info("ProgressionInstaller: Startstufe neues Spiel = " + startLevel + " (Testgelände, nur zum Testen; vor dem Mini-Slice wieder 1).");
        }

        /// <summary>
        /// Loads or creates an installer asset and makes sure the BootConfig lists it once, behind every entry of the
        /// <paramref name="placeAfter"/> types (the installers whose services it requires).
        /// </summary>
        /// <typeparam name="T">Installer type.</typeparam>
        /// <param name="assetPath">Asset path of the installer.</param>
        /// <param name="report">Protocol.</param>
        /// <param name="placeAfter">Installer types that must come first.</param>
        /// <returns>True if the BootConfig contains the installer afterwards.</returns>
        public static bool EnsureInstallerInBootConfig<T>(string assetPath, TestGroundReport report, params Type[] placeAfter) where T : ServiceInstaller
        {
            string typeName = typeof(T).Name;
            BootConfig bootConfig = AssetDatabase.LoadAssetAtPath<BootConfig>(SetupPaths.BootConfigAssetPath);
            if (bootConfig == null)
            {
                report.Warning("BootConfig fehlt (" + SetupPaths.BootConfigAssetPath + "). Bitte zuerst „Aetherfall > Projekt-Setup …“, " +
                               "Schritt e) ausführen und dieses Menü danach erneut aufrufen.");
                return false;
            }

            T installer = AssetDatabase.LoadAssetAtPath<T>(assetPath);
            if (installer == null)
            {
                if (File.Exists(FullPath(assetPath)))
                {
                    report.Warning(assetPath + " existiert, ist aber kein " + typeName + " – bitte prüfen.");
                    return false;
                }

                installer = ScriptableObject.CreateInstance<T>();
                AssetDatabase.CreateAsset(installer, assetPath);
                report.Info("Angelegt: " + assetPath);
            }

            var serialized = new SerializedObject(bootConfig);
            SerializedProperty list = serialized.FindProperty(InstallersField);
            if (list == null || !list.isArray)
            {
                report.Warning("Feld „" + InstallersField + "“ der BootConfig nicht gefunden. Bitte den " + typeName + " von Hand " +
                               "eintragen (Reihenfolge: Log, EventBus, GameState, Input, Save, GameTime).");
                return false;
            }

            int existing = -1;
            int lastRequired = -1;
            for (int i = 0; i < list.arraySize; i++)
            {
                Object entry = list.GetArrayElementAtIndex(i).objectReferenceValue;
                if (entry is T && existing < 0)
                {
                    existing = i;
                }

                for (int t = 0; t < placeAfter.Length; t++)
                {
                    if (entry != null && placeAfter[t].IsInstanceOfType(entry))
                    {
                        lastRequired = Math.Max(lastRequired, i);
                    }
                }
            }

            if (existing >= 0)
            {
                if (existing > lastRequired)
                {
                    report.Info("BootConfig enthält bereits einen " + typeName + " (Element " + existing + ", unverändert).");
                    return true;
                }

                list.MoveArrayElement(existing, lastRequired);
                serialized.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(bootConfig);
                report.Info(typeName + " in der BootConfig hinter die benötigten Installer verschoben (jetzt Element " + lastRequired + ").");
                return true;
            }

            if (lastRequired < 0)
            {
                report.Warning("Keiner der benötigten Installer (" + DescribeTypes(placeAfter) + ") steht in der BootConfig – der " + typeName +
                               " wird ans Ende gehängt. Projekt-Setup, Schritt e) prüfen.");
            }

            int insertAt = lastRequired >= 0 ? lastRequired + 1 : list.arraySize;
            if (insertAt >= list.arraySize)
            {
                list.arraySize++;
                insertAt = list.arraySize - 1;
            }
            else
            {
                list.InsertArrayElementAtIndex(insertAt);
            }

            list.GetArrayElementAtIndex(insertAt).objectReferenceValue = installer;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(bootConfig);
            report.Info(typeName + " in die BootConfig eingetragen (Element " + insertAt + ", hinter " + DescribeTypes(placeAfter) + ").");
            return true;
        }

        private static void AddToList(Object target, string field, Object value, TestGroundReport report)
        {
            var serialized = new SerializedObject(target);
            SerializedProperty list = serialized.FindProperty(field);
            if (list == null || !list.isArray)
            {
                report.Warning("Feld „" + field + "“ an " + target.GetType().Name + " nicht gefunden – bitte " + value.name + " von Hand eintragen.");
                return;
            }

            for (int i = list.arraySize - 1; i >= 0; i--)
            {
                Object entry = list.GetArrayElementAtIndex(i).objectReferenceValue;
                if (entry == value)
                {
                    return;
                }

                if (entry == null)
                {
                    list.DeleteArrayElementAtIndex(i);
                }
            }

            list.arraySize++;
            list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(target);
            report.Info(target.name + ": " + value.name + " eingetragen.");
        }

        private static string DescribeTypes(Type[] types)
        {
            var names = new string[types.Length];
            for (int i = 0; i < types.Length; i++)
            {
                names[i] = types[i].Name;
            }

            return string.Join(", ", names);
        }

        private static string FullPath(string assetPath)
        {
            return Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, assetPath);
        }
    }
}
