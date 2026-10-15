using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.AI.Bosses;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Turns the named enemies of the Eichental into boss fights (GDD 01 11.4, GDD 02 11.1/11.2, task list S42): boss bar and
    /// phases through <see cref="NamedBossEncounter"/>; the Prolog-Rissbrut gets the <see cref="AetherShell"/> (only the
    /// Aether-Stoß breaks it) and calls two Risslinge out of the ground at half health; Glutfang is its own elite type, staggers
    /// from head hits with arrows (<see cref="HeadshotStagger"/>) and howls for two Aether wolves at half health.
    /// </summary>
    public static class SliceBossBuilder
    {
        /// <summary>Boss id of the prologue Rissbrut.</summary>
        public const string RissbrutId = "boss.eichental.rissbrut_prolog";

        /// <summary>Boss id of Glutfang.</summary>
        public const string GlutfangId = "boss.eichental.glutfang";

        private const string ShellMaterialPath = TestGroundPaths.MaterialFolder + "/M_Rissschale.mat";

        /// <summary>Enemy type of a boss: Glutfang has its own elite type, the others keep the type of the layout.</summary>
        /// <param name="bossId">Boss id of the spawner.</param>
        /// <param name="fallback">Type from the layout.</param>
        public static EnemyTypeDefinition BossType(string bossId, EnemyTypeDefinition fallback)
        {
            if (bossId == GlutfangId)
            {
                return SliceEnemyAssets.Get(SliceEnemyAssets.WolfType, SliceEnemyAssets.GlutfangVariant) ?? fallback;
            }

            return fallback;
        }

        /// <summary>Adds the boss parts to a built named enemy. Unknown boss ids only get the boss bar.</summary>
        /// <param name="boss">The built enemy.</param>
        /// <param name="bossId">Boss id.</param>
        /// <param name="group">Spawn group (the helpers become its children).</param>
        /// <param name="materials">Test ground materials.</param>
        /// <param name="aetherWolf">Base type of the Aether wolves Glutfang calls.</param>
        /// <param name="enemyLayer">Enemy layer or −1.</param>
        /// <param name="hurtboxLayer">Hurtbox layer or −1.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        /// <param name="sightBlockers">Layers that block the sight of the helpers.</param>
        /// <param name="report">Protocol.</param>
        public static void Equip(EnemyController boss, string bossId, Transform group, TestGroundMaterials materials, EnemyTypeDefinition aetherWolf,
            int enemyLayer, int hurtboxLayer, int environmentLayer, int sightBlockers, TestGroundReport report)
        {
            if (boss == null)
            {
                return;
            }

            BossDefinition definition = Definition(bossId, report);
            NamedBossEncounter encounter = boss.gameObject.AddComponent<NamedBossEncounter>();
            TestGroundFields.SetReference(encounter, "definition", definition, report);
            TestGroundFields.SetReference(encounter, "enemy", boss, report);

            GameObject helpers = null;
            switch (bossId)
            {
                case RissbrutId:
                    AddShell(boss, report);
                    helpers = BuildHelpers(group, boss.transform, "Rissruf (Phase 2)", SliceEnemyAssets.RisslingType, "normal",
                        SliceEnemyAssets.Get(SliceEnemyAssets.RisslingType, "normal"), 1, "Rissling aus dem Riss", materials, enemyLayer, hurtboxLayer,
                        environmentLayer, sightBlockers, report);
                    ParticleSystem riftBurst = SpellVisualsBuilder.Burst(boss.transform, "Rissruf", new Color(0.8f, 0.65f, 1f), new Color(0.4f, 0.25f, 0.7f, 0.8f),
                        0.5f, 1.1f, 2f, 6f, 0.12f, 0.4f, 90, ParticleSystemShapeType.Sphere, 0.8f, report);
                    TestGroundFields.SetReference(encounter, "phaseBurst", riftBurst, report);
                    report.Info("Boss Rissbrut: Aether-Schale (nur der Aether-Stoß bricht sie), bei 50 % zwei Risslinge aus dem Boden.");
                    break;
                case GlutfangId:
                    // Grown into the splinter: a third larger than the pack.
                    boss.transform.localScale = Vector3.one * 1.35f;
                    HeadshotStagger stagger = boss.gameObject.AddComponent<HeadshotStagger>();
                    TestGroundFields.SetReference(stagger, "enemy", boss, report);
                    helpers = BuildHelpers(group, boss.transform, "Rudelruf (Phase 2)", SliceEnemyAssets.WolfType, "aether_verderbt", aetherWolf, 3,
                        "Aether-Wolf (Rudel)", materials, enemyLayer, hurtboxLayer, environmentLayer, sightBlockers, report);
                    ParticleSystem howl = SpellVisualsBuilder.Burst(boss.transform, "Heulen", new Color(0.7f, 0.9f, 1f), new Color(0.35f, 0.5f, 0.9f, 0.7f),
                        0.6f, 1.2f, 3f, 7f, 0.1f, 0.3f, 70, ParticleSystemShapeType.Circle, 0.6f, report);
                    TestGroundFields.SetReference(encounter, "phaseBurst", howl, report);
                    report.Info("Boss Glutfang: Elite-Aether-Wolf (Leben ×3, Kristallkern), taumelt bei Kopftreffern mit Pfeilen, ruft bei 50 % zwei Aether-Wölfe.");
                    break;
            }

            if (helpers != null)
            {
                TestGroundFields.SetReferences(encounter, "phaseHelpers", new Object[] { helpers }, report);
            }
        }

        private static BossDefinition Definition(string bossId, TestGroundReport report)
        {
            string file = bossId == GlutfangId ? "Boss_Glutfang" : bossId == RissbrutId ? "Boss_Rissbrut_Prolog" : null;
            if (file == null)
            {
                return null;
            }

            string path = TestGroundPaths.EnemyFolder + "/" + file + ".asset";
            BossDefinition definition = AssetDatabase.LoadAssetAtPath<BossDefinition>(path);
            if (definition == null)
            {
                report.Warning("Boss-Daten fehlen: " + path + " (Bossbalken ohne Namen).");
                return null;
            }

            // Two phases: the helpers come at half health (GDD 01 11.4).
            var so = new SerializedObject(definition);
            SerializedProperty thresholds = so.FindProperty("phaseThresholds");
            thresholds.arraySize = 2;
            thresholds.GetArrayElementAtIndex(0).floatValue = 1f;
            thresholds.GetArrayElementAtIndex(1).floatValue = 0.5f;
            SerializedProperty adds = so.FindProperty("addsPerPhase");
            adds.arraySize = 2;
            adds.GetArrayElementAtIndex(0).intValue = 0;
            adds.GetArrayElementAtIndex(1).intValue = 2;
            EnemyTypeDefinition baseType = bossId == RissbrutId
                ? SliceEnemyAssets.Get(SliceEnemyAssets.RisslingType, "champion")
                : SliceEnemyAssets.Get(SliceEnemyAssets.WolfType, SliceEnemyAssets.GlutfangVariant);
            if (baseType != null)
            {
                so.FindProperty("baseType").objectReferenceValue = baseType;
            }

            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(definition);
            return definition;
        }

        private static GameObject BuildHelpers(Transform group, Transform boss, string name, string typeId, string variant, EnemyTypeDefinition baseType,
            int level, string helperName, TestGroundMaterials materials, int enemyLayer, int hurtboxLayer, int environmentLayer, int sightBlockers,
            TestGroundReport report)
        {
            if (baseType == null)
            {
                report.Warning("Helfer für " + boss.name + ": Gegnertyp " + typeId + " fehlt.");
                return null;
            }

            var helpers = new GameObject(name);
            helpers.transform.SetParent(group, false);
            EnemyTypeDefinition definition = MiniSliceProfile.EnemyAtLevel(baseType, level, report);
            var offsets = new List<Vector3> { boss.right * 3f - boss.forward * 1f, -boss.right * 3f - boss.forward * 1f };
            for (int i = 0; i < offsets.Count; i++)
            {
                Vector3 local = group.InverseTransformPoint(boss.position + offsets[i]);
                EnemyController helper = SliceEnemyBuilder.Build(helpers.transform, typeId, variant, definition, helperName + " " + (i + 1),
                    boss.name + "-" + (i + 1), local, boss.eulerAngles.y, true, null, materials, enemyLayer, hurtboxLayer, environmentLayer, report);
                TestGroundFields.SetInt(helper, "sightBlockers", sightBlockers, report);
            }

            // Switched on by the encounter in phase 2.
            helpers.SetActive(false);
            return helpers;
        }

        private static void AddShell(EnemyController boss, TestGroundReport report)
        {
            Transform body = boss.transform.Find("Body");
            Transform parent = body != null ? body : boss.transform;
            GameObject shell = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            Object.DestroyImmediate(shell.GetComponent<Collider>());
            shell.name = "Aether-Schale";
            shell.layer = boss.gameObject.layer;
            shell.transform.SetParent(parent, false);
            shell.transform.localPosition = new Vector3(0f, 0.15f, 0.15f);
            shell.transform.localScale = new Vector3(1.1f, 1f, 1.5f);
            Renderer renderer = shell.GetComponent<Renderer>();
            renderer.sharedMaterial = ShellMaterial(report);
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            AetherShell component = boss.gameObject.AddComponent<AetherShell>();
            TestGroundFields.SetReference(component, "shell", shell.transform, report);
            ParticleSystem shatter = SpellVisualsBuilder.Burst(boss.transform, "Schalenbruch", new Color(0.85f, 0.75f, 1f), new Color(0.5f, 0.35f, 0.95f, 0.8f),
                0.4f, 0.9f, 3f, 8f, 0.06f, 0.18f, 80, ParticleSystemShapeType.Sphere, 0.7f, report);
            shatter.transform.localPosition = new Vector3(0f, 0.5f, 0f);
            TestGroundFields.SetReference(component, "shatterBurst", shatter, report);
        }

        private static Material ShellMaterial(TestGroundReport report)
        {
            Material material = AssetDatabase.LoadAssetAtPath<Material>(ShellMaterialPath);
            if (material == null)
            {
                Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
                material = new Material(shader) { name = "M_Rissschale" };
                AssetDatabase.CreateAsset(material, ShellMaterialPath);
                report.Info("Angelegt: " + ShellMaterialPath);
            }

            // See-through, glowing violet (alpha blend, no depth write so the body stays visible inside).
            var colour = new Color(0.62f, 0.45f, 1f, 0.22f);
            material.SetColor("_BaseColor", colour);
            material.SetColor("_EmissionColor", new Color(0.35f, 0.22f, 0.8f) * 0.8f);
            material.EnableKeyword("_EMISSION");
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
    }
}
