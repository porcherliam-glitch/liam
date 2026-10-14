using Aetherfall.Conditions;
using Aetherfall.Core;

namespace Aetherfall.Quests
{
    /// <summary>
    /// What an objective may use while it handles an event (architecture 11.7): the running quest and stage, service access
    /// for conditions and actions, and the inventory count for "collect" objectives.
    /// </summary>
    public readonly struct QuestContext
    {
        /// <summary>Quest id.</summary>
        public readonly string QuestId;

        /// <summary>Local id of the active stage.</summary>
        public readonly string StageId;

        /// <summary>Service access (may be null in tests without services).</summary>
        public readonly IServiceLocator Services;

        /// <summary>Inventory count (may be null in tests without inventory).</summary>
        public readonly IQuestInventory Inventory;

        /// <summary>Creates the context.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="stageId">Stage id.</param>
        /// <param name="services">Service access.</param>
        /// <param name="inventory">Inventory count.</param>
        public QuestContext(string questId, string stageId, IServiceLocator services, IQuestInventory inventory)
        {
            QuestId = questId ?? string.Empty;
            StageId = stageId ?? string.Empty;
            Services = services;
            Inventory = inventory;
        }

        /// <summary>Condition context with the player as subject and the quest as source.</summary>
        public ConditionContext ToConditionContext()
        {
            return new ConditionContext(Services, SubjectIds.Player, string.Empty, QuestId);
        }

        /// <summary>Action context with the player as subject and the quest as source.</summary>
        public ActionContext ToActionContext()
        {
            return new ActionContext(Services, SubjectIds.Player, string.Empty, QuestId);
        }

        /// <summary>Global id of an objective of the active stage (<c>quest.….s40.o1</c>).</summary>
        /// <param name="objectiveId">Local objective id.</param>
        public string GlobalObjectiveId(string objectiveId)
        {
            return QuestIds.GlobalObjectiveId(QuestId, StageId, objectiveId);
        }

        /// <summary>Number of pieces the player owns (0 without inventory).</summary>
        /// <param name="itemId">Item id.</param>
        public int CountItem(string itemId)
        {
            return Inventory != null ? Inventory.CountOf(itemId) : 0;
        }
    }
}
