using Aetherfall.Combat;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Adds <see cref="StatusEffectVisuals"/> to a fighter: flames around the body (box of its size, orange point light) and
    /// yellow sparks circling above the head. Used by every builder of the player, enemies, bosses and companions.
    /// </summary>
    public static class StatusVisualsBuilder
    {
        /// <summary>Builds the effects under <paramref name="root"/>.</summary>
        /// <param name="root">Fighter root (with <see cref="Combatant"/>).</param>
        /// <param name="height">Body height in metres (wolf 0.9, human 1.8).</param>
        /// <param name="length">Body length along z (wolf 1.3, human 0.4).</param>
        /// <param name="report">Protocol.</param>
        public static void Add(GameObject root, float height, float length, TestGroundReport report)
        {
            Material sparks = AetherPushEffect.ParticleMaterial(report);

            var fireObject = new GameObject("Status_Brennen");
            fireObject.transform.SetParent(root.transform, false);
            fireObject.transform.localPosition = new Vector3(0f, height * 0.45f, length > 1f ? length * 0.2f : 0f);
            fireObject.layer = root.layer;
            ParticleSystem fire = fireObject.AddComponent<ParticleSystem>();
            fire.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            ParticleSystem.MainModule main = fire.main;
            main.loop = true;
            main.playOnAwake = false;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.35f, 0.7f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(0.6f, 1.6f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.18f, 0.42f);
            main.startColor = new ParticleSystem.MinMaxGradient(new Color(1f, 0.78f, 0.3f), new Color(1f, 0.32f, 0.05f));
            main.gravityModifier = -0.15f;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 90;
            ParticleSystem.EmissionModule emission = fire.emission;
            emission.rateOverTime = 45f;
            ParticleSystem.ShapeModule shape = fire.shape;
            shape.shapeType = ParticleSystemShapeType.Box;
            shape.scale = new Vector3(0.45f, height * 0.8f, Mathf.Max(0.4f, length * 0.8f));
            ParticleSystemRenderer fireRenderer = fireObject.GetComponent<ParticleSystemRenderer>();
            fireRenderer.sharedMaterial = sparks;
            fireRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            Light light = fireObject.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = new Color(1f, 0.55f, 0.15f);
            light.range = 4f;
            light.intensity = 1.6f;
            light.shadows = LightShadows.None;
            light.enabled = false;

            var stunObject = new GameObject("Status_Betaeubt");
            stunObject.transform.SetParent(root.transform, false);
            stunObject.transform.localPosition = new Vector3(0f, height + 0.25f, length > 1f ? length * 0.4f : 0f);
            stunObject.layer = root.layer;
            ParticleSystem stun = stunObject.AddComponent<ParticleSystem>();
            stun.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            ParticleSystem.MainModule stunMain = stun.main;
            stunMain.loop = true;
            stunMain.playOnAwake = false;
            stunMain.startLifetime = 0.8f;
            stunMain.startSpeed = 0f;
            stunMain.startSize = new ParticleSystem.MinMaxCurve(0.08f, 0.14f);
            stunMain.startColor = new Color(1f, 0.92f, 0.45f);
            stunMain.simulationSpace = ParticleSystemSimulationSpace.Local;
            stunMain.maxParticles = 20;
            ParticleSystem.EmissionModule stunEmission = stun.emission;
            stunEmission.rateOverTime = 12f;
            ParticleSystem.ShapeModule stunShape = stun.shape;
            stunShape.shapeType = ParticleSystemShapeType.Circle;
            stunShape.radius = 0.3f;
            stunShape.radiusThickness = 0f;
            stunShape.rotation = new Vector3(90f, 0f, 0f);
            ParticleSystem.VelocityOverLifetimeModule orbit = stun.velocityOverLifetime;
            orbit.enabled = true;
            orbit.space = ParticleSystemSimulationSpace.Local;
            orbit.orbitalY = new ParticleSystem.MinMaxCurve(4f);
            ParticleSystemRenderer stunRenderer = stunObject.GetComponent<ParticleSystemRenderer>();
            stunRenderer.sharedMaterial = sparks;
            stunRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            StatusEffectVisuals visuals = root.AddComponent<StatusEffectVisuals>();
            TestGroundFields.SetReference(visuals, "combatant", root.GetComponent<Combatant>(), report);
            TestGroundFields.SetReference(visuals, "burning", fire, report);
            TestGroundFields.SetReference(visuals, "burningLight", light, report);
            TestGroundFields.SetReference(visuals, "stunned", stun, report);
        }
    }
}
