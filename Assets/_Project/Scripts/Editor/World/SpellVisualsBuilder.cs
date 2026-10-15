using Aetherfall.Combat;
using Aetherfall.Player;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Builds the looks (<see cref="AbilityVisual"/>) of the nine mage spells under the player (GDD 03 6.4, GDD 05): a large
    /// fire orb with an explosion, a blue ice lance, a zigzag lightning between the targets, burning ground, a frost ring around
    /// the caster, lightning strikes from the sky and three auras (fire, ice, crackling sparks). Everything uses the soft
    /// additive spark material of the Aether-Stoß plus two glowing materials for the projectile cores and one for the lightning.
    /// </summary>
    public static class SpellVisualsBuilder
    {
        private const string IceGlowPath = TestGroundPaths.MaterialFolder + "/M_Eis_Leuchten.mat";
        private const string FireOrbPath = TestGroundPaths.MaterialFolder + "/M_Feuerball_Leuchten.mat";
        private const string LightningPath = TestGroundPaths.MaterialFolder + "/M_Blitz.mat";

        private static readonly Color FireLight = new Color(1f, 0.55f, 0.15f);
        private static readonly Color FireBright = new Color(1f, 0.82f, 0.35f);
        private static readonly Color FireDeep = new Color(1f, 0.3f, 0.05f);
        private static readonly Color IceBright = new Color(0.85f, 0.97f, 1f);
        private static readonly Color IceDeep = new Color(0.35f, 0.75f, 1f);
        private static readonly Color BoltBright = new Color(0.95f, 0.95f, 1f);
        private static readonly Color BoltDeep = new Color(0.55f, 0.7f, 1f);

        /// <summary>Builds the look of one spell (by id) under the player; null for an unknown id.</summary>
        /// <param name="player">Player root.</param>
        /// <param name="abilityId">Spell id (<see cref="SpellAssets"/>).</param>
        /// <param name="muzzle">Staff tip for projectiles (null: in front of the chest).</param>
        /// <param name="hurtboxLayer">Hurtbox layer.</param>
        /// <param name="solidMask">Ground and walls.</param>
        /// <param name="report">Protocol.</param>
        public static AbilityVisual Build(Transform player, string abilityId, Transform muzzle, int hurtboxLayer, int solidMask, TestGroundReport report)
        {
            switch (abilityId)
            {
                case SpellAssets.Fireball:
                    return Fireball(player, muzzle, hurtboxLayer, solidMask, report);
                case SpellAssets.IceLance:
                    return IceLance(player, muzzle, hurtboxLayer, solidMask, report);
                case SpellAssets.ChainLightning:
                    return ChainLightning(player, report);
                case SpellAssets.FlameCarpet:
                    return FlameCarpet(player, report);
                case SpellAssets.FrostNova:
                    return FrostNova(player, report);
                case SpellAssets.ThunderCall:
                    return ThunderCall(player, report);
                case SpellAssets.FireMantle:
                    return Aura(player, "Zauber_Glutmantel", FireBright, FireDeep, -0.25f, 40f, FireLight, report);
                case SpellAssets.IceArmor:
                    return Aura(player, "Zauber_Eispanzer", IceBright, IceDeep, 0.05f, 22f, IceDeep, report);
                case SpellAssets.StormStep:
                    return StormStep(player, report);
                default:
                    return null;
            }
        }

        private static AbilityVisual Fireball(Transform player, Transform muzzle, int hurtboxLayer, int solidMask, TestGroundReport report)
        {
            AbilityVisual visual = Root(player, "Zauber_Feuerball", out GameObject root);
            ProjectileLauncher launcher = root.AddComponent<ProjectileLauncher>();
            Projectile template = ProjectileTemplate(root.transform, "Feuerball (Vorlage)", EnsureGlow(FireOrbPath, "M_Feuerball_Leuchten", FireLight, 4f, report),
                Vector3.one * 0.5f, PrimitiveType.Sphere, FireLight, 7f, 0.4f, FireBright, FireDeep, report);
            Launcher(launcher, template, muzzle, hurtboxLayer, solidMask, report);
            ParticleSystem impact = Burst(root.transform, "Explosion", FireBright, FireDeep, 0.35f, 0.75f, 3f, 9f, 0.35f, 0.9f, 1, ParticleSystemShapeType.Sphere,
                0.6f, report);
            TestGroundFields.SetReference(visual, "impactEffect", impact, report);
            TestGroundFields.SetInt(visual, "impactParticles", 120, report);
            TestGroundFields.SetReference(visual, "flash", Flash(root.transform, FireLight, 12f, 8f), report);
            TestGroundFields.SetReference(visual, "launcher", launcher, report);
            return visual;
        }

        private static AbilityVisual IceLance(Transform player, Transform muzzle, int hurtboxLayer, int solidMask, TestGroundReport report)
        {
            AbilityVisual visual = Root(player, "Zauber_Eislanze", out GameObject root);
            ProjectileLauncher launcher = root.AddComponent<ProjectileLauncher>();
            Projectile template = ProjectileTemplate(root.transform, "Eislanze (Vorlage)", EnsureGlow(IceGlowPath, "M_Eis_Leuchten", IceDeep, 3f, report),
                new Vector3(0.14f, 0.14f, 1.1f), PrimitiveType.Cube, IceDeep, 5f, 0.18f, IceBright, IceDeep, report);
            Launcher(launcher, template, muzzle, hurtboxLayer, solidMask, report);
            ParticleSystem impact = Burst(root.transform, "Eissplitter", IceBright, IceDeep, 0.3f, 0.6f, 3f, 7f, 0.1f, 0.25f, 1, ParticleSystemShapeType.Sphere,
                0.3f, report);
            TestGroundFields.SetReference(visual, "impactEffect", impact, report);
            TestGroundFields.SetInt(visual, "impactParticles", 45, report);
            TestGroundFields.SetReference(visual, "launcher", launcher, report);
            return visual;
        }

        private static AbilityVisual ChainLightning(Transform player, TestGroundReport report)
        {
            AbilityVisual visual = Root(player, "Zauber_Kettenblitz", out GameObject root);
            TestGroundFields.SetReference(visual, "beam", Beam(root.transform, 0.16f, report), report);
            TestGroundFields.SetFloat(visual, "beamSeconds", 0.28f, report);
            ParticleSystem impact = Burst(root.transform, "Funken", BoltBright, BoltDeep, 0.15f, 0.35f, 2f, 7f, 0.06f, 0.16f, 1, ParticleSystemShapeType.Sphere,
                0.25f, report);
            TestGroundFields.SetReference(visual, "impactEffect", impact, report);
            TestGroundFields.SetInt(visual, "impactParticles", 30, report);
            TestGroundFields.SetReference(visual, "flash", Flash(root.transform, BoltDeep, 9f, 6f), report);
            return visual;
        }

        private static AbilityVisual FlameCarpet(Transform player, TestGroundReport report)
        {
            AbilityVisual visual = Root(player, "Zauber_Flammenteppich", out GameObject root);
            var ground = new GameObject("Brennender_Boden");
            ground.transform.SetParent(root.transform, false);
            ground.layer = root.layer;
            ParticleSystem flames = Loop(ground.transform, "Flammen", FireBright, FireDeep, 0.4f, 0.9f, 0.1f, 0.5f, 0.35f, 0.95f, 300f,
                ParticleSystemShapeType.Circle, 4f, -0.8f, report);
            flames.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);
            // A glowing disc on the ground shows the whole area (4 m radius) under the flames.
            ParticleSystem glow = Loop(ground.transform, "Glutboden", new Color(1f, 0.45f, 0.1f, 0.45f), new Color(0.9f, 0.25f, 0.05f, 0.35f), 1.2f, 1.2f, 0f, 0f,
                8.5f, 8.5f, 2.5f, ParticleSystemShapeType.Sphere, 0.01f, 0f, report);
            glow.transform.localPosition = new Vector3(0f, 0.08f, 0f);
            glow.GetComponent<ParticleSystemRenderer>().renderMode = ParticleSystemRenderMode.HorizontalBillboard;
            ParticleSystem embers = Loop(ground.transform, "Glut", FireDeep, new Color(0.6f, 0.12f, 0.02f), 0.8f, 1.6f, 0.05f, 0.3f, 0.5f, 1.1f, 35f,
                ParticleSystemShapeType.Circle, 4f, 0f, report);
            embers.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);
            Light light = ground.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = FireLight;
            light.range = 9f;
            light.intensity = 3f;
            light.shadows = LightShadows.None;
            ground.SetActive(false);
            TestGroundFields.SetReference(visual, "lasting", ground, report);
            ParticleSystem cast = Burst(root.transform, "Wirken", FireBright, FireDeep, 0.25f, 0.5f, 2f, 5f, 0.15f, 0.35f, 40, ParticleSystemShapeType.Cone,
                0.3f, report);
            cast.transform.localPosition = new Vector3(0f, 1.2f, 0.4f);
            TestGroundFields.SetReference(visual, "castEffect", cast, report);
            return visual;
        }

        private static AbilityVisual FrostNova(Transform player, TestGroundReport report)
        {
            AbilityVisual visual = Root(player, "Zauber_Frostnova", out GameObject root);
            ParticleSystem ring = Burst(root.transform, "Frostring", IceBright, IceDeep, 0.35f, 0.55f, 9f, 13f, 0.3f, 0.7f, 220, ParticleSystemShapeType.Circle,
                0.4f, report);
            ring.transform.localPosition = new Vector3(0f, 0.4f, 0f);
            ring.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);
            ParticleSystem.ShapeModule shape = ring.shape;
            shape.radiusThickness = 0f;
            ParticleSystem.MainModule main = ring.main;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            TestGroundFields.SetReference(visual, "castEffect", ring, report);
            TestGroundFields.SetReference(visual, "flash", Flash(root.transform, IceDeep, 10f, 6f), report);
            return visual;
        }

        private static AbilityVisual ThunderCall(Transform player, TestGroundReport report)
        {
            AbilityVisual visual = Root(player, "Zauber_Gewitterruf", out GameObject root);
            TestGroundFields.SetReference(visual, "beam", Beam(root.transform, 0.2f, report), report);
            TestGroundFields.SetFloat(visual, "beamSeconds", 0.22f, report);
            ParticleSystem impact = Burst(root.transform, "Einschlag", BoltBright, BoltDeep, 0.25f, 0.5f, 3f, 9f, 0.08f, 0.22f, 1, ParticleSystemShapeType.Hemisphere,
                0.5f, report);
            impact.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);
            TestGroundFields.SetReference(visual, "impactEffect", impact, report);
            TestGroundFields.SetInt(visual, "impactParticles", 70, report);
            TestGroundFields.SetReference(visual, "flash", Flash(root.transform, BoltBright, 14f, 9f), report);
            ParticleSystem cast = Burst(root.transform, "Wirken", BoltBright, BoltDeep, 0.2f, 0.4f, 1f, 3f, 0.05f, 0.12f, 30, ParticleSystemShapeType.Sphere,
                0.5f, report);
            cast.transform.localPosition = new Vector3(0f, 1.6f, 0f);
            TestGroundFields.SetReference(visual, "castEffect", cast, report);
            return visual;
        }

        private static AbilityVisual Aura(Transform player, string name, Color bright, Color deep, float gravity, float rate, Color lightColor,
            TestGroundReport report)
        {
            AbilityVisual visual = Root(player, name, out GameObject root);
            var aura = new GameObject("Aura");
            aura.transform.SetParent(root.transform, false);
            aura.layer = root.layer;
            ParticleSystem body = Loop(aura.transform, "Huelle", bright, deep, 0.4f, 0.8f, 0.2f, 0.8f, 0.15f, 0.4f, rate, ParticleSystemShapeType.Box, 0.5f,
                gravity, report);
            body.transform.localPosition = new Vector3(0f, 0.95f, 0f);
            ParticleSystem.ShapeModule shape = body.shape;
            shape.scale = new Vector3(0.8f, 1.7f, 0.6f);
            Light light = body.gameObject.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = lightColor;
            light.range = 4f;
            light.intensity = 1.2f;
            light.shadows = LightShadows.None;
            aura.transform.localPosition = Vector3.zero;
            aura.SetActive(false);
            TestGroundFields.SetReference(visual, "lasting", aura, report);
            ParticleSystem cast = Burst(root.transform, "Wirken", bright, deep, 0.3f, 0.6f, 2f, 5f, 0.12f, 0.3f, 60, ParticleSystemShapeType.Sphere, 0.6f, report);
            cast.transform.localPosition = new Vector3(0f, 1f, 0f);
            TestGroundFields.SetReference(visual, "castEffect", cast, report);
            return visual;
        }

        private static AbilityVisual StormStep(Transform player, TestGroundReport report)
        {
            AbilityVisual visual = Aura(player, "Zauber_Sturmschritt", BoltBright, BoltDeep, 0f, 28f, BoltDeep, report);
            ParticleSystem pulse = Burst(visual.transform, "Schockfeld", BoltBright, BoltDeep, 0.2f, 0.45f, 3f, 8f, 0.06f, 0.16f, 1, ParticleSystemShapeType.Circle,
                1.2f, report);
            pulse.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);
            TestGroundFields.SetReference(visual, "impactEffect", pulse, report);
            TestGroundFields.SetInt(visual, "impactParticles", 60, report);
            return visual;
        }

        internal static AbilityVisual Root(Transform player, string name, out GameObject root)
        {
            root = new GameObject(name);
            root.transform.SetParent(player, false);
            root.layer = player.gameObject.layer;
            return root.AddComponent<AbilityVisual>();
        }

        private static void Launcher(ProjectileLauncher launcher, Projectile template, Transform muzzle, int hurtboxLayer, int solidMask, TestGroundReport report)
        {
            TestGroundFields.SetReference(launcher, "template", template, report);
            TestGroundFields.SetReference(launcher, "muzzle", muzzle, report);
            TestGroundFields.SetInt(launcher, "hurtboxLayers", hurtboxLayer >= 0 ? 1 << hurtboxLayer : 0, report);
            TestGroundFields.SetInt(launcher, "solidLayers", solidMask, report);
            TestGroundFields.SetInt(launcher, "poolSize", 4, report);
        }

        private static Projectile ProjectileTemplate(Transform parent, string name, Material glow, Vector3 coreScale, PrimitiveType shape, Color lightColor,
            float lightRange, float trailWidth, Color trailBright, Color trailDeep, TestGroundReport report)
        {
            var bolt = new GameObject(name);
            bolt.transform.SetParent(parent, false);
            bolt.layer = parent.gameObject.layer;
            Projectile projectile = bolt.AddComponent<Projectile>();

            GameObject core = GameObject.CreatePrimitive(shape);
            core.name = "Kern";
            Object.DestroyImmediate(core.GetComponent<Collider>());
            core.transform.SetParent(bolt.transform, false);
            core.transform.localScale = coreScale;
            core.layer = bolt.layer;
            Renderer coreRenderer = core.GetComponent<Renderer>();
            coreRenderer.sharedMaterial = glow;
            coreRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            Light light = bolt.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = lightColor;
            light.range = lightRange;
            light.intensity = 3.5f;
            light.shadows = LightShadows.None;

            TrailRenderer trail = bolt.AddComponent<TrailRenderer>();
            trail.time = 0.28f;
            trail.minVertexDistance = 0.1f;
            trail.widthCurve = AnimationCurve.Linear(0f, trailWidth, 1f, 0f);
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(trailBright, 0f), new GradientColorKey(trailDeep, 1f) },
                new[] { new GradientAlphaKey(0.9f, 0f), new GradientAlphaKey(0f, 1f) });
            trail.colorGradient = gradient;
            trail.sharedMaterial = AetherPushEffect.ParticleMaterial(report);
            trail.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            ParticleSystem impact = Burst(bolt.transform, "Einschlag", trailBright, trailDeep, 0.2f, 0.4f, 2f, 6f, 0.1f, 0.25f, 30, ParticleSystemShapeType.Sphere,
                0.15f, report);
            TestGroundFields.SetReference(projectile, "body", core, report);
            TestGroundFields.SetReference(projectile, "trail", trail, report);
            TestGroundFields.SetReference(projectile, "glow", light, report);
            TestGroundFields.SetReference(projectile, "impact", impact, report);
            bolt.SetActive(false);
            return projectile;
        }

        /// <summary>A one-shot burst (count 1 = only emitted by code with <c>Emit</c>).</summary>
        internal static ParticleSystem Burst(Transform parent, string name, Color bright, Color deep, float lifeMin, float lifeMax, float speedMin, float speedMax,
            float sizeMin, float sizeMax, int count, ParticleSystemShapeType shapeType, float radius, TestGroundReport report)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.layer = parent.gameObject.layer;
            ParticleSystem system = go.AddComponent<ParticleSystem>();
            system.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            ParticleSystem.MainModule main = system.main;
            main.loop = false;
            main.playOnAwake = false;
            main.duration = 0.25f;
            main.startLifetime = new ParticleSystem.MinMaxCurve(lifeMin, lifeMax);
            main.startSpeed = new ParticleSystem.MinMaxCurve(speedMin, speedMax);
            main.startSize = new ParticleSystem.MinMaxCurve(sizeMin, sizeMax);
            main.startColor = new ParticleSystem.MinMaxGradient(bright, deep);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = Mathf.Max(60, count * 3);
            ParticleSystem.EmissionModule emission = system.emission;
            emission.rateOverTime = 0f;
            emission.SetBursts(count > 1 ? new[] { new ParticleSystem.Burst(0f, count) } : new ParticleSystem.Burst[0]);
            ParticleSystem.ShapeModule shape = system.shape;
            shape.shapeType = shapeType;
            shape.radius = radius;
            if (shapeType == ParticleSystemShapeType.Cone)
            {
                shape.angle = 30f;
            }

            ParticleSystem.ColorOverLifetimeModule color = system.colorOverLifetime;
            color.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0.7f, 0.5f), new GradientAlphaKey(0f, 1f) });
            color.color = gradient;
            ParticleSystemRenderer renderer = go.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = AetherPushEffect.ParticleMaterial(report);
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            return system;
        }

        /// <summary>A looping system that plays while its object is active (burning ground, auras).</summary>
        private static ParticleSystem Loop(Transform parent, string name, Color bright, Color deep, float lifeMin, float lifeMax, float speedMin, float speedMax,
            float sizeMin, float sizeMax, float rate, ParticleSystemShapeType shapeType, float radius, float gravity, TestGroundReport report)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.layer = parent.gameObject.layer;
            ParticleSystem system = go.AddComponent<ParticleSystem>();
            ParticleSystem.MainModule main = system.main;
            main.loop = true;
            main.playOnAwake = true;
            main.startLifetime = new ParticleSystem.MinMaxCurve(lifeMin, lifeMax);
            main.startSpeed = new ParticleSystem.MinMaxCurve(speedMin, speedMax);
            main.startSize = new ParticleSystem.MinMaxCurve(sizeMin, sizeMax);
            main.startColor = new ParticleSystem.MinMaxGradient(bright, deep);
            main.gravityModifier = gravity;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = Mathf.CeilToInt(rate * lifeMax * 1.5f) + 10;
            ParticleSystem.EmissionModule emission = system.emission;
            emission.rateOverTime = rate;
            ParticleSystem.ShapeModule shape = system.shape;
            shape.shapeType = shapeType;
            shape.radius = radius;
            if (shapeType == ParticleSystemShapeType.Box)
            {
                // A box emits along its z axis; the aura should glow in every direction and rise.
                shape.randomDirectionAmount = 1f;
            }

            ParticleSystem.ColorOverLifetimeModule color = system.colorOverLifetime;
            color.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(1f, 0.2f), new GradientAlphaKey(0f, 1f) });
            color.color = gradient;
            ParticleSystemRenderer renderer = go.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = AetherPushEffect.ParticleMaterial(report);
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            return system;
        }

        internal static Light Flash(Transform parent, Color color, float range, float intensity)
        {
            var go = new GameObject("Lichtblitz");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = new Vector3(0f, 1.3f, 1.2f);
            go.layer = parent.gameObject.layer;
            Light light = go.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = color;
            light.range = range;
            light.intensity = intensity;
            light.shadows = LightShadows.None;
            light.enabled = false;
            return light;
        }

        private static LineRenderer Beam(Transform parent, float width, TestGroundReport report)
        {
            var go = new GameObject("Blitz");
            go.transform.SetParent(parent, false);
            go.layer = parent.gameObject.layer;
            LineRenderer line = go.AddComponent<LineRenderer>();
            line.useWorldSpace = true;
            line.positionCount = 0;
            line.widthCurve = AnimationCurve.Linear(0f, width, 1f, width * 0.6f);
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(BoltBright, 0f), new GradientColorKey(BoltDeep, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0.9f, 1f) });
            line.colorGradient = gradient;
            line.numCornerVertices = 2;
            line.sharedMaterial = EnsureLightning(report);
            line.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            line.receiveShadows = false;
            line.enabled = false;
            return line;
        }

        private static Material EnsureGlow(string path, string name, Color color, float emission, TestGroundReport report)
        {
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
                material = new Material(shader) { name = name };
                AssetDatabase.CreateAsset(material, path);
                report.Info("Angelegt: " + path);
            }

            material.SetColor("_BaseColor", color);
            material.SetColor("_EmissionColor", color * emission);
            material.EnableKeyword("_EMISSION");
            material.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            EditorUtility.SetDirty(material);
            return material;
        }

        private static Material EnsureLightning(TestGroundReport report)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Particles/Unlit");
            if (shader == null)
            {
                return null;
            }

            Material material = AssetDatabase.LoadAssetAtPath<Material>(LightningPath);
            if (material == null)
            {
                material = new Material(shader) { name = "M_Blitz" };
                AssetDatabase.CreateAsset(material, LightningPath);
                report.Info("Angelegt: " + LightningPath);
            }

            // Plain additive colour without texture: the line keeps its full brightness along its length.
            material.SetTexture("_BaseMap", null);
            material.SetColor("_BaseColor", Color.white);
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
    }
}
