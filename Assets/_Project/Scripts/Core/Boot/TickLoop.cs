using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// Pure logic behind <see cref="TickRunner"/>: ticks a fixed list of <see cref="ITickable"/> services in order.
    /// A tickable that throws is logged once and skipped afterwards, so one broken service cannot flood the log
    /// every frame or stop the others. Allocation-free per tick.
    /// </summary>
    public sealed class TickLoop
    {
        private ITickable[] _tickables = Array.Empty<ITickable>();
        private bool[] _faulted = Array.Empty<bool>();

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
        }

        /// <summary>Removes all tickables.</summary>
        public void Clear()
        {
            _tickables = Array.Empty<ITickable>();
            _faulted = Array.Empty<bool>();
        }

        /// <summary>Returns true if the tickable at <paramref name="index"/> threw and is skipped.</summary>
        /// <param name="index">0 to <see cref="Count"/> - 1.</param>
        public bool IsFaulted(int index)
        {
            return index >= 0 && index < _faulted.Length && _faulted[index];
        }

        /// <summary>Ticks every non-faulted tickable once.</summary>
        /// <param name="deltaTime">Frame time in seconds.</param>
        public void Tick(float deltaTime)
        {
            // Local copies: SetTickables/Clear from inside a Tick call do not disturb this iteration.
            ITickable[] tickables = _tickables;
            bool[] faulted = _faulted;
            for (int i = 0; i < tickables.Length; i++)
            {
                if (faulted[i])
                {
                    continue;
                }

                try
                {
                    tickables[i].Tick(deltaTime);
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
