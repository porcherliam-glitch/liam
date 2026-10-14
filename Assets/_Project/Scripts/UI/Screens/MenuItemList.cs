using System;
using System.Collections.Generic;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The items of one menu list (buttons of a page): their <see cref="FocusGroup"/>, the focus frame and disabled state,
    /// hold-to-confirm items with their progress bar, and the pointer wiring (hover = focus, click = confirm, hold = hold).
    /// A screen can own several lists (pages); only the active one reacts to the pointer.
    /// </summary>
    public sealed class MenuItemList
    {
        private readonly List<VisualElement> _items = new List<VisualElement>(8);
        private readonly List<VisualElement> _holdFills = new List<VisualElement>(8);
        private readonly List<bool> _hold = new List<bool>(8);
        private readonly Action<MenuItemList, int> _onEnter;
        private readonly Action<MenuItemList, int, bool> _onHold;
        private readonly Action<MenuItemList, int> _onClick;

        /// <summary>Creates an empty list.</summary>
        /// <param name="key">Page key (focus memory).</param>
        /// <param name="onEnter">Hover callback (list, index).</param>
        /// <param name="onHold">Mouse button down/up callback (list, index, held).</param>
        /// <param name="onClick">Click callback (list, index).</param>
        public MenuItemList(string key, Action<MenuItemList, int> onEnter, Action<MenuItemList, int, bool> onHold, Action<MenuItemList, int> onClick)
        {
            Key = key ?? string.Empty;
            _onEnter = onEnter;
            _onHold = onHold;
            _onClick = onClick;
            Focus = new FocusGroup(0, FocusLayout.Vertical, 1, true);
        }

        /// <summary>Page key (focus memory).</summary>
        public string Key { get; }

        /// <summary>Focus group of the items.</summary>
        public FocusGroup Focus { get; }

        /// <summary>Number of items.</summary>
        public int Count => _items.Count;

        /// <summary>Item element.</summary>
        /// <param name="index">Item index.</param>
        public VisualElement this[int index] => _items[index];

        /// <summary>Adds an item and wires its pointer events.</summary>
        /// <param name="element">Item element (usually a Button); null is ignored and returns -1.</param>
        /// <param name="requiresHold">True for hold-to-confirm items (they need a child with class <c>af-button__hold-fill</c>).</param>
        /// <returns>Index of the item.</returns>
        public int Add(VisualElement element, bool requiresHold = false)
        {
            if (element == null)
            {
                return -1;
            }

            int index = _items.Count;
            _items.Add(element);
            _hold.Add(requiresHold);
            _holdFills.Add(element.Q<VisualElement>(className: "af-button__hold-fill"));
            Focus.SetCount(_items.Count);
            UiElementUtility.BindItem(element,
                () => _onEnter?.Invoke(this, index),
                held => _onHold?.Invoke(this, index, held),
                () => _onClick?.Invoke(this, index));
            return index;
        }

        /// <summary>Removes all items (the caller removes the elements from the tree).</summary>
        public void Clear()
        {
            _items.Clear();
            _hold.Clear();
            _holdFills.Clear();
            Focus.SetCount(0);
        }

        /// <summary>True for hold-to-confirm items.</summary>
        /// <param name="index">Item index.</param>
        public bool RequiresHold(int index)
        {
            return index >= 0 && index < _hold.Count && _hold[index];
        }

        /// <summary>Enables or disables an item (focus skips it, it looks dimmed).</summary>
        /// <param name="index">Item index.</param>
        /// <param name="enabled">True = enabled.</param>
        public void SetEnabled(int index, bool enabled)
        {
            if (index < 0 || index >= _items.Count)
            {
                return;
            }

            int previous = Focus.Current;
            Focus.SetEnabled(index, enabled);
            UiElementUtility.SetDisabled(_items[index], !enabled);
            if (previous != Focus.Current)
            {
                RefreshFocus();
            }
        }

        /// <summary>Updates the focus frame of all items (only the focused one shows it).</summary>
        /// <param name="active">False hides the frame on all items (list not active).</param>
        public void RefreshFocus(bool active = true)
        {
            for (int i = 0; i < _items.Count; i++)
            {
                UiElementUtility.SetFocused(_items[i], active && i == Focus.Current);
            }
        }

        /// <summary>Shows the hold progress of an item.</summary>
        /// <param name="index">Item index.</param>
        /// <param name="progress01">Progress 0..1.</param>
        public void SetHoldProgress(int index, float progress01)
        {
            if (index >= 0 && index < _holdFills.Count)
            {
                UiElementUtility.SetFill(_holdFills[index], progress01);
            }
        }
    }
}
