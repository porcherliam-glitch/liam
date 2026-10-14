using System.Collections.Generic;
using Aetherfall.Data;
using Aetherfall.Quests;
using Aetherfall.WorldState;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.Narrative
{
    /// <summary>
    /// Finds the quest data of the project for the validator: every <see cref="QuestDefinition"/> asset, the ids of all
    /// <see cref="GameDefinition"/> assets and of assets with an <see cref="IContentIdProvider"/> such as the enemy types (for
    /// "id does not exist", V04) and the <see cref="FlagDefinition"/>s (V04, V17).
    /// </summary>
    public static class QuestAssetScanner
    {
        /// <summary>All quest assets with their asset path, sorted by path.</summary>
        public static List<KeyValuePair<string, QuestDefinition>> FindQuests()
        {
            var result = new List<KeyValuePair<string, QuestDefinition>>();
            string[] guids = AssetDatabase.FindAssets("t:" + nameof(QuestDefinition));
            for (int i = 0; i < guids.Length; i++)
            {
                string path = AssetDatabase.GUIDToAssetPath(guids[i]);
                var quest = AssetDatabase.LoadAssetAtPath<QuestDefinition>(path);
                if (quest != null)
                {
                    result.Add(new KeyValuePair<string, QuestDefinition>(path, quest));
                }
            }

            result.Sort((a, b) => string.CompareOrdinal(a.Key, b.Key));
            return result;
        }

        /// <summary>
        /// Builds the lookup from all definition assets of the project. Without any flag definition the flag checks are skipped
        /// (<paramref name="flagCheckSkipped"/>), so an early project is not flooded with "flag not defined".
        /// </summary>
        /// <param name="flagCheckSkipped">True if no flag definition exists.</param>
        public static QuestValidationLookup BuildLookup(out bool flagCheckSkipped)
        {
            var ids = new List<string>();
            FlagRegistry flags = new FlagRegistry();
            string[] guids = AssetDatabase.FindAssets("t:ScriptableObject", new[] { "Assets" });
            for (int i = 0; i < guids.Length; i++)
            {
                string path = AssetDatabase.GUIDToAssetPath(guids[i]);
                if (!path.EndsWith(".asset"))
                {
                    continue;
                }

                var asset = AssetDatabase.LoadAssetAtPath<ScriptableObject>(path);
                if (asset is IContentIdProvider provider)
                {
                    // Content that is not a GameDefinition yet (enemy types of the AI): its id exists for the validator.
                    if (!string.IsNullOrEmpty(provider.ContentId))
                    {
                        ids.Add(provider.ContentId);
                    }

                    continue;
                }

                var definition = asset as GameDefinition;
                if (definition == null || definition.Id.Length == 0)
                {
                    continue;
                }

                ids.Add(definition.Id);
                if (definition is FlagDefinition flag)
                {
                    flags.Add(flag.CreateSpec());
                }
            }

            flagCheckSkipped = flags.Count == 0;
            return new QuestValidationLookup(ids, flagCheckSkipped ? null : flags);
        }
    }
}
