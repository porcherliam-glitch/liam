using System;
using System.Collections.Generic;
using System.IO;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.EditorTools.Core;
using Aetherfall.GameTime;
using Aetherfall.Input;
using Aetherfall.Inventory;
using Aetherfall.Player;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Sets up the user interface (UI Toolkit, architecture 12) idempotently: the installers <see cref="SceneLoaderInstaller"/>
    /// (boot step 8b) and <see cref="UIInstaller"/> (step 15) in the BootConfig, the panel settings asset with the Aetherfall
    /// theme, the GameObject "UI" with <see cref="UIRoot"/> and one UIDocument per layer in the boot scene, the scene list
    /// (Boot index 0, test ground behind it) and the <see cref="PlayerHudLink"/> on the player of the test ground.
    /// </summary>
    /// <remarks>
    /// Menu <see cref="MenuPath"/> runs the boot scene part alone; "Aetherfall > Testgelaende erstellen" runs everything.
    /// Existing assets and filled fields are kept; only empty fields are filled. Guide: docs/Anleitungen/07_Test_Oberflaeche.md.
    /// </remarks>
    public static class TestGroundUiBuilder
    {
        /// <summary>Menu path (German, project convention 15.1).</summary>
        public const string MenuPath = "Aetherfall/Oberfläche einrichten";

        /// <summary>Folder of the UI art (architecture 3.1: Art/UI).</summary>
        public const string UiArtFolder = SetupPaths.ProjectFolder + "/Art/UI";

        /// <summary>Folder of the UXML layouts.</summary>
        public const string LayoutFolder = UiArtFolder + "/Layouts";

        /// <summary>The theme style sheet (imports the default runtime theme and the project sheets).</summary>
        public const string ThemePath = UiArtFolder + "/Theme/AetherfallTheme.tss";

        /// <summary>Folder of the UI settings.</summary>
        public const string UiSettingsFolder = SetupPaths.ProjectFolder + "/Settings/UI";

        /// <summary>The shared panel settings of all layers.</summary>
        public const string PanelSettingsPath = UiSettingsFolder + "/AetherfallPanelSettings.asset";

        /// <summary>Installer asset of the scene loader (boot step 8b).</summary>
        public const string SceneLoaderInstallerPath = SetupPaths.BootSettingsFolder + "/SceneLoaderInstaller.asset";

        /// <summary>Installer asset of the UI (boot step 15).</summary>
        public const string UIInstallerPath = SetupPaths.BootSettingsFolder + "/UIInstaller.asset";

        /// <summary>Name of the UI root object in the boot scene.</summary>
        public const string UiObjectName = "UI";

        private const string DialogTitle = "Oberfläche einrichten";

        private static readonly KeyValuePair<string, string>[] Layouts =
        {
            new KeyValuePair<string, string>("mainMenuLayout", "MainMenu.uxml"),
            new KeyValuePair<string, string>("pauseMenuLayout", "PauseMenu.uxml"),
            new KeyValuePair<string, string>("deathScreenLayout", "DeathScreen.uxml"),
            new KeyValuePair<string, string>("loadPageLayout", "LoadPage.uxml"),
            new KeyValuePair<string, string>("saveSlotRowLayout", "SaveSlotRow.uxml"),
            new KeyValuePair<string, string>("optionsPageLayout", "OptionsPage.uxml"),
            new KeyValuePair<string, string>("toastEntryLayout", "ToastEntry.uxml")
        };

        /// <summary>Runs the UI setup alone (asks first).</summary>
        [MenuItem(MenuPath, false, 21)]
        public static void Run()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                EditorUtility.DisplayDialog(DialogTitle, "Bitte zuerst den Play-Modus beenden (Play-Knopf oben erneut drücken).", "OK");
                return;
            }

            string question =
                "Eingerichtet bzw. ergänzt werden:\n\n" +
                "• SceneLoaderInstaller und UIInstaller in der BootConfig\n" +
                "• " + PanelSettingsPath + " mit dem Aetherfall-Theme\n" +
                "• Objekt „UI“ in der Boot-Szene mit Hauptmenü, Pausemenü, Todesbildschirm, HUD, Meldungen und Ladebildschirm\n" +
                "• Szenenliste: Boot (Index 0), dahinter das Testgelände\n\n" +
                "Vorhandenes wird nicht überschrieben. Die Boot-Szene wird dazu geöffnet und gespeichert.";
            if (!EditorUtility.DisplayDialog(DialogTitle, question, "Einrichten", "Abbrechen") ||
                !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                return;
            }

            var report = new TestGroundReport();
            bool ok = EnsureAll(report);
            report.LogToConsole();
            string message = ok
                ? "Fertig! Die Boot-Szene ist geöffnet. Drücke Play: Es erscheint das Hauptmenü.\n\nPrüfliste: docs/Anleitungen/07_Test_Oberflaeche.md"
                : "Die Oberfläche konnte nicht vollständig eingerichtet werden. Details stehen in der Console.";
            if (report.Warnings.Count > 0)
            {
                message += "\n\nHinweise (" + report.Warnings.Count + "):\n• " + string.Join("\n• ", report.Warnings);
            }

            EditorUtility.DisplayDialog(DialogTitle, message, "OK");
        }

        /// <summary>Installers, panel settings, boot scene UI and scene list. Leaves the boot scene open.</summary>
        /// <param name="report">Protocol.</param>
        /// <returns>True if the boot scene has a complete UI afterwards.</returns>
        public static bool EnsureAll(TestGroundReport report)
        {
            EnsureInstallers(report);
            PanelSettings panel = EnsurePanelSettings(report);
            bool ui = panel != null && EnsureBootUi(panel, report);
            EnsureSceneList(report);
            AssetDatabase.SaveAssets();
            return ui;
        }

        /// <summary>
        /// Puts the SceneLoaderInstaller behind the GameState installer and the UIInstaller behind every installer whose
        /// services it needs (Input, Save, GameTime, SceneLoader, Content, Inventory, Combat, AI), and fills its gameplay scene.
        /// </summary>
        /// <param name="report">Protocol.</param>
        public static void EnsureInstallers(TestGroundReport report)
        {
            bool loader = TestGroundAssets.EnsureInstallerInBootConfig<SceneLoaderInstaller>(SceneLoaderInstallerPath, report,
                typeof(EventBusInstaller), typeof(GameStateInstaller));
            if (!loader)
            {
                return;
            }

            if (!TestGroundAssets.EnsureInstallerInBootConfig<UIInstaller>(UIInstallerPath, report, typeof(EventBusInstaller), typeof(GameStateInstaller),
                    typeof(InputInstaller), typeof(SaveInstaller), typeof(GameTimeInstaller), typeof(SceneLoaderInstaller), typeof(InventoryInstaller),
                    typeof(CombatInstaller), typeof(AIInstaller)))
            {
                return;
            }

            UIInstaller installer = AssetDatabase.LoadAssetAtPath<UIInstaller>(UIInstallerPath);
            if (installer != null && string.IsNullOrEmpty(installer.GameplayScenePath))
            {
                TestGroundFields.SetString(installer, "gameplayScenePath", TestGroundPaths.ScenePath, report);
            }
        }

        /// <summary>Loads or creates the panel settings (reference 1920 × 1080, scaled by height, Aetherfall theme).</summary>
        /// <param name="report">Protocol.</param>
        public static PanelSettings EnsurePanelSettings(TestGroundReport report)
        {
            if (!TestGroundAssets.EnsureFolder(UiSettingsFolder, report))
            {
                return null;
            }

            ThemeStyleSheet theme = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>(ThemePath);
            if (theme == null)
            {
                report.Warning("Theme " + ThemePath + " fehlt oder ist noch nicht importiert. Unity einmal in den Vordergrund holen " +
                               "(dann importiert es neue Dateien) und das Menü erneut ausführen.");
            }

            PanelSettings settings = AssetDatabase.LoadAssetAtPath<PanelSettings>(PanelSettingsPath);
            if (settings == null)
            {
                if (File.Exists(FullPath(PanelSettingsPath)))
                {
                    report.Warning(PanelSettingsPath + " existiert, ist aber kein PanelSettings – bitte prüfen.");
                    return null;
                }

                settings = ScriptableObject.CreateInstance<PanelSettings>();
                // GDD 05 1.6: layout for 1920 x 1080, scaled by the screen height (Retina and 4K keep the physical size).
                settings.scaleMode = PanelScaleMode.ScaleWithScreenSize;
                settings.referenceResolution = new Vector2Int(UiScaleRules.ReferenceWidth, UiScaleRules.ReferenceHeight);
                settings.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
                settings.match = 1f;
                settings.scale = 1f;
                settings.sortingOrder = 0f;
                settings.themeStyleSheet = theme;
                AssetDatabase.CreateAsset(settings, PanelSettingsPath);
                report.Info("Angelegt: " + PanelSettingsPath + " (1920 × 1080, Skalierung nach Bildschirmhöhe, Aetherfall-Theme).");
            }
            else if (settings.themeStyleSheet == null && theme != null)
            {
                settings.themeStyleSheet = theme;
                EditorUtility.SetDirty(settings);
                report.Info(PanelSettingsPath + ": Theme eingetragen.");
            }
            else
            {
                report.Info("Vorhanden (unverändert): " + PanelSettingsPath);
            }

            return settings;
        }

        /// <summary>Opens the boot scene, adds or completes the object "UI" and saves the scene (it stays open).</summary>
        /// <param name="panel">Panel settings.</param>
        /// <param name="report">Protocol.</param>
        /// <returns>True if the UI root is complete.</returns>
        public static bool EnsureBootUi(PanelSettings panel, TestGroundReport report)
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(SetupPaths.BootScenePath) == null)
            {
                report.Warning("Boot-Szene fehlt (" + SetupPaths.BootScenePath + "). Bitte zuerst „Aetherfall > Projekt-Setup …“, Schritt e) ausführen.");
                return false;
            }

            Scene scene = EditorSceneManager.OpenScene(SetupPaths.BootScenePath, OpenSceneMode.Single);
            UIRoot root = FindInScene<UIRoot>(scene);
            if (root == null)
            {
                var rootObject = new GameObject(UiObjectName);
                SceneManager.MoveGameObjectToScene(rootObject, scene);
                root = rootObject.AddComponent<UIRoot>();
                report.Info("Boot-Szene: Objekt „" + UiObjectName + "“ mit UIRoot angelegt.");
            }

            FillReference(root, "panelSettings", panel, report);
            FillReference(root, "hudDocument", EnsureDocument(root.transform, "HUD", panel, UILayer.Hud, LoadLayout("Hud.uxml", report), report), report);
            FillReference(root, "screensDocument", EnsureDocument(root.transform, "Screens", panel, UILayer.Screens, null, report), report);
            FillReference(root, "toastsDocument", EnsureDocument(root.transform, "Toasts", panel, UILayer.Toasts, LoadLayout("Toasts.uxml", report), report), report);
            FillReference(root, "loadingDocument", EnsureDocument(root.transform, "Loading", panel, UILayer.Loading, LoadLayout("Loading.uxml", report), report), report);
            bool complete = true;
            for (int i = 0; i < Layouts.Length; i++)
            {
                VisualTreeAsset layout = LoadLayout(Layouts[i].Value, report);
                complete &= layout != null;
                FillReference(root, Layouts[i].Key, layout, report);
            }

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene))
            {
                report.Warning("Boot-Szene konnte nicht gespeichert werden.");
                return false;
            }

            report.Info("Boot-Szene gespeichert: Oberfläche (UIRoot mit HUD, Screens, Toasts, Loading).");
            return complete;
        }

        /// <summary>Scene list: Boot first (index 0), the test ground directly behind it; other entries stay.</summary>
        /// <param name="report">Protocol.</param>
        public static void EnsureSceneList(TestGroundReport report)
        {
            var scenes = new List<EditorBuildSettingsScene>
            {
                new EditorBuildSettingsScene(SetupPaths.BootScenePath, true)
            };
            bool hasTestGround = File.Exists(FullPath(TestGroundPaths.ScenePath));
            if (hasTestGround)
            {
                scenes.Add(new EditorBuildSettingsScene(TestGroundPaths.ScenePath, true));
            }

            EditorBuildSettingsScene[] current = EditorBuildSettings.scenes;
            for (int i = 0; i < current.Length; i++)
            {
                if (current[i].path != SetupPaths.BootScenePath && current[i].path != TestGroundPaths.ScenePath)
                {
                    scenes.Add(current[i]);
                }
            }

            if (SameList(current, scenes))
            {
                report.Info("Szenenliste korrekt (unverändert): " + Describe(current));
                return;
            }

            EditorBuildSettings.scenes = scenes.ToArray();
            report.Info("Szenenliste gesetzt: " + Describe(EditorBuildSettings.scenes) + (hasTestGround ? string.Empty : " (Testgelände noch nicht erstellt)"));
        }

        /// <summary>Adds the HUD bridge to the player of the test ground and fills its references.</summary>
        /// <param name="player">Player root.</param>
        /// <param name="mainCamera">Main camera (compass heading).</param>
        /// <param name="report">Protocol.</param>
        public static void AddPlayerHudLink(GameObject player, Camera mainCamera, TestGroundReport report)
        {
            if (!player.TryGetComponent(out PlayerHudLink link))
            {
                link = player.AddComponent<PlayerHudLink>();
            }

            if (player.TryGetComponent(out DamageableComponent damageable))
            {
                TestGroundFields.SetReference(link, "health", damageable, report);
            }

            if (player.TryGetComponent(out CharacterStatsComponent stats))
            {
                TestGroundFields.SetReference(link, "stats", stats, report);
            }

            if (player.TryGetComponent(out PlayerLockOn lockOn))
            {
                TestGroundFields.SetReference(link, "lockOn", lockOn, report);
            }

            if (player.TryGetComponent(out PlayerInteractor interactor))
            {
                TestGroundFields.SetReference(link, "interactor", interactor, report);
            }

            if (player.TryGetComponent(out PlayerRespawn respawn))
            {
                TestGroundFields.SetReference(link, "respawn", respawn, report);
            }

            if (mainCamera != null)
            {
                TestGroundFields.SetReference(link, "cameraTransform", mainCamera.transform, report);
            }

            report.Info("Spieler: PlayerHudLink (verbindet die Figur mit HUD und Todesbildschirm der Boot-Szene).");
        }

        private static UIDocument EnsureDocument(Transform parent, string name, PanelSettings panel, UILayer layer, VisualTreeAsset layout,
            TestGroundReport report)
        {
            Transform child = parent.Find(name);
            if (child == null)
            {
                var childObject = new GameObject(name);
                childObject.transform.SetParent(parent, false);
                child = childObject.transform;
            }

            if (!child.TryGetComponent(out UIDocument document))
            {
                document = child.gameObject.AddComponent<UIDocument>();
                report.Info("Boot-Szene: UIDocument „" + name + "“ (Ebene " + layer + ", Sortierung " + (int)layer + ") angelegt.");
            }

            if (document.panelSettings == null)
            {
                document.panelSettings = panel;
            }

            if (document.visualTreeAsset == null && layout != null)
            {
                document.visualTreeAsset = layout;
            }

            document.sortingOrder = (int)layer;
            EditorUtility.SetDirty(document);
            return document;
        }

        private static VisualTreeAsset LoadLayout(string fileName, TestGroundReport report)
        {
            string path = LayoutFolder + "/" + fileName;
            VisualTreeAsset layout = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(path);
            if (layout == null)
            {
                report.Warning("Layout fehlt oder ist noch nicht importiert: " + path);
            }

            return layout;
        }

        private static void FillReference(Object target, string field, Object value, TestGroundReport report)
        {
            if (value == null)
            {
                return;
            }

            SerializedProperty property = TestGroundFields.Find(target, field, report, out SerializedObject serialized);
            if (property == null || property.objectReferenceValue != null)
            {
                return;
            }

            property.objectReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(target);
        }

        private static T FindInScene<T>(Scene scene) where T : Component
        {
            GameObject[] roots = scene.GetRootGameObjects();
            for (int i = 0; i < roots.Length; i++)
            {
                T component = roots[i].GetComponentInChildren<T>(true);
                if (component != null)
                {
                    return component;
                }
            }

            return null;
        }

        private static bool SameList(EditorBuildSettingsScene[] current, List<EditorBuildSettingsScene> wanted)
        {
            if (current.Length != wanted.Count)
            {
                return false;
            }

            for (int i = 0; i < current.Length; i++)
            {
                if (current[i].path != wanted[i].path || current[i].enabled != wanted[i].enabled)
                {
                    return false;
                }
            }

            return true;
        }

        private static string Describe(EditorBuildSettingsScene[] scenes)
        {
            var parts = new List<string>(scenes.Length);
            for (int i = 0; i < scenes.Length; i++)
            {
                parts.Add(i + ": " + Path.GetFileNameWithoutExtension(scenes[i].path) + (scenes[i].enabled ? string.Empty : " (aus)"));
            }

            return parts.Count > 0 ? string.Join(", ", parts) : "(leer)";
        }

        private static string FullPath(string assetPath)
        {
            return Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, assetPath);
        }
    }
}
