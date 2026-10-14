using System;
using System.Collections.Generic;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// The focusable items of one list, row or grid of a screen (architecture 4.9 "Fokus-Gruppen", GDD 05 1.4). Exactly one
    /// item is focused while the group has an enabled item; disabled items are skipped. Pure logic on indices; the screen maps
    /// them to its visual elements.
    /// </summary>
    /// <remarks>
    /// <para><b>Focus memory:</b> the group keeps its index when the screen closes, so reopening a tab or list can return to
    /// the last item (GDD 05 1.4). If the focused item disappears or gets disabled, the focus moves to the item at the same
    /// position (or the nearest enabled one), never into nothing.</para>
    /// </remarks>
    public sealed class FocusGroup
    {
        private readonly List<bool> _enabled = new List<bool>();
        private int _current = -1;

        /// <summary>Creates a group.</summary>
        /// <param name="count">Number of items (all enabled).</param>
        /// <param name="layout">Arrangement for directional navigation.</param>
        /// <param name="columns">Number of columns for <see cref="FocusLayout.Grid"/> (1 or more).</param>
        /// <param name="wrap">True: moving past the last item continues at the first (lists and tab rows wrap, GDD 05 1.3).</param>
        public FocusGroup(int count = 0, FocusLayout layout = FocusLayout.Vertical, int columns = 1, bool wrap = true)
        {
            if (columns < 1)
            {
                throw new ArgumentOutOfRangeException(nameof(columns), columns, "Must be 1 or more.");
            }

            Layout = layout;
            Columns = layout == FocusLayout.Grid ? columns : 1;
            Wrap = wrap;
            SetCount(count);
        }

        /// <summary>Arrangement for directional navigation.</summary>
        public FocusLayout Layout { get; }

        /// <summary>Columns of a grid (1 for lists and rows).</summary>
        public int Columns { get; }

        /// <summary>True if moving past an end continues at the other end.</summary>
        public bool Wrap { get; }

        /// <summary>Number of items.</summary>
        public int Count => _enabled.Count;

        /// <summary>Index of the focused item, or -1 if no item is enabled.</summary>
        public int Current => _current;

        /// <summary>True if an item is focused.</summary>
        public bool HasFocus => _current >= 0;

        /// <summary>True if the item can receive the focus.</summary>
        /// <param name="index">Item index.</param>
        public bool IsEnabled(int index)
        {
            return index >= 0 && index < _enabled.Count && _enabled[index];
        }

        /// <summary>Enables or disables an item. A disabled focused item hands the focus to the nearest enabled item.</summary>
        /// <param name="index">Item index.</param>
        /// <param name="enabled">New state.</param>
        public void SetEnabled(int index, bool enabled)
        {
            if (index < 0 || index >= _enabled.Count)
            {
                throw new ArgumentOutOfRangeException(nameof(index), index, "Item index out of range (count " + _enabled.Count + ").");
            }

            _enabled[index] = enabled;
            if (!enabled && index == _current)
            {
                _current = NearestEnabled(index);
            }
            else if (enabled && _current < 0)
            {
                _current = index;
            }
        }

        /// <summary>
        /// Changes the number of items (list grew or shrank). New items are enabled. The focus keeps its index, or moves to
        /// the nearest enabled item if its item is gone; a group without focus focuses its first enabled item.
        /// </summary>
        /// <param name="count">New number of items (0 or more).</param>
        public void SetCount(int count)
        {
            if (count < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(count), count, "Must be 0 or more.");
            }

            while (_enabled.Count > count)
            {
                _enabled.RemoveAt(_enabled.Count - 1);
            }

            while (_enabled.Count < count)
            {
                _enabled.Add(true);
            }

            if (_current < 0)
            {
                FocusFirst();
            }
            else if (_current >= count)
            {
                _current = NearestEnabled(count - 1);
            }
            else if (!_enabled[_current])
            {
                _current = NearestEnabled(_current);
            }
        }

        /// <summary>Focuses the first enabled item ("erster Button bekommt Fokus").</summary>
        /// <returns>True if an item is focused afterwards.</returns>
        public bool FocusFirst()
        {
            _current = -1;
            for (int i = 0; i < _enabled.Count; i++)
            {
                if (_enabled[i])
                {
                    _current = i;
                    break;
                }
            }

            return _current >= 0;
        }

        /// <summary>Focuses an item if it is enabled.</summary>
        /// <param name="index">Item index.</param>
        /// <returns>True if the item is focused afterwards.</returns>
        public bool SetCurrent(int index)
        {
            if (!IsEnabled(index))
            {
                return false;
            }

            _current = index;
            return true;
        }

        /// <summary>Restores a remembered index if it is still valid, otherwise focuses the nearest enabled item.</summary>
        /// <param name="index">Remembered index (may be out of range).</param>
        /// <returns>True if an item is focused afterwards.</returns>
        public bool Restore(int index)
        {
            if (IsEnabled(index))
            {
                _current = index;
                return true;
            }

            _current = NearestEnabled(Math.Max(0, Math.Min(index, _enabled.Count - 1)));
            return _current >= 0;
        }

        /// <summary>Moves the focus one step; disabled items are skipped.</summary>
        /// <param name="direction">Direction.</param>
        /// <returns>True if the focus changed.</returns>
        public bool Move(NavDirection direction)
        {
            if (_enabled.Count == 0 || direction == NavDirection.None)
            {
                return false;
            }

            if (_current < 0)
            {
                return FocusFirst();
            }

            int step = StepFor(direction);
            if (step == 0)
            {
                return false;
            }

            int start = _current;
            int index = _current;
            for (int tries = 0; tries < _enabled.Count; tries++)
            {
                int next = Next(index, step, direction);
                if (next < 0 || next == start)
                {
                    return false;
                }

                index = next;
                if (_enabled[index])
                {
                    _current = index;
                    return true;
                }
            }

            return false;
        }

        private int StepFor(NavDirection direction)
        {
            switch (Layout)
            {
                case FocusLayout.Vertical:
                    return direction == NavDirection.Up ? -1 : direction == NavDirection.Down ? 1 : 0;
                case FocusLayout.Horizontal:
                    return direction == NavDirection.Left ? -1 : direction == NavDirection.Right ? 1 : 0;
                default:
                    switch (direction)
                    {
                        case NavDirection.Up: return -Columns;
                        case NavDirection.Down: return Columns;
                        case NavDirection.Left: return -1;
                        case NavDirection.Right: return 1;
                        default: return 0;
                    }
            }
        }

        private int Next(int index, int step, NavDirection direction)
        {
            int count = _enabled.Count;
            if (Layout == FocusLayout.Grid && (direction == NavDirection.Left || direction == NavDirection.Right))
            {
                // Left/right stay in the row.
                int row = index / Columns;
                int rowStart = row * Columns;
                int rowEnd = Math.Min(count, rowStart + Columns) - 1;
                int candidate = index + step;
                if (candidate < rowStart || candidate > rowEnd)
                {
                    return Wrap ? (candidate < rowStart ? rowEnd : rowStart) : -1;
                }

                return candidate;
            }

            int target = index + step;
            if (target >= 0 && target < count)
            {
                return target;
            }

            if (!Wrap)
            {
                return -1;
            }

            if (Layout == FocusLayout.Grid)
            {
                // Up/down wrap within the column.
                int column = index % Columns;
                if (target < 0)
                {
                    int last = (count - 1) / Columns * Columns + column;
                    return last < count ? last : last - Columns;
                }

                return column;
            }

            return target < 0 ? count - 1 : 0;
        }

        private int NearestEnabled(int position)
        {
            if (_enabled.Count == 0)
            {
                return -1;
            }

            int start = Math.Max(0, Math.Min(position, _enabled.Count - 1));
            for (int offset = 0; offset < _enabled.Count; offset++)
            {
                int after = start + offset;
                if (after < _enabled.Count && _enabled[after])
                {
                    return after;
                }

                int before = start - offset;
                if (before >= 0 && _enabled[before])
                {
                    return before;
                }
            }

            return -1;
        }
    }
}
