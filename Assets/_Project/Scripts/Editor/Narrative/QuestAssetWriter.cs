using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Aetherfall.Data;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// Writes quests and flags built in code (<see cref="QuestSpecBuilder"/>, <see cref="FlagSpec"/>) into
    /// <see cref="QuestDefinition"/> and <see cref="FlagDefinition"/> assets through <see cref="SerializedObject"/> - the way the
    /// inspector does it, so <c>[SerializeReference]</c> data (conditions, actions, objectives) is stored correctly. Used by
    /// the test ground menu for its test quests; the same works for the Mini-Slice quests (guide 08, 11.2).
    /// </summary>
    /// <remarks>
    /// <para>Every field of the asset is written (<see cref="QuestFields"/>). Nested <c>[Serializable]</c> data (stages,
    /// branches, fail rules, ledger entries …) is copied field by field from the objects of the spec; references go in as
    /// managed references. Objects of the spec are not copied: build a new spec for every asset.</para>
    /// <para>Only in the editor; the caller saves the assets (<c>AssetDatabase.SaveAssets</c>).</para>
    /// </remarks>
    public static class QuestAssetWriter
    {
        /// <summary>The serialized fields of <see cref="QuestDefinition"/> (and its base) that <see cref="WriteQuest"/> fills.</summary>
        public static readonly string[] QuestFields =
        {
            "id", "status", "title", "description", "category", "traits", "twistType", "recommendedLevel", "regionId", "giverId",
            "fallbackGiverIds", "turnInNpcId", "startTriggerKind", "startTriggerId", "startCondition", "startStageId", "startBranches",
            "stages", "rewards", "followUps", "repeatMode", "cooldownHours", "canFail", "failRules", "deadlineHours", "chainId",
            "chainPosition", "ledger", "companionReactions", "pacingMinute", "scopeTier", "author", "wordBudget", "notes"
        };

        /// <summary>The serialized fields of <see cref="FlagDefinition"/> (and its base) that <see cref="WriteFlag"/> fills.</summary>
        public static readonly string[] FlagFields =
        {
            "id", "status", "kind", "defaultValue", "min", "max", "enumValues", "description", "carryToNewGamePlus"
        };

        /// <summary>Writes a quest into an asset (all fields are replaced).</summary>
        /// <param name="asset">Quest asset.</param>
        /// <param name="spec">Quest data.</param>
        /// <returns>Names of fields that were not found on the asset (renamed in code); empty if everything was written.</returns>
        public static List<string> WriteQuest(QuestDefinition asset, QuestSpec spec)
        {
            if (asset == null)
            {
                throw new ArgumentNullException(nameof(asset));
            }

            if (spec == null)
            {
                throw new ArgumentNullException(nameof(spec));
            }

            var missing = new List<string>();
            var so = new SerializedObject(asset);
            SetString(so, "id", spec.Id, missing);
            SetInt(so, "status", (int)spec.Status, missing);
            SetString(so, "title", spec.Title, missing);
            SetString(so, "description", spec.Description, missing);
            SetInt(so, "category", (int)spec.Category, missing);
            SetInt(so, "traits", (int)spec.Traits, missing);
            SetString(so, "twistType", spec.TwistType, missing);
            SetInt(so, "recommendedLevel", spec.RecommendedLevel, missing);
            SetString(so, "regionId", spec.RegionId, missing);
            SetString(so, "giverId", spec.GiverId, missing);
            SetList(so, "fallbackGiverIds", spec.FallbackGiverIds, missing);
            SetString(so, "turnInNpcId", spec.TurnInNpcId, missing);
            SetInt(so, "startTriggerKind", (int)spec.StartTriggerKind, missing);
            SetString(so, "startTriggerId", spec.StartTriggerId, missing);
            SetReference(so, "startCondition", spec.StartCondition, missing);
            SetString(so, "startStageId", spec.StartStageId, missing);
            SetList(so, "startBranches", spec.StartBranches, missing);
            SetList(so, "stages", spec.Stages, missing);
            SetList(so, "rewards", spec.Rewards, missing);
            SetList(so, "followUps", spec.FollowUps, missing);
            SetInt(so, "repeatMode", (int)spec.RepeatMode, missing);
            SetFloat(so, "cooldownHours", spec.CooldownHours, missing);
            SetBool(so, "canFail", spec.CanFail, missing);
            SetList(so, "failRules", spec.FailRules, missing);
            SetFloat(so, "deadlineHours", spec.DeadlineHours, missing);
            SetString(so, "chainId", spec.ChainId, missing);
            SetInt(so, "chainPosition", spec.ChainPosition, missing);
            SetList(so, "ledger", spec.Ledger, missing);
            SetList(so, "companionReactions", spec.CompanionReactions, missing);
            SetInt(so, "pacingMinute", spec.PacingMinute, missing);
            SetInt(so, "scopeTier", (int)spec.ScopeTier, missing);
            SetString(so, "author", spec.Author, missing);
            SetInt(so, "wordBudget", spec.WordBudget, missing);
            SetString(so, "notes", spec.Notes, missing);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(asset);
            return missing;
        }

        /// <summary>Writes a flag into an asset (all fields are replaced).</summary>
        /// <param name="asset">Flag asset.</param>
        /// <param name="spec">Flag data.</param>
        /// <returns>Names of fields that were not found on the asset.</returns>
        public static List<string> WriteFlag(FlagDefinition asset, FlagSpec spec)
        {
            if (asset == null)
            {
                throw new ArgumentNullException(nameof(asset));
            }

            if (spec == null)
            {
                throw new ArgumentNullException(nameof(spec));
            }

            var missing = new List<string>();
            var so = new SerializedObject(asset);
            SetString(so, "id", spec.Id, missing);
            SetInt(so, "status", (int)ContentStatus.Draft, missing);
            SetInt(so, "kind", (int)spec.Kind, missing);
            SetInt(so, "defaultValue", spec.DefaultValue, missing);
            SetInt(so, "min", spec.Min, missing);
            SetInt(so, "max", spec.Max, missing);
            SetList(so, "enumValues", spec.EnumValues, missing);
            SetString(so, "description", spec.Description, missing);
            SetBool(so, "carryToNewGamePlus", spec.CarryToNewGamePlus, missing);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(asset);
            return missing;
        }

        private static SerializedProperty Find(SerializedObject so, string field, List<string> missing)
        {
            SerializedProperty property = so.FindProperty(field);
            if (property == null)
            {
                missing.Add(field);
            }

            return property;
        }

        private static void SetString(SerializedObject so, string field, string value, List<string> missing)
        {
            SerializedProperty property = Find(so, field, missing);
            if (property != null)
            {
                property.stringValue = value ?? string.Empty;
            }
        }

        private static void SetInt(SerializedObject so, string field, int value, List<string> missing)
        {
            SerializedProperty property = Find(so, field, missing);
            if (property != null)
            {
                property.intValue = value;
            }
        }

        private static void SetFloat(SerializedObject so, string field, float value, List<string> missing)
        {
            SerializedProperty property = Find(so, field, missing);
            if (property != null)
            {
                property.floatValue = value;
            }
        }

        private static void SetBool(SerializedObject so, string field, bool value, List<string> missing)
        {
            SerializedProperty property = Find(so, field, missing);
            if (property != null)
            {
                property.boolValue = value;
            }
        }

        private static void SetReference(SerializedObject so, string field, object value, List<string> missing)
        {
            SerializedProperty property = Find(so, field, missing);
            if (property != null)
            {
                property.managedReferenceValue = value;
            }
        }

        private static void SetList(SerializedObject so, string field, IEnumerable values, List<string> missing)
        {
            SerializedProperty property = Find(so, field, missing);
            if (property != null)
            {
                WriteList(property, values, missing);
            }
        }

        private static void WriteList(SerializedProperty list, IEnumerable values, List<string> missing)
        {
            var items = new List<object>();
            if (values != null)
            {
                foreach (object value in values)
                {
                    items.Add(value);
                }
            }

            list.arraySize = items.Count;
            for (int i = 0; i < items.Count; i++)
            {
                WriteValue(list.GetArrayElementAtIndex(i), items[i], missing);
            }
        }

        private static void WriteValue(SerializedProperty property, object value, List<string> missing)
        {
            switch (property.propertyType)
            {
                case SerializedPropertyType.ManagedReference:
                    property.managedReferenceValue = value;
                    return;
                case SerializedPropertyType.String:
                    property.stringValue = value as string ?? string.Empty;
                    return;
                case SerializedPropertyType.Integer:
                case SerializedPropertyType.Enum:
                    property.intValue = value != null ? Convert.ToInt32(value) : 0;
                    return;
                case SerializedPropertyType.Boolean:
                    property.boolValue = value is bool flag && flag;
                    return;
                case SerializedPropertyType.Float:
                    property.floatValue = value != null ? Convert.ToSingle(value) : 0f;
                    return;
            }

            if (property.isArray)
            {
                WriteList(property, value as IEnumerable, missing);
                return;
            }

            if (value != null)
            {
                WriteObject(property, value, missing);
            }
        }

        private static void WriteObject(SerializedProperty target, object source, List<string> missing)
        {
            for (Type type = source.GetType(); type != null && type != typeof(object); type = type.BaseType)
            {
                FieldInfo[] fields = type.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly);
                for (int i = 0; i < fields.Length; i++)
                {
                    FieldInfo field = fields[i];
                    if (!IsSerialized(field))
                    {
                        continue;
                    }

                    SerializedProperty property = target.FindPropertyRelative(field.Name);
                    if (property == null)
                    {
                        missing.Add(target.propertyPath + "." + field.Name);
                        continue;
                    }

                    object value = field.GetValue(source);
                    if (Attribute.IsDefined(field, typeof(SerializeReference)))
                    {
                        if (property.isArray)
                        {
                            WriteReferenceList(property, value as IEnumerable);
                        }
                        else
                        {
                            property.managedReferenceValue = value;
                        }

                        continue;
                    }

                    WriteValue(property, value, missing);
                }
            }
        }

        private static void WriteReferenceList(SerializedProperty list, IEnumerable values)
        {
            var items = new List<object>();
            if (values != null)
            {
                foreach (object value in values)
                {
                    items.Add(value);
                }
            }

            list.arraySize = items.Count;
            for (int i = 0; i < items.Count; i++)
            {
                list.GetArrayElementAtIndex(i).managedReferenceValue = items[i];
            }
        }

        private static bool IsSerialized(FieldInfo field)
        {
            if (field.IsStatic || field.IsInitOnly || Attribute.IsDefined(field, typeof(NonSerializedAttribute)))
            {
                return false;
            }

            return field.IsPublic || Attribute.IsDefined(field, typeof(SerializeField)) || Attribute.IsDefined(field, typeof(SerializeReference));
        }
    }
}
