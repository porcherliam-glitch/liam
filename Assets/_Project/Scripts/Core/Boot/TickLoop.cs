using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// Pure logic behind <see cref="TickRunner"/>: ticks a fixed list of <see cref="ITickable"/> services in order.
    /// A tickable that throws is logged once and skipped afterwards, so one broken service cannot flood the log
    /// every frame or stop the others. <see cref="IUnscaledTickable"/>s receive the unscaled frame time.
    /// Allocation-free per tick.
    /// </summary>
    public sealed class TickLoop
    {
        private ITickable[] _tickables = Array.Empty<ITickable>();
        private bool[] _faulted = Array.Empty<bool>();
        private bool[] _unscaled = Array.Empty<bool>();

        /// <summary>Number of tickables (including faulted ones).</summary>
        public int Count => _tickables.Length;

        /// <summary>Replaces the list of tickables. Null entries are ignored.</summary>
        /// <param name="tickables">Tickables in tick order; the list is copied.</param>
        public void SetTickables(IReadOnlyList<ITickable> tickables)
        {
            var list = new List<ITickable>();
            if (tickables != null)
            {
                for (int i = 0; i < tickables.Count; i++)
                {
                    if (tickables[i] != null)
                    {
                        list.Add(tickables[i]);
                    }
                }
            }

            _tickables = list.ToArray();
            _faulted = new bool[_tickables.Length];
            _unscaled = new bool[_tickables.Length];
            for (int i = 0; i < _tickables.Length; i++)
            {
                _unscaled[i] = _tickables[i] is IUnscaledTickable;
            }
        }

        /// <summary>Removes all tickables.</summary>
        public void Clear()
        {
            _tickables = Array.Empty<ITickable>();
            _faulted = Array.Empty<bool>();
            _unscaled = Array.Empty<bool>();
        }

        /// <summary>Returns true if the tickable at <paramref name="index"/> threw and is skipped.</summary>
        /// <param name="index">0 to <see cref="Count"/> - 1.</param>
        public bool IsFaulted(int index)
        {
            return index >= 0 && index < _faulted.Length && _faulted[index];
        }

        /// <summary>Ticks every non-faulted tickable once with the same frame time (scaled and unscaled equal).</summary>
        /// <param name="deltaTime">Frame time in seconds.</param>
        public void Tick(float deltaTime)
        {
            Tick(deltaTime, deltaTime);
        }

        /// <summary>
        /// Ticks every non-faulted tickable once: <see cref="IUnscaledTickable"/>s with <paramref name="unscaledDeltaTime"/>,
        /// all others with <paramref name="deltaTime"/>.
        /// </summary>
        /// <param name="deltaTime">Scaled frame time in seconds (0 while paused).</param>
        /// <param name="unscaledDeltaTime">Real frame time in seconds.</param>
        public void Tick(float deltaTime, float unscaledDeltaTime)
        {
            // Local copies: SetTickables/Clear from inside a Tick call do not disturb this iteration.
            ITickable[] tickables = _tickables;
            bool[] faulted = _faulted;
            bool[] unscaled = _unscaled;
            for (int i = 0; i < tickables.Length; i++)
            {
                if (faulted[i])
                {
                    continue;
                }

                try
                {
                    tickables[i].Tick(unscaled[i] ? unscaledDeltaTime : deltaTime);
                }
                catch (Exception exception)
                {
                    faulted[i] = true;
                    Log.Exception(LogCategory.Core, exception,
                        "Tickable " + tickables[i].GetType().Name + " threw an exception and will not be ticked again in this session.");
                }
            }
        }
    }
}
