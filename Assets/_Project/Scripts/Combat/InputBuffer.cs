using System;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Input buffer of the combat state machine (§9.8, GDD 03 4.4): keeps only the last combat input with its age. Attacks
    /// stay valid for 200 ms, dodge and parry for 150 ms (so no unwanted roll "runs on"). Dodge and parry override a
    /// buffered attack, an attack never overrides a buffered dodge or parry. Pure logic, allocation-free.
    /// </summary>
    public sealed class InputBuffer
    {
        private readonly float _attackWindow;
        private readonly float _defensiveWindow;
        private BufferedAction _pending;
        private float _age;

        /// <summary>Creates the buffer.</summary>
        /// <param name="attackWindow">Validity of buffered attacks in seconds (GDD 03: 0.2).</param>
        /// <param name="defensiveWindow">Validity of buffered dodge/parry in seconds (GDD 03: 0.15).</param>
        public InputBuffer(float attackWindow = 0.2f, float defensiveWindow = 0.15f)
        {
            _attackWindow = Math.Max(0f, attackWindow);
            _defensiveWindow = Math.Max(0f, defensiveWindow);
        }

        /// <summary>The buffered action, or <see cref="BufferedAction.None"/>.</summary>
        public BufferedAction Pending => _pending;

        /// <summary>Seconds since the buffered action was pressed.</summary>
        public float Age => _age;

        /// <summary>True for dodge and parry: they take precedence over attacks.</summary>
        /// <param name="action">Action.</param>
        public static bool IsDefensive(BufferedAction action)
        {
            return action == BufferedAction.Dodge || action == BufferedAction.Parry;
        }

        /// <summary>
        /// Buffers a press. Replaces the pending action unless the pending one is defensive and the new one is an attack.
        /// </summary>
        /// <param name="action">Pressed action (<see cref="BufferedAction.None"/> is ignored).</param>
        /// <returns>True if the action is buffered now.</returns>
        public bool Push(BufferedAction action)
        {
            if (action == BufferedAction.None)
            {
                return false;
            }

            if (_pending != BufferedAction.None && IsDefensive(_pending) && !IsDefensive(action))
            {
                return false;
            }

            _pending = action;
            _age = 0f;
            return true;
        }

        /// <summary>Ages the buffered action and drops it when its window has passed.</summary>
        /// <param name="deltaTime">Seconds (local combat time).</param>
        public void Tick(float deltaTime)
        {
            if (_pending == BufferedAction.None || !(deltaTime > 0f))
            {
                return;
            }

            _age += deltaTime;
            float window = IsDefensive(_pending) ? _defensiveWindow : _attackWindow;
            if (_age > window)
            {
                Clear();
            }
        }

        /// <summary>Removes and returns the buffered action.</summary>
        public BufferedAction Consume()
        {
            BufferedAction action = _pending;
            Clear();
            return action;
        }

        /// <summary>Drops the buffered action.</summary>
        public void Clear()
        {
            _pending = BufferedAction.None;
            _age = 0f;
        }
    }
}
