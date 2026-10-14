using System;
using Aetherfall.Events;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// UI options that the options page changes at run time: UI size, HUD mode, glyph style, hold duration and message
    /// duration factor (GDD 05 1.4, 1.6, 1.7, 4.2). Pure logic.
    /// </summary>
    /// <remarks>
    /// TODO (Options step, architecture 4.1 step 4): load and save these values in <c>settings.json</c> through the options
    /// service and publish <c>OptionsChanged</c>; until then they reset when the game ends.
    /// </remarks>
    public sealed class UiPreferences
    {
        private int _uiPercent = UiScaleRules.DefaultUiPercent;
        private HudMode _hudMode = HudMode.Contextual;
        private GlyphFamily? _glyphStyle;

        /// <summary>Raised after any value changed.</summary>
        public event Action Changed;

        /// <summary>UI size in percent (80–150, steps of 10).</summary>
        public int UiPercent
        {
            get => _uiPercent;
            set => Set(ref _uiPercent, UiScaleRules.ClampUiPercent(value));
        }

        /// <summary>HUD mode.</summary>
        public HudMode HudMode
        {
            get => _hudMode;
            set => Set(ref _hudMode, value);
        }

        /// <summary>Fixed glyph family, or null for automatic.</summary>
        public GlyphFamily? GlyphStyle
        {
            get => _glyphStyle;
            set
            {
                if (_glyphStyle == value)
                {
                    return;
                }

                _glyphStyle = value;
                RaiseChanged();
            }
        }

        /// <summary>Cycles the HUD mode one step (options row left/right).</summary>
        /// <param name="direction">-1 or +1.</param>
        public void CycleHudMode(int direction)
        {
            int count = 3;
            int next = (((int)_hudMode + Math.Sign(direction)) % count + count) % count;
            HudMode = (HudMode)next;
        }

        /// <summary>Cycles the glyph style: automatic, keyboard, Xbox, PlayStation, Nintendo, generic.</summary>
        /// <param name="direction">-1 or +1.</param>
        public void CycleGlyphStyle(int direction)
        {
            // Index 0 = automatic, 1..5 = GlyphFamily 0..4.
            int count = 6;
            int current = _glyphStyle.HasValue ? (int)_glyphStyle.Value + 1 : 0;
            int next = ((current + Math.Sign(direction)) % count + count) % count;
            GlyphStyle = next == 0 ? (GlyphFamily?)null : (GlyphFamily)(next - 1);
        }

        /// <summary>Text of the HUD mode for the options page.</summary>
        public string HudModeText()
        {
            switch (_hudMode)
            {
                case HudMode.Full: return UiTexts.Get(UiTextKeys.HudModeFull);
                case HudMode.Minimal: return UiTexts.Get(UiTextKeys.HudModeMinimal);
                default: return UiTexts.Get(UiTextKeys.HudModeContextual);
            }
        }

        /// <summary>Text of the glyph style for the options page.</summary>
        public string GlyphStyleText()
        {
            if (!_glyphStyle.HasValue)
            {
                return UiTexts.Get(UiTextKeys.GlyphStyleAuto);
            }

            switch (_glyphStyle.Value)
            {
                case GlyphFamily.Xbox: return UiTexts.Get(UiTextKeys.GlyphStyleXbox);
                case GlyphFamily.PlayStation: return UiTexts.Get(UiTextKeys.GlyphStylePlayStation);
                case GlyphFamily.Nintendo: return UiTexts.Get(UiTextKeys.GlyphStyleNintendo);
                case GlyphFamily.Generic: return UiTexts.Get(UiTextKeys.GlyphStyleGeneric);
                default: return UiTexts.Get(UiTextKeys.GlyphStyleKeyboard);
            }
        }

        private void Set<T>(ref T field, T value)
        {
            if (System.Collections.Generic.EqualityComparer<T>.Default.Equals(field, value))
            {
                return;
            }

            field = value;
            RaiseChanged();
        }

        private void RaiseChanged()
        {
            Action changed = Changed;
            if (changed != null)
            {
                changed();
            }
        }
    }
}
