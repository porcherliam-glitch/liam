using System.IO;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Smoke of smouldering ruins: a small particle system per glowing building (soft grey puffs that rise and drift east with
    /// the wind). The soft round particle texture and the transparent URP particle material are generated once.
    /// </summary>
    public sealed class EichentalSmoke
    {
        private const string TexturePath = EichentalPaths.MaterialFolder + "/T_Eichental_Rauch.png";
        private const string MaterialPath = EichentalPaths.MaterialFolder + "/M_Eichental_Rauch.mat";
        private readonly Material _material;
        private readonly TestGroundReport _report;
        private int _count;

        /// <summary>Loads or creates texture and material.</summary>
        /// <param name="report">Protocol.</param>
        public EichentalSmoke(TestGroundReport report)
        {
            _report = report;
            _material = EnsureMaterial();
        }

        /// <summary>Adds a smoke plume.</summary>
        /// <param name="parent">Building root.</param>
        /// <param name="localPosition">Start of the plume (top of the walls).</param>
        public void Add(Transform parent, Vector3 localPosition)
        {
            if (_material == null)
            {
                return;
            }

            var plume = new GameObject("Rauch");
            plume.transform.SetParent(parent, false);
            plume.transform.localPosition = localPosition;
            plume.transform.rotation = Quaternion.Euler(-90f, 0f, 0f);
            ParticleSystem system = plume.AddComponent<ParticleSystem>();
            ParticleSystem.MainModule main = system.main;
            main.loop = true;
            main.prewarm = true;
            main.startLifetime = 9f;
            main.startSpeed = 1.2f;
            main.startSize = new ParticleSystem.MinMaxCurve(2.5f, 4.5f);
            main.startColor = new Color(0.33f, 0.31f, 0.3f, 0.35f);
            main.maxParticles = 60;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            ParticleSystem.EmissionModule emission = system.emission;
            emission.rateOverTime = 4f;
            ParticleSystem.ShapeModule shape = system.shape;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 12f;
            shape.radius = 1.2f;
            ParticleSystem.VelocityOverLifetimeModule velocity = system.velocityOverLifetime;
            velocity.enabled = true;
            velocity.space = ParticleSystemSimulationSpace.World;
            velocity.x = new ParticleSystem.MinMaxCurve(0.8f);
            velocity.y = new ParticleSystem.MinMaxCurve(0.4f);
            velocity.z = new ParticleSystem.MinMaxCurve(0.3f);
            ParticleSystem.SizeOverLifetimeModule size = system.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 0.6f, 1f, 1.8f));
            ParticleSystem.ColorOverLifetimeModule color = system.colorOverLifetime;
            color.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(1f, 0.2f), new GradientAlphaKey(0f, 1f) });
            color.color = gradient;
            ParticleSystemRenderer renderer = plume.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = _material;
            renderer.renderMode = ParticleSystemRenderMode.Billboard;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _count++;
        }

        /// <summary>Number of plumes.</summary>
        public int Count => _count;

        private Material EnsureMaterial()
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Particles/Unlit");
            if (shader == null)
            {
                _report.Warning("Shader „Universal Render Pipeline/Particles/Unlit“ nicht gefunden (URP fehlt?) – kein Rauch über den Ruinen.");
                return null;
            }

            if (!File.Exists(FullPath(TexturePath)))
            {
                const int size = 64;
                var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
                for (int y = 0; y < size; y++)
                {
                    for (int x = 0; x < size; x++)
                    {
                        float dx = (x + 0.5f) / size * 2f - 1f;
                        float dy = (y + 0.5f) / size * 2f - 1f;
                        float a = Mathf.Clamp01(1f - Mathf.Sqrt(dx * dx + dy * dy));
                        texture.SetPixel(x, y, new Color(1f, 1f, 1f, a * a * (3f - 2f * a)));
                    }
                }

                texture.Apply();
                File.WriteAllBytes(FullPath(TexturePath), texture.EncodeToPNG());
                Object.DestroyImmediate(texture);
                AssetDatabase.ImportAsset(TexturePath, ImportAssetOptions.ForceUpdate);
                if (AssetImporter.GetAtPath(TexturePath) is TextureImporter importer)
                {
                    importer.alphaIsTransparency = true;
                    importer.wrapMode = TextureWrapMode.Clamp;
                    importer.SaveAndReimport();
                }
            }

            Material material = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
            if (material == null)
            {
                material = new Material(shader) { name = "M_Eichental_Rauch" };
                AssetDatabase.CreateAsset(material, MaterialPath);
            }

            material.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>(TexturePath));
            material.SetColor("_BaseColor", Color.white);
            // URP transparent surface with alpha blending (what the material inspector sets for "Surface Type: Transparent").
            material.SetFloat("_Surface", 1f);
            material.SetFloat("_Blend", 0f);
            material.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            material.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            material.SetFloat("_ZWrite", 0f);
            material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            material.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
            EditorUtility.SetDirty(material);
            return material;
        }

        private static string FullPath(string assetPath)
        {
            return Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, assetPath);
        }
    }
}
