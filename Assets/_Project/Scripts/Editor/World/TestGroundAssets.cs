using System.IO;
using Aetherfall.Core;
using Aetherfall.EditorTools.Core;
using Aetherfall.Input;
using Aetherfall.Player;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Assets of the test ground: folders, coloured URP/Lit materials, the player movement settings and the
    /// InputInstaller in the BootConfig. Existing assets are reused and never overwritten.
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
            BootConfig bootConfig = AssetDatabase.LoadAssetAtPath<BootConfig>(SetupPaths.BootConfigAssetPath);
            if (bootConfig == null)
            {
                report.Warning("BootConfig fehlt (" + SetupPaths.BootConfigAssetPath + "). Bitte zuerst „Aetherfall > Projekt-Setup …“, " +
                               "Schritt e) ausführen und dieses Menü danach erneut aufrufen.");
                return false;
            }

            InputInstaller installer = AssetDatabase.LoadAssetAtPath<InputInstaller>(TestGroundPaths.InputInstallerPath);
            if (installer == null)
            {
                if (File.Exists(FullPath(TestGroundPaths.InputInstallerPath)))
                {
                    report.Warning(TestGroundPaths.InputInstallerPath + " existiert, ist aber kein InputInstaller – bitte prüfen.");
                    return false;
                }

                installer = ScriptableObject.CreateInstance<InputInstaller>();
                AssetDatabase.CreateAsset(installer, TestGroundPaths.InputInstallerPath);
                report.Info("Angelegt: " + TestGroundPaths.InputInstallerPath);
            }

            var serialized = new SerializedObject(bootConfig);
            SerializedProperty list = serialized.FindProperty(InstallersField);
            if (list == null || !list.isArray)
            {
                report.Warning("Feld „" + InstallersField + "“ der BootConfig nicht gefunden. Bitte den InputInstaller von Hand " +
                               "hinter dem GameState-Installer eintragen.");
                return false;
            }

            int gameStateIndex = -1;
            for (int i = 0; i < list.arraySize; i++)
            {
                Object entry = list.GetArrayElementAtIndex(i).objectReferenceValue;
                if (entry is InputInstaller)
                {
                    report.Info("BootConfig enthält bereits einen InputInstaller (Element " + i + ", unverändert).");
                    return true;
                }

                if (entry is GameStateInstaller)
                {
                    gameStateIndex = i;
                }
            }

            int insertAt = gameStateIndex >= 0 ? gameStateIndex + 1 : list.arraySize;
            if (gameStateIndex < 0)
            {
                report.Warning("Kein GameState-Installer in der BootConfig gefunden – der InputInstaller wird ans Ende gehängt. " +
                               "Er braucht EventBus und GameState davor (Projekt-Setup, Schritt e).");
            }

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
            report.Info("InputInstaller in die BootConfig eingetragen (Element " + insertAt + ", hinter dem GameState-Installer).");
            return true;
        }

        private static string FullPath(string assetPath)
        {
            return Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, assetPath);
        }
    }
}
