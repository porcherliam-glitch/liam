using System.Collections.Generic;
using Aetherfall.Items;
using UnityEditor;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Loot tables of the test ground (GDD 04 5.1, 5.6): grey wolf (wolf fur guaranteed, meat, gold, rarely equipment),
    /// Aether wolf (Aether wolf pelt guaranteed), a shared consumables table (nested), and the chests wooden (LQ 1), iron
    /// (LQ 2) and hidden (LQ 3: 2 items at least rare). Gold as multiple of G(L) = 15 + 6 × L. Existing assets are never
    /// overwritten.
    /// </summary>
    public sealed class TestGroundLootTableAssets
    {
        /// <summary>Id of the grey wolf table.</summary>
        public const string WolfTableId = "loot.enemy.wolf.grauwolf";

        /// <summary>Id of the Aether wolf table.</summary>
        public const string AetherWolfTableId = "loot.enemy.wolf.aether";

        /// <summary>Id of the shared consumables table.</summary>
        public const string ConsumablesTableId = "loot.shared.verbrauch_test";

        /// <summary>Id of the wooden chest table.</summary>
        public const string WoodenChestTableId = "loot.chest.holz";

        /// <summary>Id of the iron chest table.</summary>
        public const string IronChestTableId = "loot.chest.eisen";

        /// <summary>Id of the hidden chest table.</summary>
        public const string HiddenChestTableId = "loot.chest.versteckt";

        private readonly TestGroundReport _report;
        private readonly List<LootTableDefinition> _all = new List<LootTableDefinition>();

        /// <summary>Creates or loads all loot tables (the folder must exist).</summary>
        /// <param name="report">Protocol.</param>
        public TestGroundLootTableAssets(TestGroundReport report)
        {
            _report = report;
            Table("Verbrauch_Test", ConsumablesTableId, 1, 1, new[]
            {
                Entry(LootEntryKind.Item, 100, TestGroundItemAssets.PotionId, 1, 1),
                Entry(LootEntryKind.Nothing, 60, string.Empty, 1, 1)
            });
            Table("Wolf_Grauwolf", WolfTableId, 1, 2, new[]
            {
                Guaranteed(LootEntryKind.Item, TestGroundItemAssets.WolfFurId, 1, 1),
                Entry(LootEntryKind.Nothing, 200, string.Empty, 1, 1),
                Gold(300, 0.05f, 0.15f),
                Entry(LootEntryKind.Item, 300, TestGroundItemAssets.WolfMeatId, 1, 2),
                Entry(LootEntryKind.Table, 80, ConsumablesTableId, 1, 1),
                Entry(LootEntryKind.Equipment, 120, string.Empty, 1, 1)
            });
            Table("Wolf_Aether", AetherWolfTableId, 1, 2, new[]
            {
                Guaranteed(LootEntryKind.Item, TestGroundItemAssets.AetherPeltId, 1, 1),
                Entry(LootEntryKind.Nothing, 150, string.Empty, 1, 1),
                Gold(300, 0.1f, 0.2f),
                Entry(LootEntryKind.Item, 200, TestGroundItemAssets.WolfMeatId, 1, 2),
                Entry(LootEntryKind.Table, 80, ConsumablesTableId, 1, 1),
                Entry(LootEntryKind.Equipment, 150, string.Empty, 1, 1)
            });

            // GDD 04 5.6: wooden 0.25 × G(L), 50 % on one item, 1–3 consumables.
            Table("Truhe_Holz", WoodenChestTableId, 1, 1, new[]
            {
                GuaranteedGold(0.2f, 0.3f),
                Guaranteed(LootEntryKind.Table, ConsumablesTableId, 1, 3),
                Entry(LootEntryKind.Equipment, 100, string.Empty, 1, 1),
                Entry(LootEntryKind.Nothing, 100, string.Empty, 1, 1)
            });

            // Iron: 0.5 × G(L), one item plus 50 % on a second, a material.
            Table("Truhe_Eisen", IronChestTableId, 1, 1, new[]
            {
                GuaranteedGold(0.4f, 0.6f),
                Guaranteed(LootEntryKind.Equipment, string.Empty, 1, 1),
                Guaranteed(LootEntryKind.Item, TestGroundItemAssets.WolfFurId, 1, 2),
                Entry(LootEntryKind.Equipment, 100, string.Empty, 1, 1),
                Entry(LootEntryKind.Nothing, 100, string.Empty, 1, 1)
            });

            // Hidden: 1.0 × G(L), two items (LQ 3 lifts them to at least rare), consumables.
            Table("Truhe_Versteckt", HiddenChestTableId, 0, 0, new[]
            {
                GuaranteedGold(0.8f, 1.2f),
                Guaranteed(LootEntryKind.Equipment, string.Empty, 1, 1),
                Guaranteed(LootEntryKind.Equipment, string.Empty, 1, 1),
                Guaranteed(LootEntryKind.Table, ConsumablesTableId, 1, 2)
            });
        }

        /// <summary>All loot table definitions (null entries if a path was blocked).</summary>
        public IReadOnlyList<LootTableDefinition> All => _all;

        private static EntryData Entry(LootEntryKind kind, int weight, string refId, int min, int max)
        {
            return new EntryData { Kind = kind, Weight = weight, RefId = refId, Min = min, Max = max };
        }

        private static EntryData Guaranteed(LootEntryKind kind, string refId, int min, int max)
        {
            return new EntryData { Kind = kind, Weight = 0, RefId = refId, Min = min, Max = max, Flags = LootEntryFlags.Guaranteed };
        }

        private static EntryData Gold(int weight, float factorMin, float factorMax)
        {
            return new EntryData { Kind = LootEntryKind.Gold, Weight = weight, RefId = string.Empty, Min = 1, Max = 1, GoldMin = factorMin, GoldMax = factorMax };
        }

        private static EntryData GuaranteedGold(float factorMin, float factorMax)
        {
            EntryData entry = Gold(0, factorMin, factorMax);
            entry.Flags = LootEntryFlags.Guaranteed;
            return entry;
        }

        private void Table(string file, string id, int minRolls, int maxRolls, EntryData[] entries)
        {
            string path = TestGroundPaths.LootTableFolder + "/Loot_" + file + ".asset";
            TestGroundReport report = _report;
            LootTableDefinition asset = TestGroundSerialized.EnsureAsset<LootTableDefinition>(path, report, so =>
            {
                TestGroundSerialized.Set(so, "id", id, report);
                TestGroundSerialized.Set(so, "minRolls", minRolls, report);
                TestGroundSerialized.Set(so, "maxRolls", maxRolls, report);
                TestGroundSerialized.Set(so, "lootQualityOverride", -1, report);
                SerializedProperty list = TestGroundSerialized.Property(so, "entries", report);
                if (list == null)
                {
                    return;
                }

                list.arraySize = entries.Length;
                for (int i = 0; i < entries.Length; i++)
                {
                    Write(list.GetArrayElementAtIndex(i), entries[i], report);
                }
            });
            _all.Add(asset);
        }

        private static void Write(SerializedProperty element, EntryData data, TestGroundReport report)
        {
            SetInt(element, "kind", (int)data.Kind, report);
            SetInt(element, "weight", data.Weight, report);
            SerializedProperty refId = TestGroundSerialized.Relative(element, "refId", report);
            if (refId != null)
            {
                refId.stringValue = data.RefId;
            }

            SetInt(element, "minCount", data.Min, report);
            SetInt(element, "maxCount", data.Max, report);
            SetFloat(element, "goldFactorMin", data.GoldMin, report);
            SetFloat(element, "goldFactorMax", data.GoldMax, report);
            SetInt(element, "minSourceLevel", 0, report);
            SetInt(element, "maxSourceLevel", 0, report);
            SetInt(element, "flags", (int)data.Flags, report);
            SetInt(element, "weaponShare", 50, report);
            SetInt(element, "armorShare", 40, report);
            SetInt(element, "jewelryShare", 10, report);
        }

        private static void SetInt(SerializedProperty element, string field, int value, TestGroundReport report)
        {
            SerializedProperty property = TestGroundSerialized.Relative(element, field, report);
            if (property != null)
            {
                property.intValue = value;
            }
        }

        private static void SetFloat(SerializedProperty element, string field, float value, TestGroundReport report)
        {
            SerializedProperty property = TestGroundSerialized.Relative(element, field, report);
            if (property != null)
            {
                property.floatValue = value;
            }
        }

        private sealed class EntryData
        {
            public LootEntryKind Kind;
            public int Weight;
            public string RefId;
            public int Min;
            public int Max;
            public float GoldMin;
            public float GoldMax;
            public LootEntryFlags Flags;
        }
    }
}
