using Aetherfall.Events;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Text glyphs per device family (GDD 05 1.5 table; sprites follow later). Pure data. PlayStation face buttons use
    /// symbols that every Latin font with the WGL4 character set has (× ○ □ ▲); Nintendo keeps the position rule (south
    /// button = confirm, labelled "B").
    /// </summary>
    /// <remarks>
    /// Keyboard glyphs are the default bindings of <c>GameInputBindings</c>. TODO (rebinding/options step): read the current
    /// binding display strings of the active keyboard layout (QWERTZ, AZERTY) instead of the defaults (GDD 05 1.5).
    /// </remarks>
    public static class GlyphCatalog
    {
        /// <summary>Returns the glyph text of a logical button for a device family.</summary>
        /// <param name="glyph">Logical button.</param>
        /// <param name="family">Device family.</param>
        public static string Get(UiGlyph glyph, GlyphFamily family)
        {
            switch (family)
            {
                case GlyphFamily.Xbox: return Xbox(glyph);
                case GlyphFamily.PlayStation: return PlayStation(glyph);
                case GlyphFamily.Nintendo: return Nintendo(glyph);
                case GlyphFamily.Generic: return Generic(glyph);
                default: return Keyboard(glyph);
            }
        }

        /// <summary>True for families of gamepads (round face buttons and shoulder labels).</summary>
        /// <param name="family">Device family.</param>
        public static bool IsGamepad(GlyphFamily family)
        {
            return family != GlyphFamily.KeyboardMouse;
        }

        /// <summary>USS class suffix of a family (<c>glyphs-xbox</c> …) for family specific glyph styles.</summary>
        /// <param name="family">Device family.</param>
        public static string StyleClass(GlyphFamily family)
        {
            switch (family)
            {
                case GlyphFamily.Xbox: return "glyphs-xbox";
                case GlyphFamily.PlayStation: return "glyphs-playstation";
                case GlyphFamily.Nintendo: return "glyphs-nintendo";
                case GlyphFamily.Generic: return "glyphs-generic";
                default: return "glyphs-keyboard";
            }
        }

        private static string Keyboard(UiGlyph glyph)
        {
            switch (glyph)
            {
                case UiGlyph.Confirm: return "Enter";
                case UiGlyph.Back: return "Esc";
                case UiGlyph.Secondary: return "F";
                case UiGlyph.Sort: return "R";
                case UiGlyph.TabPrev: return "Q";
                case UiGlyph.TabNext: return "E";
                case UiGlyph.SubTabPrev: return "Z";
                case UiGlyph.SubTabNext: return "C";
                case UiGlyph.Details: return "Shift";
                case UiGlyph.Map: return "M";
                case UiGlyph.Menu: return "Esc";
                case UiGlyph.Interact: return "E";
                case UiGlyph.Ability1: return "1";
                case UiGlyph.Ability2: return "2";
                case UiGlyph.Ability3: return "3";
                case UiGlyph.Ability4: return "4";
                case UiGlyph.QuickSlot1: return "5";
                case UiGlyph.QuickSlot2: return "6";
                case UiGlyph.QuickSlot3: return "7";
                case UiGlyph.QuickSlot4: return "8";
                default: return "?";
            }
        }

        private static string Xbox(UiGlyph glyph)
        {
            switch (glyph)
            {
                case UiGlyph.Confirm: return "A";
                case UiGlyph.Back: return "B";
                case UiGlyph.Secondary: return "X";
                case UiGlyph.Sort: return "Y";
                case UiGlyph.TabPrev: return "LB";
                case UiGlyph.TabNext: return "RB";
                case UiGlyph.SubTabPrev: return "LT";
                case UiGlyph.SubTabNext: return "RT";
                case UiGlyph.Details: return "R3";
                case UiGlyph.Map: return "View";
                case UiGlyph.Menu: return "Menu";
                case UiGlyph.Interact: return "A";
                case UiGlyph.Ability1: return "RB+X";
                case UiGlyph.Ability2: return "RB+Y";
                case UiGlyph.Ability3: return "RB+B";
                case UiGlyph.Ability4: return "RB+A";
                default: return DPad(glyph);
            }
        }

        private static string PlayStation(UiGlyph glyph)
        {
            switch (glyph)
            {
                case UiGlyph.Confirm: return "×";
                case UiGlyph.Back: return "○";
                case UiGlyph.Secondary: return "□";
                case UiGlyph.Sort: return "▲";
                case UiGlyph.TabPrev: return "L1";
                case UiGlyph.TabNext: return "R1";
                case UiGlyph.SubTabPrev: return "L2";
                case UiGlyph.SubTabNext: return "R2";
                case UiGlyph.Details: return "R3";
                case UiGlyph.Map: return "Touchpad";
                case UiGlyph.Menu: return "Options";
                case UiGlyph.Interact: return "×";
                case UiGlyph.Ability1: return "R1+□";
                case UiGlyph.Ability2: return "R1+▲";
                case UiGlyph.Ability3: return "R1+○";
                case UiGlyph.Ability4: return "R1+×";
                default: return DPad(glyph);
            }
        }

        private static string Nintendo(UiGlyph glyph)
        {
            switch (glyph)
            {
                case UiGlyph.Confirm: return "B";
                case UiGlyph.Back: return "A";
                case UiGlyph.Secondary: return "Y";
                case UiGlyph.Sort: return "X";
                case UiGlyph.TabPrev: return "L";
                case UiGlyph.TabNext: return "R";
                case UiGlyph.SubTabPrev: return "ZL";
                case UiGlyph.SubTabNext: return "ZR";
                case UiGlyph.Details: return "R-Stick";
                case UiGlyph.Map: return "−";
                case UiGlyph.Menu: return "+";
                case UiGlyph.Interact: return "B";
                case UiGlyph.Ability1: return "R+Y";
                case UiGlyph.Ability2: return "R+X";
                case UiGlyph.Ability3: return "R+A";
                case UiGlyph.Ability4: return "R+B";
                default: return DPad(glyph);
            }
        }

        private static string Generic(UiGlyph glyph)
        {
            switch (glyph)
            {
                case UiGlyph.Confirm: return "Süd";
                case UiGlyph.Back: return "Ost";
                case UiGlyph.Secondary: return "West";
                case UiGlyph.Sort: return "Nord";
                case UiGlyph.TabPrev: return "L";
                case UiGlyph.TabNext: return "R";
                case UiGlyph.SubTabPrev: return "LT";
                case UiGlyph.SubTabNext: return "RT";
                case UiGlyph.Details: return "R-Stick";
                case UiGlyph.Map: return "Select";
                case UiGlyph.Menu: return "Start";
                case UiGlyph.Interact: return "Süd";
                case UiGlyph.Ability1: return "R+West";
                case UiGlyph.Ability2: return "R+Nord";
                case UiGlyph.Ability3: return "R+Ost";
                case UiGlyph.Ability4: return "R+Süd";
                default: return DPad(glyph);
            }
        }

        private static string DPad(UiGlyph glyph)
        {
            switch (glyph)
            {
                case UiGlyph.QuickSlot1: return "↑";
                case UiGlyph.QuickSlot2: return "→";
                case UiGlyph.QuickSlot3: return "↓";
                case UiGlyph.QuickSlot4: return "←";
                default: return "?";
            }
        }
    }
}
