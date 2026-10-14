using System;
using System.Collections.Generic;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The load page (LoadPage.uxml) with one row per save (SaveSlotRow.uxml: kind, date and time, playtime; GDD 05 5.5).
    /// Damaged saves are shown but cannot be chosen. Used by the main menu and the pause menu.
    /// </summary>
    /// <remarks>Shows the newest <see cref="MaxRows"/> saves. TODO (save menu step): scroll list, delete with hold, character folders.</remarks>
    public sealed class SaveSlotListView
    {
        /// <summary>Number of rows that fit on the page.</summary>
        public const int MaxRows = 5;

        private readonly VisualTreeAsset _rowAsset;
        private readonly MenuItemList _list;
        private readonly bool _holdToLoad;
        private readonly VisualElement _rows;
        private readonly Label _empty;
        private readonly Label _status;
        private readonly List<string> _slotIds = new List<string>(MaxRows);

        /// <summary>Builds the page into a host element.</summary>
        /// <param name="host">Element that receives the page.</param>
        /// <param name="pageAsset">LoadPage.uxml.</param>
        /// <param name="rowAsset">SaveSlotRow.uxml.</param>
        /// <param name="list">Item list of the page.</param>
        /// <param name="holdToLoad">True: loading needs hold-to-confirm (in the game, the current progress is lost).</param>
        public SaveSlotListView(VisualElement host, VisualTreeAsset pageAsset, VisualTreeAsset rowAsset, MenuItemList list, bool holdToLoad)
        {
            if (host == null || pageAsset == null || rowAsset == null || list == null)
            {
                throw new ArgumentNullException(host == null ? nameof(host) : pageAsset == null ? nameof(pageAsset) : rowAsset == null ? nameof(rowAsset) : nameof(list));
            }

            _rowAsset = rowAsset;
            _list = list;
            _holdToLoad = holdToLoad;
            pageAsset.CloneTree(host);
            UiElementUtility.ApplyTexts(host);
            _rows = host.Q<VisualElement>("load-list");
            _empty = host.Q<Label>("load-empty");
            _status = host.Q<Label>("load-status");
            SetStatus(string.Empty);
        }

        /// <summary>Slot id of a row.</summary>
        /// <param name="index">Row index.</param>
        public string SlotIdAt(int index)
        {
            return index >= 0 && index < _slotIds.Count ? _slotIds[index] : string.Empty;
        }

        /// <summary>Rebuilds the rows from the slot list (newest first).</summary>
        /// <param name="slots">Slots of the current character.</param>
        public void Refresh(IReadOnlyList<SaveSlotInfo> slots)
        {
            _list.Clear();
            _slotIds.Clear();
            _rows.Clear();
            int count = slots != null ? Math.Min(MaxRows, slots.Count) : 0;
            for (int i = 0; i < count; i++)
            {
                SaveSlotInfo slot = slots[i];
                _rowAsset.CloneTree(_rows);
                VisualElement row = _rows[_rows.childCount - 1];
                UiElementUtility.SetText(row.Q<Label>("slot-kind"), slot.IsDamaged
                    ? UiTexts.Format(UiTextKeys.SlotDamaged, SaveSlotText.KindName(slot.Kind))
                    : SaveSlotText.KindName(slot.Kind));
                UiElementUtility.SetText(row.Q<Label>("slot-date"), SaveSlotText.DateTime(slot.CreatedUtc));
                UiElementUtility.SetText(row.Q<Label>("slot-playtime"),
                    slot.Header != null ? SaveSlotText.PlaytimeLine(slot.Header.PlaytimeSeconds) : string.Empty);
                row.EnableInClassList("is-damaged", slot.IsDamaged);
                int index = _list.Add(row, _holdToLoad);
                _slotIds.Add(slot.SlotId);
                if (slot.IsDamaged)
                {
                    _list.SetEnabled(index, false);
                }
            }

            UiElementUtility.SetDisplayed(_empty, count == 0);
            _list.Focus.FocusFirst();
            _list.RefreshFocus();
        }

        /// <summary>Shows an error or status line under the list (empty hides it).</summary>
        /// <param name="text">Text.</param>
        public void SetStatus(string text)
        {
            UiElementUtility.SetText(_status, text);
            UiElementUtility.SetDisplayed(_status, !string.IsNullOrEmpty(text));
        }
    }
}
