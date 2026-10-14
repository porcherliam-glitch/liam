using System.IO;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Events;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Data assets of the first playable fight (one-handed sword with wooden shield against wolves): attacks, combo, weapon,
    /// shield, combat settings and the enemy types grey wolf and Aether wolf. Existing assets are reused and never
    /// overwritten (changed values stay); missing ones are created with the values of GDD 03 (and Vorschlaege of this step).
    /// </summary>
    /// <remarks>
    /// Sword timings: light hit 0.82 s with the combo window at 0.45 s (GDD 03 5.1 "Tempo 450 ms", 4.4 "ab ~55 %"), stamina
    /// 12 light / 24 heavy / 18 sprint and jump (4.3, 5.1), the 4th hit is a thrust (stab, ×1.2, poise ×1.5). Wolf: bite with
    /// 0.45 s telegraph, snap 0.4 s, pounce 0.65 s with 4 m leap (9.5: telegraph ≥ 0.4 s, recovery 0.4/0.8–1.2 s).
    /// </remarks>
    public sealed class TestGroundCombatAssets
    {
        /// <summary>Creates or loads all combat assets (folders must exist).</summary>
        /// <param name="report">Protocol.</param>
        public TestGroundCombatAssets(TestGroundReport report)
        {
            AttackDefinition light1 = EnsureAttack("Einhandschwert_Leicht1", SwordLight("attack.einhandschwert.leicht_1", 0.4f), report);
            AttackDefinition light2 = EnsureAttack("Einhandschwert_Leicht2", SwordLight("attack.einhandschwert.leicht_2", 0.4f), report);
            AttackDefinition light3 = EnsureAttack("Einhandschwert_Leicht3", SwordLight("attack.einhandschwert.leicht_3", 0.5f), report);
            AttackDefinition light4 = EnsureAttack("Einhandschwert_Leicht4_Stich", SwordThrust(), report);
            AttackDefinition heavy = EnsureAttack("Einhandschwert_Schwer", SwordHeavy(), report);
            AttackDefinition sprint = EnsureAttack("Einhandschwert_Sprint", SwordSprint(), report);
            AttackDefinition jump = EnsureAttack("Einhandschwert_Sprung", SwordJump(), report);
            AttackDefinition counter = EnsureAttack("Einhandschwert_Konter", SwordCounter(), report);
            AttackDefinition finisher = EnsureAttack("Einhandschwert_Finisher", SwordFinisher(), report);
            AttackDefinition bite = EnsureAttack("Wolf_Biss", WolfBite(), report);
            AttackDefinition snap = EnsureAttack("Wolf_Schnappen", WolfSnap(), report);
            AttackDefinition pounce = EnsureAttack("Wolf_Sprungangriff", WolfPounce(), report);

            ComboDefinition combo = EnsureCombo(new[] { light1, light2, light3, light4 }, report);
            Shield = EnsureShield(report);
            Weapon = EnsureWeapon(combo, heavy, sprint, jump, counter, finisher, report);
            Settings = EnsureAsset<CombatSettings>(TestGroundPaths.CombatSettingsPath, report, null);
            Wolf = EnsureEnemy("Grauwolf", false, bite, snap, pounce, report);
            AetherWolf = EnsureEnemy("AetherWolf", true, bite, snap, pounce, report);
        }

        /// <summary>One-handed sword with moveset.</summary>
        public WeaponDefinition Weapon { get; }

        /// <summary>Wooden shield.</summary>
        public ShieldDefinition Shield { get; }

        /// <summary>Combat rules.</summary>
        public CombatSettings Settings { get; }

        /// <summary>Grey wolf (enemy.wolf.grauwolf, normal, level 8).</summary>
        public EnemyTypeDefinition Wolf { get; }

        /// <summary>Aether wolf (grey wolf, variant aether_verderbt).</summary>
        public EnemyTypeDefinition AetherWolf { get; }

        /// <summary>True if every asset exists.</summary>
        public bool IsComplete => Weapon != null && Shield != null && Settings != null && Wolf != null && AetherWolf != null;

        private static AttackSpec SwordLight(string id, float lunge)
        {
            AttackSpec spec = AttackSpec.Create(id, 0.2f, 0.12f, 0.5f);
            spec.ComboWindowStartSeconds = 0.45f;
            spec.StaminaCost = 12f;
            spec.StaminaDamage = 20f;
            spec.LungeDistance = lunge;
            spec.KnockbackDistance = 0.25f;
            spec.OffsetY = 1.0f;
            spec.OffsetZ = 1.1f;
            spec.SizeX = 1.9f;
            spec.SizeY = 1.3f;
            spec.SizeZ = 1.7f;
            return spec;
        }

        private static AttackSpec SwordThrust()
        {
            AttackSpec spec = AttackSpec.Create("attack.einhandschwert.leicht_4_stich", 0.28f, 0.12f, 0.6f);
            spec.Kind = AttackKind.ComboFinisher;
            spec.ComboWindowStartSeconds = 0.6f;
            spec.DamageMultiplier = 1.2f;
            spec.PoiseMultiplier = 1.5f;
            spec.OverrideDamageType = true;
            spec.DamageType = DamageType.Stab;
            spec.StaminaCost = 12f;
            spec.StaminaDamage = 25f;
            spec.LungeDistance = 0.8f;
            spec.KnockbackDistance = 0.6f;
            spec.OffsetY = 1.0f;
            spec.OffsetZ = 1.3f;
            spec.SizeX = 0.9f;
            spec.SizeY = 1.0f;
            spec.SizeZ = 2.1f;
            return spec;
        }

        private static AttackSpec SwordHeavy()
        {
            AttackSpec spec = AttackSpec.Create("attack.einhandschwert.schwer", 0.45f, 0.15f, 0.7f);
            spec.Kind = AttackKind.Heavy;
            spec.ComboWindowStartSeconds = 10f;
            spec.CancelOnlyInRecovery = true;
            spec.DamageMultiplier = 1.5f;
            spec.PoiseMultiplier = 1.5f;
            spec.StaminaCost = 24f;
            spec.StaminaDamage = 35f;
            spec.LungeDistance = 0.6f;
            spec.KnockbackDistance = 0.8f;
            spec.OffsetY = 1.0f;
            spec.OffsetZ = 1.2f;
            spec.SizeX = 1.6f;
            spec.SizeY = 1.8f;
            spec.SizeZ = 1.9f;
            return spec;
        }

        private static AttackSpec SwordSprint()
        {
            AttackSpec spec = AttackSpec.Create("attack.einhandschwert.sprint", 0.2f, 0.18f, 0.55f);
            spec.Kind = AttackKind.Sprint;
            spec.ComboWindowStartSeconds = 10f;
            spec.DamageMultiplier = 1.3f;
            spec.PoiseMultiplier = 1.5f;
            spec.StaminaCost = 18f;
            spec.StaminaDamage = 25f;
            spec.LungeDistance = 2.0f;
            spec.KnockbackDistance = 0.8f;
            spec.OffsetZ = 1.2f;
            spec.SizeX = 1.4f;
            spec.SizeY = 1.3f;
            spec.SizeZ = 2.0f;
            return spec;
        }

        private static AttackSpec SwordJump()
        {
            AttackSpec spec = AttackSpec.Create("attack.einhandschwert.sprung", 0.15f, 0.2f, 0.45f);
            spec.Kind = AttackKind.Jump;
            spec.ComboWindowStartSeconds = 10f;
            spec.DamageMultiplier = 1.2f;
            spec.PoiseMultiplier = 1.3f;
            spec.StaminaCost = 18f;
            spec.StaminaDamage = 25f;
            spec.LungeDistance = 0.3f;
            spec.KnockbackDistance = 0.5f;
            spec.OffsetY = 0.7f;
            spec.OffsetZ = 1.1f;
            spec.SizeX = 1.6f;
            spec.SizeY = 1.8f;
            spec.SizeZ = 1.8f;
            return spec;
        }

        private static AttackSpec SwordCounter()
        {
            AttackSpec spec = AttackSpec.Create("attack.einhandschwert.konter", 0.12f, 0.15f, 0.45f);
            spec.Kind = AttackKind.Counter;
            spec.ComboWindowStartSeconds = 10f;
            spec.CancelOnlyInRecovery = true;
            spec.DamageMultiplier = 3.0f;
            spec.PoiseMultiplier = 2.0f;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 40f;
            spec.LungeDistance = 0.8f;
            spec.KnockbackDistance = 1.0f;
            spec.MaxTurnDegrees = 90f;
            spec.OffsetZ = 1.2f;
            spec.SizeX = 1.9f;
            spec.SizeY = 1.4f;
            spec.SizeZ = 1.9f;
            return spec;
        }

        private static AttackSpec SwordFinisher()
        {
            AttackSpec spec = AttackSpec.Create("attack.einhandschwert.finisher", 0.8f, 0.1f, 0.7f);
            spec.Kind = AttackKind.Finisher;
            spec.ComboWindowStartSeconds = 10f;
            spec.CancelOnlyInRecovery = true;
            spec.DamageMultiplier = 5f;
            spec.PoiseMultiplier = 0f;
            spec.StaminaCost = 0f;
            spec.LungeDistance = 0f;
            spec.KnockbackDistance = 0f;
            spec.MaxTurnDegrees = 180f;
            return spec;
        }

        private static AttackSpec WolfBite()
        {
            AttackSpec spec = AttackSpec.Create("attack.wolf.biss", 0.45f, 0.15f, 0.45f);
            spec.Kind = AttackKind.Enemy;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 25f;
            spec.LungeDistance = 0.8f;
            spec.KnockbackDistance = 0.4f;
            spec.OffsetY = 0.6f;
            spec.OffsetZ = 1.0f;
            spec.SizeX = 0.9f;
            spec.SizeY = 0.9f;
            spec.SizeZ = 1.3f;
            return spec;
        }

        private static AttackSpec WolfSnap()
        {
            AttackSpec spec = AttackSpec.Create("attack.wolf.schnappen", 0.4f, 0.12f, 0.4f);
            spec.Kind = AttackKind.Enemy;
            spec.DamageMultiplier = 0.7f;
            spec.PoiseMultiplier = 0.7f;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 15f;
            spec.LungeDistance = 0.4f;
            spec.KnockbackDistance = 0.2f;
            spec.OffsetY = 0.6f;
            spec.OffsetZ = 0.9f;
            spec.SizeX = 0.8f;
            spec.SizeY = 0.8f;
            spec.SizeZ = 1.1f;
            return spec;
        }

        private static AttackSpec WolfPounce()
        {
            AttackSpec spec = AttackSpec.Create("attack.wolf.sprungangriff", 0.65f, 0.3f, 0.95f);
            spec.Kind = AttackKind.Enemy;
            spec.DamageMultiplier = 1.4f;
            spec.PoiseMultiplier = 2.0f;
            spec.StaminaCost = 0f;
            spec.StaminaDamage = 40f;
            spec.LungeDistance = 4.0f;
            spec.KnockbackDistance = 1.0f;
            spec.OffsetY = 0.7f;
            spec.OffsetZ = 1.1f;
            spec.SizeX = 1.0f;
            spec.SizeY = 1.0f;
            spec.SizeZ = 1.5f;
            return spec;
        }

        private static AttackDefinition EnsureAttack(string fileName, AttackSpec spec, TestGroundReport report)
        {
            string path = TestGroundPaths.AttackFolder + "/" + fileName + ".asset";
            return EnsureAsset<AttackDefinition>(path, report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "attackId", spec.Id, report);
                Set(so, "kind", (int)spec.Kind, report);
                Set(so, "windupSeconds", spec.WindupSeconds, report);
                Set(so, "activeSeconds", spec.ActiveSeconds, report);
                Set(so, "recoverySeconds", spec.RecoverySeconds, report);
                Set(so, "comboWindowStartSeconds", spec.ComboWindowStartSeconds, report);
                Set(so, "cancelOnlyInRecovery", spec.CancelOnlyInRecovery, report);
                Set(so, "damageMultiplier", spec.DamageMultiplier, report);
                Set(so, "poiseMultiplier", spec.PoiseMultiplier, report);
                Set(so, "staminaCost", spec.StaminaCost, report);
                Set(so, "staminaDamage", spec.StaminaDamage, report);
                Set(so, "overrideDamageType", spec.OverrideDamageType, report);
                Set(so, "damageType", (int)spec.DamageType, report);
                Set(so, "unblockable", spec.Unblockable, report);
                Set(so, "unparryable", spec.Unparryable, report);
                Set(so, "shape", (int)spec.Shape, report);
                Set(so, "offset", new Vector3(spec.OffsetX, spec.OffsetY, spec.OffsetZ), report);
                Set(so, "size", new Vector3(spec.SizeX, spec.SizeY, spec.SizeZ), report);
                Set(so, "radius", spec.Radius, report);
                Set(so, "lungeDistance", spec.LungeDistance, report);
                Set(so, "knockbackDistance", spec.KnockbackDistance, report);
                Set(so, "maxTurnDegrees", spec.MaxTurnDegrees, report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
        }

        private static ComboDefinition EnsureCombo(AttackDefinition[] steps, TestGroundReport report)
        {
            string path = TestGroundPaths.WeaponFolder + "/Einhandschwert_Kombo.asset";
            return EnsureAsset<ComboDefinition>(path, report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "comboId", "combo.einhandschwert.leicht", report);
                SetReferences(so, "steps", steps, report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
        }

        private static ShieldDefinition EnsureShield(TestGroundReport report)
        {
            string path = TestGroundPaths.WeaponFolder + "/Holzschild.asset";
            return EnsureAsset<ShieldDefinition>(path, report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "shieldId", "item.shield.holzschild", report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
        }

        private static WeaponDefinition EnsureWeapon(ComboDefinition combo, AttackDefinition heavy, AttackDefinition sprint, AttackDefinition jump,
            AttackDefinition counter, AttackDefinition finisher, TestGroundReport report)
        {
            string path = TestGroundPaths.WeaponFolder + "/Einhandschwert.asset";
            return EnsureAsset<WeaponDefinition>(path, report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "weaponId", "item.weapon.einhandschwert_eisen", report);
                Set(so, "baseDamage", 50f, report);
                Set(so, "damageType", (int)DamageType.Slash, report);
                Set(so, "weaponPoise", 10f, report);
                Set(so, "lightCombo", combo, report);
                Set(so, "heavyAttack", heavy, report);
                Set(so, "sprintAttack", sprint, report);
                Set(so, "jumpAttack", jump, report);
                Set(so, "counterAttack", counter, report);
                Set(so, "finisher", finisher, report);
                so.ApplyModifiedPropertiesWithoutUndo();
            });
        }

        private static EnemyTypeDefinition EnsureEnemy(string fileName, bool aether, AttackDefinition bite, AttackDefinition snap,
            AttackDefinition pounce, TestGroundReport report)
        {
            string path = TestGroundPaths.EnemyFolder + "/" + fileName + ".asset";
            return EnsureAsset<EnemyTypeDefinition>(path, report, asset =>
            {
                var so = new SerializedObject(asset);
                Set(so, "enemyTypeId", "enemy.wolf.grauwolf", report);
                Set(so, "variantId", aether ? "aether_verderbt" : "normal", report);
                Set(so, "displayName", aether ? "Aether-Wolf" : "Grauwolf", report);
                Set(so, "level", Aetherfall.EditorTools.Narrative.TestGroundLevels.WolfLevel, report);
                Set(so, "lootTableId", string.Empty, report);
                Set(so, "baseHealth", 70f, report);
                Set(so, "baseDamage", 25f, report);
                Set(so, "damageType", (int)DamageType.Stab, report);
                Set(so, "baseArmor", 15f, report);
                Set(so, "basePoise", 30f, report);
                Set(so, "attackPoise", 12f, report);
                Set(so, "aetherDamageShare", aether ? 0.25f : 0f, report);
                Set(so, "hasCrystalCore", aether, report);
                // Aether-corrupted enemies do not flee (Vorschlag); animals flee below 25 % health (GDD 03 9.4).
                Set(so, "fleeHealthFraction", aether ? 0f : 0.25f, report);
                Set(so, "perceptionFactor", 1.5f, report);

                SerializedProperty resistances = so.FindProperty("resistances");
                if (resistances != null)
                {
                    resistances.arraySize = aether ? 2 : 1;
                    SetResistance(resistances.GetArrayElementAtIndex(0), DamageType.Fire, -0.5f);
                    if (aether)
                    {
                        SetResistance(resistances.GetArrayElementAtIndex(1), DamageType.Aether, 0.5f);
                    }
                }

                SerializedProperty attacks = so.FindProperty("attacks");
                if (attacks != null)
                {
                    attacks.arraySize = 3;
                    SetEnemyAttack(attacks.GetArrayElementAtIndex(0), bite, 0f, 2.2f, 30f, 1.6f, 3f);
                    SetEnemyAttack(attacks.GetArrayElementAtIndex(1), snap, 0f, 1.8f, 30f, 1.2f, 2f);
                    SetEnemyAttack(attacks.GetArrayElementAtIndex(2), pounce, 3.0f, 6.0f, 25f, 4.0f, 2f);
                }

                so.ApplyModifiedPropertiesWithoutUndo();
            });
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

        private static T EnsureAsset<T>(string path, TestGroundReport report, System.Action<T> fill) where T : ScriptableObject
        {
            T existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing != null)
            {
                report.Info("Vorhanden (unverändert): " + path);
                return existing;
            }

            if (File.Exists(Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, path)))
            {
                report.Warning(path + " existiert, ist aber kein " + typeof(T).Name + " – bitte prüfen.");
                return null;
            }

            T asset = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(asset, path);
            if (fill != null)
            {
                fill(asset);
            }

            EditorUtility.SetDirty(asset);
            report.Info("Angelegt: " + path);
            return asset;
        }

        private static void Set(SerializedObject so, string field, float value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.floatValue = value;
            }
        }

        private static void Set(SerializedObject so, string field, int value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.intValue = value;
            }
        }

        private static void Set(SerializedObject so, string field, bool value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.boolValue = value;
            }
        }

        private static void Set(SerializedObject so, string field, string value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.stringValue = value;
            }
        }

        private static void Set(SerializedObject so, string field, Vector3 value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.vector3Value = value;
            }
        }

        private static void Set(SerializedObject so, string field, Object value, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property != null)
            {
                property.objectReferenceValue = value;
            }
        }

        private static void SetReferences(SerializedObject so, string field, Object[] values, TestGroundReport report)
        {
            SerializedProperty property = Property(so, field, report);
            if (property == null || !property.isArray)
            {
                return;
            }

            property.arraySize = values.Length;
            for (int i = 0; i < values.Length; i++)
            {
                property.GetArrayElementAtIndex(i).objectReferenceValue = values[i];
            }
        }

        private static SerializedProperty Property(SerializedObject so, string field, TestGroundReport report)
        {
            SerializedProperty property = so.FindProperty(field);
            if (property == null)
            {
                report.Warning("Feld „" + field + "“ an " + so.targetObject.GetType().Name + " nicht gefunden (Code umbenannt?).");
            }

            return property;
        }
    }
}
