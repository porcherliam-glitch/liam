using System;
using System.IO;
using Aetherfall.Dialogue;
using Aetherfall.NPC;
using Aetherfall.WorldState;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// Writes dialogues, NPCs and flags built in code (like <see cref="MuehlbachDialogueLibrary"/>) as assets: a
    /// <see cref="DialogueDefinition"/> with the same nodes, a <see cref="NpcDefinition"/> or a <see cref="FlagDefinition"/>. Existing assets at the path are overwritten in place (the GUID and
    /// every reference to the asset stay). Used by the test ground generator; pure editor code.
    /// </summary>
    public static class DialogueAssetWriter
    {
        /// <summary>Writes a dialogue asset.</summary>
        /// <param name="spec">Dialogue built in code.</param>
        /// <param name="assetPath">Path below Assets/, ending in .asset.</param>
        /// <returns>The asset.</returns>
        public static DialogueDefinition WriteDialogue(DialogueSpec spec, string assetPath)
        {
            if (spec == null)
            {
                throw new ArgumentNullException(nameof(spec));
            }

            DialogueDefinition asset = LoadOrCreate<DialogueDefinition>(assetPath);
            var serialized = new SerializedObject(asset);
            serialized.FindProperty("id").stringValue = spec.Id;
            serialized.FindProperty("title").stringValue = spec.Title;
            serialized.FindProperty("mode").enumValueIndex = (int)spec.Mode;
            serialized.FindProperty("speakerId").stringValue = spec.SpeakerId;
            serialized.FindProperty("startNodeId").stringValue = spec.StartNodeId;
            serialized.FindProperty("cancelable").boolValue = spec.Cancelable;
            serialized.FindProperty("questId").stringValue = spec.QuestId;
            SerializedProperty exits = serialized.FindProperty("questExitIds");
            exits.arraySize = 0;
            foreach (string exit in spec.QuestExitIds)
            {
                exits.arraySize++;
                exits.GetArrayElementAtIndex(exits.arraySize - 1).stringValue = exit;
            }

            SerializedProperty nodes = serialized.FindProperty("nodes");
            nodes.arraySize = spec.Nodes.Count;
            for (int i = 0; i < spec.Nodes.Count; i++)
            {
                nodes.GetArrayElementAtIndex(i).managedReferenceValue = spec.Nodes[i];
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(asset);
            return asset;
        }

        /// <summary>Writes an NPC asset.</summary>
        /// <param name="spec">NPC data.</param>
        /// <param name="assetPath">Path below Assets/, ending in .asset.</param>
        /// <returns>The asset.</returns>
        public static NpcDefinition WriteNpc(NpcSpec spec, string assetPath)
        {
            if (spec == null)
            {
                throw new ArgumentNullException(nameof(spec));
            }

            NpcDefinition asset = LoadOrCreate<NpcDefinition>(assetPath);
            var serialized = new SerializedObject(asset);
            serialized.FindProperty("id").stringValue = spec.Id;
            serialized.FindProperty("displayName").stringValue = spec.Name;
            serialized.FindProperty("roleName").stringValue = spec.Role;
            serialized.FindProperty("nameKnownFromStart").boolValue = spec.NameKnownFromStart;
            serialized.FindProperty("defaultDialogueId").stringValue = spec.DefaultDialogueId;
            serialized.FindProperty("level").intValue = spec.Level;
            serialized.FindProperty("greed").floatValue = spec.Greed;
            serialized.FindProperty("unbribable").boolValue = spec.Unbribable;
            serialized.FindProperty("startRelationship").intValue = spec.StartRelationship;
            serialized.FindProperty("groupId").stringValue = spec.GroupId;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(asset);
            return asset;
        }

        /// <summary>Writes a flag asset (world state, architecture 8).</summary>
        /// <param name="spec">Flag data.</param>
        /// <param name="assetPath">Path below Assets/, ending in .asset.</param>
        /// <returns>The asset.</returns>
        public static FlagDefinition WriteFlag(FlagSpec spec, string assetPath)
        {
            if (spec == null)
            {
                throw new ArgumentNullException(nameof(spec));
            }

            FlagDefinition asset = LoadOrCreate<FlagDefinition>(assetPath);
            var serialized = new SerializedObject(asset);
            serialized.FindProperty("id").stringValue = spec.Id;
            serialized.FindProperty("kind").enumValueIndex = (int)spec.Kind;
            serialized.FindProperty("defaultValue").intValue = spec.DefaultValue;
            serialized.FindProperty("min").intValue = spec.Min;
            serialized.FindProperty("max").intValue = spec.Max;
            serialized.FindProperty("carryToNewGamePlus").boolValue = spec.CarryToNewGamePlus;
            serialized.FindProperty("description").stringValue = spec.Description;
            SerializedProperty values = serialized.FindProperty("enumValues");
            values.arraySize = spec.EnumValues != null ? spec.EnumValues.Count : 0;
            for (int i = 0; i < values.arraySize; i++)
            {
                values.GetArrayElementAtIndex(i).stringValue = spec.EnumValues[i];
            }

            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(asset);
            return asset;
        }

        private static T LoadOrCreate<T>(string assetPath) where T : ScriptableObject
        {
            var existing = AssetDatabase.LoadAssetAtPath<T>(assetPath);
            if (existing != null)
            {
                return existing;
            }

            string folder = Path.GetDirectoryName(assetPath);
            if (!string.IsNullOrEmpty(folder) && !AssetDatabase.IsValidFolder(folder))
            {
                Directory.CreateDirectory(folder);
                AssetDatabase.Refresh();
            }

            var asset = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(asset, assetPath);
            return asset;
        }
    }
}
