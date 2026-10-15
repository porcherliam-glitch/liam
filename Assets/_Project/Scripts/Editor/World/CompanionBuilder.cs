using Aetherfall.Combat;
using Aetherfall.Companions;
using Aetherfall.Conditions;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.World;
using Aetherfall.WorldState;
using UnityEditor;
using UnityEngine;
using D = Aetherfall.EditorTools.Narrative.MiniSliceDialogueLibrary;
using Q = Aetherfall.EditorTools.Narrative.MiniSliceQuestLibrary;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Builds Ser Maren Falkenried (GDD 01 10.6, GDD 03 13): the villager figure in plate with the silver tabard of the
    /// Silberwacht, sword and wooden shield, a <see cref="Combatant"/> on the player's side with hurtboxes and sword hitbox, the
    /// <see cref="CompanionController"/> and her talk component (test dialogue, later the commands). She sits in a
    /// <see cref="ConditionalObjectGroup"/>: in the Eichental she waits at the guard post of Lindenhain once "Die Wölfe vom
    /// Nordhang" is done (the slice puts her arrival at about 2:00 after quest 1 and one side quest), in other scenes she only
    /// exists once she is recruited and then appears next to the player.
    /// </summary>
    public static class CompanionBuilder
    {
        private const float MaxHealth = 220f;

        /// <summary>Adds Maren to a scene.</summary>
        /// <param name="parent">Parent group.</param>
        /// <param name="position">Position (her post in the Eichental, otherwise next to the player's start).</param>
        /// <param name="yaw">Facing at the post.</param>
        /// <param name="atPost">True in the Eichental: visible from the end of quest 2 on, with a name sign at the post.</param>
        /// <param name="player">Player object.</param>
        /// <param name="materials">Materials of the villagers.</param>
        /// <param name="bodyLayer">Layer of her body (the enemies' layer: characters).</param>
        /// <param name="hurtboxLayer">Hurtbox layer.</param>
        /// <param name="interactableLayer">Interactable layer (talking).</param>
        /// <param name="solidMask">Ground and walls.</param>
        /// <param name="labelFont">Font of the name sign.</param>
        /// <param name="report">Protocol.</param>
        /// <returns>The companion.</returns>
        public static CompanionController BuildMaren(Transform parent, Vector3 position, float yaw, bool atPost, GameObject player,
            EichentalMaterials materials, int bodyLayer, int hurtboxLayer, int interactableLayer, int solidMask, Font labelFont, TestGroundReport report)
        {
            var visibility = new GameObject(atPost ? "Sichtbar: Maren (nach Quest 2 oder in der Gruppe)" : "Sichtbar: Maren (in der Gruppe)");
            visibility.transform.SetParent(parent, false);
            ConditionalObjectGroup conditional = visibility.AddComponent<ConditionalObjectGroup>();
            TestGroundFields.SetString(conditional, "phaseId", "begleiterin_maren", report);
            Condition joined = new AnyOf(new FlagIs(Q.FlagMarenTest, 1), new FlagIs(Q.FlagMarenTest, 2));
            Condition visibleWhile = atPost ? new AnyOf(new QuestStatusIs(Q.Wolves, QuestStatus.Completed), joined) : joined;
            var serialized = new SerializedObject(conditional);
            serialized.FindProperty("visibleWhile").managedReferenceValue = visibleWhile;
            serialized.ApplyModifiedPropertiesWithoutUndo();

            var root = new GameObject("Ser Maren Falkenried (" + D.Maren + ")");
            root.transform.SetParent(visibility.transform, false);
            root.transform.SetPositionAndRotation(position, Quaternion.Euler(0f, yaw, 0f));
            root.layer = Mathf.Max(0, bodyLayer);

            CharacterController controller = root.AddComponent<CharacterController>();
            controller.height = 1.8f;
            controller.radius = 0.35f;
            controller.center = new Vector3(0f, 0.9f, 0f);
            controller.slopeLimit = 45f;
            controller.stepOffset = 0.35f;

            DamageableComponent damageable = root.AddComponent<DamageableComponent>();
            TestGroundFields.SetFloat(damageable, "maxHealth", MaxHealth, report);
            TestGroundFields.SetString(damageable, "ownerId", "companion.maren_falkenried", report);

            Transform figure = VillagerFigures.Build(root.transform, D.Maren, materials, false, report);
            HitFlash flash = root.AddComponent<HitFlash>();
            if (figure != null)
            {
                TestGroundFields.SetReferences(flash, "renderers", figure.GetComponentsInChildren<Renderer>(), report);
            }

            Transform targetPoint = TestGroundCombatBuilder.CreateChild(root.transform, "TargetPoint", new Vector3(0f, 1.25f, 0f));
            Combatant combatant = root.AddComponent<Combatant>();
            TestGroundFields.SetString(combatant, "combatantId", "companion.maren_falkenried", report);
            TestGroundFields.SetString(combatant, "typeId", "companion.maren_falkenried", report);
            TestGroundFields.SetInt(combatant, "team", (int)CombatTeam.Player, report);
            TestGroundFields.SetReference(combatant, "damageable", damageable, report);
            TestGroundFields.SetReference(combatant, "targetPoint", targetPoint, report);
            TestGroundFields.SetBool(combatant, "targetable", true, report);
            TestGroundFields.SetFloat(combatant, "armor", 30f, report);
            TestGroundFields.SetFloat(combatant, "maxPoise", 60f, report);
            TestGroundFields.SetReference(combatant, "hitFlash", flash, report);
            TestGroundCombatBuilder.AddHurtbox(root.transform, "Hurtbox_Body", HitZone.Body, new Vector3(0f, 0.85f, 0f), new Vector3(0.6f, 1.3f, 0.6f),
                hurtboxLayer, report);
            TestGroundCombatBuilder.AddHurtbox(root.transform, "Hurtbox_Head", HitZone.Head, new Vector3(0f, 1.65f, 0f), new Vector3(0.32f, 0.32f, 0.32f),
                hurtboxLayer, report);
            StatusVisualsBuilder.Add(root, 1.8f, 0.4f, report);

            Hitbox hitbox = root.AddComponent<Hitbox>();
            TestGroundFields.SetReference(hitbox, "owner", combatant, report);
            TestGroundFields.SetInt(hitbox, "hurtboxLayers", hurtboxLayer >= 0 ? 1 << hurtboxLayer : ~0, report);

            // Sword pivot in the right shoulder (it swings for each hit), grip one arm length in front; shield on the left arm.
            Transform shoulder = figure != null ? CharacterModels.Find(figure, "UpperArm.R") : null;
            Transform swordPivot = TestGroundCombatBuilder.CreateChild(root.transform, "Schwerthand",
                shoulder != null ? root.transform.InverseTransformPoint(shoulder.position) : new Vector3(0.4f, 1.2f, 0.1f));
            Transform sword = CharacterModels.Instantiate(CharacterModels.Sword, swordPivot, "Schwert", root.layer, report);
            Transform grip = null;
            if (sword != null)
            {
                sword.localPosition = new Vector3(0f, -0.15f, 0.42f);
                sword.localRotation = Quaternion.Euler(-35f, 0f, 0f);
                grip = TestGroundCombatBuilder.CreateChild(swordPivot, "Griff", new Vector3(0f, -0.15f, 0.42f));
            }

            Transform shieldArm = TestGroundCombatBuilder.CreateChild(root.transform, "Schildarm", new Vector3(-0.42f, 1.05f, 0.18f));
            CharacterModels.Instantiate(CharacterModels.WoodenShield, shieldArm, "Holzschild", root.layer, report);
            HumanoidPuppet puppet = figure != null ? figure.GetComponent<HumanoidPuppet>() : null;
            if (puppet != null)
            {
                puppet.SetHandTargets(grip, shieldArm);
                TestGroundFields.SetReference(puppet, "combatant", combatant, report);
            }

            GameObject sign = null;
            if (atPost && labelFont != null)
            {
                TextMesh label = EichentalLabel.Create(root.transform, "Ser Maren Falkenried\nRitterin der Silberwacht",
                    new Vector3(0f, VillagerFigures.Height(D.Maren) + 0.4f, 0f), 180f, labelFont, 0.025f);
                sign = label != null ? label.gameObject : null;
            }

            MiniSliceAssets.TryMakeTalkable(root, D.Maren, player, interactableLayer, report, false);

            CompanionController companion = root.AddComponent<CompanionController>();
            TestGroundFields.SetString(companion, "companionId", "companion.maren_falkenried", report);
            TestGroundFields.SetString(companion, "joinedFlag", Q.FlagMarenTest, report);
            TestGroundFields.SetString(companion, "waitFlag", Q.FlagMarenWaits, report);
            TestGroundFields.SetReference(companion, "combatant", combatant, report);
            TestGroundFields.SetReference(companion, "hitbox", hitbox, report);
            TestGroundFields.SetReferences(companion, "attacks", new Object[]
            {
                AssetDatabase.LoadAssetAtPath<AttackDefinition>(TestGroundPaths.AttackFolder + "/Einhandschwert_Leicht1.asset"),
                AssetDatabase.LoadAssetAtPath<AttackDefinition>(TestGroundPaths.AttackFolder + "/Einhandschwert_Leicht2.asset"),
                AssetDatabase.LoadAssetAtPath<AttackDefinition>(TestGroundPaths.AttackFolder + "/Einhandschwert_Leicht3.asset")
            }, report);
            TestGroundFields.SetReference(companion, "swordPivot", swordPivot, report);
            TestGroundFields.SetReference(companion, "postSign", sign, report);
            TestGroundFields.SetInt(companion, "obstacleLayers", solidMask, report);
            TestGroundFields.SetInt(companion, "groundLayers", solidMask, report);
            report.Info("Begleiterin Ser Maren Falkenried: " + (atPost ? "am Wachposten Lindenhain ab dem Ende von „Die Wölfe vom Nordhang“" : "erscheint in der Gruppe neben dem Spieler") +
                        "; Prüfungsdialog " + D.MarenDialogue + ", folgt defensiv (GDD 03 13.1), geht bei 0 LP 12 s zu Boden.");
            return companion;
        }
    }
}
