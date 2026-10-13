using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// Default <see cref="IGameStateService"/> (the "GameStateManager" of §6.2, architecture 4.4). Pure logic:
    /// time scale changes go through <see cref="ITimeScaleService"/>, notifications through <see cref="IEventBus"/>.
    /// </summary>
    /// <remarks>
    /// <para>Order of a successful change: update base state/modal stack → log → set time scale → publish
    /// <see cref="GameStateChanged"/>.</para>
    /// <para><b>Changes requested by handlers:</b> a <see cref="GameStateChanged"/> handler may call
    /// <see cref="SwitchBase"/>, <see cref="Push"/> or <see cref="Pop"/>. The change itself (state, log, time scale) is
    /// applied immediately, but its event is queued and published only after the current event has reached all handlers.
    /// So every handler receives the events in chronological order, and the last event it received always matches
    /// <see cref="Current"/> (Input, UI, Audio and GameTime align themselves with the last event, architecture 4.3).
    /// The queue is preallocated; publishing stays allocation-free.</para>
    /// <para><b>Endless loops:</b> at most <see cref="MaxFollowUpChanges"/> changes requested by handlers are delivered
    /// per outer change. Further queued events are dropped with an error log (the same protection the event bus applies
    /// to nested publishing).</para>
    /// </remarks>
    public sealed class GameStateService : IGameStateService
    {
        /// <summary>Maximum number of follow-up changes (requested by event handlers) delivered per outer change.</summary>
        public const int MaxFollowUpChanges = 8;

        private readonly IEventBus _eventBus;
        private readonly ITimeScaleService _timeScale;
        private readonly List<GameState> _modalStack = new List<GameState>(4);
        private readonly Queue<GameStateChanged> _pendingEvents = new Queue<GameStateChanged>(MaxFollowUpChanges + 1);
        private GameState _baseState = GameState.Boot;
        private bool _publishing;

        /// <summary>Creates the service in state <see cref="GameState.Boot"/> and applies its time scale (1).</summary>
        /// <param name="eventBus">Bus for <see cref="GameStateChanged"/>.</param>
        /// <param name="timeScaleService">Writer of the global time scale.</param>
        public GameStateService(IEventBus eventBus, ITimeScaleService timeScaleService)
        {
            _eventBus = eventBus ?? throw new ArgumentNullException(nameof(eventBus));
            _timeScale = timeScaleService ?? throw new ArgumentNullException(nameof(timeScaleService));
            _timeScale.SetTimeScale(GetTimeScale(GameState.Boot));
        }

        /// <inheritdoc />
        public GameState Current => _modalStack.Count > 0 ? _modalStack[_modalStack.Count - 1] : _baseState;

        /// <inheritdoc />
        public GameState BaseState => _baseState;

        /// <inheritdoc />
        public int ModalCount => _modalStack.Count;

        /// <summary>
        /// Time scale of a state according to table 4.4: Menu and Paused stop the game time (0), every other state runs at 1.
        /// (Hub menus pause the game: documented recommendation of the open decision in architecture 4.4.)
        /// </summary>
        /// <param name="state">State to query.</param>
        public static float GetTimeScale(GameState state)
        {
            return state == GameState.Menu || state == GameState.Paused ? 0f : 1f;
        }

        /// <inheritdoc />
        public GameState GetModalAt(int index)
        {
            if (index < 0 || index >= _modalStack.Count)
            {
                throw new ArgumentOutOfRangeException(nameof(index), index, "Modal stack index out of range (count " + _modalStack.Count + ").");
            }

            return _modalStack[index];
        }

        /// <inheritdoc />
        public bool SwitchBase(GameState state, string reason)
        {
            GameState previous = Current;
            if (!GameStateTransitions.IsBaseState(state))
            {
                LogRejected("SwitchBase", state, reason, state + " is not a base state (use Push for modal states).");
                return false;
            }

            if (!GameStateTransitions.CanSwitchBase(previous, state))
            {
                LogRejected("SwitchBase", state, reason, "not allowed from " + previous + ".");
                return false;
            }

            int closedModals = _modalStack.Count;
            _modalStack.Clear();
            _baseState = state;
            ApplyChange(previous, reason, closedModals > 0 ? " Closed " + closedModals + " modal state(s)." : string.Empty);
            return true;
        }

        /// <inheritdoc />
        public bool Push(GameState modal, string reason)
        {
            GameState previous = Current;
            if (!GameStateTransitions.IsModalState(modal))
            {
                LogRejected("Push", modal, reason, modal + " is not a modal state (use SwitchBase for base states).");
                return false;
            }

            if (!GameStateTransitions.TryGetPushMode(previous, modal, out ModalPushMode mode))
            {
                LogRejected("Push", modal, reason, "not allowed from " + previous + ".");
                return false;
            }

            if (mode == ModalPushMode.ReplaceTop)
            {
                _modalStack[_modalStack.Count - 1] = modal;
                ApplyChange(previous, reason, " " + modal + " replaces " + previous + ".");
            }
            else
            {
                _modalStack.Add(modal);
                ApplyChange(previous, reason, string.Empty);
            }

            return true;
        }

        /// <inheritdoc />
        public bool Pop(GameState expectedTop)
        {
            GameState previous = Current;
            if (_modalStack.Count == 0)
            {
                LogRejected("Pop", expectedTop, null, "the modal stack is empty (current state " + previous + ").");
                return false;
            }

            if (previous != expectedTop)
            {
                LogRejected("Pop", expectedTop, null, "the top modal state is " + previous + ", not " + expectedTop + ".");
                return false;
            }

            GameState revealed = _modalStack.Count > 1 ? _modalStack[_modalStack.Count - 2] : _baseState;
            if (!GameStateTransitions.IsValidPopTarget(previous, revealed))
            {
                // Cannot happen with the push rules; protects against future rule changes.
                Log.Error(LogCategory.GameState, "Pop(" + expectedTop + ") rejected: popping would reveal " + revealed +
                                                 ", which the transition table does not allow.");
                return false;
            }

            _modalStack.RemoveAt(_modalStack.Count - 1);
            ApplyChange(previous, "Pop " + expectedTop, string.Empty);
            return true;
        }

        private void ApplyChange(GameState previous, string reason, string detail)
        {
            GameState current = Current;
            float timeScale = GetTimeScale(current);

            if (Log.IsEnabled(LogCategory.GameState, LogLevel.Info))
            {
                Log.Info(LogCategory.GameState,
                    previous + " -> " + current + " (" + ReasonText(reason) + ")." + detail +
                    " Base: " + _baseState + ", modal stack: " + _modalStack.Count + ", time scale: " + timeScale + ".");
            }

            _timeScale.SetTimeScale(timeScale);

            _pendingEvents.Enqueue(new GameStateChanged(previous, current));
            if (_publishing)
            {
                // Requested by a handler: the outer call publishes it after the current event (chronological order).
                return;
            }

            PublishPendingEvents();
        }

        private void PublishPendingEvents()
        {
            _publishing = true;
            try
            {
                int delivered = 0;
                while (_pendingEvents.Count > 0)
                {
                    if (delivered > MaxFollowUpChanges)
                    {
                        Log.Error(LogCategory.GameState,
                            "Dropped " + _pendingEvents.Count + " GameStateChanged event(s): GameStateChanged handlers requested more than " +
                            MaxFollowUpChanges + " follow-up state changes (possible endless loop). Current: " + Current +
                            ". Check handlers that call SwitchBase/Push/Pop.");
                        break;
                    }

                    GameStateChanged changed = _pendingEvents.Dequeue();
                    _eventBus.Publish(in changed);
                    delivered++;
                }
            }
            finally
            {
                // Normally already empty. Not empty after the loop protection or an exception: those events are stale.
                _pendingEvents.Clear();
                _publishing = false;
            }
        }

        private void LogRejected(string operation, GameState requested, string reason, string why)
        {
            Log.Warning(LogCategory.GameState,
                "Rejected " + operation + "(" + requested + ")" + (string.IsNullOrEmpty(reason) ? string.Empty : " [" + reason + "]") +
                ": " + why + " Current: " + Current + ", base: " + _baseState + ".");
        }

        private static string ReasonText(string reason)
        {
            return string.IsNullOrEmpty(reason) ? "no reason given" : reason;
        }
    }
}
