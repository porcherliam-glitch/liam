using System;
using System.Collections.Generic;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// The stack of open screens, which is also the focus stack of architecture 4.9: the top screen owns the focus and gets
    /// all navigation input; closing it hands the focus back to the screen below, which still knows its focused item
    /// (<see cref="FocusGroup"/>). A screen is on the stack at most once. Pure logic.
    /// </summary>
    /// <typeparam name="T">Screen type.</typeparam>
    public sealed class ScreenStack<T> where T : class
    {
        private readonly List<T> _items = new List<T>(8);

        /// <summary>Number of screens on the stack.</summary>
        public int Count => _items.Count;

        /// <summary>The top screen (owns the focus), or null.</summary>
        public T Top => _items.Count > 0 ? _items[_items.Count - 1] : null;

        /// <summary>Screen at a position; 0 is the bottom.</summary>
        /// <param name="index">0 to <see cref="Count"/> - 1.</param>
        public T this[int index] => _items[index];

        /// <summary>True if the screen is on the stack.</summary>
        /// <param name="screen">Screen.</param>
        public bool Contains(T screen)
        {
            return screen != null && _items.IndexOf(screen) >= 0;
        }

        /// <summary>Puts a screen on top. A screen that is already on the stack moves to the top.</summary>
        /// <param name="screen">Screen.</param>
        /// <returns>True if the top changed.</returns>
        public bool Push(T screen)
        {
            if (screen == null)
            {
                throw new ArgumentNullException(nameof(screen));
            }

            if (ReferenceEquals(Top, screen))
            {
                return false;
            }

            _items.Remove(screen);
            _items.Add(screen);
            return true;
        }

        /// <summary>Removes a screen wherever it is.</summary>
        /// <param name="screen">Screen.</param>
        /// <returns>True if it was on the stack.</returns>
        public bool Remove(T screen)
        {
            return screen != null && _items.Remove(screen);
        }

        /// <summary>Removes all screens.</summary>
        public void Clear()
        {
            _items.Clear();
        }
    }
}
