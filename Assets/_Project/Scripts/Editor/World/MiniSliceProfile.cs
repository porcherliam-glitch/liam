using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.EditorTools.Core;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Progression;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// "Neues Spiel" of the mini slice (GDD 02 11.1: the prologue starts at level 1): start level 1 at the ProgressionInstaller and
    /// the warrior's kit of GDD 03 11.2 at item level 1 at the InventoryInstaller (the test ground kit has item level 10 and needs
    /// player level 7, GDD 04 2.4). The test ground generator sets its own test values again; the generator run last decides.
    /// Also the enemy levels of the Eichental: level copies of the wolf types (<see cref="EnemyAtLevel"/>).
    /// </summary>
    public static class MiniSliceProfile
    {
        /// <summary>Start level of a new game in the mini slice.</summary>
        public const int StartLevel = 1;

        /// <summary>Item level of the starting kit.</summary>
        public const int KitItemLevel = 1;

        /// <summary>The kit of the mini slice.</summary>
        public const string StartingEquipmentPath = TestGroundPaths.ItemSettingsFolder + "/Startausruestung_Krieger_MiniSlice.asset";

        /// <summary>Folder of the level copies of the enemy types used in the Eichental.</summary>
        public const string EnemyFolder = TestGroundPaths.EnemyFolder + "/Eichental";

        /// <summary>Kit of the mage (GDD 03 11.2).</summary>
        public const string MageEquipmentPath = TestGroundPaths.ItemSettingsFolder + "/Startausruestung_Magier_MiniSlice.asset";

        /// <summary>Folder of the class assets.</summary>
        public const string ClassFolder = SetupPaths.ProjectFolder + "/Data/Classes";

        /// <summary>Installer of the classes in the BootConfig.</summary>
        public const string ClassInstallerPath = SetupPaths.BootSettingsFolder + "/ClassInstaller.asset";

        /// <summary>Sets start level, kits and the classes (warrior, mage) of the mini slice.</summary>
        /// <param name="report">Protocol.</param>
        public static void Apply(TestGroundReport report)
        {
            SetStartLevel(StartLevel, report);
            StartingEquipment warriorKit = EnsureKit(report);
            SetStartingEquipment(warriorKit, report);
            StartingEquipment mageKit = EnsureMageKit(report);
            var classes = new List<Object>
            {
                // GDD 03 11.2: start attributes Str / Dex / Int / Wis / Con / Cha (sum 66).
                EnsureClass("Klasse_Krieger", "class.krieger", "Krieger", "Ich stehe, wo andere fallen.",
                    "Nahkampf mit Schwert und Schild: Schläge, Blocken und Parieren. Viel Leben, wenig Mana. Für alle, die mitten ins Getümmel wollen.",
                    new[] { 14f, 10f, 8f, 9f, 15f, 10f }, warriorKit, report),
                EnsureClass("Klasse_Magier", "class.magier", "Magier", "Feuer, Eis und Sturm gehorchen mir.",
                    "Kampf auf Abstand mit dem Lehrlingsstab: Feuergeschosse (Maustaste links) und ein großer Feuerball (rechts). Wenig Leben, viel Mana – halte Gegner auf Abstand. Start mit Stoffrobe, 3 Heil- und 3 Manatränken.",
                    new[] { 8f, 10f, 15f, 13f, 10f, 10f }, mageKit, report)
            };
            SetClasses(classes, report);
        }

        /// <summary>
        /// Sets the test kit at the InventoryInstaller (the test ground generator; it sets its start level itself) and empties the
        /// class list: the test ground starts without class choice and keeps its test values.
        /// </summary>
        /// <param name="testKit">Kit of the test ground.</param>
        /// <param name="report">Protocol.</param>
        public static void ApplyTestGround(StartingEquipment testKit, TestGroundReport report)
        {
            SetStartingEquipment(testKit, report);
            SetClasses(new List<Object>(), report);
        }

        private static void SetClasses(List<Object> classes, TestGroundReport report)
        {
            if (!TestGroundAssets.EnsureInstallerInBootConfig<Aetherfall.Classes.ClassInstaller>(ClassInstallerPath, report,
                    typeof(InventoryInstaller), typeof(Aetherfall.SaveSystem.SaveInstaller)))
            {
                return;
            }

            var installer = AssetDatabase.LoadAssetAtPath<Aetherfall.Classes.ClassInstaller>(ClassInstallerPath);
            var so = new SerializedObject(installer);
            SerializedProperty list = so.FindProperty("classes");
            list.arraySize = classes.Count;
            for (int i = 0; i < classes.Count; i++)
            {
                list.GetArrayElementAtIndex(i).objectReferenceValue = classes[i];
            }

            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(installer);
            report.Info("ClassInstaller: " + (classes.Count > 0 ? classes.Count + " Klassen (Krieger, Magier), Klassenwahl bei „Neues Spiel“" : "ohne Klassen (Testgelände)") + ".");
        }

        private static Aetherfall.Classes.ClassDefinition EnsureClass(string file, string id, string name, string motto, string description, float[] attributes,
            StartingEquipment kit, TestGroundReport report)
        {
            if (!TestGroundAssets.EnsureFolder(ClassFolder, report))
            {
                return null;
            }

            var definition = TestGroundSerialized.EnsureAsset<Aetherfall.Classes.ClassDefinition>(ClassFolder + "/" + file + ".asset", report, null);
            if (definition == null)
            {
                return null;
            }

            // Written on every run: the texts and values follow the GDD here, not in the asset.
            var so = new SerializedObject(definition);
            so.FindProperty("classId").stringValue = id;
            so.FindProperty("displayName").stringValue = name;
            so.FindProperty("motto").stringValue = motto;
            so.FindProperty("description").stringValue = description;
            string[] fields = { "strength", "dexterity", "intelligence", "wisdom", "constitution", "charisma" };
            for (int i = 0; i < fields.Length; i++)
            {
                so.FindProperty(fields[i]).floatValue = attributes[i];
            }

            so.FindProperty("startingEquipment").objectReferenceValue = kit;
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(definition);
            return definition;
        }

        private static StartingEquipment EnsureMageKit(TestGroundReport report)
        {
            // GDD 03 11.2 mage: apprentice staff (fire), cloth robe, 3 small mana potions, 3 small healing potions; cloth shoes
            // (Vorschlag: the warrior also has boots). Item level 1, common.
            StartingEquipment kit = TestGroundSerialized.EnsureAsset<StartingEquipment>(MageEquipmentPath, report, null);
            if (kit == null)
            {
                return null;
            }

            var so = new SerializedObject(kit);
            SerializedProperty list = so.FindProperty("items");
            list.arraySize = 5;
            Entry(list.GetArrayElementAtIndex(0), TestGroundItemAssets.StaffId, 1, EquipmentSlot.MainHand);
            Entry(list.GetArrayElementAtIndex(1), TestGroundItemAssets.RobeId, 1, EquipmentSlot.Chest);
            Entry(list.GetArrayElementAtIndex(2), "item.armor.stoffschuhe", 1, EquipmentSlot.Feet);
            Entry(list.GetArrayElementAtIndex(3), TestGroundItemAssets.PotionId, 3, EquipmentSlot.QuickSlot1);
            Entry(list.GetArrayElementAtIndex(4), TestGroundItemAssets.ManaPotionId, 3, EquipmentSlot.QuickSlot2);
            so.FindProperty("gold").intValue = 0;
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(kit);
            return kit;
        }

        /// <summary>
        /// A copy of an enemy type at another level (same id, attacks and loot; health, damage, armour and poise follow the level
        /// through the enemy scaling). Kept in <see cref="EnemyFolder"/>, updated on every run.
        /// </summary>
        /// <param name="baseType">Enemy type (e.g. the grey wolf of the test ground, level 8).</param>
        /// <param name="level">Level in the Eichental.</param>
        /// <param name="report">Protocol.</param>
        public static EnemyTypeDefinition EnemyAtLevel(EnemyTypeDefinition baseType, int level, TestGroundReport report)
        {
            if (baseType == null || level <= 0 || baseType.Level == level)
            {
                return baseType;
            }

            if (!TestGroundAssets.EnsureFolder(EnemyFolder, report))
            {
                return baseType;
            }

            string name = baseType.name + "_Stufe" + level;
            string path = EnemyFolder + "/" + name + ".asset";
            var copy = AssetDatabase.LoadAssetAtPath<EnemyTypeDefinition>(path);
            if (copy == null)
            {
                copy = Object.Instantiate(baseType);
                AssetDatabase.CreateAsset(copy, path);
            }
            else
            {
                // Same values as the base type, only the level differs.
                EditorUtility.CopySerialized(baseType, copy);
            }

            // CopySerialized also copies the name; the main object must keep the file name.
            copy.name = name;
            var serialized = new SerializedObject(copy);
            serialized.FindProperty("level").intValue = level;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(copy);
            return copy;
        }

        private static void SetStartLevel(int level, TestGroundReport report)
        {
            var installer = AssetDatabase.LoadAssetAtPath<ProgressionInstaller>(TestGroundPaths.ProgressionInstallerPath);
            if (installer == null)
            {
                report.Warning("ProgressionInstaller fehlt – Startstufe nicht gesetzt.");
                return;
            }

            var serialized = new SerializedObject(installer);
            SerializedProperty field = serialized.FindProperty("newGameStartLevel");
            if (field != null && field.intValue != level)
            {
                field.intValue = level;
                serialized.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(installer);
            }

            report.Info("ProgressionInstaller: Startstufe neues Spiel = " + level + " (Mini-Slice).");
        }

        private static void SetStartingEquipment(StartingEquipment kit, TestGroundReport report)
        {
            var installer = AssetDatabase.LoadAssetAtPath<InventoryInstaller>(TestGroundPaths.InventoryInstallerPath);
            if (installer == null || kit == null)
            {
                report.Warning("InventoryInstaller oder Startausrüstung fehlt – Startausrüstung nicht gesetzt.");
                return;
            }

            var serialized = new SerializedObject(installer);
            SerializedProperty field = serialized.FindProperty("startingEquipment");
            if (field != null && field.objectReferenceValue != kit)
            {
                field.objectReferenceValue = kit;
                serialized.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(installer);
            }

            report.Info("InventoryInstaller: Startausrüstung = " + AssetDatabase.GetAssetPath(kit) + ".");
        }

        private static StartingEquipment EnsureKit(TestGroundReport report)
        {
            // GDD 03 11.2 warrior: iron one-handed sword, wooden shield, gambeson, leather boots, 3 small healing potions. Item
            // level 1 (wearable from level 1), everything common: the better gear comes from chests and quests.
            StartingEquipment kit = TestGroundSerialized.EnsureAsset<StartingEquipment>(StartingEquipmentPath, report, null);
            if (kit == null)
            {
                return null;
            }

            var so = new SerializedObject(kit);
            SerializedProperty list = so.FindProperty("items");
            list.arraySize = 6;
            Entry(list.GetArrayElementAtIndex(0), TestGroundItemAssets.SwordId, 1, EquipmentSlot.MainHand);
            Entry(list.GetArrayElementAtIndex(1), TestGroundItemAssets.WoodenShieldId, 1, EquipmentSlot.OffHand);
            Entry(list.GetArrayElementAtIndex(2), "item.armor.gambeson_wams", 1, EquipmentSlot.Chest);
            Entry(list.GetArrayElementAtIndex(3), "item.armor.gambeson_hose", 1, EquipmentSlot.Legs);
            Entry(list.GetArrayElementAtIndex(4), "item.armor.lederstiefel", 1, EquipmentSlot.Feet);
            Entry(list.GetArrayElementAtIndex(5), TestGroundItemAssets.PotionId, 3, EquipmentSlot.QuickSlot1);
            so.FindProperty("gold").intValue = 0;
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(kit);
            return kit;
        }

        private static void Entry(SerializedProperty element, string itemId, int count, EquipmentSlot slot)
        {
            element.FindPropertyRelative("itemId").stringValue = itemId;
            element.FindPropertyRelative("count").intValue = count;
            element.FindPropertyRelative("itemLevel").intValue = KitItemLevel;
            element.FindPropertyRelative("rarity").intValue = (int)ItemRarity.Common;
            element.FindPropertyRelative("slot").intValue = (int)slot;
        }
    }
}
