using Aetherfall.Combat;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Looks of the mage's fire (GDD 03 5.3 staff "Elementgeschoss"): the glowing crystal of the staff, and the fire bolt
    /// template of the <see cref="ProjectileLauncher"/> – a bright core, an orange point light, a fading trail and a burst of
    /// sparks on impact. Materials are generated once in the test ground material folder.
    /// </summary>
    public static class SpellEffects
    {
        private const string FireGlowPath = TestGroundPaths.MaterialFolder + "/M_Feuer_Leuchten.mat";
        private static readonly Color Fire = new Color(1f, 0.55f, 0.15f);

        /// <summary>Gives every "_Leuchten" slot under <paramref name="model"/> the glowing fire material.</summary>
        /// <param name="model">Model root (staff).</param>
        /// <param name="report">Protocol.</param>
        public static void GlowFire(Transform model, TestGroundReport report)
        {
            Material glow = EnsureFireGlow(report);
            foreach (Renderer renderer in model.GetComponentsInChildren<Renderer>(true))
            {
                Material[] slots = renderer.sharedMaterials;
                for (int i = 0; i < slots.Length; i++)
                {
                    if (slots[i] != null && slots[i].name.EndsWith("_Leuchten", System.StringComparison.Ordinal))
                    {
                        slots[i] = glow;
                    }
                }

                renderer.sharedMaterials = slots;
            }
        }

        /// <summary>Builds the fire bolt template under the player and connects it to the launcher.</summary>
        /// <param name="player">Player root.</param>
        /// <param name="launcher">Launcher of the player.</param>
        /// <param name="muzzle">Staff tip (null: in front of the chest).</param>
        /// <param name="hurtboxLayer">Hurtbox layer.</param>
        /// <param name="solidMask">Ground and walls.</param>
        /// <param name="report">Protocol.</param>
        public static void BuildFireBolt(Transform player, ProjectileLauncher launcher, Transform muzzle, int hurtboxLayer, int solidMask,
            TestGroundReport report)
        {
            Material glow = EnsureFireGlow(report);
            Material sparks = AetherPushEffect.ParticleMaterial(report);
            var bolt = new GameObject("Feuergeschoss (Vorlage)");
            bolt.transform.SetParent(player, false);
            bolt.layer = player.gameObject.layer;
            Projectile projectile = bolt.AddComponent<Projectile>();

            GameObject core = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            core.name = "Kern";
            Object.DestroyImmediate(core.GetComponent<Collider>());
            core.transform.SetParent(bolt.transform, false);
            core.transform.localScale = Vector3.one * 0.26f;
            core.layer = bolt.layer;
            Renderer coreRenderer = core.GetComponent<Renderer>();
            coreRenderer.sharedMaterial = glow;
            coreRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            Light light = bolt.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = Fire;
            light.range = 5f;
            light.intensity = 3f;
            light.shadows = LightShadows.None;

            TrailRenderer trail = bolt.AddComponent<TrailRenderer>();
            trail.time = 0.22f;
            trail.minVertexDistance = 0.1f;
            trail.widthCurve = AnimationCurve.Linear(0f, 0.22f, 1f, 0f);
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(new Color(1f, 0.85f, 0.4f), 0f), new GradientColorKey(new Color(1f, 0.35f, 0.05f), 1f) },
                new[] { new GradientAlphaKey(0.9f, 0f), new GradientAlphaKey(0f, 1f) });
            trail.colorGradient = gradient;
            trail.sharedMaterial = sparks;
            trail.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            var impactObject = new GameObject("Einschlag");
            impactObject.transform.SetParent(bolt.transform, false);
            impactObject.layer = bolt.layer;
            ParticleSystem impact = impactObject.AddComponent<ParticleSystem>();
            impact.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            ParticleSystem.MainModule main = impact.main;
            main.loop = false;
            main.playOnAwake = false;
            main.duration = 0.2f;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.2f, 0.4f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(2f, 6f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.12f, 0.3f);
            main.startColor = new ParticleSystem.MinMaxGradient(new Color(1f, 0.8f, 0.3f), new Color(1f, 0.35f, 0.05f));
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 50;
            ParticleSystem.EmissionModule emission = impact.emission;
            emission.rateOverTime = 0f;
            emission.SetBursts(new[] { new ParticleSystem.Burst(0f, 36) });
            ParticleSystem.ShapeModule shape = impact.shape;
            shape.shapeType = ParticleSystemShapeType.Sphere;
            shape.radius = 0.15f;
            ParticleSystemRenderer impactRenderer = impactObject.GetComponent<ParticleSystemRenderer>();
            impactRenderer.sharedMaterial = sparks;
            impactRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            TestGroundFields.SetReference(projectile, "body", core, report);
            TestGroundFields.SetReference(projectile, "trail", trail, report);
            TestGroundFields.SetReference(projectile, "glow", light, report);
            TestGroundFields.SetReference(projectile, "impact", impact, report);
            bolt.SetActive(false);

            TestGroundFields.SetReference(launcher, "template", projectile, report);
            TestGroundFields.SetReference(launcher, "muzzle", muzzle, report);
            TestGroundFields.SetInt(launcher, "hurtboxLayers", hurtboxLayer >= 0 ? 1 << hurtboxLayer : 0, report);
            TestGroundFields.SetInt(launcher, "solidLayers", solidMask, report);
        }

        private static Material EnsureFireGlow(TestGroundReport report)
        {
            Material material = AssetDatabase.LoadAssetAtPath<Material>(FireGlowPath);
            if (material == null)
            {
                Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
                material = new Material(shader) { name = "M_Feuer_Leuchten" };
                AssetDatabase.CreateAsset(material, FireGlowPath);
                report.Info("Angelegt: " + FireGlowPath);
            }

            material.SetColor("_BaseColor", Fire);
            material.SetColor("_EmissionColor", Fire * 3.5f);
            material.EnableKeyword("_EMISSION");
            material.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            EditorUtility.SetDirty(material);
            return material;
        }
    }
}
