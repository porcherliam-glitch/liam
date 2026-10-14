using System;
using System.Globalization;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Options placeholder page (OptionsPage.uxml): UI size (80–150 %), HUD mode and glyph style; left/right or confirm
    /// change the value (GDD 05 1.2, 1.5, 1.6). The full options menu follows with the Options step.
    /// </summary>
    public sealed class OptionsPageView
    {
        private const int UiScaleRow = 0;
        private const int HudModeRow = 1;
        private const int GlyphRow = 2;

        private readonly UiPreferences _preferences;
        private readonly Label _uiScaleValue;
        private readonly Label _hudModeValue;
        private readonly Label _glyphValue;

        /// <summary>Builds the page into a host element.</summary>
        /// <param name="host">Element that receives the page.</param>
        /// <param name="pageAsset">OptionsPage.uxml.</param>
        /// <param name="list">Item list of the page.</param>
        /// <param name="preferences">UI options.</param>
        public OptionsPageView(VisualElement host, VisualTreeAsset pageAsset, MenuItemList list, UiPreferences preferences)
        {
            if (host == null || pageAsset == null || list == null || preferences == null)
            {
                throw new ArgumentNullException(host == null ? nameof(host) : pageAsset == null ? nameof(pageAsset) : list == null ? nameof(list) : nameof(preferences));
            }

            _preferences = preferences;
            pageAsset.CloneTree(host);
            UiElementUtility.ApplyTexts(host);
            list.Add(host.Q<VisualElement>("options-ui-scale"));
            list.Add(host.Q<VisualElement>("options-hud-mode"));
            list.Add(host.Q<VisualElement>("options-glyphs"));
            _uiScaleValue = host.Q<Label>("options-ui-scale-value");
            _hudModeValue = host.Q<Label>("options-hud-mode-value");
            _glyphValue = host.Q<Label>("options-glyphs-value");
            _preferences.Changed += Refresh;
            Refresh();
        }

        /// <summary>Left/right on a row.</summary>
        /// <param name="index">Row.</param>
        /// <param name="delta">-1 or +1.</param>
        /// <returns>True if the row changed a value.</returns>
        public bool TryAdjust(int index, int delta)
        {
            switch (index)
            {
                case UiScaleRow:
                    _preferences.UiPercent = UiScaleRules.Step(_preferences.UiPercent, delta);
                    return true;
                case HudModeRow:
                    _preferences.CycleHudMode(delta);
                    return true;
                case GlyphRow:
                    _preferences.CycleGlyphStyle(delta);
                    return true;
                default:
                    return false;
            }
        }

        /// <summary>Confirm on a row: next value (the UI size wraps from 150 % back to 80 %).</summary>
        /// <param name="index">Row.</param>
        public void Submit(int index)
        {
            if (index == UiScaleRow && _preferences.UiPercent >= UiScaleRules.MaxUiPercent)
            {
                _preferences.UiPercent = UiScaleRules.MinUiPercent;
                return;
            }

            TryAdjust(index, 1);
        }

        private void Refresh()
        {
            UiElementUtility.SetText(_uiScaleValue, UiTexts.Format(UiTextKeys.OptionValue,
                UiTexts.Format(UiTextKeys.Percent, _preferences.UiPercent.ToString(CultureInfo.InvariantCulture))));
            UiElementUtility.SetText(_hudModeValue, UiTexts.Format(UiTextKeys.OptionValue, _preferences.HudModeText()));
            UiElementUtility.SetText(_glyphValue, UiTexts.Format(UiTextKeys.OptionValue, _preferences.GlyphStyleText()));
        }
    }
}
