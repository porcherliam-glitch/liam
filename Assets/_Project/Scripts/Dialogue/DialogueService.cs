using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Default <see cref="IDialogueService"/> and <see cref="IDialogueMemory"/> (architecture 11.8). Pure logic around a
    /// <see cref="DialogueRunner"/>: game state <c>Dialogue</c> while a conversation runs (pushed at the start, popped at the
    /// end), save lock <see cref="SaveBlockerId"/> (GDD 05 5.2), the conversation memory (save section <c>dialogue</c> through
    /// <see cref="DialogueSaveable"/>) and the late collaborators (speakers from the NPC system, game day) resolved in
    /// <see cref="PostInitialize"/>.
    /// </summary>
    /// <remarks>
    /// <para><b>Saving:</b> running conversations are never saved: the save lock stays active while one runs (also below the
    /// pause menu). Loading a save stops a running conversation without events (<see cref="ResetForLoad"/>).</para>
    /// <para>Game state and save manager may be null (tests without them).</para>
    /// </remarks>
    public sealed class DialogueService : IDialogueService, IDialogueMemory, IPostInitializable, ISessionService, IDisposable
    {
        /// <summary>Id of the save lock while a conversation runs.</summary>
        public const string SaveBlockerId = "dialogue";

        private readonly IEventBus _bus;
        private readonly IServiceLocator _services;
        private readonly IGameStateService _gameState;
        private readonly ISaveManager _saves;
        private readonly DialogueMemory _memory = new DialogueMemory();
        private readonly DialogueRunContext _context;
        private readonly DialogueRunner _runner;
        private bool _pushedState;
        private bool _pendingPop;
        private bool _blocking;
        private bool _subscribed;
        private bool _disposed;

        /// <summary>Creates the service.</summary>
        /// <param name="bus">Event bus.</param>
        /// <param name="catalog">All dialogues.</param>
        /// <param name="services">Service access for conditions and actions (may be null in tests).</param>
        /// <param name="stats">Player values for checks and prices (may be null).</param>
        /// <param name="wallet">Gold (may be null).</param>
        /// <param name="gameState">Game state (may be null in tests).</param>
        /// <param name="saves">Save manager for the save lock (may be null).</param>
        /// <param name="rules">Rules (null = defaults: deterministic checks).</param>
        public DialogueService(IEventBus bus, DialogueCatalog catalog, IServiceLocator services, IDialogueCheckStats stats, IDialogueWallet wallet,
            IGameStateService gameState, ISaveManager saves, DialogueRules rules = null)
        {
            _bus = bus ?? throw new ArgumentNullException(nameof(bus));
            Catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
            _services = services;
            _gameState = gameState;
            _saves = saves;
            _context = new DialogueRunContext(bus, services, _memory, catalog, stats, wallet, rules);
            _runner = new DialogueRunner(_context);
            _runner.Changed += OnRunnerChanged;
            _runner.Ended += OnRunnerEnded;
        }

        /// <inheritdoc />
        public event Action Changed;

        /// <inheritdoc />
        public event Action<DialogueEndInfo> Ended;

        /// <inheritdoc />
        public DialogueView View => _runner.View;

        /// <inheritdoc />
        public bool IsRunning => _runner.IsRunning;

        /// <inheritdoc />
        public DialogueCatalog Catalog { get; }

        /// <summary>The memory data (saveable, debug).</summary>
        public DialogueMemory Memory => _memory;

        /// <summary>The run context (rules, badge rules, attached collaborators).</summary>
        public DialogueRunContext Context => _context;

        /// <summary>The runner (tests, debug overlay).</summary>
        public DialogueRunner Runner => _runner;

        /// <summary>True while the service holds the save lock.</summary>
        public bool IsBlockingSaves => _blocking;

        /// <inheritdoc />
        public IReadOnlyList<string> KnownTopics => _memory.SortedTopics();

        /// <summary>
        /// Resolves the collaborators registered after the dialogue installer (speakers, game day) and subscribes to
        /// <c>GameStateChanged</c> (a conversation that ended below the pause menu leaves its state when it is revealed again).
        /// </summary>
        public void PostInitialize()
        {
            if (!_subscribed && !_disposed)
            {
                _bus.Subscribe<GameStateChanged>(OnGameStateChanged);
                _subscribed = true;
            }

            if (_services == null)
            {
                return;
            }

            if (_context.Speakers == null && _services.TryGet(out IDialogueSpeakerDirectory speakers))
            {
                _context.Speakers = speakers;
            }

            if (_context.Calendar == null && _services.TryGet(out IDialogueCalendar calendar))
            {
                _context.Calendar = calendar;
            }
        }

        /// <summary>Attaches the speaker directory directly (tests, or when the NPC system starts later).</summary>
        /// <param name="speakers">Directory.</param>
        public void AttachSpeakers(IDialogueSpeakerDirectory speakers)
        {
            _context.Speakers = speakers;
        }

        /// <summary>Attaches the calendar directly (tests).</summary>
        /// <param name="calendar">Calendar.</param>
        public void AttachCalendar(IDialogueCalendar calendar)
        {
            _context.Calendar = calendar;
        }

        /// <inheritdoc />
        public bool TryStart(in DialogueStartRequest request)
        {
            if (_disposed)
            {
                return false;
            }

            if (_runner.IsRunning)
            {
                Log.Warning(LogCategory.Dialogue, "Dialogue '" + request.DialogueId + "' not started: '" + View.DialogueId + "' is running.");
                return false;
            }

            if (!Catalog.TryGet(request.DialogueId, out DialogueSpec spec))
            {
                Log.Error(LogCategory.Dialogue, "Dialogue '" + request.DialogueId + "' does not exist (content catalog?).");
                return false;
            }

            if (spec.Mode == DialogueMode.Bark)
            {
                Log.Warning(LogCategory.Dialogue, "Dialogue '" + spec.Id + "' is a bark and is not started as a conversation.");
                return false;
            }

            if (_gameState != null)
            {
                if (!GameStateTransitions.CanPush(_gameState.Current, GameState.Dialogue))
                {
                    Log.Warning(LogCategory.Dialogue, "Dialogue '" + spec.Id + "' not started in game state " + _gameState.Current + ".");
                    return false;
                }

                _pushedState = _gameState.Push(GameState.Dialogue, "Dialogue " + spec.Id);
                if (!_pushedState)
                {
                    return false;
                }
            }

            if (_saves != null)
            {
                _saves.AddBlocker(SaveBlockerId, SaveReasonKeys.ForState(GameState.Dialogue));
                _blocking = true;
            }

            Log.Info(LogCategory.Dialogue, "Dialogue '" + spec.Id + "' started with '" + request.NpcId + "'" +
                                           (request.SourceId.Length > 0 ? " (" + request.SourceId + ")" : string.Empty) + ".");
            if (!_runner.Start(spec, request))
            {
                Release();
                return false;
            }

            return true;
        }

        /// <inheritdoc />
        public bool Continue()
        {
            return _runner.Continue();
        }

        /// <inheritdoc />
        public bool Choose(int optionIndex)
        {
            return _runner.Choose(optionIndex);
        }

        /// <inheritdoc />
        public bool Back()
        {
            if (!_runner.IsRunning)
            {
                return false;
            }

            DialogueView view = _runner.View;
            if (view.State == DialogueViewState.Choice)
            {
                int back = view.BackOptionIndex;
                if (back >= 0)
                {
                    return _runner.Choose(back);
                }
            }

            return view.CanCancel && _runner.Cancel();
        }

        /// <inheritdoc />
        public bool ForceEnd(string reason)
        {
            if (!_runner.IsRunning)
            {
                return false;
            }

            Log.Info(LogCategory.Dialogue, "Dialogue '" + View.DialogueId + "' ended: " + (reason ?? string.Empty));
            return _runner.Cancel();
        }

        /// <inheritdoc />
        public void RefreshOptions()
        {
            _runner.RefreshChoice();
        }

        /// <summary>
        /// Before a save is loaded (saveable): stops a running conversation without events, releases game state and save lock.
        /// </summary>
        public void ResetForLoad()
        {
            _runner.Abort();
            Release();
        }

        /// <inheritdoc />
        public void BeginSession()
        {
        }

        /// <inheritdoc />
        public void EndSession()
        {
            ResetForLoad();
        }

        /// <inheritdoc />
        public bool IsTopicKnown(string topicId)
        {
            return _memory.HasTopic(topicId);
        }

        /// <inheritdoc />
        public bool UnlockTopic(string topicId)
        {
            if (!_memory.AddTopic(topicId))
            {
                return false;
            }

            _bus.Publish(new TopicUnlocked(topicId));
            return true;
        }

        /// <inheritdoc />
        public bool IsNameKnown(string speakerId)
        {
            if (_memory.HasName(speakerId))
            {
                return true;
            }

            return _context.TryGetSpeaker(speakerId, out DialogueSpeakerInfo info) && info.NameKnownFromStart;
        }

        /// <inheritdoc />
        public bool RevealName(string speakerId)
        {
            return _memory.AddName(speakerId);
        }

        /// <summary>Shown name of a speaker (name once known, else role).</summary>
        /// <param name="speakerId">NPC id.</param>
        public string SpeakerName(string speakerId)
        {
            return _context.SpeakerName(speakerId);
        }

        /// <inheritdoc />
        public bool WasOptionChosen(string dialogueId, string nodeId, string optionId)
        {
            return _memory.IsChosen(DialogueIds.OptionKey(dialogueId, nodeId, optionId));
        }

        /// <inheritdoc />
        public bool TryGetCheckResult(string dialogueId, string nodeId, out bool success)
        {
            return _memory.TryGetCheck(DialogueIds.NodeKey(dialogueId, nodeId), out success);
        }

        /// <summary>Stops a running conversation and unsubscribes.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            ResetForLoad();
            _runner.Changed -= OnRunnerChanged;
            _runner.Ended -= OnRunnerEnded;
            if (_subscribed)
            {
                _bus.Unsubscribe<GameStateChanged>(OnGameStateChanged);
                _subscribed = false;
            }

            _disposed = true;
        }

        private bool ModalStackContainsDialogue()
        {
            for (int i = 0; i < _gameState.ModalCount; i++)
            {
                if (_gameState.GetModalAt(i) == GameState.Dialogue)
                {
                    return true;
                }
            }

            return false;
        }

        private void OnRunnerChanged()
        {
            Changed?.Invoke();
        }

        private void OnRunnerEnded(DialogueEndInfo info)
        {
            Release();
            Log.Info(LogCategory.Dialogue, info.ToString());
            Ended?.Invoke(info);
        }

        private void OnGameStateChanged(GameStateChanged evt)
        {
            if (!_pendingPop || _gameState == null)
            {
                return;
            }

            if (evt.Current == GameState.Dialogue && !_runner.IsRunning)
            {
                // The conversation ended while the pause menu (or the death screen) lay over it: leave the revealed state now.
                _pendingPop = false;
                _gameState.Pop(GameState.Dialogue);
            }
            else if (!ModalStackContainsDialogue())
            {
                _pendingPop = false;
            }
        }

        private void Release()
        {
            if (_pushedState)
            {
                _pushedState = false;
                if (_gameState != null && _gameState.Current == GameState.Dialogue)
                {
                    _gameState.Pop(GameState.Dialogue);
                }
                else if (_gameState != null && ModalStackContainsDialogue())
                {
                    // Below the pause menu: pop when the dialogue state is revealed again (OnGameStateChanged).
                    _pendingPop = true;
                }
            }

            if (_blocking)
            {
                _blocking = false;
                if (_saves != null)
                {
                    _saves.RemoveBlocker(SaveBlockerId);
                }
            }
        }
    }
}
