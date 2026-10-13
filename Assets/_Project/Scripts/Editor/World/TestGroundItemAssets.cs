using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.Data;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Stats;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Item data of the test ground (GDD 04 1–5, GDD 03 11.2): weapons, shields, armor of the three classes, cloak, jewelry,
    /// the small healing potion, wolf materials and the developer ballast stone as <see cref="ItemDefinition"/>s; the affixes
    /// (<see cref="TestGroundAffixAssets"/>) and loot tables (<see cref="TestGroundLootTableAssets"/>); the warrior's
    /// starting equipment; the content catalog with all of them; the loot tables of the wolf types; the materials of loot
    /// beams, pickups and chests. Existing assets are reused and never overwritten; only empty fields are filled (wolf loot
    /// table, catalog entries, installer references).
    /// </summary>
    /// <remarks>Base values come from the tables in Aetherfall.Items (GDD 04 4.2/8.6), not from numbers typed here.</remarks>
    public sealed class TestGroundItemAssets
    {
        /// <summary>Iron one-handed sword (start weapon).</summary>
        public const string SwordId = "item.weapon.einhandschwert_eisen";

        /// <summary>Wooden shield (start shield).</summary>
        public const string WoodenShieldId = "item.weapon.holzschild";

        /// <summary>Small healing potion.</summary>
        public const string PotionId = "item.potion.heiltrank_schwach";

        /// <summary>Wolf fur.</summary>
        public const string WolfFurId = "item.material.wolfsfell";

        /// <summary>Wolf meat.</summary>
        public const string WolfMeatId = "item.material.wolfsfleisch";

        /// <summary>Aether wolf pelt (GDD 02 quest "Woelfe vom Nordhang").</summary>
        public const string AetherPeltId = "item.material.wolfspelz_aether";

        private const string Weapons = "/Weapons";
        private const string ArmorFolder = "/Armor";
        private const string JewelryFolder = "/Jewelry";
        private const string Consumables = "/Consumables";
        private const string Materials = "/Materials";
        private const string Misc = "/Misc";

        private readonly TestGroundReport _report;
        private readonly List<ItemDefinition> _items = new List<ItemDefinition>();

        /// <summary>Creates or loads all item assets, affixes, loot tables, the starting equipment and the catalog.</summary>
        /// <param name="report">Protocol.</param>
        public TestGroundItemAssets(TestGroundReport report)
        {
            _report = report;
            string[] folders =
            {
                TestGroundPaths.ItemFolder + Weapons, TestGroundPaths.ItemFolder + ArmorFolder, TestGroundPaths.ItemFolder + JewelryFolder,
                TestGroundPaths.ItemFolder + Consumables, TestGroundPaths.ItemFolder + Materials, TestGroundPaths.ItemFolder + Misc,
                TestGroundPaths.AffixFolder, TestGroundPaths.LootTableFolder, TestGroundPaths.ItemSettingsFolder
            };
            for (int i = 0; i < folders.Length; i++)
            {
                if (!TestGroundAssets.EnsureFolder(folders[i], report))
                {
                    report.Warning("Ordner " + folders[i] + " fehlt – Item-Daten unvollständig.");
                    return;
                }
            }

            CreateWeapons();
            CreateArmor();
            CreateJewelry();
            CreateOthers();
            Affixes = new TestGroundAffixAssets(report);
            LootTables = new TestGroundLootTableAssets(report);
            StartingEquipment = EnsureStartingEquipment();
            Catalog = EnsureCatalog();
            BeamMaterial = EnsureUnlitMaterial("LootBeam", new Color(1f, 1f, 1f, 1f));
            PickupMaterial = TestGroundAssets.EnsureMaterial("LootPickup", Color.white, report);
            WoodMaterial = TestGroundAssets.EnsureMaterial("TestChestWood", new Color(0.55f, 0.36f, 0.2f), report);
            IronMaterial = TestGroundAssets.EnsureMaterial("TestChestIron", new Color(0.55f, 0.58f, 0.62f), report);
            HiddenMaterial = TestGroundAssets.EnsureMaterial("TestChestHidden", new Color(0.32f, 0.22f, 0.45f), report);
            report.Info("Items: " + _items.Count + " Definitionen, " + Affixes.All.Count + " Affixe, " + LootTables.All.Count + " Loot-Tabellen (GDD 04).");
        }

        /// <summary>Affix assets.</summary>
        public TestGroundAffixAssets Affixes { get; private set; }

        /// <summary>Loot table assets.</summary>
        public TestGroundLootTableAssets LootTables { get; private set; }

        /// <summary>Starting equipment of the warrior.</summary>
        public StartingEquipment StartingEquipment { get; private set; }

        /// <summary>Content catalog with all definitions.</summary>
        public ContentCatalog Catalog { get; private set; }

        /// <summary>Unlit material of the loot beams.</summary>
        public Material BeamMaterial { get; private set; }

        /// <summary>Material of the pickup cubes.</summary>
        public Material PickupMaterial { get; private set; }

        /// <summary>Wooden chest.</summary>
        public Material WoodMaterial { get; private set; }

        /// <summary>Iron chest.</summary>
        public Material IronMaterial { get; private set; }

        /// <summary>Hidden chest.</summary>
        public Material HiddenMaterial { get; private set; }

        /// <summary>True if catalog and starting equipment exist.</summary>
        public bool IsComplete => Catalog != null && StartingEquipment != null;

        /// <summary>Sets the loot table of the wolf types if their field is still empty (GDD 04 5.1 "loot.enemy.wolf.grauwolf").</summary>
        /// <param name="wolf">Grey wolf type.</param>
        /// <param name="aetherWolf">Aether wolf type.</param>
        public void AssignWolfLoot(EnemyTypeDefinition wolf, EnemyTypeDefinition aetherWolf)
        {
            AssignLoot(wolf, TestGroundLootTableAssets.WolfTableId);
            AssignLoot(aetherWolf, TestGroundLootTableAssets.AetherWolfTableId);
        }

        private void AssignLoot(EnemyTypeDefinition enemy, string tableId)
        {
            if (enemy == null)
            {
                return;
            }

            var so = new SerializedObject(enemy);
            SerializedProperty field = TestGroundSerialized.Property(so, "lootTableId", _report);
            if (field == null || !string.IsNullOrEmpty(field.stringValue))
            {
                return;
            }

            field.stringValue = tableId;
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(enemy);
            _report.Info("Gegnertyp " + enemy.name + ": Loot-Tabelle " + tableId + " eingetragen.");
        }

        private void CreateWeapons()
        {
            Weapon("Einhandschwert_Eisen", SwordId, "Eisernes Einhandschwert", WeaponType.OneHandedSword, 100, 0f, 0f, 0f, 0f);
            Weapon("Axt_Eisen", "item.weapon.axt_eisen", "Eiserne Axt", WeaponType.Axe, 60, 0f, 0f, 0f, 0f);
            Weapon("Streitkolben_Eisen", "item.weapon.streitkolben_eisen", "Eiserner Streitkolben", WeaponType.Mace, 60, 0f, 0f, 0f, 0f);
            Weapon("Zweihandschwert_Eisen", "item.weapon.zweihandschwert_eisen", "Eisernes Zweihandschwert", WeaponType.TwoHandedSword, 40, 0f, 0f, 0f, 0f);

            // Block values of GDD 03 4.7: wooden 150° / 80 % / 20 % / 40 %, iron 150° / 90 % / 35 % / 55 % (6 kg).
            Weapon("Holzschild", WoodenShieldId, "Holzschild", WeaponType.Shield, 60, 150f, 0.8f, 0.2f, 0.4f);
            Weapon("Eisenschild", "item.weapon.eisenschild", "Eisenschild", WeaponType.Shield, 40, 150f, 0.9f, 0.35f, 0.55f, 6f);
        }

        private void CreateArmor()
        {
            Armor("Gambeson_Wams", "item.armor.gambeson_wams", "Gambeson-Wams", EquipKind.Chest, ArmorClass.Light);
            Armor("Gambeson_Hose", "item.armor.gambeson_hose", "Gambeson-Hose", EquipKind.Legs, ArmorClass.Light);
            Armor("Stoffkappe", "item.armor.stoffkappe", "Stoffkappe", EquipKind.Head, ArmorClass.Light);
            Armor("Stoffhandschuhe", "item.armor.stoffhandschuhe", "Stoffhandschuhe", EquipKind.Hands, ArmorClass.Light);
            Armor("Stoffschuhe", "item.armor.stoffschuhe", "Stoffschuhe", EquipKind.Feet, ArmorClass.Light);
            Armor("Lederkappe", "item.armor.lederkappe", "Lederkappe", EquipKind.Head, ArmorClass.Medium);
            Armor("Lederwams", "item.armor.lederwams", "Lederwams", EquipKind.Chest, ArmorClass.Medium);
            Armor("Lederhandschuhe", "item.armor.lederhandschuhe", "Lederhandschuhe", EquipKind.Hands, ArmorClass.Medium);
            Armor("Lederhose", "item.armor.lederhose", "Lederhose", EquipKind.Legs, ArmorClass.Medium);
            Armor("Lederstiefel", "item.armor.lederstiefel", "Lederstiefel", EquipKind.Feet, ArmorClass.Medium);
            Armor("Eisenhelm", "item.armor.eisenhelm", "Eisenhelm", EquipKind.Head, ArmorClass.Heavy);
            Armor("Plattenharnisch", "item.armor.plattenharnisch", "Plattenharnisch", EquipKind.Chest, ArmorClass.Heavy);
            Armor("Panzerhandschuhe", "item.armor.panzerhandschuhe", "Panzerhandschuhe", EquipKind.Hands, ArmorClass.Heavy);
            Armor("Plattenbeinschienen", "item.armor.plattenbeinschienen", "Plattenbeinschienen", EquipKind.Legs, ArmorClass.Heavy);
            Armor("Plattenstiefel", "item.armor.plattenstiefel", "Plattenstiefel", EquipKind.Feet, ArmorClass.Heavy);
            Armor("Wollumhang", "item.armor.wollumhang", "Wollumhang", EquipKind.Cloak, ArmorClass.None);
        }

        private void CreateJewelry()
        {
            // GDD 04 4.2 "Schmuck: Basistyp mit Implizitwert" (iLvl 1 -> iLvl 80, linear).
            Jewelry("Eisenring", "item.trinket.eisenring", "Eisenring", EquipKind.Ring, StatId.Armor, 1f, 2f, 30f, "+{0} Rüstung");
            Jewelry("Goldring", "item.trinket.goldring", "Goldring", EquipKind.Ring, StatId.Luck, 1f, 2f, 8f, "+{0} Glück");
            Jewelry("Bernsteinamulett", "item.trinket.bernsteinamulett", "Bernsteinamulett", EquipKind.Amulet, StatId.MaxHealth, 1f, 10f, 150f, "+{0} max. LP");
            Jewelry("Wolfszahnamulett", "item.trinket.wolfszahnamulett", "Wolfszahnamulett", EquipKind.Amulet, StatId.CritDamage, 0.01f, 4f, 15f,
                "+{0} % Krit-Schaden");
        }

        private void CreateOthers()
        {
            Simple(Consumables, "Heiltrank_Schwach", PotionId, "Kleiner Heiltrank", ItemCategory.Consumable, EquipKind.QuickUse, 20, 0.3f, 30f,
                ItemRarity.Common);
            Simple(Materials, "Wolfsfell", WolfFurId, "Wolfsfell", ItemCategory.Material, EquipKind.None, 99, 1f, 4f, ItemRarity.Common);
            Simple(Materials, "Wolfsfleisch", WolfMeatId, "Wolfsfleisch", ItemCategory.Material, EquipKind.None, 99, 0.5f, 2f, ItemRarity.Common);
            Simple(Materials, "Wolfspelz_Aether", AetherPeltId, "Aether-Wolfspelz", ItemCategory.Material, EquipKind.None, 99, 1f, 15f,
                ItemRarity.Uncommon);
            Simple(Misc, "Ballaststein", Aetherfall.DevTools.InventoryDebugOverlay.BallastItemId, "Ballaststein (Test, 25 kg)", ItemCategory.Misc,
                EquipKind.None, 10, 25f, 0f, ItemRarity.Common);
        }

        private void Weapon(string file, string id, string name, WeaponType type, int dropWeight, float blockAngle, float blockPhysical,
            float blockElemental, float blockStability, float weightOverride = 0f)
        {
            float weight = weightOverride > 0f ? weightOverride : WeaponTypeRules.Weight(type);
            Item(TestGroundPaths.ItemFolder + Weapons + "/" + file + ".asset", so =>
            {
                Common(so, id, name, ItemCategory.Weapon, WeaponTypeRules.EquipKindOf(type), 1, weight, WeaponTypeRules.ValueCategory(type), ItemRarity.Common);
                TestGroundSerialized.Set(so, "weaponType", (int)type, _report);
                TestGroundSerialized.Set(so, "baseStat", WeaponTypeRules.BaseValue(type), _report);
                TestGroundSerialized.Set(so, "randomDrop", true, _report);
                TestGroundSerialized.Set(so, "dropWeight", dropWeight, _report);
                TestGroundSerialized.Set(so, "blockAngle", blockAngle, _report);
                TestGroundSerialized.Set(so, "blockPhysical", blockPhysical, _report);
                TestGroundSerialized.Set(so, "blockElemental", blockElemental, _report);
                TestGroundSerialized.Set(so, "blockStability", blockStability, _report);
            });
        }

        private void Armor(string file, string id, string name, EquipKind kind, ArmorClass armorClass)
        {
            Item(TestGroundPaths.ItemFolder + ArmorFolder + "/" + file + ".asset", so =>
            {
                Common(so, id, name, ItemCategory.Armor, kind, 1, ArmorRules.Weight(kind, armorClass), ArmorRules.ValueCategory(kind), ItemRarity.Common);
                TestGroundSerialized.Set(so, "armorClass", (int)armorClass, _report);
                TestGroundSerialized.Set(so, "baseStat", ArmorRules.BaseArmor(kind, armorClass), _report);
                TestGroundSerialized.Set(so, "randomDrop", true, _report);
                TestGroundSerialized.Set(so, "dropWeight", 100, _report);
                if (armorClass == ArmorClass.Medium)
                {
                    // GDD 04 4.2: leather pieces +2 % (iLvl 1) to +6 % (iLvl 80) stamina regeneration.
                    Implicit(so, StatId.StaminaRegen, StatModifierKind.PercentAdd, 0.01f, 2f, 6f, "+{0} % Ausdauer-Regeneration");
                }
                else if (armorClass == ArmorClass.Light)
                {
                    // Cloth pieces +1 % to +4 % spell power.
                    Implicit(so, StatId.SpellPower, StatModifierKind.PercentAdd, 0.01f, 1f, 4f, "+{0} % Zauberkraft");
                }
            });
        }

        private void Jewelry(string file, string id, string name, EquipKind kind, StatId stat, float scale, float atLevel1, float atLevel80, string text)
        {
            Item(TestGroundPaths.ItemFolder + JewelryFolder + "/" + file + ".asset", so =>
            {
                Common(so, id, name, ItemCategory.Jewelry, kind, 1, 0.1f, ArmorRules.ValueCategory(kind), ItemRarity.Common);
                TestGroundSerialized.Set(so, "randomDrop", true, _report);
                TestGroundSerialized.Set(so, "dropWeight", 100, _report);
                Implicit(so, stat, StatModifierKind.Flat, scale, atLevel1, atLevel80, text);
            });
        }

        private void Simple(string folder, string file, string id, string name, ItemCategory category, EquipKind kind, int stackSize, float weight,
            float value, ItemRarity rarity)
        {
            Item(TestGroundPaths.ItemFolder + folder + "/" + file + ".asset", so => Common(so, id, name, category, kind, stackSize, weight, value, rarity));
        }

        private void Common(SerializedObject so, string id, string name, ItemCategory category, EquipKind kind, int stackSize, float weight, float value,
            ItemRarity rarity)
        {
            TestGroundSerialized.Set(so, "id", id, _report);
            TestGroundSerialized.Set(so, "displayName", name, _report);
            TestGroundSerialized.Set(so, "category", (int)category, _report);
            TestGroundSerialized.Set(so, "equipKind", (int)kind, _report);
            TestGroundSerialized.Set(so, "stackSize", stackSize, _report);
            TestGroundSerialized.Set(so, "weight", weight, _report);
            TestGroundSerialized.Set(so, "value", value, _report);
            TestGroundSerialized.Set(so, "baseRarity", (int)rarity, _report);
        }

        private void Implicit(SerializedObject so, StatId stat, StatModifierKind kind, float scale, float atLevel1, float atLevel80, string text)
        {
            TestGroundSerialized.Set(so, "implicitStat", (int)stat, _report);
            TestGroundSerialized.Set(so, "implicitKind", (int)kind, _report);
            TestGroundSerialized.Set(so, "implicitScale", scale, _report);
            TestGroundSerialized.Set(so, "implicitAtLevel1", atLevel1, _report);
            TestGroundSerialized.Set(so, "implicitAtLevel80", atLevel80, _report);
            TestGroundSerialized.Set(so, "implicitText", text, _report);
        }

        private void Item(string path, System.Action<SerializedObject> fill)
        {
            _items.Add(TestGroundSerialized.EnsureAsset<ItemDefinition>(path, _report, fill));
        }

        private StartingEquipment EnsureStartingEquipment()
        {
            // GDD 03 11.2 warrior: iron one-handed sword, wooden shield, gambeson (chest, legs), leather boots, 3 small healing
            // potions. Item level 10 like the test character (GDD 03 8.3); the sword is rare: W = 20 x 2.08 x 1.2 = 50.
            return TestGroundSerialized.EnsureAsset<StartingEquipment>(TestGroundPaths.StartingEquipmentPath, _report, so =>
            {
                SerializedProperty list = TestGroundSerialized.Property(so, "items", _report);
                if (list == null)
                {
                    return;
                }

                list.arraySize = 6;
                Kit(list.GetArrayElementAtIndex(0), SwordId, 1, ItemRarity.Rare, EquipmentSlot.MainHand);
                Kit(list.GetArrayElementAtIndex(1), WoodenShieldId, 1, ItemRarity.Common, EquipmentSlot.OffHand);
                Kit(list.GetArrayElementAtIndex(2), "item.armor.gambeson_wams", 1, ItemRarity.Common, EquipmentSlot.Chest);
                Kit(list.GetArrayElementAtIndex(3), "item.armor.gambeson_hose", 1, ItemRarity.Common, EquipmentSlot.Legs);
                Kit(list.GetArrayElementAtIndex(4), "item.armor.lederstiefel", 1, ItemRarity.Common, EquipmentSlot.Feet);
                Kit(list.GetArrayElementAtIndex(5), PotionId, 3, ItemRarity.Common, EquipmentSlot.QuickSlot1);
                TestGroundSerialized.Set(so, "gold", 0, _report);
            });
        }

        private void Kit(SerializedProperty element, string itemId, int count, ItemRarity rarity, EquipmentSlot slot)
        {
            SerializedProperty id = TestGroundSerialized.Relative(element, "itemId", _report);
            if (id != null)
            {
                id.stringValue = itemId;
            }

            SetRelative(element, "count", count);
            SetRelative(element, "itemLevel", TestGroundPaths.AreaLevel);
            SetRelative(element, "rarity", (int)rarity);
            SetRelative(element, "slot", (int)slot);
        }

        private void SetRelative(SerializedProperty element, string field, int value)
        {
            SerializedProperty property = TestGroundSerialized.Relative(element, field, _report);
            if (property != null)
            {
                property.intValue = value;
            }
        }

        private ContentCatalog EnsureCatalog()
        {
            ContentCatalog catalog = TestGroundSerialized.EnsureAsset<ContentCatalog>(TestGroundPaths.ContentCatalogPath, _report, null);
            if (catalog == null)
            {
                return null;
            }

            var definitions = new List<Object>();
            AddAll(definitions, _items);
            AddAll(definitions, Affixes.All);
            AddAll(definitions, LootTables.All);
            var so = new SerializedObject(catalog);
            SerializedProperty list = TestGroundSerialized.Property(so, "definitions", _report);
            if (list == null)
            {
                return catalog;
            }

            // Keep what is there (also entries added by hand), drop empty slots, append what is missing.
            var present = new HashSet<Object>();
            for (int i = list.arraySize - 1; i >= 0; i--)
            {
                Object entry = list.GetArrayElementAtIndex(i).objectReferenceValue;
                if (entry == null)
                {
                    list.DeleteArrayElementAtIndex(i);
                    continue;
                }

                present.Add(entry);
            }

            int added = 0;
            for (int i = 0; i < definitions.Count; i++)
            {
                if (definitions[i] == null || present.Contains(definitions[i]))
                {
                    continue;
                }

                list.arraySize++;
                list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = definitions[i];
                added++;
            }

            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(catalog);
            _report.Info("Inhaltskatalog " + TestGroundPaths.ContentCatalogPath + ": " + list.arraySize + " Definitionen (" + added + " neu).");
            return catalog;
        }

        private static void AddAll<T>(List<Object> target, IReadOnlyList<T> source) where T : Object
        {
            for (int i = 0; i < source.Count; i++)
            {
                if (source[i] != null)
                {
                    target.Add(source[i]);
                }
            }
        }

        private Material EnsureUnlitMaterial(string fileName, Color color)
        {
            string path = TestGroundPaths.MaterialFolder + "/" + fileName + ".mat";
            Material existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null)
            {
                return existing;
            }

            Shader shader = Shader.Find("Universal Render Pipeline/Unlit");
            if (shader == null)
            {
                _report.Warning("Shader „Universal Render Pipeline/Unlit“ nicht gefunden – die Loot-Strahlen nutzen „Unlit/Color“.");
                shader = Shader.Find("Unlit/Color");
            }

            var material = new Material(shader) { name = fileName };
            if (material.HasProperty("_BaseColor"))
            {
                material.SetColor("_BaseColor", color);
            }

            if (material.HasProperty("_Color"))
            {
                material.SetColor("_Color", color);
            }

            AssetDatabase.CreateAsset(material, path);
            _report.Info("Material angelegt: " + path);
            return material;
        }
    }
}
