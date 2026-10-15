using Aetherfall.Combat;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Builds the explosive world objects of GDD 03 6.6–6.7 for the test ground and the Eichental: an oil barrel (wood with
    /// iron rings; a blow spills a 3 m oil puddle, fire explodes it and leaves the puddle burning 8 s) and a powder keg (dark,
    /// with a fuse; fire or an explosion sets it off, 5 m). Each is a neutral <see cref="Combatant"/> with a hurtbox, a burst of
    /// sparks, a light flash and an <see cref="ElementArea"/> child for the puddle and the fire.
    /// </summary>
    public static class ExplosiveBuilder
    {
        /// <summary>Builds an oil barrel.</summary>
        /// <param name="parent">Parent.</param>
        /// <param name="name">Name.</param>
        /// <param name="objectId">Object id (may be empty).</param>
        /// <param name="localPosition">Position under the parent.</param>
        /// <param name="wood">Barrel material.</param>
        /// <param name="iron">Ring material.</param>
        /// <param name="hurtboxLayer">Hurtbox layer or −1.</param>
        /// <param name="environmentLayer">Environment layer (solid collider).</param>
        /// <param name="report">Protocol.</param>
        public static ExplosiveObject BuildOilBarrel(Transform parent, string name, string objectId, Vector3 localPosition, Material wood, Material iron,
            int hurtboxLayer, int environmentLayer, TestGroundReport report)
        {
            GameObject root = Root(parent, name, localPosition, environmentLayer);
            var visuals = new GameObject("Modell");
            visuals.transform.SetParent(root.transform, false);
            visuals.layer = root.layer;
            Visual(visuals.transform, "Fass", PrimitiveType.Cylinder, new Vector3(0f, 0.5f, 0f), new Vector3(0.8f, 0.5f, 0.8f), wood);
            Visual(visuals.transform, "Ring oben", PrimitiveType.Cylinder, new Vector3(0f, 0.8f, 0f), new Vector3(0.84f, 0.03f, 0.84f), iron);
            Visual(visuals.transform, "Ring unten", PrimitiveType.Cylinder, new Vector3(0f, 0.2f, 0f), new Vector3(0.84f, 0.03f, 0.84f), iron);
            Visual(visuals.transform, "Deckel", PrimitiveType.Cylinder, new Vector3(0f, 1.0f, 0f), new Vector3(0.7f, 0.02f, 0.7f), iron);
            return Finish(root, visuals, ExplosiveKind.OilBarrel, objectId, new Vector3(0f, 0.5f, 0f), new Vector3(0.9f, 1.0f, 0.9f), hurtboxLayer,
                environmentLayer, report);
        }

        /// <summary>Builds a powder keg.</summary>
        /// <param name="parent">Parent.</param>
        /// <param name="name">Name.</param>
        /// <param name="objectId">Object id (may be empty).</param>
        /// <param name="localPosition">Position under the parent.</param>
        /// <param name="wood">Keg material (dark).</param>
        /// <param name="iron">Ring material.</param>
        /// <param name="hurtboxLayer">Hurtbox layer or −1.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        /// <param name="report">Protocol.</param>
        public static ExplosiveObject BuildPowderKeg(Transform parent, string name, string objectId, Vector3 localPosition, Material wood, Material iron,
            int hurtboxLayer, int environmentLayer, TestGroundReport report)
        {
            GameObject root = Root(parent, name, localPosition, environmentLayer);
            var visuals = new GameObject("Modell");
            visuals.transform.SetParent(root.transform, false);
            visuals.layer = root.layer;
            Visual(visuals.transform, "Fass", PrimitiveType.Cylinder, new Vector3(0f, 0.35f, 0f), new Vector3(0.7f, 0.35f, 0.7f), wood);
            Visual(visuals.transform, "Ring", PrimitiveType.Cylinder, new Vector3(0f, 0.35f, 0f), new Vector3(0.74f, 0.03f, 0.74f), iron);
            Visual(visuals.transform, "Lunte", PrimitiveType.Cylinder, new Vector3(0.1f, 0.78f, 0f), new Vector3(0.03f, 0.1f, 0.03f), iron);
            return Finish(root, visuals, ExplosiveKind.PowderKeg, objectId, new Vector3(0f, 0.35f, 0f), new Vector3(0.8f, 0.7f, 0.8f), hurtboxLayer,
                environmentLayer, report);
        }

        private static GameObject Root(Transform parent, string name, Vector3 localPosition, int environmentLayer)
        {
            var root = new GameObject(name);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = localPosition;
            root.layer = environmentLayer >= 0 ? environmentLayer : 0;
            return root;
        }

        private static ExplosiveObject Finish(GameObject root, GameObject visuals, ExplosiveKind kind, string objectId, Vector3 center, Vector3 size,
            int hurtboxLayer, int environmentLayer, TestGroundReport report)
        {
            // Solid for walking and the crosshair; the hurtbox for blades, bolts and arrows.
            var solid = new GameObject("Solid");
            solid.transform.SetParent(visuals.transform, false);
            solid.layer = environmentLayer >= 0 ? environmentLayer : 0;
            CapsuleCollider capsule = solid.AddComponent<CapsuleCollider>();
            capsule.center = center;
            capsule.height = size.y;
            capsule.radius = size.x * 0.5f;

            DamageableComponent damageable = root.AddComponent<DamageableComponent>();
            TestGroundFields.SetFloat(damageable, "maxHealth", 9999f, report);
            TestGroundFields.SetBool(damageable, "regenerate", false, report);
            TestGroundFields.SetString(damageable, "ownerId", string.IsNullOrEmpty(objectId) ? root.name : objectId, report);
            Transform targetPoint = TestGroundCombatBuilder.CreateChild(root.transform, "TargetPoint", center);
            Combatant combatant = root.AddComponent<Combatant>();
            TestGroundFields.SetString(combatant, "combatantId", string.IsNullOrEmpty(objectId) ? root.name : objectId, report);
            TestGroundFields.SetString(combatant, "typeId", kind == ExplosiveKind.PowderKeg ? "object.pulverfass" : "object.oelfass", report);
            TestGroundFields.SetInt(combatant, "team", (int)CombatTeam.Neutral, report);
            TestGroundFields.SetReference(combatant, "damageable", damageable, report);
            TestGroundFields.SetReference(combatant, "targetPoint", targetPoint, report);
            TestGroundFields.SetBool(combatant, "targetable", false, report);
            TestGroundFields.SetBool(combatant, "usePoiseMeter", false, report);
            TestGroundFields.SetInt(combatant, "level", 1, report);
            TestGroundCombatBuilder.AddHurtbox(root.transform, "Hurtbox", HitZone.Body, center, size, hurtboxLayer, report);

            Material sparks = AetherPushEffect.ParticleMaterial(report);
            ParticleSystem burst = Burst(root.transform, sparks, kind == ExplosiveKind.PowderKeg ? 2.5f : 1.6f);
            var flashObject = new GameObject("Blitz");
            flashObject.transform.SetParent(root.transform, false);
            flashObject.transform.localPosition = new Vector3(0f, 1f, 0f);
            Light flash = flashObject.AddComponent<Light>();
            flash.type = LightType.Point;
            flash.color = new Color(1f, 0.7f, 0.3f);
            flash.range = kind == ExplosiveKind.PowderKeg ? 14f : 9f;
            flash.intensity = 0f;
            flash.shadows = LightShadows.None;
            flash.enabled = false;

            ElementArea area = BuildArea(root.transform, "Fläche", ElementReactions.OilPuddleRadius, hurtboxLayer, sparks, report);
            area.gameObject.SetActive(false);

            ExplosiveObject explosive = root.AddComponent<ExplosiveObject>();
            TestGroundFields.SetInt(explosive, "kind", (int)kind, report);
            TestGroundFields.SetString(explosive, "objectId", objectId ?? string.Empty, report);
            TestGroundFields.SetReference(explosive, "visuals", visuals, report);
            TestGroundFields.SetReference(explosive, "burst", burst, report);
            TestGroundFields.SetReference(explosive, "flash", flash, report);
            TestGroundFields.SetReference(explosive, "area", area, report);
            return explosive;
        }

        /// <summary>
        /// Builds an element area (oil puddle, fire, water) with its own neutral combatant and flat hurtbox, so bolts and arrows
        /// into the oil set it off. Inactive kind until <see cref="ElementArea.Spill"/>.
        /// </summary>
        /// <param name="parent">Parent.</param>
        /// <param name="name">Name.</param>
        /// <param name="radius">Radius in metres.</param>
        /// <param name="hurtboxLayer">Hurtbox layer or −1.</param>
        /// <param name="sparks">Particle material of the flames.</param>
        /// <param name="report">Protocol.</param>
        public static ElementArea BuildArea(Transform parent, string name, float radius, int hurtboxLayer, Material sparks, TestGroundReport report)
        {
            var root = new GameObject(name);
            root.transform.SetParent(parent, false);
            root.layer = parent.gameObject.layer;

            GameObject oil = Visual(root.transform, "Öl", PrimitiveType.Cylinder, new Vector3(0f, 0.02f, 0f), new Vector3(radius * 2f, 0.01f, radius * 2f),
                TestGroundAssets.EnsureMaterial("Oel", new Color(0.08f, 0.07f, 0.05f), report));
            Renderer oilRenderer = oil.GetComponent<Renderer>();
            oilRenderer.sharedMaterial.SetFloat("_Smoothness", 0.9f);
            oilRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            var fire = new GameObject("Feuer");
            fire.transform.SetParent(root.transform, false);
            fire.layer = root.layer;
            ParticleSystem flames = fire.AddComponent<ParticleSystem>();
            ParticleSystem.MainModule main = flames.main;
            main.loop = true;
            main.playOnAwake = true;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.5f, 0.9f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(1.2f, 2.4f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.35f, 0.7f);
            main.startColor = new ParticleSystem.MinMaxGradient(new Color(1f, 0.75f, 0.25f), new Color(1f, 0.35f, 0.05f));
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 160;
            ParticleSystem.EmissionModule emission = flames.emission;
            emission.rateOverTime = 70f;
            ParticleSystem.ShapeModule shape = flames.shape;
            shape.shapeType = ParticleSystemShapeType.Circle;
            shape.radius = radius * 0.9f;
            ParticleSystemRenderer flameRenderer = fire.GetComponent<ParticleSystemRenderer>();
            flameRenderer.sharedMaterial = sparks;
            flameRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            Light glow = fire.AddComponent<Light>();
            glow.type = LightType.Point;
            glow.color = new Color(1f, 0.55f, 0.15f);
            glow.range = radius * 3f;
            glow.intensity = 2.5f;
            glow.shadows = LightShadows.None;
            fire.SetActive(false);

            GameObject water = Visual(root.transform, "Wasser", PrimitiveType.Cylinder, new Vector3(0f, 0.02f, 0f), new Vector3(radius * 2f, 0.01f, radius * 2f),
                TestGroundAssets.EnsureMaterial("Pfuetze", new Color(0.25f, 0.35f, 0.42f), report));
            water.SetActive(false);

            DamageableComponent damageable = root.AddComponent<DamageableComponent>();
            TestGroundFields.SetFloat(damageable, "maxHealth", 9999f, report);
            TestGroundFields.SetBool(damageable, "regenerate", false, report);
            TestGroundFields.SetString(damageable, "ownerId", name, report);
            Transform targetPoint = TestGroundCombatBuilder.CreateChild(root.transform, "TargetPoint", new Vector3(0f, 0.2f, 0f));
            Combatant combatant = root.AddComponent<Combatant>();
            TestGroundFields.SetString(combatant, "combatantId", parent.name + "/" + name, report);
            TestGroundFields.SetString(combatant, "typeId", "object.flaeche", report);
            TestGroundFields.SetInt(combatant, "team", (int)CombatTeam.Neutral, report);
            TestGroundFields.SetReference(combatant, "damageable", damageable, report);
            TestGroundFields.SetReference(combatant, "targetPoint", targetPoint, report);
            TestGroundFields.SetBool(combatant, "targetable", false, report);
            TestGroundFields.SetBool(combatant, "usePoiseMeter", false, report);
            TestGroundCombatBuilder.AddHurtbox(root.transform, "Hurtbox", HitZone.Body, new Vector3(0f, 0.2f, 0f), new Vector3(radius * 2f, 0.4f, radius * 2f),
                hurtboxLayer, report);

            ElementArea area = root.AddComponent<ElementArea>();
            TestGroundFields.SetInt(area, "kind", (int)ElementAreaKind.None, report);
            TestGroundFields.SetFloat(area, "radius", radius, report);
            TestGroundFields.SetFloat(area, "seconds", 0f, report);
            TestGroundFields.SetReference(area, "oilVisual", oil, report);
            TestGroundFields.SetReference(area, "fireVisual", fire, report);
            TestGroundFields.SetReference(area, "waterVisual", water, report);
            return area;
        }

        private static ParticleSystem Burst(Transform parent, Material sparks, float strength)
        {
            var burstObject = new GameObject("Explosion");
            burstObject.transform.SetParent(parent, false);
            burstObject.transform.localPosition = new Vector3(0f, 0.6f, 0f);
            burstObject.layer = parent.gameObject.layer;
            ParticleSystem burst = burstObject.AddComponent<ParticleSystem>();
            burst.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            ParticleSystem.MainModule main = burst.main;
            main.loop = false;
            main.playOnAwake = false;
            main.duration = 0.3f;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.3f, 0.7f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(4f * strength, 9f * strength);
            main.startSize = new ParticleSystem.MinMaxCurve(0.3f, 0.9f);
            main.startColor = new ParticleSystem.MinMaxGradient(new Color(1f, 0.85f, 0.4f), new Color(1f, 0.3f, 0.05f));
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.gravityModifier = 0.4f;
            main.maxParticles = 200;
            ParticleSystem.EmissionModule emission = burst.emission;
            emission.rateOverTime = 0f;
            emission.SetBursts(new[] { new ParticleSystem.Burst(0f, (short)(90 * strength)) });
            ParticleSystem.ShapeModule shape = burst.shape;
            shape.shapeType = ParticleSystemShapeType.Sphere;
            shape.radius = 0.4f;
            ParticleSystemRenderer renderer = burstObject.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = sparks;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return burst;
        }

        private static GameObject Visual(Transform parent, string name, PrimitiveType type, Vector3 localPosition, Vector3 localScale, Material material)
        {
            GameObject visual = GameObject.CreatePrimitive(type);
            visual.name = name;
            visual.layer = parent.gameObject.layer;
            visual.transform.SetParent(parent, false);
            visual.transform.localPosition = localPosition;
            visual.transform.localScale = localScale;
            Object.DestroyImmediate(visual.GetComponent<Collider>());
            if (material != null && visual.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = material;
            }

            return visual;
        }
    }
}
