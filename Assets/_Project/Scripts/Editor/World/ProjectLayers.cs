using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Creates user layers of architecture 2.8 in <c>ProjectSettings/TagManager.asset</c> if their slot is still empty.
    /// Never renames or overwrites a layer that is already in use.
    /// </summary>
    public static class ProjectLayers
    {
        private const string TagManagerPath = "ProjectSettings/TagManager.asset";

        /// <summary>Returns the index of a layer and creates it in its planned slot if possible.</summary>
        /// <param name="plannedIndex">Slot from architecture 2.8 (e.g. 6 = Player).</param>
        /// <param name="layerName">Layer name.</param>
        /// <param name="report">Protocol.</param>
        /// <returns>The layer index, or -1 if the layer does not exist and its slot is taken by another layer.</returns>
        public static int Ensure(int plannedIndex, string layerName, TestGroundReport report)
        {
            int existing = LayerMask.NameToLayer(layerName);
            if (existing >= 0)
            {
                return existing;
            }

            Object[] assets = AssetDatabase.LoadAllAssetsAtPath(TagManagerPath);
            if (assets == null || assets.Length == 0)
            {
                report.Warning("Layer „" + layerName + "“ nicht angelegt: " + TagManagerPath + " nicht gefunden.");
                return -1;
            }

            var tagManager = new SerializedObject(assets[0]);
            SerializedProperty layers = tagManager.FindProperty("layers");
            if (layers == null || !layers.isArray || plannedIndex >= layers.arraySize)
            {
                report.Warning("Layer „" + layerName + "“ nicht angelegt: Layer-Liste nicht lesbar. Bitte von Hand anlegen " +
                               "(Edit > Project Settings > Tags and Layers, User Layer " + plannedIndex + ").");
                return -1;
            }

            SerializedProperty slot = layers.GetArrayElementAtIndex(plannedIndex);
            if (!string.IsNullOrEmpty(slot.stringValue))
            {
                report.Warning("Layer „" + layerName + "“ nicht angelegt: User Layer " + plannedIndex + " heißt bereits „" +
                               slot.stringValue + "“. Das Testgelände nutzt stattdessen den Layer Default.");
                return -1;
            }

            slot.stringValue = layerName;
            tagManager.ApplyModifiedPropertiesWithoutUndo();
            report.Info("Layer angelegt: " + plannedIndex + " = " + layerName + " (Architektur 2.8).");
            return plannedIndex;
        }
    }
}
