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
            if (!NeedsSetup()) return;
            if (!Setup(true)) return;
            EditorUtility.DisplayDialog("Dead Zone", "Das Projekt wurde eingerichtet.\n\nDrücke oben in der Mitte auf ▶ (Play), um zu spielen.\nMenü „Dead Zone“ → „Windows-Spiel bauen“ erzeugt eine startbare Spieldatei.", "OK");
        }

        /// <summary>
        /// Main scene missing, or a material template missing or made for the other render pipeline (renders magenta).
        /// The effect templates count only when their shader exists, so a missing shader cannot repeat the setup forever.
        /// </summary>
        public static bool NeedsSetup()
        {
            bool urp = GraphicsSettings.currentRenderPipeline != null;
            if (!TemplateOk("Lit", urp) || AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null) return true;
            if (Mats.ParticleShader(false) != null && !TemplateOk("ParticleAlpha", urp)) return true;
            if (Mats.ParticleShader(true) != null && !TemplateOk("ParticleAdd", urp)) return true;
            return !TemplateOk("LitCutout", urp);
        }

        private static bool TemplateOk(string name, bool urp)
        {
            var m = AssetDatabase.LoadAssetAtPath<Material>(MatDir + "/" + name + ".mat");
            return m != null && m.shader != null && m.shader.name.StartsWith("Universal Render Pipeline") == urp;
        }

        [MenuItem("Dead Zone/Projekt einrichten", priority = 1)]
        public static void SetupMenu() => Setup(true);

        [MenuItem("Dead Zone/Spielen", priority = 2)]
        public static void PlayMenu()
        {
            if (!Setup(true)) return;
            if (SceneManager.GetActiveScene().path != ScenePath && EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            EditorApplication.isPlaying = true;
        }

        /// <summary>Batchmode: -executeMethod DeadZone.EditorTools.ProjectSetup.RunBatch</summary>
        public static void RunBatch()
        {
            EditorApplication.Exit(Setup(false) ? 0 : 1);
        }

        /// <summary>Returns false when the user cancelled the save prompt for an unsaved scene.</summary>
        public static bool Setup(bool openScene)
        {
            CreateFolder("Assets/_Project", "Scenes");
            CreateFolder("Assets/_Project", "Resources");
            CreateFolder("Assets/_Project/Resources", "DZMaterials");
            CreateMaterials();
            if (!CreateScene(openScene)) return false;
            ConfigurePlayer();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("[DZ] Projekt eingerichtet: Szene " + ScenePath + ", Materialien unter " + MatDir);
            return true;
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
            // effects: soft particles (alpha-blended and additive) and alpha-clipped decals; Mats configures them like
            // URP's material inspector would, because materials made from script skip its validation
            SaveConfigured("ParticleAlpha", Mats.NewParticleTemplate(false), m => Mats.ConfigureParticle(m, false));
            SaveConfigured("ParticleAdd", Mats.NewParticleTemplate(true), m => Mats.ConfigureParticle(m, true));
            SaveConfigured("LitCutout", Mats.NewCutoutTemplate(), Mats.ConfigureCutout);
        }

        /// <summary>Saves a configured template; an existing asset gets the shader and is configured again in place.</summary>
        private static void SaveConfigured(string name, Material m, System.Action<Material> configure)
        {
            if (m == null) { Debug.LogWarning("[DZ] Shader für " + name + " nicht gefunden"); return; }
            string path = MatDir + "/" + name + ".mat";
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing == null) { AssetDatabase.CreateAsset(m, path); return; }
            existing.shader = m.shader;
            existing.shaderKeywords = new string[0]; // drop keywords of a shader for the other pipeline
            configure(existing);
            EditorUtility.SetDirty(existing);
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

        private static bool CreateScene(bool openScene)
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null)
            {
                var active = SceneManager.GetActiveScene();
                bool untitled = string.IsNullOrEmpty(active.path);
                if (active.isDirty && untitled && !Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                {
                    Debug.LogWarning("[DZ] Einrichtung abgebrochen – die ungespeicherte Szene wurde nicht ersetzt.");
                    return false;
                }
                // an additive new scene is not allowed next to an unsaved untitled scene, so replace it then
                bool replace = Application.isBatchMode || untitled || (openScene && !active.isDirty);
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
            return true;
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
