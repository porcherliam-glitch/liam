using System;
using System.IO;
using Aetherfall.Core;
using Aetherfall.EditorTools.Core;
using Aetherfall.GameTime;
using Aetherfall.Input;
using Aetherfall.Player;
using Aetherfall.SaveSystem;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Assets of the test ground: folders, coloured URP/Lit materials, the player movement settings and the installers
    /// of Input, Save and GameTime in the BootConfig. Existing assets are reused and never overwritten.
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
