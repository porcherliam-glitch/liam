using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// Default <see cref="IGameStateService"/> (the "GameStateManager" of §6.2, architecture 4.4). Pure logic:
    /// time scale changes go through <see cref="ITimeScaleService"/>, notifications through <see cref="IEventBus"/>.
    /// </summary>
    /// <remarks>
    /// Order of a successful change: update base state/modal stack → log → set time scale → publish
    /// <see cref="GameStateChanged"/>. Handlers may request further changes; those are applied immediately
    /// (state is already consistent), and their events are delivered nested.
    /// </remarks>
    public sealed class GameStateService : IGameStateService
    {
        private readonly IEventBus _eventBus;
        private readonly ITimeScaleService _timeScale;
        private readonly List<GameState> _modalStack = new List<GameState>(4);
        private GameState _baseState = GameState.Boot;

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

            var changed = new GameStateChanged(previous, current);
            _eventBus.Publish(in changed);
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
