using System.IO;
using Aetherfall.Player;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// The look of the Aether-Stoß on the player: a burst of glowing blue-violet sparks that shoots forward in a 90° cone and
    /// fades within half a second, plus a short blue light flash. Built as children of the player and connected to the
    /// <see cref="PlayerAbilityCaster"/>; the soft spark texture and the additive URP particle material are generated once.
    /// </summary>
    public static class AetherPushEffect
    {
        private const string TexturePath = TestGroundPaths.MaterialFolder + "/T_AetherFunke.png";
        private const string MaterialPath = TestGroundPaths.MaterialFolder + "/M_AetherStoss.mat";

        /// <summary>Adds the effect to the player and sets the fields <c>effect</c> and <c>flash</c> of the caster.</summary>
        /// <param name="player">Player root.</param>
        /// <param name="caster">Ability caster of the player.</param>
        /// <param name="report">Protocol.</param>
        public static void Build(Transform player, PlayerAbilityCaster caster, TestGroundReport report)
        {
            Material material = EnsureMaterial(report);
            var burst = new GameObject("AetherStoss");
            burst.transform.SetParent(player, false);
            burst.transform.localPosition = new Vector3(0f, 1.1f, 0.3f);
            burst.layer = player.gameObject.layer;
            ParticleSystem system = burst.AddComponent<ParticleSystem>();
            system.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            ParticleSystem.MainModule main = system.main;
            main.loop = false;
            main.playOnAwake = false;
            main.duration = 0.3f;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.4f, 0.65f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(7f, 13f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.3f, 0.65f);
            main.startColor = new ParticleSystem.MinMaxGradient(new Color(0.55f, 0.92f, 1f, 1f), new Color(0.72f, 0.55f, 1f, 1f));
            main.maxParticles = 220;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            ParticleSystem.EmissionModule emission = system.emission;
            emission.rateOverTime = 0f;
            emission.SetBursts(new[] { new ParticleSystem.Burst(0f, 130), new ParticleSystem.Burst(0.07f, 60) });
            ParticleSystem.ShapeModule shape = system.shape;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 42f;
            shape.radius = 0.3f;
            ParticleSystem.SizeOverLifetimeModule size = system.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 1f, 1f, 0.2f));
            ParticleSystem.ColorOverLifetimeModule color = system.colorOverLifetime;
            color.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0.8f, 0.5f), new GradientAlphaKey(0f, 1f) });
            color.color = gradient;
            ParticleSystemRenderer renderer = burst.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = material;
            renderer.renderMode = ParticleSystemRenderMode.Stretch;
            renderer.velocityScale = 0.04f;
            renderer.lengthScale = 1.5f;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            AddShockRing(burst.transform, material);

            var lightObject = new GameObject("AetherStossLicht");
            lightObject.transform.SetParent(player, false);
            lightObject.transform.localPosition = new Vector3(0f, 1.3f, 1.2f);
            Light light = lightObject.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = new Color(0.55f, 0.85f, 1f);
            light.range = 9f;
            light.intensity = 6f;
            light.shadows = LightShadows.None;
            light.enabled = false;

            TestGroundFields.SetReference(caster, "effect", system, report);
            TestGroundFields.SetReference(caster, "flash", light, report);
            if (material == null)
            {
                report.Warning("Aether-Stoß: kein Partikel-Material (URP fehlt?) – nur der Lichtblitz ist zu sehen.");
            }
        }

        /// <summary>
        /// A wave front: a few large, flat glowing discs that fly forward with the burst and grow, so the cone reads as one
        /// push and not only as sparks. Child of the burst, played with it.
        /// </summary>
        private static void AddShockRing(Transform burst, Material material)
        {
            var ringObject = new GameObject("Druckwelle");
            ringObject.transform.SetParent(burst, false);
            ringObject.layer = burst.gameObject.layer;
            ParticleSystem ring = ringObject.AddComponent<ParticleSystem>();
            ring.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            ParticleSystem.MainModule main = ring.main;
            main.loop = false;
            main.playOnAwake = false;
            main.duration = 0.2f;
            main.startLifetime = 0.35f;
            main.startSpeed = 14f;
            main.startSize = 1.4f;
            main.startColor = new Color(0.6f, 0.9f, 1f, 0.55f);
            main.maxParticles = 12;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            ParticleSystem.EmissionModule emission = ring.emission;
            emission.rateOverTime = 0f;
            emission.SetBursts(new[] { new ParticleSystem.Burst(0f, 5) });
            ParticleSystem.ShapeModule shape = ring.shape;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 25f;
            shape.radius = 0.1f;
            ParticleSystem.SizeOverLifetimeModule size = ring.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 0.6f, 1f, 3.2f));
            ParticleSystem.ColorOverLifetimeModule color = ring.colorOverLifetime;
            color.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(0.9f, 0f), new GradientAlphaKey(0f, 1f) });
            color.color = gradient;
            ParticleSystemRenderer renderer = ringObject.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = material;
            renderer.renderMode = ParticleSystemRenderMode.Billboard;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
        }

        /// <summary>The additive particle material with the soft spark texture (also for the fire of the mage).</summary>
        /// <param name="report">Protocol.</param>
        public static Material ParticleMaterial(TestGroundReport report)
        {
            return EnsureMaterial(report);
        }

        private static Material EnsureMaterial(TestGroundReport report)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Particles/Unlit");
            if (shader == null)
            {
                return null;
            }

            if (!File.Exists(FullPath(TexturePath)))
            {
                // A soft dot with a bright core: additive sparks look like light, not like discs.
                const int size = 64;
                var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
                for (int y = 0; y < size; y++)
                {
                    for (int x = 0; x < size; x++)
                    {
                        float dx = (x + 0.5f) / size * 2f - 1f;
                        float dy = (y + 0.5f) / size * 2f - 1f;
                        float a = Mathf.Clamp01(1f - Mathf.Sqrt(dx * dx + dy * dy));
                        texture.SetPixel(x, y, new Color(1f, 1f, 1f, a * a * a));
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
                material = new Material(shader) { name = "M_AetherStoss" };
                AssetDatabase.CreateAsset(material, MaterialPath);
                report.Info("Angelegt: " + MaterialPath);
            }

            material.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>(TexturePath));
            material.SetColor("_BaseColor", Color.white);
            // URP transparent surface with additive blending (inspector "Surface Type: Transparent, Blending Mode: Additive").
            material.SetFloat("_Surface", 1f);
            material.SetFloat("_Blend", 2f);
            material.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            material.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.One);
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
