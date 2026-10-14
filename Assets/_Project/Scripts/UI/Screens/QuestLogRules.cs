using System;
using Aetherfall.Quests;
using Aetherfall.UI.Framework;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Pure rules of the quest log (GDD 02 7.1, GDD 05 1.9): which tab a quest belongs to, the German category names, the
    /// category colour classes and the text of an objective.
    /// </summary>
    public static class QuestLogRules
    {
        /// <summary>Number of tabs.</summary>
        public const int TabCount = 7;

        /// <summary>Prefix of the text keys of the category names (<c>quest-category-side</c>, UiTexts).</summary>
        public const string CategoryTextPrefix = "quest-category-";

        /// <summary>Prefix of the category colour classes (<c>af-cat--main</c> …, Journal.uss).</summary>
        public const string CategoryClassPrefix = "af-cat--";

        private static readonly string[] TabElementNames =
        {
            "questlog-cat-main", "questlog-cat-faction", "questlog-cat-region", "questlog-cat-side", "questlog-cat-companion", "questlog-cat-contracts",
            "questlog-cat-done"
        };

        /// <summary>Name of the tab button in Journal.uxml.</summary>
        /// <param name="tab">Tab.</param>
        public static string TabElementName(QuestLogTab tab)
        {
            int index = (int)tab;
            return index >= 0 && index < TabElementNames.Length ? TabElementNames[index] : TabElementNames[0];
        }

        /// <summary>The tab of an active quest of a category (GDD 02 7.1).</summary>
        /// <param name="category">Category.</param>
        public static QuestLogTab TabOf(QuestCategory category)
        {
            switch (category)
            {
                case QuestCategory.Main:
                    return QuestLogTab.Main;
                case QuestCategory.Faction:
                    return QuestLogTab.Faction;
                case QuestCategory.Region:
                    return QuestLogTab.Region;
                case QuestCategory.Companion:
                    return QuestLogTab.Companion;
                case QuestCategory.Bounty:
                case QuestCategory.Daily:
                case QuestCategory.Weekly:
                case QuestCategory.Procedural:
                case QuestCategory.WorldEvent:
                    return QuestLogTab.Contracts;
                default:
                    return QuestLogTab.Side;
            }
        }

        /// <summary>The tab of a started quest: finished quests go to "Abgeschlossen", running ones to their category tab.</summary>
        /// <param name="spec">Quest data.</param>
        /// <param name="instance">Quest state.</param>
        public static QuestLogTab TabOf(QuestSpec spec, QuestInstance instance)
        {
            if (instance != null && instance.IsFinished)
            {
                return QuestLogTab.Completed;
            }

            return spec != null ? TabOf(spec.Category) : QuestLogTab.Side;
        }

        /// <summary>True if the quest log lists the quest (started: active, completed or failed).</summary>
        /// <param name="instance">Quest state (may be null).</param>
        public static bool IsListed(QuestInstance instance)
        {
            return instance != null && (instance.IsActive || instance.IsFinished);
        }

        /// <summary>Text key of the German category name (<c>quest-category-side</c> = "Nebenquest").</summary>
        /// <param name="category">Category.</param>
        public static string CategoryTextKey(QuestCategory category)
        {
            return CategoryTextPrefix + CategoryId(category);
        }

        /// <summary>German category name, e.g. "Nebenquest".</summary>
        /// <param name="category">Category.</param>
        public static string CategoryName(QuestCategory category)
        {
            return UiTexts.Get(CategoryTextKey(category));
        }

        /// <summary>Colour class of a category (GDD 05 1.9), e.g. <c>af-cat--main</c>.</summary>
        /// <param name="category">Category.</param>
        public static string CategoryClass(QuestCategory category)
        {
            switch (category)
            {
                case QuestCategory.Main: return CategoryClassPrefix + "main";
                case QuestCategory.Faction: return CategoryClassPrefix + "faction";
                case QuestCategory.Region: return CategoryClassPrefix + "region";
                case QuestCategory.Companion: return CategoryClassPrefix + "companion";
                case QuestCategory.Bounty: return CategoryClassPrefix + "bounty";
                case QuestCategory.Treasure: return CategoryClassPrefix + "treasure";
                case QuestCategory.Craft: return CategoryClassPrefix + "crafting";
                case QuestCategory.Legendary: return CategoryClassPrefix + "legendary";
                case QuestCategory.Daily:
                case QuestCategory.Weekly:
                case QuestCategory.Procedural:
                    return CategoryClassPrefix + "repeatable";
                default:
                    return CategoryClassPrefix + "side";
            }
        }

        /// <summary>All category colour classes (to remove the old one before setting a new one).</summary>
        public static readonly string[] AllCategoryClasses =
        {
            CategoryClassPrefix + "main", CategoryClassPrefix + "faction", CategoryClassPrefix + "region", CategoryClassPrefix + "side",
            CategoryClassPrefix + "companion", CategoryClassPrefix + "bounty", CategoryClassPrefix + "treasure", CategoryClassPrefix + "crafting",
            CategoryClassPrefix + "repeatable", CategoryClassPrefix + "legendary"
        };

        /// <summary>The text of an objective: its journal text, otherwise the short form (<c>Toete(enemy.wolf, 3)</c>).</summary>
        /// <param name="objective">Objective (may be null).</param>
        public static string ObjectiveText(QuestObjective objective)
        {
            if (objective == null)
            {
                return string.Empty;
            }

            string text = objective.JournalText;
            return text.Length > 0 ? text : objective.Describe();
        }

        /// <summary>Splits a stage-qualified objective id (<c>s10.o1</c>, payload of ObjectiveProgressed).</summary>
        /// <param name="key">Stage-qualified id.</param>
        /// <param name="stageId">Stage id.</param>
        /// <param name="objectiveId">Objective id.</param>
        /// <returns>False if the key has no dot.</returns>
        public static bool TrySplitObjectiveKey(string key, out string stageId, out string objectiveId)
        {
            int dot = string.IsNullOrEmpty(key) ? -1 : key.LastIndexOf('.');
            if (dot <= 0 || dot >= key.Length - 1)
            {
                stageId = string.Empty;
                objectiveId = string.Empty;
                return false;
            }

            stageId = key.Substring(0, dot);
            objectiveId = key.Substring(dot + 1);
            return true;
        }

        /// <summary>Finds an objective definition of a quest.</summary>
        /// <param name="spec">Quest data.</param>
        /// <param name="stageId">Stage id.</param>
        /// <param name="objectiveId">Objective id.</param>
        /// <param name="objective">Objective or null.</param>
        public static bool TryGetObjective(QuestSpec spec, string stageId, string objectiveId, out QuestObjective objective)
        {
            objective = null;
            if (spec == null || !spec.TryGetStage(stageId, out StageDefinition stage))
            {
                return false;
            }

            int index = stage.IndexOfObjective(objectiveId);
            objective = index >= 0 ? stage.Objectives[index] : null;
            return objective != null;
        }

        /// <summary>Id of a category in text keys and data (<c>main</c>, <c>side</c>, <c>procedural</c> …).</summary>
        /// <param name="category">Category.</param>
        public static string CategoryId(QuestCategory category)
        {
            switch (category)
            {
                case QuestCategory.Main: return "main";
                case QuestCategory.Faction: return "faction";
                case QuestCategory.Region: return "region";
                case QuestCategory.Side: return "side";
                case QuestCategory.Companion: return "companion";
                case QuestCategory.Bounty: return "bounty";
                case QuestCategory.Treasure: return "treasure";
                case QuestCategory.Dungeon: return "dungeon";
                case QuestCategory.Craft: return "craft";
                case QuestCategory.Puzzle: return "puzzle";
                case QuestCategory.Legendary: return "legendary";
                case QuestCategory.Daily: return "daily";
                case QuestCategory.Weekly: return "weekly";
                case QuestCategory.Procedural: return "procedural";
                case QuestCategory.WorldEvent: return "event";
                default: return "side";
            }
        }

        /// <summary>Text of a recommended level (number, at least 1).</summary>
        /// <param name="level">Level.</param>
        public static string LevelText(int level)
        {
            return Math.Max(1, level).ToString(System.Globalization.CultureInfo.InvariantCulture);
        }
    }
}
