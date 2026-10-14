using System.Collections.Generic;
using Aetherfall.Data;
using Aetherfall.Dialogue;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.NPC;
using Aetherfall.WorldState;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Test ground part "Dialoge" (guide 10, section 12.5): writes Harrik, the Muehlbach dialogue (GDD 02, 12.10) and its flags
    /// as assets, enters them in the content catalog and places Harrik as a talking NPC west of the spawn (capsule, trigger on
    /// the Interactable layer, <see cref="NpcInteractable"/>, <see cref="NpcLookAt"/> towards the player).
    /// </summary>
    /// <remarks>
    /// Assets are overwritten in place on every run (GUIDs and references stay). Without the DialogueInstaller and NpcInstaller
    /// in the BootConfig the NPC shows no prompt (it waits for the dialogue service).
    /// </remarks>
    public static class TestGroundNpcBuilder
    {
        /// <summary>Folder of the NPC assets.</summary>
        public const string NpcFolder = "Assets/_Project/Data/NPCs";

        /// <summary>Folder of the dialogue assets of the region.</summary>
        public const string DialogueFolder = "Assets/_Project/Data/Dialogues/Eichental";

        /// <summary>Folder of the flags of the dialogue.</summary>
        public const string FlagFolder = "Assets/_Project/Data/Flags/Eichental";

        /// <summary>Harrik as NPC asset.</summary>
        public const string HarrikPath = NpcFolder + "/Npc_Harrik.asset";

        /// <summary>The Muehlbach dialogue as asset.</summary>
        public const string HarrikDialoguePath = DialogueFolder + "/Dlg_Harrik_Verhandlung.asset";

        /// <summary>Position of Harrik: south-east of the spawn on open ground (the notice board stands west of the spawn).</summary>
        public static readonly Vector3 HarrikPosition = new Vector3(6f, 0f, -4f);

        private const float Height = 2f;
        private const float Radius = 0.4f;

        /// <summary>Writes NPC, dialogue and flags and enters them in the content catalog.</summary>
        /// <param name="catalog">Content catalog of the test ground (from the item assets).</param>
        /// <param name="report">Protocol.</param>
        /// <returns>Harrik, or null if the catalog is missing.</returns>
        public static NpcDefinition CreateAssets(ContentCatalog catalog, TestGroundReport report)
        {
            if (catalog == null)
            {
                report.Warning("NPC Harrik: kein Inhaltskatalog – NPC und Dialog werden nicht angelegt.");
                return null;
            }

            var definitions = new List<GameDefinition>();
            DialogueSpec dialogue = MuehlbachDialogueLibrary.Build();
            definitions.Add(DialogueAssetWriter.WriteDialogue(dialogue, HarrikDialoguePath));
            NpcDefinition harrik = DialogueAssetWriter.WriteNpc(MuehlbachDialogueLibrary.HarrikNpc(), HarrikPath);
            definitions.Add(harrik);
            IReadOnlyList<FlagSpec> flags = MuehlbachDialogueLibrary.Flags().All;
            for (int i = 0; i < flags.Count; i++)
            {
                definitions.Add(DialogueAssetWriter.WriteFlag(flags[i], FlagFolder + "/Flag_" + AssetName(flags[i].Id) + ".asset"));
            }

            int added = AddToCatalog(catalog, definitions);
            AssetDatabase.SaveAssets();
            report.Info("NPC Harrik: Dialog " + dialogue.Id + " (" + dialogue.Nodes.Count + " Knoten), " + flags.Count + " Flags, " + added +
                        " neue Einträge im Inhaltskatalog.");
            return harrik;
        }

        /// <summary>Places Harrik in the open scene.</summary>
        /// <param name="player">Player object (look target).</param>
        /// <param name="interactableLayer">Interactable layer or -1.</param>
        /// <param name="environmentLayer">Environment layer of the body.</param>
        /// <param name="material">Material of the body (placeholder).</param>
        /// <param name="report">Protocol.</param>
        /// <returns>The NPC object, or null if the NPC asset is missing (run <see cref="CreateAssets"/> first).</returns>
        public static GameObject Build(GameObject player, int interactableLayer, int environmentLayer, Material material, TestGroundReport report)
        {
            var harrik = AssetDatabase.LoadAssetAtPath<NpcDefinition>(HarrikPath);
            if (harrik == null)
            {
                report.Warning("NPC Harrik: " + HarrikPath + " fehlt – kein NPC im Testgelände.");
                return null;
            }

            var root = new GameObject("NPC_Harrik");
            root.transform.position = HarrikPosition;
            Vector3 toSpawn = Vector3.zero - HarrikPosition;
            root.transform.rotation = Quaternion.LookRotation(new Vector3(toSpawn.x, 0f, toSpawn.z).normalized, Vector3.up);

            GameObject body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.name = "Koerper";
            body.transform.SetParent(root.transform, false);
            body.transform.localPosition = new Vector3(0f, Height * 0.5f, 0f);
            body.transform.localScale = new Vector3(Radius * 2f, Height * 0.5f, Radius * 2f);
            body.layer = environmentLayer;
            if (material != null && body.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = material;
            }

            var chest = new GameObject("Brust");
            chest.transform.SetParent(root.transform, false);
            chest.transform.localPosition = new Vector3(0f, 1.5f, 0f);

            var trigger = new GameObject("Interaktion");
            trigger.transform.SetParent(root.transform, false);
            trigger.layer = interactableLayer >= 0 ? interactableLayer : 0;
            CapsuleCollider capsule = trigger.AddComponent<CapsuleCollider>();
            capsule.isTrigger = true;
            capsule.center = new Vector3(0f, Height * 0.5f, 0f);
            capsule.height = Height;
            capsule.radius = Radius + 0.3f;

            NpcLookAt look = root.AddComponent<NpcLookAt>();
            TestGroundFields.SetReference(look, "lookTarget", player != null ? player.transform : null, report);
            NpcInteractable interactable = root.AddComponent<NpcInteractable>();
            TestGroundFields.SetReference(interactable, "npc", harrik, report);
            TestGroundFields.SetReference(interactable, "interactionPoint", chest.transform, report);
            TestGroundFields.SetReference(interactable, "lookAt", look, report);
            report.Info("NPC Harrik bei " + HarrikPosition + ": E / A = Sprechen (Dialog " + harrik.DefaultDialogueId + ").");
            return root;
        }

        private static int AddToCatalog(ContentCatalog catalog, List<GameDefinition> definitions)
        {
            var serialized = new SerializedObject(catalog);
            SerializedProperty list = serialized.FindProperty("definitions");
            var present = new HashSet<Object>();
            for (int i = 0; i < list.arraySize; i++)
            {
                present.Add(list.GetArrayElementAtIndex(i).objectReferenceValue);
            }

            int added = 0;
            for (int i = 0; i < definitions.Count; i++)
            {
                if (definitions[i] == null || !present.Add(definitions[i]))
                {
                    continue;
                }

                list.arraySize++;
                list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = definitions[i];
                added++;
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(catalog);
            return added;
        }

        private static string AssetName(string flagId)
        {
            // flag.eichental.harrik_status -> harrik_status; quest-local flags keep their last part (messer_an_kehle).
            int dot = flagId.LastIndexOf('.');
            return dot >= 0 && dot < flagId.Length - 1 ? flagId.Substring(dot + 1) : flagId;
        }
    }
}
