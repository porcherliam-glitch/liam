using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.GameTime;
using Aetherfall.SaveSystem;
using Aetherfall.WorldState;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Default <see cref="IQuestService"/> (architecture 11.7). Pure logic: everything comes in through the constructor
    /// (event bus, catalog, condition watcher, inventory count, world state, playtime, save locks), so quest paths can be
    /// tested with artificial events (GDD 02 10.3).
    /// </summary>
    /// <remarks>
    /// <para><b>Flow:</b> start (start conditions, start stage, auto tracking) → stage start (event <c>QuestStageChanged</c>,
    /// start actions, objectives register their events) → objectives progress on events (<c>ObjectiveProgressed</c>, bonus
    /// actions of fulfilled objectives) → stage done (completion actions, ledger entry, branches top-down, default exit) → end
    /// stage: success (rewards, follow-up quests, <c>QuestCompleted</c>) or failure (<c>QuestFailed</c>). Fail rules of the
    /// quest and of the active stage are watched by the condition watcher.</para>
    /// <para><b>Re-entrancy:</b> actions and events can start other quests or progress other objectives while a stage
    /// changes. All state changes that follow from an event are queued and processed in order once the outermost call
    /// finishes, so a stage never changes in the middle of another stage change, and an event that finished stage A is not
    /// delivered to stage B.</para>
    /// <para><b>Saving:</b> state is set by <see cref="QuestSaveable"/> without events; objectives are re-bound in
    /// <see cref="CompleteLoad"/> (architecture 9.1 "OnAfterLoad").</para>
    /// </remarks>
    public sealed class QuestService : IQuestService, ITickable, IDisposable, ISessionService, IPostInitializable
    {
        /// <summary>Most tracked quests at the same time (§16.6).</summary>
        public const int MaxTrackedQuests = 3;

        /// <summary>Localization key of the save lock of time-critical stages (GDD 05, 5.2).</summary>
        public const string SaveLockReasonKey = "save.blocked.quest_stage";

        /// <summary>Reason id when a required objective failed and the stage can no longer be done.</summary>
        public const string ObjectiveFailedReason = "objective_failed";

        private const int MaxWorkItems = 10000;
        private const float CooldownCheckInterval = 1f;
        private const string SaveLockPrefix = "quest.";

        private readonly IEventBus _bus;
        private readonly IServiceLocator _services;
        private readonly IConditionWatcher _watcher;
        private readonly IQuestInventory _inventory;
        private readonly IWorldState _worldState;
        private readonly IPlaytimeClock _clock;
        private readonly ISaveManager _saveManager;
        private readonly QuestAvailabilityService _availability;
        private readonly QuestAutoStarter _autoStarter;
        private readonly Dictionary<string, QuestInstance> _instances = new Dictionary<string, QuestInstance>(StringComparer.Ordinal);
        private readonly List<QuestInstance> _order = new List<QuestInstance>();
        private readonly Dictionary<string, List<ObjectiveBinding>> _bindings = new Dictionary<string, List<ObjectiveBinding>>(StringComparer.Ordinal);
        private readonly Dictionary<string, List<int>> _stageRuleWatches = new Dictionary<string, List<int>>(StringComparer.Ordinal);
        private readonly Dictionary<string, List<int>> _questRuleWatches = new Dictionary<string, List<int>>(StringComparer.Ordinal);
        private readonly HashSet<string> _saveLocks = new HashSet<string>(StringComparer.Ordinal);
        private readonly List<ObjectiveBinding> _timed = new List<ObjectiveBinding>();
        private readonly List<ObjectiveBinding> _timedScratch = new List<ObjectiveBinding>();
        private readonly List<string> _tracked = new List<string>();
        private readonly Queue<WorkItem> _work = new Queue<WorkItem>();
        private string _focus = string.Empty;
        private int _workDepth;
        private bool _draining;
        private int _notifiedRevision;
        private float _cooldownTimer;
        private bool _disposed;

        /// <summary>Creates the service.</summary>
        /// <param name="bus">Event bus (objective events in, quest events out).</param>
        /// <param name="catalog">All quests.</param>
        /// <param name="services">Service access for conditions and actions (may be null in tests without services).</param>
        /// <param name="watcher">Condition watcher (availability, fail rules, condition objectives).</param>
        /// <param name="inventory">Inventory count for collect objectives (may be null).</param>
        /// <param name="worldState">World state for the quest-local flags (may be null).</param>
        /// <param name="clock">Active playtime (may be null = 0).</param>
        /// <param name="saveManager">Save locks of time-critical stages (may be null).</param>
        public QuestService(IEventBus bus, QuestCatalog catalog, IServiceLocator services, IConditionWatcher watcher, IQuestInventory inventory,
                            IWorldState worldState, IPlaytimeClock clock, ISaveManager saveManager)
        {
            _bus = bus ?? throw new ArgumentNullException(nameof(bus));
            Catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
            _watcher = watcher ?? throw new ArgumentNullException(nameof(watcher));
            _services = services;
            _inventory = inventory;
            _worldState = worldState;
            _clock = clock;
            _saveManager = saveManager;
            Router = new ObjectiveEventRouter(bus, this);
            _availability = new QuestAvailabilityService(this, bus, watcher, catalog, services);
            _autoStarter = new QuestAutoStarter(bus, this, catalog);
        }

        /// <inheritdoc />
        public event Action Changed;

        /// <inheritdoc />
        public int Revision { get; private set; }

        /// <inheritdoc />
        public QuestCatalog Catalog { get; }

        /// <inheritdoc />
        public IReadOnlyList<QuestInstance> Instances => _order;

        /// <inheritdoc />
        public IReadOnlyList<string> TrackedQuestIds => _tracked;

        /// <inheritdoc />
        public string FocusQuestId => _focus;

        /// <summary>Availability of quests with a giver (start conditions watched).</summary>
        public QuestAvailabilityService Availability => _availability;

        /// <summary>Number of event types the router subscribed to (each once).</summary>
        public int RoutedEventTypeCount => Router.ChannelCount;

        internal ObjectiveEventRouter Router { get; }

        private double Playtime => _clock != null ? _clock.PlaytimeSeconds : 0.0;

        /// <inheritdoc />
        public QuestStatus GetStatus(string questId)
        {
            if (questId != null && _instances.TryGetValue(questId, out QuestInstance instance) && instance.Status != QuestStatus.Unknown)
            {
                // A repeatable quest goes back from "completed" to "available" after its cool-down (GDD 02, 4.3).
                return instance.IsFinished && _availability.IsAvailable(questId) ? QuestStatus.Available : instance.Status;
            }

            return _availability.IsAvailable(questId) ? QuestStatus.Available : QuestStatus.Unknown;
        }

        /// <inheritdoc />
        public int GetAvailableQuestIds(string giverId, List<string> results)
        {
            if (results == null)
            {
                throw new ArgumentNullException(nameof(results));
            }

            results.Clear();
            foreach (string questId in _availability.AvailableQuestIds)
            {
                if (!Catalog.TryGet(questId, out QuestSpec spec) || spec.Has(QuestTraits.Hidden))
                {
                    continue;
                }

                if (string.IsNullOrEmpty(giverId) || spec.GiverId == giverId)
                {
                    results.Add(questId);
                }
            }

            results.Sort(string.CompareOrdinal);
            return results.Count;
        }

        /// <inheritdoc />
        public bool TryGetInstance(string questId, out QuestInstance instance)
        {
            if (questId == null)
            {
                instance = null;
                return false;
            }

            return _instances.TryGetValue(questId, out instance);
        }

        /// <inheritdoc />
        public bool CanStart(string questId, out string reason)
        {
            if (!Catalog.TryGet(questId, out QuestSpec spec))
            {
                reason = "Quest '" + questId + "' gibt es nicht.";
                return false;
            }

            return CanStart(spec, false, out reason);
        }

        /// <inheritdoc />
        public bool TryStart(string questId, string sourceId)
        {
            return Start(questId, sourceId, false);
        }

        /// <inheritdoc />
        public bool TryStartForced(string questId, string sourceId)
        {
            return Start(questId, sourceId, true);
        }

        /// <inheritdoc />
        public bool TrySetStage(string questId, string stageId, string sourceId)
        {
            if (!TryGetActive(questId, out QuestInstance instance, out QuestSpec spec) || !spec.TryGetStage(stageId, out _))
            {
                Log.Warning(LogCategory.Quests, "Quest '" + questId + "': cannot jump to stage '" + stageId + "' (not active or unknown stage, source '" + sourceId + "').");
                return false;
            }

            BeginWork();
            try
            {
                EnterStage(instance, spec, stageId, instance.StageId);
            }
            finally
            {
                EndWork();
            }

            return true;
        }

        /// <inheritdoc />
        public bool TryComplete(string questId, string sourceId)
        {
            if (!TryGetActive(questId, out QuestInstance instance, out _))
            {
                return false;
            }

            BeginWork();
            try
            {
                FinishQuest(instance, true, instance.StageId, string.Empty);
            }
            finally
            {
                EndWork();
            }

            return true;
        }

        /// <inheritdoc />
        public bool TryFail(string questId, string reasonId)
        {
            if (!TryGetActive(questId, out QuestInstance instance, out _))
            {
                return false;
            }

            BeginWork();
            try
            {
                FinishQuest(instance, false, instance.StageId, reasonId);
            }
            finally
            {
                EndWork();
            }

            return true;
        }

        /// <inheritdoc />
        public bool TryCompleteObjective(string questId, string objectiveId)
        {
            ObjectiveBinding binding = FindBinding(questId, objectiveId);
            if (binding == null)
            {
                return false;
            }

            BeginWork();
            try
            {
                binding.Runtime.Complete();
                AfterRuntimeChange(binding);
            }
            finally
            {
                EndWork();
            }

            return true;
        }

        /// <inheritdoc />
        public bool TrySetObjectiveProgress(string questId, string objectiveId, int progress)
        {
            ObjectiveBinding binding = FindBinding(questId, objectiveId);
            if (binding == null)
            {
                return false;
            }

            BeginWork();
            try
            {
                binding.Runtime.Set(progress);
                AfterRuntimeChange(binding);
            }
            finally
            {
                EndWork();
            }

            return true;
        }

        /// <inheritdoc />
        public bool ResetQuest(string questId)
        {
            if (questId == null || !_instances.TryGetValue(questId, out QuestInstance instance))
            {
                return false;
            }

            BeginWork();
            try
            {
                UnbindStage(instance);
                UnwatchQuestRules(instance);
                _instances.Remove(questId);
                _order.Remove(instance);
                Untrack(questId);
                if (_services != null && _services.TryGet(out IWorldStateDebug debug))
                {
                    debug.ResetFlagsWrittenBy(questId, "debug");
                }

                if (_worldState != null)
                {
                    _worldState.ResetPrefix(QuestIds.LocalFlagPrefix(questId), "debug");
                }

                Revision++;
                _availability.Refresh(questId);
                Log.Info(LogCategory.Quests, "Quest '" + questId + "' reset (debug).");
            }
            finally
            {
                EndWork();
            }

            return true;
        }

        /// <inheritdoc />
        public bool IsStageReached(string questId, string stageId)
        {
            return TryGetInstance(questId, out QuestInstance instance) && instance.Status != QuestStatus.Unknown && instance.HasVisited(stageId);
        }

        /// <inheritdoc />
        public bool IsObjectiveDone(string questId, string stageId, string objectiveId)
        {
            if (!TryGetInstance(questId, out QuestInstance instance) || instance.Status == QuestStatus.Unknown)
            {
                return false;
            }

            if (string.IsNullOrEmpty(stageId) || stageId == instance.StageId)
            {
                return instance.TryGetObjective(objectiveId, out ObjectiveState state) && state.Done;
            }

            foreach (string key in instance.CompletedObjectives)
            {
                if (key == QuestIds.StageObjectiveKey(stageId, objectiveId))
                {
                    return true;
                }
            }

            return false;
        }

        /// <inheritdoc />
        public bool IsObjectiveVisible(string questId, string objectiveId)
        {
            if (!TryGetInstance(questId, out QuestInstance instance) || !instance.IsActive || !Catalog.TryGet(questId, out QuestSpec spec) ||
                !spec.TryGetStage(instance.StageId, out StageDefinition stage))
            {
                return false;
            }

            int index = stage.IndexOfObjective(objectiveId);
            QuestObjective objective = index >= 0 ? stage.Objectives[index] : null;
            if (objective == null)
            {
                return false;
            }

            Condition visible = objective.VisibleCondition;
            return visible == null || ConditionEvaluator.IsMet(visible, CreateContext(questId, stage.Id).ToConditionContext());
        }

        /// <inheritdoc />
        public bool TryGetChoice(string questId, string stageObjectiveKey, out string optionId)
        {
            optionId = string.Empty;
            return TryGetInstance(questId, out QuestInstance instance) && stageObjectiveKey != null &&
                   instance.Choices.TryGetValue(stageObjectiveKey, out optionId);
        }

        /// <inheritdoc />
        public bool AddLedgerEntry(string questId, string entryId)
        {
            if (!TryGetInstance(questId, out QuestInstance instance) || !Catalog.TryGet(questId, out QuestSpec spec))
            {
                Log.Warning(LogCategory.Quests, "Ledger entry '" + entryId + "' for quest '" + questId + "' ignored: the quest was never started.");
                return false;
            }

            BeginWork();
            try
            {
                return AddLedger(instance, spec, entryId);
            }
            finally
            {
                EndWork();
            }
        }

        /// <inheritdoc />
        public List<QuestLedgerLine> GetLedger(string questId)
        {
            var lines = new List<QuestLedgerLine>();
            if (!TryGetInstance(questId, out QuestInstance instance) || !Catalog.TryGet(questId, out QuestSpec spec))
            {
                return lines;
            }

            IReadOnlyList<string> entries = instance.LedgerEntries;
            for (int i = 0; i < entries.Count; i++)
            {
                if (!spec.TryGetLedgerEntry(entries[i], out LedgerEntryDefinition entry))
                {
                    continue;
                }

                if (entry.VisibleCondition != null && !ConditionEvaluator.IsMet(entry.VisibleCondition, ConditionContextFor(questId)))
                {
                    continue;
                }

                lines.Add(new QuestLedgerLine(entry.Id, entry.Text, entry.IsConsequence));
            }

            return lines;
        }

        /// <inheritdoc />
        public bool IsTracked(string questId)
        {
            return questId != null && _tracked.Contains(questId);
        }

        /// <inheritdoc />
        public bool TrySetTracked(string questId, bool tracked)
        {
            if (!tracked)
            {
                if (!_tracked.Contains(questId))
                {
                    return true;
                }

                Untrack(questId);
                MarkChanged();
                return true;
            }

            if (!TryGetActive(questId, out _, out _))
            {
                return false;
            }

            if (_tracked.Contains(questId))
            {
                return true;
            }

            if (_tracked.Count >= MaxTrackedQuests)
            {
                return false;
            }

            _tracked.Add(questId);
            if (_focus.Length == 0)
            {
                _focus = questId;
            }

            MarkChanged();
            return true;
        }

        /// <inheritdoc />
        public bool TrySetFocus(string questId)
        {
            if (!TrySetTracked(questId, true))
            {
                return false;
            }

            _focus = questId;
            MarkChanged();
            return true;
        }

        /// <summary>Counts time limits of active objectives down and re-offers repeatable quests after their cool-down.</summary>
        /// <param name="deltaTime">Scaled frame time in seconds.</param>
        public void Tick(float deltaTime)
        {
            if (_disposed)
            {
                return;
            }

            if (_timed.Count > 0 && deltaTime > 0f)
            {
                BeginWork();
                try
                {
                    _timedScratch.Clear();
                    _timedScratch.AddRange(_timed);
                    for (int i = 0; i < _timedScratch.Count; i++)
                    {
                        ObjectiveBinding binding = _timedScratch[i];
                        if (!binding.Active || !binding.Runtime.CountDown(deltaTime))
                        {
                            continue;
                        }

                        QuestContext ctx = CreateContext(binding.Instance.QuestId, binding.StageId);
                        try
                        {
                            binding.Objective.OnTimerExpired(binding.Runtime, ctx);
                        }
                        catch (Exception exception)
                        {
                            Log.Exception(LogCategory.Quests, exception, "OnTimerExpired of " + binding.Objective.GetType().Name + " in '" + binding.Instance.QuestId + "'");
                        }

                        AfterRuntimeChange(binding);
                    }
                }
                finally
                {
                    _timedScratch.Clear();
                    EndWork();
                }
            }

            _cooldownTimer += deltaTime;
            if (_cooldownTimer >= CooldownCheckInterval)
            {
                _cooldownTimer = 0f;
                BeginWork();
                try
                {
                    _availability.CheckCooldowns();
                }
                finally
                {
                    EndWork();
                }
            }
        }

        /// <summary>Starts watching the start conditions of all quests with a giver (boot step 18).</summary>
        public void PostInitialize()
        {
            BeginWork();
            try
            {
                _availability.Rebuild();
            }
            finally
            {
                EndWork();
            }
        }

        /// <inheritdoc />
        public void BeginSession()
        {
        }

        /// <summary>Releases all objective bindings and watches and forgets the state (main menu, before another load).</summary>
        public void EndSession()
        {
            ClearState();
        }

        /// <summary>Unsubscribes from all events and releases every watch.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            ClearState();
            Router.Dispose();
            _availability.Dispose();
            _autoStarter.Dispose();
            _disposed = true;
        }

        /// <summary>
        /// Load step 1 (<see cref="ISaveable.Load"/>): forgets the current state without events. Followed by
        /// <see cref="RestoreInstance"/> per saved quest and <see cref="CompleteLoad"/> after all systems loaded.
        /// </summary>
        public void ClearState()
        {
            for (int i = 0; i < _order.Count; i++)
            {
                UnbindStage(_order[i]);
                UnwatchQuestRules(_order[i]);
            }

            _instances.Clear();
            _order.Clear();
            _tracked.Clear();
            _focus = string.Empty;
            _work.Clear();
            _availability.Clear();
            Revision++;
        }

        /// <summary>Load step 2: adds a saved quest state (no events, no bindings yet).</summary>
        /// <param name="instance">State.</param>
        /// <param name="tracked">True if it was tracked.</param>
        public void RestoreInstance(QuestInstance instance, bool tracked)
        {
            if (instance == null || instance.QuestId.Length == 0 || _instances.ContainsKey(instance.QuestId))
            {
                return;
            }

            _instances.Add(instance.QuestId, instance);
            _order.Add(instance);
            if (tracked && instance.IsActive && _tracked.Count < MaxTrackedQuests)
            {
                _tracked.Add(instance.QuestId);
            }
        }

        /// <summary>Load step 2: restores the focus quest (must be tracked; otherwise the best tracked quest).</summary>
        /// <param name="questId">Focus quest id.</param>
        public void RestoreFocus(string questId)
        {
            _focus = questId != null && _tracked.Contains(questId) ? questId : PickFocus();
        }

        /// <summary>
        /// Load step 3 (<see cref="IPostLoad.OnAfterLoad"/>): binds the objectives of active stages again (objectives reconcile
        /// with other systems, e.g. collect counts the inventory), watches fail rules and start conditions again and marks every
        /// watched condition for re-evaluation (architecture 9.2 "ConditionWatcher einmal komplett"). An active quest whose saved
        /// stage no longer exists continues at the stage of <see cref="ResolveLostStage"/> with fresh objective states (no
        /// events, no stage actions).
        /// </summary>
        public void CompleteLoad()
        {
            BeginWork();
            try
            {
                for (int i = 0; i < _order.Count; i++)
                {
                    QuestInstance instance = _order[i];
                    if (!instance.IsActive)
                    {
                        continue;
                    }

                    if (!Catalog.TryGet(instance.QuestId, out QuestSpec spec) || !TryGetLoadedStage(instance, spec, out StageDefinition stage))
                    {
                        Log.Error(LogCategory.Quests, "Quest '" + instance.QuestId + "': stage '" + instance.StageId + "' of the save no longer exists; the quest stays at it.");
                        continue;
                    }

                    WatchQuestRules(instance, spec);
                    BindStage(instance, stage, true);
                    EnqueueCheck(instance);
                }

                _availability.Rebuild();
                _watcher.MarkAllDirty();
                Revision++;
            }
            finally
            {
                EndWork();
            }
        }

        /// <summary>
        /// Load fallback (<see cref="CompleteLoad"/>): the stage a running quest continues at when its saved stage no longer
        /// exists in the data. Takes the last visited stage that still exists and continues at the stage that follows it
        /// (branches and default exit, evaluated now) - after a renamed stage that is the stage under its new id. Without such
        /// an exit it is that visited stage itself, without any visited stage the start stage. Empty only for a quest
        /// without stages. Runs no actions.
        /// </summary>
        /// <param name="spec">Quest data.</param>
        /// <param name="visitedStages">Visited stages of the save, in order.</param>
        internal string ResolveLostStage(QuestSpec spec, IReadOnlyList<string> visitedStages)
        {
            if (visitedStages != null)
            {
                for (int i = visitedStages.Count - 1; i >= 0; i--)
                {
                    if (!spec.TryGetStage(visitedStages[i], out StageDefinition last))
                    {
                        continue;
                    }

                    string next = last.IsEndStage ? string.Empty : ResolveNext(spec, last);
                    return next.Length > 0 && spec.TryGetStage(next, out _) ? next : last.Id;
                }
            }

            return ResolveStartStage(spec);
        }

        private bool TryGetLoadedStage(QuestInstance instance, QuestSpec spec, out StageDefinition stage)
        {
            if (spec.TryGetStage(instance.StageId, out stage))
            {
                return true;
            }

            string fallback = ResolveLostStage(spec, instance.VisitedStages);
            if (fallback.Length == 0 || !spec.TryGetStage(fallback, out stage))
            {
                return false;
            }

            Log.Warning(LogCategory.Quests, "Quest '" + instance.QuestId + "': stage '" + instance.StageId + "' of the save no longer exists; the quest continues at '" +
                                            fallback + "' with fresh objectives.");
            instance.EnterStage(stage);
            return true;
        }

        internal void Deliver<TEvent>(ObjectiveBinding binding, IObjectiveListener<TEvent> listener, in TEvent evt) where TEvent : struct, IGameEvent
        {
            ObjectiveRuntime runtime = binding.Runtime;
            if (!binding.Active || runtime.IsFailed || (runtime.IsDone && !binding.Objective.CanRegress))
            {
                return;
            }

            BeginWork();
            try
            {
                QuestContext ctx = CreateContext(binding.Instance.QuestId, binding.StageId);
                Condition visible = binding.Objective.VisibleCondition;
                if (visible != null && !ConditionEvaluator.IsMet(visible, ctx.ToConditionContext()))
                {
                    return;
                }

                try
                {
                    listener.Handle(evt, runtime, ctx);
                }
                catch (Exception exception)
                {
                    Log.Exception(LogCategory.Quests, exception, binding.Objective.GetType().Name + " failed on " + typeof(TEvent).Name + " in '" + binding.Instance.QuestId + "'");
                }

                AfterRuntimeChange(binding);
            }
            finally
            {
                EndWork();
            }
        }

        internal void WatchObjectiveCondition(ObjectiveBinding binding, Condition condition, IObjectiveConditionListener listener)
        {
            QuestContext ctx = CreateContext(binding.Instance.QuestId, binding.StageId);
            int watchId = _watcher.Watch(condition, ctx.ToConditionContext(), value => OnObjectiveConditionChanged(binding, listener, value));
            binding.WatchIds.Add(watchId);
            try
            {
                listener.OnConditionChanged(_watcher.IsMet(watchId), binding.Runtime, ctx);
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Quests, exception, "Condition objective in '" + binding.Instance.QuestId + "'");
            }
        }

        internal bool CanBeOffered(QuestSpec spec, out bool coolingDown)
        {
            coolingDown = false;
            if (!_instances.TryGetValue(spec.Id, out QuestInstance instance) || instance.Status == QuestStatus.Unknown)
            {
                return true;
            }

            if (!instance.IsFinished || !spec.IsRepeatable)
            {
                return false;
            }

            if (Playtime < instance.AvailableAgainAtPlaytime)
            {
                coolingDown = true;
                return false;
            }

            return true;
        }

        internal void OnAvailabilityChanged()
        {
            MarkChanged();
        }

        private static int FocusPriority(QuestCategory category)
        {
            switch (category)
            {
                case QuestCategory.Main:
                    return 0;
                case QuestCategory.Companion:
                    return 1;
                case QuestCategory.Region:
                    return 2;
                case QuestCategory.Faction:
                    return 3;
                default:
                    return 4;
            }
        }

        private bool Start(string questId, string sourceId, bool force)
        {
            if (!Catalog.TryGet(questId, out QuestSpec spec))
            {
                Log.Warning(LogCategory.Quests, "Quest '" + questId + "' does not exist (start by '" + sourceId + "').");
                return false;
            }

            if (!CanStart(spec, force, out string reason))
            {
                Log.Info(LogCategory.Quests, "Quest '" + questId + "' not started (" + reason + ", source '" + sourceId + "').");
                return false;
            }

            BeginWork();
            try
            {
                if (!_instances.TryGetValue(questId, out QuestInstance instance))
                {
                    instance = new QuestInstance(questId);
                    _instances.Add(questId, instance);
                    _order.Add(instance);
                }

                instance.ResetForStart(Playtime);
                Revision++;
                _availability.Refresh(questId);
                _bus.Publish(new QuestStarted(questId));
                Log.Info(LogCategory.Quests, "Quest '" + questId + "' started (source '" + sourceId + "').");
                AutoTrack(spec);
                WatchQuestRules(instance, spec);
                string startStage = ResolveStartStage(spec);
                if (startStage.Length == 0)
                {
                    Log.Error(LogCategory.Quests, "Quest '" + questId + "' has no stage; it fails at once.");
                    FinishQuest(instance, false, string.Empty, "no_stage");
                    return true;
                }

                EnterStage(instance, spec, startStage, string.Empty);
                return true;
            }
            finally
            {
                EndWork();
            }
        }

        private bool CanStart(QuestSpec spec, bool force, out string reason)
        {
            if (_instances.TryGetValue(spec.Id, out QuestInstance instance))
            {
                if (instance.IsActive)
                {
                    reason = "läuft bereits";
                    return false;
                }

                if (instance.Status == QuestStatus.Locked)
                {
                    reason = "gesperrt";
                    return false;
                }

                if (instance.IsFinished)
                {
                    if (!spec.IsRepeatable)
                    {
                        reason = instance.Status == QuestStatus.Completed ? "bereits abgeschlossen" : "bereits gescheitert";
                        return false;
                    }

                    if (Playtime < instance.AvailableAgainAtPlaytime)
                    {
                        reason = "Abklingzeit läuft";
                        return false;
                    }
                }
            }

            if (!force && !ConditionEvaluator.IsMet(spec.StartCondition, ConditionContextFor(spec.Id)))
            {
                reason = "Startbedingungen nicht erfüllt";
                return false;
            }

            reason = string.Empty;
            return true;
        }

        private string ResolveStartStage(QuestSpec spec)
        {
            IReadOnlyList<StageBranch> branches = spec.StartBranches;
            for (int i = 0; i < branches.Count; i++)
            {
                StageBranch branch = branches[i];
                if (branch != null && branch.TargetStageId.Length > 0 && ConditionEvaluator.IsMet(branch.Condition, ConditionContextFor(spec.Id)))
                {
                    return branch.TargetStageId;
                }
            }

            return spec.DefaultStartStageId;
        }

        private void EnterStage(QuestInstance instance, QuestSpec spec, string stageId, string previousStageId)
        {
            if (!spec.TryGetStage(stageId, out StageDefinition stage))
            {
                Log.Error(LogCategory.Quests, "Quest '" + spec.Id + "': stage '" + stageId + "' does not exist; the quest fails.");
                FinishQuest(instance, false, instance.StageId, "missing_stage");
                return;
            }

            UnbindStage(instance);
            instance.EnterStage(stage);
            Revision++;
            _bus.Publish(new QuestStageChanged(spec.Id, stage.Id, previousStageId));
            int epoch = instance.Epoch;
            ActionRunner.Run(stage.OnStart, ActionContextFor(spec.Id));
            if (!instance.IsActive || instance.Epoch != epoch)
            {
                return;
            }

            BindStage(instance, stage, false);
            EnqueueCheck(instance);
        }

        private void BindStage(QuestInstance instance, StageDefinition stage, bool afterLoad)
        {
            string questId = instance.QuestId;
            var bindings = new List<ObjectiveBinding>(stage.Objectives.Count);
            _bindings[questId] = bindings;
            IReadOnlyList<QuestObjective> objectives = stage.Objectives;
            IReadOnlyList<ObjectiveState> states = instance.Objectives;
            for (int i = 0; i < objectives.Count && i < states.Count; i++)
            {
                QuestObjective objective = objectives[i];
                if (objective == null)
                {
                    Log.Error(LogCategory.Quests, "Quest '" + questId + "', stage '" + stage.Id + "': objective " + i + " has an unknown type (V14) and can never be fulfilled.");
                    continue;
                }

                var binding = new ObjectiveBinding(this, instance, stage.Id, objective, new ObjectiveRuntime(states[i], objective.CanRegress));
                bindings.Add(binding);
                if (objective.TimeLimitSeconds > 0f)
                {
                    _timed.Add(binding);
                }

                try
                {
                    objective.RegisterListeners(binding);
                }
                catch (Exception exception)
                {
                    Log.Exception(LogCategory.Quests, exception, "RegisterListeners of " + objective.GetType().Name + " in '" + questId + "'");
                }
            }

            for (int i = 0; i < bindings.Count; i++)
            {
                ObjectiveBinding binding = bindings[i];
                if (!binding.Active)
                {
                    continue;
                }

                QuestContext ctx = CreateContext(questId, stage.Id);
                try
                {
                    if (afterLoad)
                    {
                        binding.Objective.OnAfterLoad(binding.Runtime, ctx);
                    }
                    else
                    {
                        binding.Objective.OnStageStarted(binding.Runtime, ctx);
                    }
                }
                catch (Exception exception)
                {
                    Log.Exception(LogCategory.Quests, exception, "Stage start of " + binding.Objective.GetType().Name + " in '" + questId + "'");
                }

                AfterRuntimeChange(binding);
            }

            WatchRules(instance, stage.FailRules, instance.Epoch, _stageRuleWatches);
            if (stage.SaveLock && _saveManager != null && _saveLocks.Add(questId))
            {
                _saveManager.AddBlocker(SaveLockPrefix + questId, SaveLockReasonKey);
            }
        }

        private void UnbindStage(QuestInstance instance)
        {
            string questId = instance.QuestId;
            if (_bindings.TryGetValue(questId, out List<ObjectiveBinding> bindings))
            {
                for (int i = 0; i < bindings.Count; i++)
                {
                    ObjectiveBinding binding = bindings[i];
                    binding.Active = false;
                    Router.Remove(binding);
                    for (int w = 0; w < binding.WatchIds.Count; w++)
                    {
                        _watcher.Unwatch(binding.WatchIds[w]);
                    }

                    binding.WatchIds.Clear();
                    _timed.Remove(binding);
                }

                _bindings.Remove(questId);
            }

            Unwatch(_stageRuleWatches, questId);
            if (_saveLocks.Remove(questId) && _saveManager != null)
            {
                _saveManager.RemoveBlocker(SaveLockPrefix + questId);
            }
        }

        private void WatchQuestRules(QuestInstance instance, QuestSpec spec)
        {
            Unwatch(_questRuleWatches, instance.QuestId);
            WatchRules(instance, spec.FailRules, -1, _questRuleWatches);
        }

        private void UnwatchQuestRules(QuestInstance instance)
        {
            Unwatch(_questRuleWatches, instance.QuestId);
        }

        private void WatchRules(QuestInstance instance, IReadOnlyList<QuestFailRule> rules, int epoch, Dictionary<string, List<int>> store)
        {
            if (rules == null || rules.Count == 0)
            {
                return;
            }

            if (!store.TryGetValue(instance.QuestId, out List<int> ids))
            {
                ids = new List<int>();
                store.Add(instance.QuestId, ids);
            }

            ConditionContext ctx = ConditionContextFor(instance.QuestId);
            for (int i = 0; i < rules.Count; i++)
            {
                QuestFailRule rule = rules[i];
                if (rule == null || rule.Condition == null)
                {
                    Log.Warning(LogCategory.Quests, "Quest '" + instance.QuestId + "': fail rule " + i + " without condition is ignored (V14).");
                    continue;
                }

                int watchId = _watcher.Watch(rule.Condition, ctx, value => OnFailRuleChanged(instance, rule, epoch, value));
                ids.Add(watchId);
                if (_watcher.IsMet(watchId))
                {
                    _work.Enqueue(new WorkItem(instance, rule, epoch));
                }
            }
        }

        private void Unwatch(Dictionary<string, List<int>> store, string questId)
        {
            if (!store.TryGetValue(questId, out List<int> ids))
            {
                return;
            }

            for (int i = 0; i < ids.Count; i++)
            {
                _watcher.Unwatch(ids[i]);
            }

            store.Remove(questId);
        }

        private void OnFailRuleChanged(QuestInstance instance, QuestFailRule rule, int epoch, bool value)
        {
            if (!value)
            {
                return;
            }

            BeginWork();
            try
            {
                _work.Enqueue(new WorkItem(instance, rule, epoch));
            }
            finally
            {
                EndWork();
            }
        }

        private void OnObjectiveConditionChanged(ObjectiveBinding binding, IObjectiveConditionListener listener, bool value)
        {
            if (!binding.Active)
            {
                return;
            }

            BeginWork();
            try
            {
                try
                {
                    listener.OnConditionChanged(value, binding.Runtime, CreateContext(binding.Instance.QuestId, binding.StageId));
                }
                catch (Exception exception)
                {
                    Log.Exception(LogCategory.Quests, exception, "Condition objective in '" + binding.Instance.QuestId + "'");
                }

                AfterRuntimeChange(binding);
            }
            finally
            {
                EndWork();
            }
        }

        private void AfterRuntimeChange(ObjectiveBinding binding)
        {
            if (!binding.Runtime.ConsumeChanged())
            {
                return;
            }

            QuestInstance instance = binding.Instance;
            ObjectiveState state = binding.Runtime.State;
            string key = QuestIds.StageObjectiveKey(binding.StageId, state.ObjectiveId);
            instance.SetObjectiveCompleted(key, state.Done);
            if (state.Done && binding.Objective.RecordsChoice && state.Extra.Length > 0)
            {
                instance.SetChoice(key, state.Extra);
            }

            Revision++;
            _bus.Publish(new ObjectiveProgressed(instance.QuestId, key, state.Progress, state.Required));
            IReadOnlyList<GameAction> bonus = binding.Objective.OnCompletedActions;
            if (state.Done && bonus.Count > 0 && instance.TryMarkBonus(key))
            {
                // Once per run (not per objective state): entering the stage again creates fresh states.
                ActionRunner.Run(bonus, ActionContextFor(instance.QuestId));
            }

            EnqueueCheck(instance);
        }

        private void EnqueueCheck(QuestInstance instance)
        {
            if (instance.CheckQueued)
            {
                return;
            }

            instance.CheckQueued = true;
            _work.Enqueue(new WorkItem(instance));
        }

        private void BeginWork()
        {
            _workDepth++;
        }

        private void EndWork()
        {
            _workDepth--;
            if (_workDepth > 0)
            {
                return;
            }

            _workDepth = 0;
            if (_draining)
            {
                return;
            }

            Drain();
            if (_notifiedRevision != Revision)
            {
                _notifiedRevision = Revision;
                RaiseChanged();
            }
        }

        private void MarkChanged()
        {
            Revision++;
            if (_workDepth == 0)
            {
                _notifiedRevision = Revision;
                RaiseChanged();
            }
        }

        private void RaiseChanged()
        {
            Action handler = Changed;
            if (handler == null)
            {
                return;
            }

            try
            {
                handler();
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Quests, exception, "QuestService.Changed handler");
            }
        }

        private void Drain()
        {
            if (_draining)
            {
                return;
            }

            _draining = true;
            try
            {
                int processed = 0;
                while (_work.Count > 0)
                {
                    if (++processed > MaxWorkItems)
                    {
                        Log.Error(LogCategory.Quests, "QuestService: more than " + MaxWorkItems + " stage changes in one step (stages without objectives in a loop?); the rest is dropped.");
                        _work.Clear();
                        break;
                    }

                    WorkItem item = _work.Dequeue();
                    try
                    {
                        if (item.Rule == null)
                        {
                            item.Instance.CheckQueued = false;
                            CheckStage(item.Instance);
                        }
                        else
                        {
                            ApplyFailRule(item.Instance, item.Rule, item.Epoch);
                        }
                    }
                    catch (Exception exception)
                    {
                        Log.Exception(LogCategory.Quests, exception, "QuestService work item of '" + item.Instance.QuestId + "'");
                    }
                }
            }
            finally
            {
                _draining = false;
            }
        }

        private void CheckStage(QuestInstance instance)
        {
            if (!instance.IsActive || !Catalog.TryGet(instance.QuestId, out QuestSpec spec) || !spec.TryGetStage(instance.StageId, out StageDefinition stage))
            {
                return;
            }

            if (IsSatisfied(stage, instance, out bool blocked))
            {
                CompleteStage(instance, spec, stage);
            }
            else if (blocked)
            {
                Log.Info(LogCategory.Quests, "Quest '" + instance.QuestId + "', stage '" + stage.Id + "': a required objective failed.");
                FinishQuest(instance, false, stage.Id, ObjectiveFailedReason);
            }
        }

        private static bool IsSatisfied(StageDefinition stage, QuestInstance instance, out bool blocked)
        {
            blocked = false;
            if (stage.IsActionOnly)
            {
                return true;
            }

            IReadOnlyList<QuestObjective> objectives = stage.Objectives;
            IReadOnlyList<ObjectiveState> states = instance.Objectives;
            int required = 0;
            int done = 0;
            int failed = 0;
            for (int i = 0; i < objectives.Count; i++)
            {
                QuestObjective objective = objectives[i];
                if (objective != null && objective.IsOptional)
                {
                    continue;
                }

                required++;
                if (objective == null || i >= states.Count)
                {
                    continue;
                }

                if (states[i].Done)
                {
                    done++;
                }
                else if (states[i].Failed)
                {
                    failed++;
                }
            }

            if (required == 0)
            {
                return true;
            }

            switch (stage.CompletionMode)
            {
                case StageCompletionMode.Any:
                    blocked = failed == required;
                    return done >= 1;
                case StageCompletionMode.AtLeast:
                    int needed = Math.Max(1, Math.Min(stage.RequiredCount, required));
                    blocked = required - failed < needed;
                    return done >= needed;
                default:
                    blocked = failed > 0;
                    return done == required;
            }
        }

        private void CompleteStage(QuestInstance instance, QuestSpec spec, StageDefinition stage)
        {
            int epoch = instance.Epoch;
            UnbindStage(instance);
            ActionRunner.Run(stage.OnComplete, ActionContextFor(spec.Id));
            if (stage.LedgerEntryId.Length > 0)
            {
                AddLedger(instance, spec, stage.LedgerEntryId);
            }

            if (!instance.IsActive || instance.Epoch != epoch)
            {
                return;
            }

            if (stage.EndType == StageEndType.Success)
            {
                FinishQuest(instance, true, stage.Id, string.Empty);
                return;
            }

            if (stage.EndType == StageEndType.Failure)
            {
                FinishQuest(instance, false, stage.Id, stage.Id);
                return;
            }

            string next = ResolveNext(spec, stage);
            if (next.Length == 0)
            {
                Log.Error(LogCategory.Quests, "Quest '" + spec.Id + "', stage '" + stage.Id + "' is done but has no exit (V06/V09); the quest is stuck.");
                return;
            }

            EnterStage(instance, spec, next, stage.Id);
        }

        private string ResolveNext(QuestSpec spec, StageDefinition stage)
        {
            ConditionContext ctx = ConditionContextFor(spec.Id);
            IReadOnlyList<StageBranch> branches = stage.Branches;
            for (int i = 0; i < branches.Count; i++)
            {
                StageBranch branch = branches[i];
                if (branch != null && branch.TargetStageId.Length > 0 && ConditionEvaluator.IsMet(branch.Condition, ctx))
                {
                    return branch.TargetStageId;
                }
            }

            return stage.DefaultNextStageId;
        }

        private void ApplyFailRule(QuestInstance instance, QuestFailRule rule, int epoch)
        {
            if (!instance.IsActive || (epoch >= 0 && instance.Epoch != epoch))
            {
                return;
            }

            if (!Catalog.TryGet(instance.QuestId, out QuestSpec spec))
            {
                return;
            }

            Log.Info(LogCategory.Quests, "Quest '" + instance.QuestId + "': fail rule '" + rule + "' applies.");
            if (rule.TargetStageId.Length > 0)
            {
                EnterStage(instance, spec, rule.TargetStageId, instance.StageId);
                return;
            }

            FinishQuest(instance, false, instance.StageId, rule.ReasonId.Length > 0 ? rule.ReasonId : "fail_rule");
        }

        private void FinishQuest(QuestInstance instance, bool success, string endStageId, string reasonId)
        {
            if (!instance.IsActive)
            {
                return;
            }

            string questId = instance.QuestId;
            Catalog.TryGet(questId, out QuestSpec spec);
            UnbindStage(instance);
            UnwatchQuestRules(instance);
            instance.Finish(success ? QuestStatus.Completed : QuestStatus.Failed, endStageId, success ? string.Empty : reasonId, Playtime);
            if (success)
            {
                instance.CompletionCount++;
                if (spec != null)
                {
                    ActionRunner.Run(spec.Rewards, ActionContextFor(questId));
                }
            }

            if (spec != null && spec.IsRepeatable)
            {
                instance.AvailableAgainAtPlaytime = Playtime + (success ? spec.CooldownSeconds : 0.0);
            }

            if (_worldState != null)
            {
                _worldState.ResetPrefix(QuestIds.LocalFlagPrefix(questId), questId);
            }

            Untrack(questId);
            Revision++;
            if (success)
            {
                Log.Info(LogCategory.Quests, "Quest '" + questId + "' completed at '" + endStageId + "'.");
                _bus.Publish(new QuestCompleted(questId, endStageId));
                if (spec != null)
                {
                    StartFollowUps(spec);
                }
            }
            else
            {
                Log.Info(LogCategory.Quests, "Quest '" + questId + "' failed ('" + reasonId + "').");
                _bus.Publish(new QuestFailed(questId, reasonId));
            }

            _availability.Refresh(questId);
        }

        private void StartFollowUps(QuestSpec spec)
        {
            IReadOnlyList<FollowUpQuest> followUps = spec.FollowUps;
            for (int i = 0; i < followUps.Count; i++)
            {
                FollowUpQuest followUp = followUps[i];
                if (followUp == null || followUp.QuestId.Length == 0)
                {
                    continue;
                }

                if (followUp.Mode == FollowUpMode.AutoStart)
                {
                    Start(followUp.QuestId, spec.Id, false);
                }
                else
                {
                    _availability.Refresh(followUp.QuestId);
                }
            }
        }

        private bool AddLedger(QuestInstance instance, QuestSpec spec, string entryId)
        {
            if (!spec.TryGetLedgerEntry(entryId, out _))
            {
                Log.Warning(LogCategory.Quests, "Quest '" + spec.Id + "': ledger entry '" + entryId + "' is not defined (V04).");
                return false;
            }

            if (!instance.AddLedgerEntry(entryId))
            {
                return false;
            }

            Revision++;
            return true;
        }

        private void AutoTrack(QuestSpec spec)
        {
            if (_tracked.Contains(spec.Id))
            {
                return;
            }

            if (_tracked.Count >= MaxTrackedQuests)
            {
                Log.Info(LogCategory.Quests, "Quest '" + spec.Id + "' is not tracked automatically: " + MaxTrackedQuests + " quests are tracked already.");
                return;
            }

            _tracked.Add(spec.Id);
            if (_focus.Length == 0 || spec.Category == QuestCategory.Main)
            {
                _focus = spec.Id;
            }
        }

        private void Untrack(string questId)
        {
            if (!_tracked.Remove(questId))
            {
                return;
            }

            if (_focus == questId)
            {
                _focus = PickFocus();
            }
        }

        private string PickFocus()
        {
            string best = string.Empty;
            int bestPriority = int.MaxValue;
            for (int i = 0; i < _tracked.Count; i++)
            {
                int priority = Catalog.TryGet(_tracked[i], out QuestSpec spec) ? FocusPriority(spec.Category) : int.MaxValue - 1;
                if (priority < bestPriority)
                {
                    best = _tracked[i];
                    bestPriority = priority;
                }
            }

            return best;
        }

        private bool TryGetActive(string questId, out QuestInstance instance, out QuestSpec spec)
        {
            spec = null;
            if (!TryGetInstance(questId, out instance) || !instance.IsActive)
            {
                return false;
            }

            return Catalog.TryGet(questId, out spec);
        }

        private ObjectiveBinding FindBinding(string questId, string objectiveId)
        {
            if (questId == null || !_bindings.TryGetValue(questId, out List<ObjectiveBinding> bindings))
            {
                return null;
            }

            for (int i = 0; i < bindings.Count; i++)
            {
                if (bindings[i].Active && bindings[i].Objective.Id == objectiveId)
                {
                    return bindings[i];
                }
            }

            return null;
        }

        private QuestContext CreateContext(string questId, string stageId)
        {
            return new QuestContext(questId, stageId, _services, _inventory);
        }

        private ConditionContext ConditionContextFor(string questId)
        {
            return new ConditionContext(_services, SubjectIds.Player, string.Empty, questId);
        }

        private ActionContext ActionContextFor(string questId)
        {
            return new ActionContext(_services, SubjectIds.Player, string.Empty, questId);
        }

        private readonly struct WorkItem
        {
            public readonly QuestInstance Instance;
            public readonly QuestFailRule Rule;
            public readonly int Epoch;

            public WorkItem(QuestInstance instance)
            {
                Instance = instance;
                Rule = null;
                Epoch = -1;
            }

            public WorkItem(QuestInstance instance, QuestFailRule rule, int epoch)
            {
                Instance = instance;
                Rule = rule;
                Epoch = epoch;
            }
        }
    }
}
