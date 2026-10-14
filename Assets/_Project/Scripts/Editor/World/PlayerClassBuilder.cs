using Aetherfall.Classes;
using Aetherfall.Combat;
using Aetherfall.Stats;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Adds <see cref="PlayerClass"/> to the player of the slice scenes (Eichental, crypt; not the test ground): class attributes
    /// and the look of the mage – a dark blue robe with golden seams instead of the warrior's gambeson (material slots of the
    /// warrior model, GDD 03 11.2 "Stoffrobe").
    /// </summary>
    public static class PlayerClassBuilder
    {
        /// <summary>Adds the class component to the player.</summary>
        /// <param name="player">Player root (after <see cref="TestGroundCombatBuilder.SetUpPlayer"/>).</param>
        /// <param name="report">Protocol.</param>
        public static void AddTo(GameObject player, TestGroundReport report)
        {
            PlayerClass component = player.AddComponent<PlayerClass>();
            TestGroundFields.SetReference(component, "stats", player.GetComponent<CharacterStatsComponent>(), report);
            TestGroundFields.SetReference(component, "health", player.GetComponent<DamageableComponent>(), report);
            Transform model = player.transform.Find("Modell");
            if (model == null)
            {
                report.Warning("PlayerClass: kein Modell an der Spielfigur – die Kleidung des Magiers wird nicht gefärbt.");
                return;
            }

            TestGroundFields.SetReferences(component, "figure", model.GetComponentsInChildren<Renderer>(true), report);
            var so = new SerializedObject(component);
            SerializedProperty looks = so.FindProperty("looks");
            looks.arraySize = 1;
            SerializedProperty mage = looks.GetArrayElementAtIndex(0);
            mage.FindPropertyRelative("classId").stringValue = "class.magier";
            string[] slots = { "Krieger_Wams", "Krieger_Aermel", "Krieger_Naht", "Krieger_Hose", "Krieger_Guertel" };
            Material[] materials =
            {
                TestGroundAssets.EnsureMaterial("Magier_Robe", new Color(0.16f, 0.2f, 0.4f), report),
                TestGroundAssets.EnsureMaterial("Magier_Aermel", new Color(0.21f, 0.27f, 0.5f), report),
                TestGroundAssets.EnsureMaterial("Magier_Saum", new Color(0.8f, 0.64f, 0.3f), report),
                TestGroundAssets.EnsureMaterial("Magier_Hose", new Color(0.14f, 0.14f, 0.2f), report),
                TestGroundAssets.EnsureMaterial("Magier_Guertel", new Color(0.45f, 0.18f, 0.12f), report)
            };
            SerializedProperty slotList = mage.FindPropertyRelative("slots");
            SerializedProperty materialList = mage.FindPropertyRelative("materials");
            slotList.arraySize = slots.Length;
            materialList.arraySize = slots.Length;
            for (int i = 0; i < slots.Length; i++)
            {
                slotList.GetArrayElementAtIndex(i).stringValue = slots[i];
                materialList.GetArrayElementAtIndex(i).objectReferenceValue = materials[i];
            }

            so.ApplyModifiedPropertiesWithoutUndo();
            report.Info("Klassen an der Spielfigur: Startwerte der Klasse, Magier in dunkelblauer Robe mit goldenem Saum.");
        }
    }
}
