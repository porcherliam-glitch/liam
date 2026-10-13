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
        private const string DynamicsManagerPath = "ProjectSettings/DynamicsManager.asset";
        private const string CollisionMatrixField = "m_LayerCollisionMatrix";
        private const int LayerCount = 32;

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

        /// <summary>
        /// Makes a layer collide with nothing (architecture 2.8: "Hurtbox – kollidiert mit nichts, nur Abfragen") in the
        /// layer collision matrix of the physics settings. Idempotent.
        /// </summary>
        /// <param name="layer">Layer index (0–31).</param>
        /// <param name="report">Protocol.</param>
        public static void IsolateLayer(int layer, TestGroundReport report)
        {
            if (WriteMatrix(layer, 0L, report))
            {
                report.Info("Physik-Matrix: Layer " + layer + " („" + LayerMask.LayerToName(layer) + "“) kollidiert mit nichts (Architektur 2.8).");
            }
        }

        /// <summary>
        /// Lets a layer collide only with the given layers (architecture 2.8, e.g. "Pickup – Environment, Terrain, Player") in
        /// the layer collision matrix of the physics settings. Negative entries (layer missing) are skipped. Idempotent.
        /// </summary>
        /// <param name="layer">Layer index (0–31).</param>
        /// <param name="collidesWith">Layers it may collide with.</param>
        /// <param name="report">Protocol.</param>
        public static void RestrictLayer(int layer, int[] collidesWith, TestGroundReport report)
        {
            long allowed = 0L;
            string names = string.Empty;
            for (int i = 0; collidesWith != null && i < collidesWith.Length; i++)
            {
                int other = collidesWith[i];
                if (other >= 0 && other < LayerCount)
                {
                    allowed |= 1L << other;
                    names += (names.Length > 0 ? ", " : string.Empty) + LayerMask.LayerToName(other);
                }
            }

            if (WriteMatrix(layer, allowed, report))
            {
                report.Info("Physik-Matrix: Layer " + layer + " („" + LayerMask.LayerToName(layer) + "“) kollidiert nur mit " +
                            (names.Length > 0 ? names : "nichts") + " (Architektur 2.8).");
            }
        }

        private static bool WriteMatrix(int layer, long allowed, TestGroundReport report)
        {
            if (layer < 0 || layer >= LayerCount)
            {
                return false;
            }

            for (int other = 0; other < LayerCount; other++)
            {
                Physics.IgnoreLayerCollision(layer, other, (allowed & (1L << other)) == 0L);
            }

            Object[] assets = AssetDatabase.LoadAllAssetsAtPath(DynamicsManagerPath);
            if (assets == null || assets.Length == 0)
            {
                report.Warning("Physik-Matrix nicht gefunden (" + DynamicsManagerPath + "). Bitte von Hand: Edit > Project Settings > Physics > " +
                               "Layer Collision Matrix, Zeile „" + LayerMask.LayerToName(layer) + "“ wie in Architektur 2.8 setzen.");
                return false;
            }

            var physics = new SerializedObject(assets[0]);
            SerializedProperty matrix = physics.FindProperty(CollisionMatrixField);
            if (matrix == null || !matrix.isArray || matrix.arraySize < LayerCount)
            {
                report.Info("Physik-Matrix: Layer " + layer + " per Physics.IgnoreLayerCollision gesetzt.");
                return false;
            }

            long bit = 1L << layer;
            for (int row = 0; row < LayerCount; row++)
            {
                SerializedProperty entry = matrix.GetArrayElementAtIndex(row);
                long mask = entry.longValue & 0xFFFFFFFFL;
                if (row == layer)
                {
                    entry.longValue = allowed;
                }
                else
                {
                    entry.longValue = (allowed & (1L << row)) != 0L ? mask | bit : mask & ~bit;
                }
            }

            physics.ApplyModifiedPropertiesWithoutUndo();
            return true;
        }
    }
}
