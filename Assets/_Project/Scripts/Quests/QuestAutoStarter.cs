using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Starts quests whose start trigger is not a person or a board (GDD 02 4.1 "Startauslöser"):
    /// <list type="bullet">
    /// <item><see cref="QuestStartTriggerKind.Automatic"/>: after every <see cref="GameLoaded"/> (new game or load) the quest
    /// starts if it has not started yet and its start conditions hold, e.g. the prologue "Asche über Eichental".</item>
    /// <item><see cref="QuestStartTriggerKind.AreaEntered"/>: entering the location named by the trigger id starts the quest,
    /// e.g. "Die vergessene Gruft" without its quest giver (GDD 02 11.7, "Ersatz").</item>
    /// </list>
    /// </summary>
    /// <remarks>Owned and disposed by <see cref="QuestService"/>. Pure logic over the event bus.</remarks>
    internal sealed class QuestAutoStarter : IDisposable
    {
        private const string SourceAutomatic = "auto";
        private const string SourceArea = "area";

        private readonly IEventBus _bus;
        private readonly IQuestService _quests;
        private readonly QuestCatalog _catalog;
        private bool _subscribed;

        /// <summary>Creates the starter and subscribes to the bus.</summary>
        /// <param name="bus">Event bus.</param>
        /// <param name="quests">Quest service that starts the quests.</param>
        /// <param name="catalog">All quests.</param>
        public QuestAutoStarter(IEventBus bus, IQuestService quests, QuestCatalog catalog)
        {
            _bus = bus ?? throw new ArgumentNullException(nameof(bus));
            _quests = quests ?? throw new ArgumentNullException(nameof(quests));
            _catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
            _bus.Subscribe<GameLoaded>(OnGameLoaded);
            _bus.Subscribe<AreaEntered>(OnAreaEntered);
            _subscribed = true;
        }

        /// <summary>Starts every automatic quest that has not started yet (also callable from tests and debug tools).</summary>
        /// <returns>Number of quests started.</returns>
        public int StartAutomaticQuests()
        {
            return StartMatching(QuestStartTriggerKind.Automatic, null, SourceAutomatic);
        }

        /// <inheritdoc />
        public void Dispose()
        {
            if (!_subscribed)
            {
                return;
            }

            _bus.Unsubscribe<GameLoaded>(OnGameLoaded);
            _bus.Unsubscribe<AreaEntered>(OnAreaEntered);
            _subscribed = false;
        }

        private void OnGameLoaded(GameLoaded evt)
        {
            StartAutomaticQuests();
        }

        private void OnAreaEntered(AreaEntered evt)
        {
            if (!string.IsNullOrEmpty(evt.AreaId))
            {
                StartMatching(QuestStartTriggerKind.AreaEntered, evt.AreaId, SourceArea);
            }
        }

        private int StartMatching(QuestStartTriggerKind kind, string triggerId, string source)
        {
            // Copy first: starting a quest may publish events that lead back here.
            var candidates = new List<string>();
            IReadOnlyList<QuestSpec> all = _catalog.All;
            for (int i = 0; i < all.Count; i++)
            {
                QuestSpec spec = all[i];
                if (spec.StartTriggerKind != kind || (triggerId != null && !string.Equals(spec.StartTriggerId, triggerId, StringComparison.Ordinal)))
                {
                    continue;
                }

                QuestStatus status = _quests.GetStatus(spec.Id);
                bool alreadyStarted = status == QuestStatus.Active || status == QuestStatus.Completed || status == QuestStatus.Failed;
                if (!alreadyStarted && _quests.CanStart(spec.Id, out _))
                {
                    candidates.Add(spec.Id);
                }
            }

            int started = 0;
            for (int i = 0; i < candidates.Count; i++)
            {
                if (_quests.TryStart(candidates[i], source))
                {
                    started++;
                    Log.Info(LogCategory.Quests, "Quest '" + candidates[i] + "' started automatically (" + kind + ").");
                }
            }

            return started;
        }
    }
}
