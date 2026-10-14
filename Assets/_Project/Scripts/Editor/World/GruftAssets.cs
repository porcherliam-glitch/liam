using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.AI.Bosses;
using Aetherfall.Combat;
using Aetherfall.Data;
using Aetherfall.Events;
using Aetherfall.Items;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Data of the crypt (GDD 02 11.7; GDD 03 9 and 10.6; GDD 04 5): the skeleton warrior <c>enemy.untot.skelett_krieger</c>
    /// as normal (level 6), elite with tower shield (level 8) and champion (base of the boss, level 9) with its attacks, the
    /// boss "Der Wachende Ritter" (<see cref="BossDefinition"/>: phases 100 %/50 %, 2 adds, shield bash, sword blow, charge,
    /// spin), the loot tables of the skeletons and of the boss, the quest items blade fragment and seal stone, and their entries
    /// in the content catalog. Existing assets stay unchanged.
    /// </summary>
    /// <remarks>
    /// Skeleton values (Vorschlag after GDD 03 10.6 and GDD 01 11.1 "Untote"): LP 80, blow 22 slash, armor 25, poise 70;
    /// blunt +25 % (weakness), stab −30 %. Champion: LP ×4, damage ×1.5, poise ×2 (GDD 03 9.7); the knight is also weak
    /// against Aether (+25 %).
    /// </remarks>
    public sealed class GruftAssets
    {
        private readonly TestGroundReport _report;
        private readonly List<Object> _catalogEntries = new List<Object>();

        /// <summary>Creates or loads all crypt data.</summary>
        /// <param name="report">Protocol.</param>
        public GruftAssets(TestGroundReport report)
        {
            _report = report;
            AttackDefinition blow = EnsureAttack("Skelett_Hieb", SkeletonBlow());
            AttackDefinition thrust = EnsureAttack("Skelett_Stoss", SkeletonThrust());
            AttackDefinition bash = EnsureAttack("Ritter_Schildstoss", KnightShieldBash());
            AttackDefinition sword = EnsureAttack("Ritter_Schwerthieb", KnightSwordBlow());
            AttackDefinition charge = EnsureAttack("Ritter_Sturmangriff", KnightCharge());
            AttackDefinition spin = EnsureAttack("Ritter_Rundumschlag", KnightSpin());

            Skeleton = EnsureSkeleton(GruftPaths.SkeletonPath, DungeonVariant.Normal, blow, thrust);
            SkeletonElite = EnsureSkeleton(GruftPaths.SkeletonElitePath, DungeonVariant.Elite, blow, thrust);
            SkeletonChampion = EnsureSkeleton(GruftPaths.SkeletonChampionPath, DungeonVariant.Champion, blow, thrust);
            Boss = EnsureBoss(SkeletonChampion, bash, sword, charge, spin);

            EnsureLootTable("Loot_Skelett", GruftPaths.SkeletonLootTableId, 1, 1, -1, new[]
            {
                Entry(LootEntryKind.Nothing, 200, string.Empty, 0f, 0f, LootEntryFlags.None),
                Entry(LootEntryKind.Gold, 300, string.Empty, 0.05f, 0.15f, LootEntryFlags.None),
                Entry(LootEntryKind.Table, 80, TestGroundLootTableAssets.ConsumablesTableId, 0f, 0f, LootEntryFlags.None),
                Entry(LootEntryKind.Equipment, 100, string.Empty, 0f, 0f, LootEntryFlags.None)
            });

            // GDD 04 5.7 "Mini-Boss": guaranteed on the first win the boss unique plus 1 random piece with loot quality 3 (GDD 04 5.2:
            // at least rare), here with gold and a consumable. The boss unique (blade fragment) is a world reward picked up in the
            // arena, so it survives loading (world drops do not). The 2 % legendary roll needs the loot system (guide 12, open points).
            EnsureLootTable("Loot_Boss_Wachender_Ritter", GruftPaths.BossLootTableId, 0, 0, 3, new[]
            {
                Entry(LootEntryKind.Gold, 0, string.Empty, 1.0f, 1.5f, LootEntryFlags.Guaranteed),
                Entry(LootEntryKind.Equipment, 0, string.Empty, 0f, 0f, LootEntryFlags.Guaranteed),
                Entry(LootEntryKind.Table, 0, TestGroundLootTableAssets.ConsumablesTableId, 0f, 0f, LootEntryFlags.Guaranteed)
            });

            EnsureQuestItem("Klingenfragment_Eidwahrer", GruftPaths.BladeFragmentItemId, "Klingenfragment „Eidwahrer“",
                "Ein Bruchstück der Klinge des letzten Eichenritters. Die Schneide summt leise.", ItemRarity.Rare);
            EnsureQuestItem("Siegelstein_Gruft", GruftPaths.SealStoneItemId, "Siegelstein der Gruft",
                "Ein Eichenritter-Siegel. Es hält einen Splitterriss geschlossen.", ItemRarity.Uncommon);
            AddToCatalog();
        }

        /// <summary>Normal skeleton warrior.</summary>
        public EnemyTypeDefinition Skeleton { get; }

        /// <summary>Elite skeleton warrior (tower shield).</summary>
        public EnemyTypeDefinition SkeletonElite { get; }

        /// <summary>Champion skeleton warrior (base of the boss).</summary>
        public EnemyTypeDefinition SkeletonChampion { get; }

        /// <summary>The boss.</summary>
        public BossDefinition Boss { get; }

        /// <summary>True if every enemy asset exists.</summary>
        public bool IsComplete => Skeleton != null && SkeletonElite != null && SkeletonChampion != null && Boss != null;

        private enum DungeonVariant
        {
            Normal,
            Elite,
            Champion
        }

        private static AttackSpec SkeletonBlow()
        {
            AttackSpec spec = AttackSpec.Create("attack.skelett.hieb", 0.6f, 0.15f, 0.6f);
            spec.Kind = AttackKind.Enemy;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 25f;
            spec.LungeDistance = 0.6f;
            spec.KnockbackDistance = 0.3f;
            spec.OffsetY = 1.1f;
            spec.OffsetZ = 1.2f;
            spec.SizeX = 1.4f;
            spec.SizeY = 1.2f;
            spec.SizeZ = 1.6f;
            return spec;
        }

        private static AttackSpec SkeletonThrust()
        {
            AttackSpec spec = AttackSpec.Create("attack.skelett.stoss", 0.5f, 0.12f, 0.5f);
            spec.Kind = AttackKind.Enemy;
            spec.DamageMultiplier = 0.8f;
            spec.OverrideDamageType = true;
            spec.DamageType = DamageType.Stab;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 15f;
            spec.LungeDistance = 1.0f;
            spec.OffsetY = 1.1f;
            spec.OffsetZ = 1.3f;
            spec.SizeX = 0.8f;
            spec.SizeY = 0.8f;
            spec.SizeZ = 1.8f;
            return spec;
        }

        private static AttackSpec KnightShieldBash()
        {
            // GDD 02 11.7: telegraph = the shield pulls back for 0.8 s; parried, it opens the guard.
            AttackSpec spec = AttackSpec.Create("attack.ritter.schildstoss", 0.8f, 0.15f, 0.7f);
            spec.Kind = AttackKind.Enemy;
            spec.DamageMultiplier = 0.8f;
            spec.PoiseMultiplier = 2.0f;
            spec.OverrideDamageType = true;
            spec.DamageType = DamageType.Blunt;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 45f;
            spec.LungeDistance = 1.0f;
            spec.KnockbackDistance = 1.5f;
            spec.OffsetY = 1.2f;
            spec.OffsetZ = 1.2f;
            spec.SizeX = 1.6f;
            spec.SizeY = 1.6f;
            spec.SizeZ = 1.4f;
            spec.ShakeAmplitude = 0.3f;
            spec.ShakeDuration = 0.2f;
            return spec;
        }

        private static AttackSpec KnightSwordBlow()
        {
            AttackSpec spec = AttackSpec.Create("attack.ritter.schwerthieb", 0.6f, 0.18f, 0.8f);
            spec.Kind = AttackKind.Enemy;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 30f;
            spec.LungeDistance = 0.8f;
            spec.KnockbackDistance = 0.6f;
            spec.OffsetY = 1.2f;
            spec.OffsetZ = 1.5f;
            spec.SizeX = 2.0f;
            spec.SizeY = 1.4f;
            spec.SizeZ = 2.0f;
            return spec;
        }

        private static AttackSpec KnightCharge()
        {
            // GDD 03 9.5: unblockable attacks telegraph red for at least 0.7 s.
            AttackSpec spec = AttackSpec.Create("attack.ritter.sturmangriff", 0.9f, 0.35f, 1.2f);
            spec.Kind = AttackKind.Enemy;
            spec.DamageMultiplier = 1.4f;
            spec.PoiseMultiplier = 2.5f;
            spec.Unblockable = true;
            spec.Unparryable = true;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 0f;
            spec.LungeDistance = 6.0f;
            spec.KnockbackDistance = 2.0f;
            spec.OffsetY = 1.1f;
            spec.OffsetZ = 1.0f;
            spec.SizeX = 1.6f;
            spec.SizeY = 1.6f;
            spec.SizeZ = 1.6f;
            spec.ShakeAmplitude = 0.5f;
            spec.ShakeDuration = 0.3f;
            return spec;
        }

        private static AttackSpec KnightSpin()
        {
            AttackSpec spec = AttackSpec.Create("attack.ritter.rundumschlag", 0.8f, 0.25f, 1.0f);
            spec.Kind = AttackKind.Enemy;
            spec.DamageMultiplier = 1.2f;
            spec.PoiseMultiplier = 1.5f;
            spec.Unparryable = true;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 35f;
            spec.Shape = HitboxShape.Sphere;
            spec.Radius = 2.6f;
            spec.OffsetY = 1.0f;
            spec.OffsetZ = 0f;
            spec.KnockbackDistance = 1.2f;
            spec.MaxTurnDegrees = 0f;
            return spec;
        }

        private AttackDefinition EnsureAttack(string fileName, AttackSpec spec)
        {
            string path = TestGroundPaths.AttackFolder + "/" + fileName + ".asset";
            TestGroundReport report = _report;
            return TestGroundSerialized.EnsureAsset<AttackDefinition>(path, report, so =>
            {
                TestGroundSerialized.Set(so, "attackId", spec.Id, report);
                TestGroundSerialized.Set(so, "kind", (int)spec.Kind, report);
                TestGroundSerialized.Set(so, "windupSeconds", spec.WindupSeconds, report);
                TestGroundSerialized.Set(so, "activeSeconds", spec.ActiveSeconds, report);
                TestGroundSerialized.Set(so, "recoverySeconds", spec.RecoverySeconds, report);
                TestGroundSerialized.Set(so, "comboWindowStartSeconds", spec.ComboWindowStartSeconds, report);
                TestGroundSerialized.Set(so, "damageMultiplier", spec.DamageMultiplier, report);
                TestGroundSerialized.Set(so, "poiseMultiplier", spec.PoiseMultiplier, report);
                TestGroundSerialized.Set(so, "staminaCost", spec.StaminaCost, report);
                TestGroundSerialized.Set(so, "staminaDamage", spec.StaminaDamage, report);
                TestGroundSerialized.Set(so, "overrideDamageType", spec.OverrideDamageType, report);
                TestGroundSerialized.Set(so, "damageType", (int)spec.DamageType, report);
                TestGroundSerialized.Set(so, "unblockable", spec.Unblockable, report);
                TestGroundSerialized.Set(so, "unparryable", spec.Unparryable, report);
                TestGroundSerialized.Set(so, "shape", (int)spec.Shape, report);
                SetVector(so, "offset", new Vector3(spec.OffsetX, spec.OffsetY, spec.OffsetZ));
                SetVector(so, "size", new Vector3(spec.SizeX, spec.SizeY, spec.SizeZ));
                TestGroundSerialized.Set(so, "radius", spec.Radius, report);
                TestGroundSerialized.Set(so, "lungeDistance", spec.LungeDistance, report);
                TestGroundSerialized.Set(so, "knockbackDistance", spec.KnockbackDistance, report);
                TestGroundSerialized.Set(so, "maxTurnDegrees", spec.MaxTurnDegrees, report);
                TestGroundSerialized.Set(so, "shakeAmplitude", spec.ShakeAmplitude, report);
                TestGroundSerialized.Set(so, "shakeDuration", spec.ShakeDuration, report);
            });
        }

        private EnemyTypeDefinition EnsureSkeleton(string path, DungeonVariant variant, AttackDefinition blow, AttackDefinition thrust)
        {
            TestGroundReport report = _report;
            return TestGroundSerialized.EnsureAsset<EnemyTypeDefinition>(path, report, so =>
            {
                TestGroundSerialized.Set(so, "enemyTypeId", GruftPaths.SkeletonTypeId, report);
                switch (variant)
                {
                    case DungeonVariant.Elite:
                        TestGroundSerialized.Set(so, "variantId", "elite", report);
                        TestGroundSerialized.Set(so, "displayName", "Skelett-Krieger (Turmschild)", report);
                        TestGroundSerialized.Set(so, "level", GruftPaths.EliteLevel, report);
                        TestGroundSerialized.Set(so, "healthVariantFactor", 2f, report);
                        TestGroundSerialized.Set(so, "damageVariantFactor", 1.3f, report);
                        TestGroundSerialized.Set(so, "poiseVariantFactor", 1.5f, report);
                        TestGroundSerialized.Set(so, "lootTableId", GruftPaths.SkeletonLootTableId, report);
                        break;
                    case DungeonVariant.Champion:
                        TestGroundSerialized.Set(so, "variantId", "champion", report);
                        TestGroundSerialized.Set(so, "displayName", "Der Wachende Ritter", report);
                        TestGroundSerialized.Set(so, "level", GruftPaths.BossLevel, report);
                        TestGroundSerialized.Set(so, "healthVariantFactor", 4f, report);
                        TestGroundSerialized.Set(so, "damageVariantFactor", 1.5f, report);
                        TestGroundSerialized.Set(so, "poiseVariantFactor", 2f, report);
                        TestGroundSerialized.Set(so, "lootTableId", GruftPaths.BossLootTableId, report);
                        TestGroundSerialized.Set(so, "turnRate", 110f, report);
                        TestGroundSerialized.Set(so, "parryPoiseLoss", 0.12f, report);
                        TestGroundSerialized.Set(so, "parryOpenSeconds", 1.5f, report);
                        TestGroundSerialized.Set(so, "leashDistance", 80f, report);
                        break;
                    default:
                        TestGroundSerialized.Set(so, "variantId", "normal", report);
                        TestGroundSerialized.Set(so, "displayName", "Skelett-Krieger", report);
                        TestGroundSerialized.Set(so, "level", GruftPaths.SkeletonLevel, report);
                        TestGroundSerialized.Set(so, "lootTableId", GruftPaths.SkeletonLootTableId, report);
                        break;
                }

                TestGroundSerialized.Set(so, "baseHealth", 80f, report);
                TestGroundSerialized.Set(so, "baseDamage", 22f, report);
                TestGroundSerialized.Set(so, "damageType", (int)DamageType.Slash, report);
                TestGroundSerialized.Set(so, "baseArmor", 25f, report);
                TestGroundSerialized.Set(so, "basePoise", 70f, report);
                TestGroundSerialized.Set(so, "attackPoise", 15f, report);
                // Undead never flee and feel nothing but noise and sight (Vorschlag).
                TestGroundSerialized.Set(so, "fleeHealthFraction", 0f, report);
                TestGroundSerialized.Set(so, "perceptionFactor", 1.0f, report);
                TestGroundSerialized.Set(so, "walkSpeed", 1.4f, report);
                TestGroundSerialized.Set(so, "runSpeed", 4.2f, report);
                TestGroundSerialized.Set(so, "circleSpeed", 1.8f, report);
                if (variant != DungeonVariant.Champion)
                {
                    TestGroundSerialized.Set(so, "turnRate", 240f, report);
                    TestGroundSerialized.Set(so, "parryPoiseLoss", 0.35f, report);
                }

                SerializedProperty resistances = TestGroundSerialized.Property(so, "resistances", report);
                if (resistances != null)
                {
                    bool knight = variant == DungeonVariant.Champion;
                    resistances.arraySize = knight ? 3 : 2;
                    SetResistance(resistances.GetArrayElementAtIndex(0), DamageType.Blunt, -0.25f);
                    SetResistance(resistances.GetArrayElementAtIndex(1), DamageType.Stab, 0.3f);
                    if (knight)
                    {
                        SetResistance(resistances.GetArrayElementAtIndex(2), DamageType.Aether, -0.25f);
                    }
                }

                SerializedProperty attacks = TestGroundSerialized.Property(so, "attacks", report);
                if (attacks != null)
                {
                    attacks.arraySize = 2;
                    SetEnemyAttack(attacks.GetArrayElementAtIndex(0), blow, 0f, 2.4f, 30f, 1.8f, 3f);
                    SetEnemyAttack(attacks.GetArrayElementAtIndex(1), thrust, 0.5f, 2.8f, 20f, 2.4f, 1f);
                }
            });
        }

        private BossDefinition EnsureBoss(EnemyTypeDefinition champion, AttackDefinition bash, AttackDefinition sword, AttackDefinition charge,
            AttackDefinition spin)
        {
            TestGroundReport report = _report;
            return TestGroundSerialized.EnsureAsset<BossDefinition>(GruftPaths.BossPath, report, so =>
            {
                TestGroundSerialized.Set(so, "bossId", "boss.eichental.wachender_ritter", report);
                TestGroundSerialized.Set(so, "displayName", "Der Wachende Ritter", report);
                TestGroundSerialized.Set(so, "title", "Letzter Wächter der Eichenritter", report);
                TestGroundSerialized.Set(so, "baseType", champion, report);
                TestGroundSerialized.Set(so, "musicId", "mus.boss_gruft", report);
                SerializedProperty phases = TestGroundSerialized.Property(so, "phaseThresholds", report);
                if (phases != null)
                {
                    phases.arraySize = 2;
                    phases.GetArrayElementAtIndex(0).floatValue = 1f;
                    phases.GetArrayElementAtIndex(1).floatValue = 0.5f;
                }

                SerializedProperty adds = TestGroundSerialized.Property(so, "addsPerPhase", report);
                if (adds != null)
                {
                    adds.arraySize = 2;
                    adds.GetArrayElementAtIndex(0).intValue = 0;
                    adds.GetArrayElementAtIndex(1).intValue = 2;
                }

                SerializedProperty attacks = TestGroundSerialized.Property(so, "attacks", report);
                if (attacks != null)
                {
                    attacks.arraySize = 4;
                    SetBossAttack(attacks.GetArrayElementAtIndex(0), bash, 0f, 2.4f, 25f, 2.5f, 3f, 1, false);
                    SetBossAttack(attacks.GetArrayElementAtIndex(1), sword, 0f, 2.8f, 25f, 2.0f, 2f, 1, false);
                    SetBossAttack(attacks.GetArrayElementAtIndex(2), charge, 4f, 9f, 15f, 7.0f, 2f, 2, true);
                    SetBossAttack(attacks.GetArrayElementAtIndex(3), spin, 0f, 2.6f, 180f, 6.0f, 1.5f, 2, true);
                }
            });
        }

        private void EnsureLootTable(string file, string id, int minRolls, int maxRolls, int lootQuality, LootData[] entries)
        {
            string path = TestGroundPaths.LootTableFolder + "/" + file + ".asset";
            TestGroundReport report = _report;
            LootTableDefinition table = TestGroundSerialized.EnsureAsset<LootTableDefinition>(path, report, so =>
            {
                TestGroundSerialized.Set(so, "id", id, report);
                TestGroundSerialized.Set(so, "minRolls", minRolls, report);
                TestGroundSerialized.Set(so, "maxRolls", maxRolls, report);
                TestGroundSerialized.Set(so, "lootQualityOverride", lootQuality, report);
                SerializedProperty list = TestGroundSerialized.Property(so, "entries", report);
                if (list == null)
                {
                    return;
                }

                list.arraySize = entries.Length;
                for (int i = 0; i < entries.Length; i++)
                {
                    WriteEntry(list.GetArrayElementAtIndex(i), entries[i]);
                }
            });
            if (table != null)
            {
                _catalogEntries.Add(table);
            }
        }

        private void EnsureQuestItem(string file, string id, string name, string description, ItemRarity rarity)
        {
            string path = GruftPaths.QuestItemFolder + "/" + file + ".asset";
            TestGroundReport report = _report;
            ItemDefinition item = TestGroundSerialized.EnsureAsset<ItemDefinition>(path, report, so =>
            {
                TestGroundSerialized.Set(so, "id", id, report);
                TestGroundSerialized.Set(so, "displayName", name, report);
                TestGroundSerialized.Set(so, "description", description, report);
                TestGroundSerialized.Set(so, "category", (int)ItemCategory.QuestItem, report);
                TestGroundSerialized.Set(so, "equipKind", (int)EquipKind.None, report);
                TestGroundSerialized.Set(so, "stackSize", 1, report);
                TestGroundSerialized.Set(so, "weight", 0f, report);
                TestGroundSerialized.Set(so, "value", 0f, report);
                TestGroundSerialized.Set(so, "baseRarity", (int)rarity, report);
                TestGroundSerialized.Set(so, "questItem", true, report);
                TestGroundSerialized.Set(so, "randomDrop", false, report);
            });
            if (item != null)
            {
                _catalogEntries.Add(item);
            }
        }

        private void AddToCatalog()
        {
            ContentCatalog catalog = AssetDatabase.LoadAssetAtPath<ContentCatalog>(TestGroundPaths.ContentCatalogPath);
            if (catalog == null)
            {
                _report.Warning("Inhaltskatalog " + TestGroundPaths.ContentCatalogPath + " fehlt – Questgegenstände und Loot-Tabellen der Gruft " +
                                "sind im Spiel unbekannt. Zuerst „Aetherfall > Testgelände erstellen“ ausführen.");
                return;
            }

            var so = new SerializedObject(catalog);
            SerializedProperty list = TestGroundSerialized.Property(so, "definitions", _report);
            if (list == null)
            {
                return;
            }

            var present = new HashSet<Object>();
            for (int i = 0; i < list.arraySize; i++)
            {
                present.Add(list.GetArrayElementAtIndex(i).objectReferenceValue);
            }

            int added = 0;
            for (int i = 0; i < _catalogEntries.Count; i++)
            {
                if (_catalogEntries[i] == null || present.Contains(_catalogEntries[i]))
                {
                    continue;
                }

                list.arraySize++;
                list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = _catalogEntries[i];
                added++;
            }

            if (added > 0)
            {
                so.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(catalog);
            }

            _report.Info("Inhaltskatalog: " + added + " Einträge der Gruft neu (Questgegenstände, Loot-Tabellen).");
        }

        private static LootData Entry(LootEntryKind kind, int weight, string refId, float goldMin, float goldMax, LootEntryFlags flags)
        {
            return new LootData { Kind = kind, Weight = weight, RefId = refId, GoldMin = goldMin, GoldMax = goldMax, Flags = flags };
        }

        private static void WriteEntry(SerializedProperty element, LootData data)
        {
            SetRelative(element, "kind", (int)data.Kind);
            SetRelative(element, "weight", data.Weight);
            SerializedProperty refId = element.FindPropertyRelative("refId");
            if (refId != null)
            {
                refId.stringValue = data.RefId ?? string.Empty;
            }

            SetRelative(element, "minCount", 1);
            SetRelative(element, "maxCount", 1);
            SetRelative(element, "goldFactorMin", data.GoldMin);
            SetRelative(element, "goldFactorMax", data.GoldMax);
            SetRelative(element, "minSourceLevel", 0);
            SetRelative(element, "maxSourceLevel", 0);
            SetRelative(element, "flags", (int)data.Flags);
            SetRelative(element, "weaponShare", 50);
            SetRelative(element, "armorShare", 40);
            SetRelative(element, "jewelryShare", 10);
        }

        private static void SetRelative(SerializedProperty element, string field, int value)
        {
            SerializedProperty property = element.FindPropertyRelative(field);
            if (property != null)
            {
                property.intValue = value;
            }
        }

        private static void SetRelative(SerializedProperty element, string field, float value)
        {
            SerializedProperty property = element.FindPropertyRelative(field);
            if (property != null)
            {
                property.floatValue = value;
            }
        }

        private static void SetResistance(SerializedProperty element, DamageType type, float value)
        {
            element.FindPropertyRelative("damageType").intValue = (int)type;
            element.FindPropertyRelative("value").floatValue = value;
            element.FindPropertyRelative("immune").boolValue = false;
        }

        private static void SetEnemyAttack(SerializedProperty element, AttackDefinition attack, float minRange, float maxRange, float maxAngle,
            float cooldown, float weight)
        {
            element.FindPropertyRelative("attack").objectReferenceValue = attack;
            element.FindPropertyRelative("minRange").floatValue = minRange;
            element.FindPropertyRelative("maxRange").floatValue = maxRange;
            element.FindPropertyRelative("maxAngle").floatValue = maxAngle;
            element.FindPropertyRelative("cooldown").floatValue = cooldown;
            element.FindPropertyRelative("weight").floatValue = weight;
        }

        private static void SetBossAttack(SerializedProperty element, AttackDefinition attack, float minRange, float maxRange, float maxAngle,
            float cooldown, float weight, int minPhase, bool dropsGuard)
        {
            SetEnemyAttack(element, attack, minRange, maxRange, maxAngle, cooldown, weight);
            element.FindPropertyRelative("minPhase").intValue = minPhase;
            element.FindPropertyRelative("dropsGuard").boolValue = dropsGuard;
        }

        private void SetVector(SerializedObject so, string field, Vector3 value)
        {
            SerializedProperty property = TestGroundSerialized.Property(so, field, _report);
            if (property != null)
            {
                property.vector3Value = value;
            }
        }

        private sealed class LootData
        {
            public LootEntryKind Kind;
            public int Weight;
            public string RefId;
            public float GoldMin;
            public float GoldMax;
            public LootEntryFlags Flags;
        }
    }
}
