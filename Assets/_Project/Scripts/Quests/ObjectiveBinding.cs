using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Connects one objective of an active stage with its run-time state while the stage is active: the objective registers
    /// its events and conditions through it (<see cref="IObjectiveEventRegistry"/>), the quest service removes everything
    /// with it when the stage ends.
    /// </summary>
    internal sealed class ObjectiveBinding : IObjectiveEventRegistry
    {
        private readonly QuestService _service;

        public ObjectiveBinding(QuestService service, QuestInstance instance, string stageId, QuestObjective objective, ObjectiveRuntime runtime)
        {
            _service = service;
            Instance = instance;
            StageId = stageId;
            Objective = objective;
            Runtime = runtime;
            Active = true;
        }

        public QuestInstance Instance { get; }

        public string StageId { get; }

        public QuestObjective Objective { get; }

        public ObjectiveRuntime Runtime { get; }

        public bool Active { get; set; }

        public List<ObjectiveEventRouter.IChannel> Channels { get; } = new List<ObjectiveEventRouter.IChannel>();

        public List<int> WatchIds { get; } = new List<int>();

        public void Listen<TEvent>(IObjectiveListener<TEvent> listener) where TEvent : struct, IGameEvent
        {
            if (listener == null)
            {
                return;
            }

            _service.Router.Add(this, listener);
        }

        public void WatchCondition(Condition condition, IObjectiveConditionListener listener)
        {
            if (listener == null)
            {
                return;
            }

            _service.WatchObjectiveCondition(this, condition, listener);
        }
    }
}
