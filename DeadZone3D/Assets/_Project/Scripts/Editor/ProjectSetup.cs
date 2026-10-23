using System.IO;
using DeadZone.Game;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace DeadZone.EditorTools
{
    /// <summary>
    /// One-time project setup: material templates (so builds contain the shaders), the main scene and the build list.
    /// Runs automatically the first time the project is opened; menu: Dead Zone > Projekt einrichten.
    /// </summary>
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        public const string ScenePath = "Assets/_Project/Scenes/Main.unity";
        private const string MatDir = "Assets/_Project/Resources/DZMaterials";

        static ProjectSetup()
        {
            EditorApplication.delayCall += AutoSetup;
        }

        private static void AutoSetup()
        {
            if (Application.isBatchMode || EditorApplication.isPlayingOrWillChangePlaymode) return;
            bool done = AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) != null && AssetDatabase.LoadAssetAtPath<Material>(MatDir + "/Lit.mat") != null;
            if (done) return;
            Setup(true);
            EditorUtility.DisplayDialog("Dead Zone", "Das Projekt wurde eingerichtet.\n\nDrücke oben in der Mitte auf ▶ (Play), um zu spielen.\nMenü „Dead Zone“ → „Windows-Spiel bauen“ erzeugt eine startbare Spieldatei.", "OK");
        }

        [MenuItem("Dead Zone/Projekt einrichten", priority = 1)]
        public static void SetupMenu() => Setup(true);

        [MenuItem("Dead Zone/Spielen", priority = 2)]
        public static void PlayMenu()
        {
            Setup(true);
            if (SceneManager.GetActiveScene().path != ScenePath && EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            EditorApplication.isPlaying = true;
        }

        /// <summary>Batchmode: -executeMethod DeadZone.EditorTools.ProjectSetup.RunBatch</summary>
        public static void RunBatch()
        {
            Setup(false);
            EditorApplication.Exit(0);
        }

        public static void Setup(bool openScene)
        {
            CreateFolder("Assets/_Project", "Scenes");
            CreateFolder("Assets/_Project", "Resources");
            CreateFolder("Assets/_Project/Resources", "DZMaterials");
            CreateMaterials();
            CreateScene(openScene);
            ConfigurePlayer();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("[DZ] Projekt eingerichtet: Szene " + ScenePath + ", Materialien unter " + MatDir);
        }

        private static void CreateFolder(string parent, string name)
        {
            if (!AssetDatabase.IsValidFolder(parent + "/" + name)) AssetDatabase.CreateFolder(parent, name);
        }

        private static void CreateMaterials()
        {
            bool urp = GraphicsSettings.currentRenderPipeline != null;
            var lit = Shader.Find(urp ? "Universal Render Pipeline/Lit" : "Standard");
            var unlit = Shader.Find(urp ? "Universal Render Pipeline/Unlit" : "Unlit/Color");
            if (lit == null) { Debug.LogError("[DZ] Lit-Shader nicht gefunden"); return; }
            Save(new Material(lit) { name = "Lit" }, "Lit");
            var em = new Material(lit) { name = "Emissive" };
            em.EnableKeyword("_EMISSION");
            em.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            if (em.HasProperty("_EmissionColor")) em.SetColor("_EmissionColor", Color.white);
            Save(em, "Emissive");
            if (unlit != null) Save(new Material(unlit) { name = "Unlit" }, "Unlit");
        }

        private static void Save(Material m, string name)
        {
            string path = MatDir + "/" + name + ".mat";
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null)
            {
                existing.shader = m.shader;
                existing.shaderKeywords = m.shaderKeywords;
                existing.globalIlluminationFlags = m.globalIlluminationFlags;
                EditorUtility.SetDirty(existing);
                return;
            }
            AssetDatabase.CreateAsset(m, path);
        }

        private static void CreateScene(bool openScene)
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null)
            {
                var active = SceneManager.GetActiveScene();
                bool replace = openScene && !active.isDirty;
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, replace ? NewSceneMode.Single : NewSceneMode.Additive);
                var go = new GameObject("DeadZone");
                go.AddComponent<GameRoot>();
                SceneManager.MoveGameObjectToScene(go, scene);
                // fog must be on in the built scene, otherwise the build strips the fog shader variants
                var previous = SceneManager.GetActiveScene();
                SceneManager.SetActiveScene(scene);
                RenderSettings.fog = true;
                RenderSettings.fogMode = FogMode.ExponentialSquared;
                RenderSettings.fogDensity = 0.012f;
                RenderSettings.ambientMode = AmbientMode.Flat;
                if (previous.IsValid() && previous != scene && previous.isLoaded) SceneManager.SetActiveScene(previous);
                EditorSceneManager.SaveScene(scene, ScenePath);
                if (!replace) EditorSceneManager.CloseScene(scene, true);
            }
            else if (openScene && SceneManager.GetActiveScene().path != ScenePath && !SceneManager.GetActiveScene().isDirty)
            {
                EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        private static void ConfigurePlayer()
        {
            PlayerSettings.productName = "Dead Zone Extraction";
            PlayerSettings.companyName = "DeadZoneStudio";
            PlayerSettings.fullScreenMode = FullScreenMode.FullScreenWindow;
            PlayerSettings.resizableWindow = true;
            PlayerSettings.runInBackground = false;
            PlayerSettings.visibleInBackground = false;
        }

        internal static string DesktopFolder(string name) => Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.DesktopDirectory), name);
    }
}
