using Aetherfall.Combat;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// The arrow template of the player's bow (GDD 03 6.1): the Blender arrow (<see cref="CharacterModels.Arrow"/>, a thin box
    /// without the model), a short pale trail and a small burst of straw and dust on impact, wired into the bow's
    /// <see cref="ProjectileLauncher"/>.
    /// </summary>
    public static class BowEffects
    {
        /// <summary>Builds the inactive arrow template under <paramref name="parent"/> and sets the launcher fields.</summary>
        /// <param name="parent">Launcher object (child of the player).</param>
        /// <param name="launcher">The bow's launcher.</param>
        /// <param name="muzzle">Launch point (the bow hand).</param>
        /// <param name="hurtboxLayer">Hurtbox layer or −1.</param>
        /// <param name="solidMask">Layers where the arrow stops.</param>
        /// <param name="report">Protocol.</param>
        public static void BuildArrow(Transform parent, ProjectileLauncher launcher, Transform muzzle, int hurtboxLayer, int solidMask, TestGroundReport report)
        {
            var arrow = new GameObject("Pfeil (Vorlage)");
            arrow.transform.SetParent(parent, false);
            arrow.layer = parent.gameObject.layer;
            Projectile projectile = arrow.AddComponent<Projectile>();

            Transform model = CharacterModels.Instantiate(CharacterModels.Arrow, arrow.transform, "Modell", arrow.layer, report);
            GameObject body;
            if (model != null)
            {
                body = model.gameObject;
                foreach (Renderer renderer in model.GetComponentsInChildren<Renderer>(true))
                {
                    renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                }
            }
            else
            {
                body = GameObject.CreatePrimitive(PrimitiveType.Cube);
                body.name = "Modell";
                Object.DestroyImmediate(body.GetComponent<Collider>());
                body.transform.SetParent(arrow.transform, false);
                body.transform.localPosition = new Vector3(0f, 0f, -0.3f);
                body.transform.localScale = new Vector3(0.02f, 0.02f, 0.7f);
                body.layer = arrow.layer;
            }

            Material particles = AetherPushEffect.ParticleMaterial(report);
            TrailRenderer trail = arrow.AddComponent<TrailRenderer>();
            trail.time = 0.12f;
            trail.minVertexDistance = 0.2f;
            trail.widthCurve = AnimationCurve.Linear(0f, 0.04f, 1f, 0f);
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(new Color(0.95f, 0.92f, 0.85f), 0f), new GradientColorKey(new Color(0.8f, 0.78f, 0.72f), 1f) },
                new[] { new GradientAlphaKey(0.45f, 0f), new GradientAlphaKey(0f, 1f) });
            trail.colorGradient = gradient;
            trail.sharedMaterial = particles;
            trail.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            var impactObject = new GameObject("Einschlag");
            impactObject.transform.SetParent(arrow.transform, false);
            impactObject.layer = arrow.layer;
            ParticleSystem impact = impactObject.AddComponent<ParticleSystem>();
            impact.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            ParticleSystem.MainModule main = impact.main;
            main.loop = false;
            main.playOnAwake = false;
            main.duration = 0.2f;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.25f, 0.5f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(1f, 3.5f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.04f, 0.1f);
            main.startColor = new ParticleSystem.MinMaxGradient(new Color(0.85f, 0.72f, 0.42f), new Color(0.55f, 0.45f, 0.32f));
            main.gravityModifier = 0.6f;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 30;
            ParticleSystem.EmissionModule emission = impact.emission;
            emission.rateOverTime = 0f;
            emission.SetBursts(new[] { new ParticleSystem.Burst(0f, 18) });
            ParticleSystem.ShapeModule shape = impact.shape;
            shape.shapeType = ParticleSystemShapeType.Hemisphere;
            shape.radius = 0.05f;
            shape.rotation = new Vector3(180f, 0f, 0f);
            ParticleSystemRenderer impactRenderer = impactObject.GetComponent<ParticleSystemRenderer>();
            impactRenderer.sharedMaterial = particles;
            impactRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            TestGroundFields.SetReference(projectile, "body", body, report);
            TestGroundFields.SetReference(projectile, "trail", trail, report);
            TestGroundFields.SetReference(projectile, "impact", impact, report);
            arrow.SetActive(false);

            TestGroundFields.SetReference(launcher, "template", projectile, report);
            TestGroundFields.SetReference(launcher, "muzzle", muzzle, report);
            TestGroundFields.SetInt(launcher, "hurtboxLayers", hurtboxLayer >= 0 ? 1 << hurtboxLayer : 0, report);
            TestGroundFields.SetInt(launcher, "solidLayers", solidMask, report);
            TestGroundFields.SetInt(launcher, "poolSize", 12, report);
            report.Info("Bogen: Pfeil-Vorlage (Blender-Pfeil, Spur, Einschlag) und eigener ProjectileLauncher an der Bogenhand (12 Pfeile gleichzeitig).");
        }
    }
}
