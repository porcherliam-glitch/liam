using System;
using System.Collections.Generic;
using Aetherfall.Core;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Aetherfall.EditorTools.Core
{
    /// <summary>
    /// Step e) of the project setup (architecture 2.7 #42, 4.1): creates the boot assets in
    /// <c>Assets/_Project/Settings/Boot/</c> (LogSettings, LogInstaller, EventBusInstaller, GameStateInstaller, BootConfig
    /// with the installer order Log → EventBus → GameState), the boot scene <c>Scenes/Boot/Boot.unity</c> and enters it as
    /// the only scene with index 0 in the scene list.
    /// </summary>
    /// <remarks>
    /// <para>Existing assets are never overwritten. Empty references are filled. Replacing a non-empty installer list,
    /// completing an existing boot scene and replacing the scene list ask first.</para>
    /// <para>Scene layout (as described in docs/Anleitungen/02_Test_Phase1_Fundament.md, section 3): GameObject
    /// "GameBootstrapper" with <see cref="GameBootstrapper"/> and <see cref="TickRunner"/> (the field <c>tickRunner</c> points
    /// to it), GameObject "DevTools" with the developer overlay <c>Aetherfall.DevTools.GameStateDebugOverlay</c>.</para>
    /// <para>The overlay type is looked up by name (<see cref="OverlayTypeName"/>): this assembly (no. 33) may only reference
    /// the assemblies 1–5 (architecture 3.3), not Aetherfall.DevTools (no. 32). If the type cannot be found, the step skips
    /// the overlay and says so in the protocol.</para>
    /// </remarks>
    [Serializable]
    internal sealed class BootContentSetupStep : SetupStep
    {
        // Serialized field names of the Core types (see docs/Anleitungen/02, section 9 "Wichtige Feldnamen").
        private const string BootConfigField = "bootConfig";
        private const string TickRunnerField = "tickRunner";
        private const string InstallersField = "installers";
        private const string LogSettingsField = "logSettings";

        // Assembly-qualified name of the overlay in Aetherfall.DevTools (resolved at runtime, see remarks).
        private const string OverlayTypeName = "Aetherfall.DevTools.GameStateDebugOverlay, Aetherfall.DevTools";
        private const string OverlayFullName = "Aetherfall.DevTools.GameStateDebugOverlay";
        private const string OverlayDisplayName = "GameStateDebugOverlay";

        /// <inheritdoc />
        public override string Letter => "e";

        /// <inheritdoc />
        public override string Title => "Boot-Inhalte und Boot-Szene";

        /// <inheritdoc />
        public override string Description =>
            "Legt in Assets/_Project/Settings/Boot/ die Assets LogSettings, LogInstaller, EventBusInstaller, GameStateInstaller und BootConfig an " +
            "(Installer-Reihenfolge Log → EventBus → GameState), dazu die Boot-Szene Assets/_Project/Scenes/Boot/Boot.unity mit GameBootstrapper, " +
            "TickRunner und DevTools-Overlay, und trägt sie als einzige Szene mit Index 0 in die Szenenliste ein. Vorhandenes wird nicht überschrieben.";

        /// <inheritdoc />
        public override void Run(SetupLog log)
        {
            if (!AssetFolderUtility.EnsureAssetFolder(SetupPaths.BootSettingsFolder, log) ||
                !AssetFolderUtility.EnsureAssetFolder(SetupPaths.BootSceneFolder, log))
            {
                log.Error("e) Abbruch: Die Ordner für Boot-Assets und Boot-Szene fehlen.");
                return;
            }

            LogSettings logSettings = EnsureAsset<LogSettings>(SetupPaths.LogSettingsAssetPath, log);
            LogInstaller logInstaller = EnsureAsset<LogInstaller>(SetupPaths.LogInstallerAssetPath, log);
            EventBusInstaller eventBusInstaller = EnsureAsset<EventBusInstaller>(SetupPaths.EventBusInstallerAssetPath, log);
            GameStateInstaller gameStateInstaller = EnsureAsset<GameStateInstaller>(SetupPaths.GameStateInstallerAssetPath, log);
            BootConfig bootConfig = EnsureAsset<BootConfig>(SetupPaths.BootConfigAssetPath, log);

            if (logInstaller != null && logSettings != null)
            {
                FillEmptyReference(logInstaller, LogSettingsField, logSettings, log);
            }

            if (bootConfig != null && logInstaller != null && eventBusInstaller != null && gameStateInstaller != null)
            {
                EnsureInstallerList(bootConfig, new ServiceInstaller[] { logInstaller, eventBusInstaller, gameStateInstaller }, log);
            }
            else
            {
                log.Warning("e) Installer-Liste nicht gesetzt, weil eines der Boot-Assets fehlt (siehe Meldungen oben).");
            }

            AssetDatabase.SaveAssets();

            if (bootConfig == null)
            {
                log.Error("e) Boot-Szene nicht angelegt: BootConfig.asset fehlt oder ist kein BootConfig.");
                return;
            }

            if (!EnsureBootScene(bootConfig, log))
            {
                return;
            }

            EnsureSceneList(log);
        }

        /// <inheritdoc />
        protected override void CollectItems(List<SetupCheckItem> items)
        {
            items.Add(DescribeAsset<LogSettings>(SetupPaths.LogSettingsAssetPath));
            items.Add(DescribeLogInstaller());
            items.Add(DescribeAsset<EventBusInstaller>(SetupPaths.EventBusInstallerAssetPath));
            items.Add(DescribeAsset<GameStateInstaller>(SetupPaths.GameStateInstallerAssetPath));
            items.Add(DescribeBootConfig());
            DescribeBootScene(items);
            items.Add(DescribeSceneList());
        }

        private static SetupCheckItem DescribeAsset<T>(string path) where T : ScriptableObject
        {
            T asset = AssetDatabase.LoadAssetAtPath<T>(path);
            if (asset != null)
            {
                return new SetupCheckItem(path, SetupStatus.Done, typeof(T).Name);
            }

            return AssetFolderUtility.Exists(path)
                ? new SetupCheckItem(path, SetupStatus.Open, "Datei existiert, ist aber kein " + typeof(T).Name + " – bitte prüfen (wird nicht überschrieben)")
                : new SetupCheckItem(path, SetupStatus.Open, "fehlt – wird angelegt");
        }

        private static SetupCheckItem DescribeLogInstaller()
        {
            SetupCheckItem asset = DescribeAsset<LogInstaller>(SetupPaths.LogInstallerAssetPath);
            if (asset.Status != SetupStatus.Done)
            {
                return asset;
            }

            LogInstaller installer = AssetDatabase.LoadAssetAtPath<LogInstaller>(SetupPaths.LogInstallerAssetPath);
            var serialized = new SerializedObject(installer);
            SerializedProperty property = serialized.FindProperty(LogSettingsField);
            if (property == null)
            {
                return new SetupCheckItem(SetupPaths.LogInstallerAssetPath, SetupStatus.Unknown, "Feld '" + LogSettingsField + "' nicht gefunden (Code geändert?)");
            }

            return property.objectReferenceValue != null
                ? new SetupCheckItem(SetupPaths.LogInstallerAssetPath, SetupStatus.Done, "LogInstaller, Log Settings = " + property.objectReferenceValue.name)
                : new SetupCheckItem(SetupPaths.LogInstallerAssetPath, SetupStatus.Open, "Feld „Log Settings“ ist leer – wird mit LogSettings.asset belegt");
        }

        private static SetupCheckItem DescribeBootConfig()
        {
            SetupCheckItem asset = DescribeAsset<BootConfig>(SetupPaths.BootConfigAssetPath);
            if (asset.Status != SetupStatus.Done)
            {
                return asset;
            }

            BootConfig config = AssetDatabase.LoadAssetAtPath<BootConfig>(SetupPaths.BootConfigAssetPath);
            string problem = CheckInstallerList(config.Installers);
            return problem.Length == 0
                ? new SetupCheckItem(SetupPaths.BootConfigAssetPath, SetupStatus.Done, "Installer: " + DescribeInstallers(config.Installers))
                : new SetupCheckItem(SetupPaths.BootConfigAssetPath, SetupStatus.Open, problem, "Project-Fenster: BootConfig anklicken > Inspector > Installers");
        }

        private static void DescribeBootScene(List<SetupCheckItem> items)
        {
            if (!AssetFolderUtility.Exists(SetupPaths.BootScenePath))
            {
                items.Add(new SetupCheckItem(SetupPaths.BootScenePath, SetupStatus.Open, "fehlt – wird angelegt"));
                return;
            }

            string[] dependencies = AssetDatabase.GetDependencies(SetupPaths.BootScenePath, false);
            bool hasBootstrapper = UsesScript(dependencies, typeof(GameBootstrapper));
            bool hasTickRunner = UsesScript(dependencies, typeof(TickRunner));
            Type overlayType = FindOverlayType();
            bool hasOverlay = overlayType != null && UsesScript(dependencies, overlayType);
            bool referencesBootConfig = Array.IndexOf(dependencies, SetupPaths.BootConfigAssetPath) >= 0;

            items.Add(new SetupCheckItem(SetupPaths.BootScenePath, SetupStatus.Done, "vorhanden"));
            items.Add(new SetupCheckItem("Boot-Szene: GameBootstrapper mit BootConfig", hasBootstrapper && referencesBootConfig ? SetupStatus.Done : SetupStatus.Open,
                !hasBootstrapper ? "Komponente fehlt – wird ergänzt (nach Rückfrage)"
                : referencesBootConfig ? "Feld „Boot Config“ zeigt auf BootConfig.asset"
                : "Feld „Boot Config“ ist leer oder zeigt auf ein anderes Asset – wird gesetzt, falls leer",
                "Hierarchy: GameBootstrapper > Inspector > Boot Config"));
            items.Add(new SetupCheckItem("Boot-Szene: TickRunner", hasTickRunner ? SetupStatus.Done : SetupStatus.Open,
                hasTickRunner ? "vorhanden" : "fehlt – wird am GameBootstrapper ergänzt (nach Rückfrage)"));
            items.Add(overlayType == null
                ? new SetupCheckItem("Boot-Szene: " + OverlayDisplayName, SetupStatus.Unknown, DescribeMissingOverlayType())
                : new SetupCheckItem("Boot-Szene: " + OverlayDisplayName, hasOverlay ? SetupStatus.Done : SetupStatus.Open,
                    hasOverlay ? "vorhanden" : "fehlt – wird als GameObject „DevTools“ ergänzt (nach Rückfrage)"));
        }

        private static SetupCheckItem DescribeSceneList()
        {
            EditorBuildSettingsScene[] scenes = EditorBuildSettings.scenes;
            const string label = "Szenenliste: nur Boot.unity mit Index 0";
            const string menu = "File > Build Profiles > Scene List";
            if (IsSceneListCorrect(scenes))
            {
                return new SetupCheckItem(label, SetupStatus.Done, SetupPaths.BootScenePath, menu);
            }

            return new SetupCheckItem(label, SetupStatus.Open, "aktuell: " + DescribeScenes(scenes) + " – wird ersetzt (nach Rückfrage, falls andere Szenen enthalten sind)", menu);
        }

        private static T EnsureAsset<T>(string path, SetupLog log) where T : ScriptableObject
        {
            T existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing != null)
            {
                log.Info("e) Vorhanden (unverändert): " + path);
                return existing;
            }

            if (AssetFolderUtility.Exists(path))
            {
                log.Error("e) " + path + " existiert, ist aber kein " + typeof(T).Name + ". Die Datei wird nicht überschrieben – bitte prüfen oder umbenennen.");
                return null;
            }

            T created = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(created, path);
            log.Info("e) Angelegt: " + path + " (" + typeof(T).Name + ")");
            return created;
        }

        private static void FillEmptyReference(UnityEngine.Object target, string fieldName, UnityEngine.Object value, SetupLog log)
        {
            var serialized = new SerializedObject(target);
            SerializedProperty property = serialized.FindProperty(fieldName);
            if (property == null)
            {
                log.Error("e) Feld '" + fieldName + "' an " + target.name + " nicht gefunden. Wurde der Code umbenannt? Bitte von Hand setzen.");
                return;
            }

            if (property.objectReferenceValue != null)
            {
                return;
            }

            property.objectReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(target);
            log.Info("e) " + target.name + "." + fieldName + " = " + value.name);
        }

        private static void EnsureInstallerList(BootConfig bootConfig, ServiceInstaller[] baseInstallers, SetupLog log)
        {
            var serialized = new SerializedObject(bootConfig);
            SerializedProperty list = serialized.FindProperty(InstallersField);
            if (list == null || !list.isArray)
            {
                log.Error("e) Feld '" + InstallersField + "' an BootConfig nicht gefunden. Bitte die Installer von Hand eintragen (Anleitung 02, Abschnitt 3.1).");
                return;
            }

            if (list.arraySize > 0)
            {
                string problem = CheckInstallerList(bootConfig.Installers);
                if (problem.Length == 0)
                {
                    log.Info("e) Installer-Liste der BootConfig ist gültig (unverändert): " + DescribeInstallers(bootConfig.Installers));
                    return;
                }

                bool replace = EditorUtility.DisplayDialog(
                    "Installer-Liste ersetzen?",
                    "Die Installer-Liste von BootConfig.asset ist nicht gültig:\n\n" + problem +
                    "\n\nAktuell: " + DescribeInstallers(bootConfig.Installers) +
                    "\n\nErsetzen durch: LogInstaller → EventBusInstaller → GameStateInstaller?\nAndere Einträge gehen dabei verloren.",
                    "Ersetzen",
                    "Nicht ändern");
                if (!replace)
                {
                    log.Warning("e) Installer-Liste nicht geändert. Bitte von Hand korrigieren: " + problem);
                    return;
                }
            }

            list.arraySize = baseInstallers.Length;
            for (int i = 0; i < baseInstallers.Length; i++)
            {
                list.GetArrayElementAtIndex(i).objectReferenceValue = baseInstallers[i];
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(bootConfig);
            log.Info("e) Installer-Liste der BootConfig gesetzt: " + DescribeInstallers(bootConfig.Installers));
        }

        /// <summary>Returns an empty string if the list is valid and contains Log → EventBus → GameState in this relative order.</summary>
        private static string CheckInstallerList(IReadOnlyList<ServiceInstaller> installers)
        {
            var descriptions = new List<IInstallerDescription>(installers.Count);
            int logIndex = -1;
            int eventBusIndex = -1;
            int gameStateIndex = -1;
            for (int i = 0; i < installers.Count; i++)
            {
                ServiceInstaller installer = installers[i];
                bool present = installer != null;
                descriptions.Add(present ? installer : null);
                if (!present)
                {
                    continue;
                }

                if (installer is LogInstaller && logIndex < 0)
                {
                    logIndex = i;
                }
                else if (installer is EventBusInstaller && eventBusIndex < 0)
                {
                    eventBusIndex = i;
                }
                else if (installer is GameStateInstaller && gameStateIndex < 0)
                {
                    gameStateIndex = i;
                }
            }

            if (installers.Count == 0)
            {
                return "Die Liste „Installers“ ist leer – wird mit Log → EventBus → GameState gefüllt.";
            }

            InstallerValidationResult validation = InstallerOrderValidator.Validate(descriptions, new[] { typeof(IGameStateService) });
            if (!validation.IsValid)
            {
                return validation.BuildReport("Reihenfolge-Prüfung des Bootstrappers schlägt fehl:");
            }

            if (logIndex < 0 || eventBusIndex < 0 || gameStateIndex < 0 || !(logIndex < eventBusIndex && eventBusIndex < gameStateIndex))
            {
                return "Erwartet werden LogInstaller, EventBusInstaller und GameStateInstaller in dieser Reihenfolge (Architektur 4.1).";
            }

            return string.Empty;
        }

        private static bool EnsureBootScene(BootConfig bootConfig, SetupLog log)
        {
            bool sceneExists = AssetFolderUtility.Exists(SetupPaths.BootScenePath);
            if (sceneExists)
            {
                string[] dependencies = AssetDatabase.GetDependencies(SetupPaths.BootScenePath, false);
                Type overlayType = FindOverlayType();
                bool complete = UsesScript(dependencies, typeof(GameBootstrapper)) &&
                                UsesScript(dependencies, typeof(TickRunner)) &&
                                (overlayType == null || UsesScript(dependencies, overlayType)) &&
                                Array.IndexOf(dependencies, SetupPaths.BootConfigAssetPath) >= 0;
                if (complete)
                {
                    log.Info("e) Boot-Szene vollständig (unverändert): " + SetupPaths.BootScenePath);
                    return true;
                }

                if (!EditorUtility.DisplayDialog(
                        "Boot-Szene ergänzen?",
                        "Die vorhandene Boot-Szene " + SetupPaths.BootScenePath + " ist unvollständig.\n\n" +
                        "Fehlende Objekte und Komponenten (GameBootstrapper, TickRunner, DevTools-Overlay) und leere Felder werden ergänzt. " +
                        "Vorhandene Objekte und belegte Felder bleiben unverändert. Die Szene wird dazu geöffnet und gespeichert.",
                        "Ergänzen",
                        "Abbrechen"))
                {
                    log.Info("e) Boot-Szene nicht verändert (abgebrochen).");
                    return true;
                }
            }

            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                log.Info("e) Abgebrochen – die geöffneten Szenen wurden nicht gespeichert, die Boot-Szene wurde nicht " + (sceneExists ? "ergänzt." : "angelegt."));
                return false;
            }

            Scene scene = sceneExists
                ? EditorSceneManager.OpenScene(SetupPaths.BootScenePath, OpenSceneMode.Single)
                : EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            if (!scene.IsValid())
            {
                log.Error("e) Boot-Szene konnte nicht " + (sceneExists ? "geöffnet" : "erzeugt") + " werden.");
                return false;
            }

            PopulateBootScene(scene, bootConfig, log);

            if (!EditorSceneManager.SaveScene(scene, SetupPaths.BootScenePath))
            {
                log.Error("e) Boot-Szene konnte nicht gespeichert werden: " + SetupPaths.BootScenePath);
                return false;
            }

            log.Info("e) Boot-Szene " + (sceneExists ? "ergänzt" : "angelegt") + " und gespeichert: " + SetupPaths.BootScenePath + " (bleibt geöffnet).");
            return true;
        }

        private static void PopulateBootScene(Scene scene, BootConfig bootConfig, SetupLog log)
        {
            GameBootstrapper bootstrapper = FindInScene<GameBootstrapper>(scene);
            if (bootstrapper == null)
            {
                GameObject bootstrapperObject = CreateGameObject(scene, SetupPaths.BootstrapperObjectName);
                bootstrapper = bootstrapperObject.AddComponent<GameBootstrapper>();
                log.Info("e) GameObject „" + SetupPaths.BootstrapperObjectName + "“ mit GameBootstrapper angelegt.");
            }

            TickRunner tickRunner = FindInScene<TickRunner>(scene);
            if (tickRunner == null)
            {
                tickRunner = bootstrapper.gameObject.AddComponent<TickRunner>();
                log.Info("e) TickRunner an „" + bootstrapper.gameObject.name + "“ ergänzt.");
            }

            FillEmptyReference(bootstrapper, BootConfigField, bootConfig, log);
            FillEmptyReference(bootstrapper, TickRunnerField, tickRunner, log);

            Type overlayType = FindOverlayType();
            if (overlayType == null)
            {
                log.Warning("e) " + OverlayDisplayName + " nicht angelegt: " + DescribeMissingOverlayType());
            }
            else if (FindInScene(scene, overlayType) == null)
            {
                GameObject devTools = CreateGameObject(scene, SetupPaths.DevToolsObjectName);
                devTools.AddComponent(overlayType);
                log.Info("e) GameObject „" + SetupPaths.DevToolsObjectName + "“ mit " + OverlayDisplayName + " angelegt.");
            }

            EditorSceneManager.MarkSceneDirty(scene);
        }

        /// <summary>Finds the overlay type of Aetherfall.DevTools by name; null if that assembly is missing or failed to compile.</summary>
        private static Type FindOverlayType()
        {
            Type type = Type.GetType(OverlayTypeName, false);
            if (type != null)
            {
                return type;
            }

            // Fallback in case the assembly-qualified lookup does not resolve the assembly name.
            foreach (Type candidate in TypeCache.GetTypesDerivedFrom<MonoBehaviour>())
            {
                if (candidate.FullName == OverlayFullName)
                {
                    return candidate;
                }
            }

            return null;
        }

        private static string DescribeMissingOverlayType()
        {
            return "Der Typ " + OverlayFullName + " wurde nicht gefunden (Assembly Aetherfall.DevTools fehlt oder hat Compiler-Fehler). " +
                   "Console auf rote Fehler prüfen; danach Schritt e) erneut ausführen.";
        }

        private static GameObject CreateGameObject(Scene scene, string name)
        {
            var gameObject = new GameObject(name);
            if (gameObject.scene != scene)
            {
                SceneManager.MoveGameObjectToScene(gameObject, scene);
            }

            return gameObject;
        }

        private static T FindInScene<T>(Scene scene) where T : Component
        {
            return FindInScene(scene, typeof(T)) as T;
        }

        private static Component FindInScene(Scene scene, Type componentType)
        {
            GameObject[] roots = scene.GetRootGameObjects();
            for (int i = 0; i < roots.Length; i++)
            {
                Component component = roots[i].GetComponentInChildren(componentType, true);
                if (component != null)
                {
                    return component;
                }
            }

            return null;
        }

        private static void EnsureSceneList(SetupLog log)
        {
            EditorBuildSettingsScene[] current = EditorBuildSettings.scenes;
            if (IsSceneListCorrect(current))
            {
                log.Info("e) Szenenliste korrekt (unverändert): nur " + SetupPaths.BootScenePath + " mit Index 0.");
                return;
            }

            bool hasOtherScenes = false;
            for (int i = 0; i < current.Length; i++)
            {
                if (current[i].path != SetupPaths.BootScenePath)
                {
                    hasOtherScenes = true;
                    break;
                }
            }

            if (hasOtherScenes && !EditorUtility.DisplayDialog(
                    "Szenenliste ersetzen?",
                    "Die Szenenliste (File > Build Profiles > Scene List) enthält:\n\n" + DescribeScenes(current) +
                    "\n\nLaut Architektur 4.1 ist Boot.unity die einzige Szene (Index 0); alle anderen Szenen werden später additiv geladen. Liste ersetzen?",
                    "Ersetzen",
                    "Nicht ändern"))
            {
                log.Warning("e) Szenenliste nicht geändert. Boot.unity muss Index 0 haben, sonst startet der Build nicht über den Bootstrapper.");
                return;
            }

            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(SetupPaths.BootScenePath, true) };
            log.Info("e) Szenenliste gesetzt: " + SetupPaths.BootScenePath + " (Index 0, einzige Szene).");
        }

        private static bool IsSceneListCorrect(EditorBuildSettingsScene[] scenes)
        {
            return scenes != null && scenes.Length == 1 && scenes[0].enabled && scenes[0].path == SetupPaths.BootScenePath;
        }

        private static bool UsesScript(string[] dependencies, Type componentType)
        {
            for (int i = 0; i < dependencies.Length; i++)
            {
                if (!dependencies[i].EndsWith(".cs", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                MonoScript script = AssetDatabase.LoadAssetAtPath<MonoScript>(dependencies[i]);
                if (script != null && script.GetClass() == componentType)
                {
                    return true;
                }
            }

            return false;
        }

        private static string DescribeInstallers(IReadOnlyList<ServiceInstaller> installers)
        {
            if (installers == null || installers.Count == 0)
            {
                return "(leer)";
            }

            var names = new List<string>(installers.Count);
            for (int i = 0; i < installers.Count; i++)
            {
                names.Add(installers[i] != null ? installers[i].name : "(leer)");
            }

            return string.Join(" → ", names);
        }

        private static string DescribeScenes(EditorBuildSettingsScene[] scenes)
        {
            if (scenes == null || scenes.Length == 0)
            {
                return "(leer)";
            }

            var lines = new List<string>(scenes.Length);
            for (int i = 0; i < scenes.Length; i++)
            {
                lines.Add(i + ": " + scenes[i].path + (scenes[i].enabled ? string.Empty : " (deaktiviert)"));
            }

            return string.Join(", ", lines);
        }
    }
}
