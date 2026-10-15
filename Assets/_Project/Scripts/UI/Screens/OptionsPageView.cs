using System;
using System.Globalization;
using Aetherfall.Core;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Options placeholder page (OptionsPage.uxml): UI size (80–150 %), HUD mode, glyph style and difficulty (GDD 03 9.7: Geschichte,
    /// Normal, Schwer, Albtraum – at any time); left/right or confirm change the value (GDD 05 1.2, 1.5, 1.6). The full options
    /// menu follows with the Options step.
    /// </summary>
    public sealed class OptionsPageView
    {
        private const int UiScaleRow = 0;
        private const int HudModeRow = 1;
        private const int GlyphRow = 2;
        private const int DifficultyRow = 3;

        private readonly UiPreferences _preferences;
        private readonly Label _uiScaleValue;
        private readonly Label _hudModeValue;
        private readonly Label _glyphValue;
        private readonly Label _difficultyValue;
        private IDifficultyService _difficulty;

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
            list.Add(host.Q<VisualElement>("options-difficulty"));
            _uiScaleValue = host.Q<Label>("options-ui-scale-value");
            _hudModeValue = host.Q<Label>("options-hud-mode-value");
            _glyphValue = host.Q<Label>("options-glyphs-value");
            _difficultyValue = host.Q<Label>("options-difficulty-value");
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
                case DifficultyRow:
                    IDifficultyService difficulty = Difficulty();
                    if (difficulty == null)
                    {
                        return false;
                    }

                    int next = (((int)difficulty.Level + (delta >= 0 ? 1 : -1)) % 4 + 4) % 4;
                    difficulty.SetLevel((DifficultyLevel)next);
                    Refresh();
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
            IDifficultyService difficulty = Difficulty();
            UiElementUtility.SetText(_difficultyValue, UiTexts.Format(UiTextKeys.OptionValue, difficulty != null ? difficulty.Settings.Name : "Normal"));
        }

        private IDifficultyService Difficulty()
        {
            // Resolved on first use: the page is built while the boot may still register services.
            if (_difficulty == null && Services.Locator != null && Services.Locator.TryGet(out IDifficultyService difficulty))
            {
                _difficulty = difficulty;
                _difficulty.Changed += level => Refresh();
            }

            return _difficulty;
        }
    }
}
