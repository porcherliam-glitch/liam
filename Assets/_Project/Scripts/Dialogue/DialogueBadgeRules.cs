using System;
using System.Collections.Generic;
using Aetherfall.Conditions;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Which actions mark an option (GDD 02, 12.4: "Kennzeichen werden aus Proben und Aktionen der Option abgeleitet"). Actions
    /// that implement <see cref="IDialogueBadgeSource"/> say it themselves. Actions of assemblies that may not reference
    /// Dialogue (Quests no. 26 and Inventory no. 13, architecture 3.2) are recognised by their frozen class name (architecture
    /// 7.6): <c>StartQuest</c> → "!", <c>SetQuestStage</c> → diamond, <c>CompleteQuest</c> → star, <c>RemoveCurrency</c> → gold.
    /// </summary>
    /// <remarks>The result per action type is cached; the table can be extended (<see cref="Map"/>) by installers.</remarks>
    public sealed class DialogueBadgeRules
    {
        private readonly Dictionary<string, DialogueOptionMarks> _byName = new Dictionary<string, DialogueOptionMarks>(StringComparer.Ordinal);
        private readonly Dictionary<Type, DialogueOptionMarks> _cache = new Dictionary<Type, DialogueOptionMarks>();

        /// <summary>Creates the rules with the default table.</summary>
        public DialogueBadgeRules()
        {
            Map("StartQuest", DialogueOptionMarks.NewQuest);
            Map("SetQuestStage", DialogueOptionMarks.QuestProgress);
            Map("CompleteQuest", DialogueOptionMarks.QuestComplete);
            Map("RemoveCurrency", DialogueOptionMarks.Bribe);
        }

        /// <summary>Maps an action class name to markings (replaces an earlier entry).</summary>
        /// <param name="actionTypeName">Class name without namespace, e.g. <c>StartQuest</c>.</param>
        /// <param name="marks">Markings.</param>
        public void Map(string actionTypeName, DialogueOptionMarks marks)
        {
            if (string.IsNullOrEmpty(actionTypeName))
            {
                return;
            }

            _byName[actionTypeName] = marks;
            _cache.Clear();
        }

        /// <summary>Markings of one action (none for null).</summary>
        /// <param name="action">Action.</param>
        public DialogueOptionMarks MarksOf(GameAction action)
        {
            if (action == null)
            {
                return DialogueOptionMarks.None;
            }

            if (action is IDialogueBadgeSource source)
            {
                return source.DialogueMarks;
            }

            Type type = action.GetType();
            if (!_cache.TryGetValue(type, out DialogueOptionMarks marks))
            {
                _byName.TryGetValue(type.Name, out marks);
                _cache[type] = marks;
            }

            return marks;
        }

        /// <summary>Markings of a list of actions.</summary>
        /// <param name="actions">Actions (null = none).</param>
        public DialogueOptionMarks MarksOf(IReadOnlyList<GameAction> actions)
        {
            DialogueOptionMarks marks = DialogueOptionMarks.None;
            if (actions == null)
            {
                return marks;
            }

            for (int i = 0; i < actions.Count; i++)
            {
                marks |= MarksOf(actions[i]);
            }

            return marks;
        }
    }
}
