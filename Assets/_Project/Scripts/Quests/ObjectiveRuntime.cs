using System;

namespace Aetherfall.Quests
{
    /// <summary>
    /// Handle through which an objective changes its run-time state (architecture 11.7: the objective objects belong to the
    /// asset and are shared by every save, so their progress lives here and is passed in). The quest service publishes
    /// <c>ObjectiveProgressed</c>, runs completion actions and checks the stage after every change.
    /// </summary>
    public sealed class ObjectiveRuntime
    {
        internal const char ListSeparator = ';';

        private readonly ObjectiveState _state;
        private readonly bool _canRegress;
        private bool _changed;

        /// <summary>Creates the handle.</summary>
        /// <param name="state">State to change.</param>
        /// <param name="canRegress">True if <see cref="Set"/> may take back a fulfilled objective (collect objectives).</param>
        public ObjectiveRuntime(ObjectiveState state, bool canRegress)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _canRegress = canRegress;
        }

        /// <summary>The state.</summary>
        public ObjectiveState State => _state;

        /// <summary>Local objective id.</summary>
        public string ObjectiveId => _state.ObjectiveId;

        /// <summary>Required progress.</summary>
        public int Required => _state.Required;

        /// <summary>Current progress.</summary>
        public int Progress => _state.Progress;

        /// <summary>True if fulfilled.</summary>
        public bool IsDone => _state.Done;

        /// <summary>True if it can no longer be fulfilled.</summary>
        public bool IsFailed => _state.Failed;

        /// <summary>Remaining time of a time limit in seconds.</summary>
        public float TimerRemaining => _state.TimerRemaining;

        /// <summary>Free text state.</summary>
        public string Extra => _state.Extra;

        /// <summary>True if anything changed since the service last looked.</summary>
        public bool HasChanged => _changed;

        /// <summary>Adds progress (counters that never go down, e.g. kills). Ignored once done or failed.</summary>
        /// <param name="amount">Amount (at least 1 to have an effect).</param>
        public void Add(int amount)
        {
            if (amount <= 0 || _state.Done || _state.Failed)
            {
                return;
            }

            SetProgress(Math.Min(_state.Required, _state.Progress + amount), false);
        }

        /// <summary>
        /// Sets the progress (counts that can sink, e.g. owned items: GDD 02 5.2 "Rueckschritt"). Objectives that cannot regress
        /// keep a fulfilled state.
        /// </summary>
        /// <param name="value">New progress (clamped to 0-required).</param>
        public void Set(int value)
        {
            if (_state.Failed)
            {
                return;
            }

            SetProgress(Math.Max(0, Math.Min(_state.Required, value)), _canRegress);
        }

        /// <summary>Fulfils the objective at once (talked, reached, chosen …).</summary>
        public void Complete()
        {
            if (_state.Done || _state.Failed)
            {
                return;
            }

            SetProgress(_state.Required, false);
        }

        /// <summary>Marks the objective as failed (time limit, detected). Ignored once done.</summary>
        public void Fail()
        {
            if (_state.Done || _state.Failed)
            {
                return;
            }

            _state.Failed = true;
            _state.TimerRemaining = 0f;
            _changed = true;
        }

        /// <summary>Sets the free text state.</summary>
        /// <param name="extra">Text (null = empty).</param>
        public void SetExtra(string extra)
        {
            string value = extra ?? string.Empty;
            if (value == _state.Extra)
            {
                return;
            }

            _state.Extra = value;
            _changed = true;
        }

        /// <summary>
        /// Adds a token to the distinct set kept in <see cref="Extra"/> (e.g. inspected clue ids, hit targets), so the same
        /// object counts only once.
        /// </summary>
        /// <param name="token">Token without <c>;</c>.</param>
        /// <returns>True if the token was new.</returns>
        public bool AddDistinct(string token)
        {
            if (string.IsNullOrEmpty(token) || ContainsDistinct(token))
            {
                return false;
            }

            SetExtra(_state.Extra.Length == 0 ? token : _state.Extra + ListSeparator + token);
            return true;
        }

        /// <summary>True if the token is in the distinct set.</summary>
        /// <param name="token">Token.</param>
        public bool ContainsDistinct(string token)
        {
            if (string.IsNullOrEmpty(token) || _state.Extra.Length == 0)
            {
                return false;
            }

            string[] parts = _state.Extra.Split(ListSeparator);
            for (int i = 0; i < parts.Length; i++)
            {
                if (parts[i] == token)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>Number of tokens in the distinct set.</summary>
        public int DistinctCount => _state.Extra.Length == 0 ? 0 : _state.Extra.Split(ListSeparator).Length;

        /// <summary>Counts the time limit down (called by the quest service).</summary>
        /// <param name="deltaTime">Seconds.</param>
        /// <returns>True if the limit ran out with this call.</returns>
        internal bool CountDown(float deltaTime)
        {
            if (_state.TimerRemaining <= 0f || _state.Done || _state.Failed)
            {
                return false;
            }

            _state.TimerRemaining = Math.Max(0f, _state.TimerRemaining - deltaTime);
            return _state.TimerRemaining <= 0f;
        }

        /// <summary>Returns and clears the change mark (called by the quest service).</summary>
        internal bool ConsumeChanged()
        {
            bool changed = _changed;
            _changed = false;
            return changed;
        }

        private void SetProgress(int value, bool allowRegress)
        {
            bool done = value >= _state.Required;
            if (_state.Done && !done && !allowRegress)
            {
                return;
            }

            if (value == _state.Progress && done == _state.Done)
            {
                return;
            }

            _state.Progress = value;
            _state.Done = done;
            if (done)
            {
                _state.TimerRemaining = 0f;
            }

            _changed = true;
        }
    }
}
