using System.Collections.Generic;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Base of the menu screens of this step (main menu, pause menu, death screen): a visual root that opens and closes with
    /// the USS transition, one or more <see cref="MenuItemList"/> pages of which one is active, glyph labels that follow the
    /// device, and the pointer routing to the UI manager.
    /// </summary>
    public abstract class MenuScreen : UIScreen
    {
        private readonly List<KeyValuePair<Label, UiGlyph>> _glyphLabels = new List<KeyValuePair<Label, UiGlyph>>();
        private readonly IGlyphService _glyphs;
        private MenuItemList _active;

        /// <summary>Creates the screen around its root element (instantiated from the UXML).</summary>
        /// <param name="screenId">Screen id.</param>
        /// <param name="root">Root element of the screen.</param>
        /// <param name="glyphs">Glyph service.</param>
        protected MenuScreen(string screenId, VisualElement root, IGlyphService glyphs) : base(screenId, UILayer.Screens)
        {
            Root = root;
            _glyphs = glyphs;
            UiElementUtility.ApplyTexts(root);
            UiElementUtility.HideImmediately(root);
        }

        /// <summary>Root element of the screen.</summary>
        protected VisualElement Root { get; }

        /// <summary>The page whose items have the focus.</summary>
        protected MenuItemList ActiveList => _active;

        /// <summary>Creates a list whose pointer events reach this screen.</summary>
        /// <param name="key">Page key.</param>
        protected MenuItemList CreateList(string key)
        {
            return new MenuItemList(key, OnItemEnter, OnItemHold, OnItemClick);
        }

        /// <summary>Makes a list the active page (its focus group becomes <see cref="UIScreen.Focus"/>).</summary>
        /// <param name="list">List.</param>
        /// <param name="focusIndex">Index to focus (-1 = keep the remembered index, or the first item).</param>
        protected void Activate(MenuItemList list, int focusIndex = -1)
        {
            if (_active != null && !ReferenceEquals(_active, list))
            {
                _active.RefreshFocus(false);
            }

            _active = list;
            Focus = list != null ? list.Focus : null;
            if (list != null)
            {
                if (focusIndex >= 0)
                {
                    list.Focus.Restore(focusIndex);
                }
                else if (!list.Focus.HasFocus)
                {
                    list.Focus.FocusFirst();
                }

                list.RefreshFocus();
            }
        }

        /// <summary>Collects the glyph labels of the root (call after building) and shows the current family.</summary>
        protected void BindGlyphs()
        {
            _glyphLabels.Clear();
            UiElementUtility.CollectGlyphLabels(Root, _glyphLabels);
            RefreshGlyphs();
        }

        /// <summary>Shows the glyphs of the current device family.</summary>
        public void RefreshGlyphs()
        {
            UiElementUtility.RefreshGlyphs(Root, _glyphLabels, _glyphs);
        }

        /// <inheritdoc />
        public override bool RequiresHold(int index)
        {
            return _active != null && _active.RequiresHold(index);
        }

        /// <inheritdoc />
        public override void FocusChanged(int previous, int current)
        {
            if (_active != null)
            {
                _active.RefreshFocus();
            }
        }

        /// <inheritdoc />
        public override void HoldProgress(int index, float progress01)
        {
            if (_active != null)
            {
                _active.SetHoldProgress(index, progress01);
            }
        }

        /// <inheritdoc />
        protected override void OnOpen(object args)
        {
            RefreshGlyphs();
            UiElementUtility.ShowAnimated(Root);
        }

        /// <inheritdoc />
        protected override void OnClose()
        {
            UiElementUtility.HideAnimated(Root);
        }

        private void OnItemEnter(MenuItemList list, int index)
        {
            if (ReferenceEquals(list, _active))
            {
                PointerEntered(index);
            }
        }

        private void OnItemHold(MenuItemList list, int index, bool held)
        {
            if (ReferenceEquals(list, _active) || !held)
            {
                PointerHold(index, held);
            }
        }

        private void OnItemClick(MenuItemList list, int index)
        {
            if (ReferenceEquals(list, _active))
            {
                PointerClicked(index);
            }
        }
    }
}
