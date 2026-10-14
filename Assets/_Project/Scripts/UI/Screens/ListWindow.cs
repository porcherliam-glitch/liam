using System;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The visible part of a list that is longer than its box (pure logic): <see cref="Visible"/> rows from
    /// <see cref="First"/> on, moved so the focused row stays visible; "▲ weitere" / "▼ weitere" show if rows are hidden.
    /// </summary>
    public sealed class ListWindow
    {
        /// <summary>Creates the window.</summary>
        /// <param name="visible">Rows that fit (at least 1).</param>
        public ListWindow(int visible)
        {
            Visible = Math.Max(1, visible);
        }

        /// <summary>Rows that fit.</summary>
        public int Visible { get; }

        /// <summary>Index of the first visible row.</summary>
        public int First { get; private set; }

        /// <summary>Number of rows.</summary>
        public int Count { get; private set; }

        /// <summary>True if rows are hidden above.</summary>
        public bool HasMoreAbove => First > 0;

        /// <summary>True if rows are hidden below.</summary>
        public bool HasMoreBelow => First + Visible < Count;

        /// <summary>Sets the number of rows (keeps the window inside the list).</summary>
        /// <param name="count">Rows.</param>
        public void SetCount(int count)
        {
            Count = Math.Max(0, count);
            Clamp();
        }

        /// <summary>Moves the window so that a row is visible.</summary>
        /// <param name="index">Row index (ignored if outside the list).</param>
        /// <returns>True if the window moved.</returns>
        public bool EnsureVisible(int index)
        {
            if (index < 0 || index >= Count)
            {
                return false;
            }

            int before = First;
            if (index < First)
            {
                First = index;
            }
            else if (index >= First + Visible)
            {
                First = index - Visible + 1;
            }

            Clamp();
            return First != before;
        }

        /// <summary>True if a row is inside the window.</summary>
        /// <param name="index">Row index.</param>
        public bool IsVisible(int index)
        {
            return index >= First && index < First + Visible && index < Count;
        }

        /// <summary>Back to the top.</summary>
        public void Reset()
        {
            First = 0;
        }

        private void Clamp()
        {
            First = Math.Max(0, Math.Min(First, Count - Visible));
        }
    }
}
