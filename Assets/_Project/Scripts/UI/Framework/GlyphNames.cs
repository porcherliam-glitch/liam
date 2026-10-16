using System;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Naming rule for glyph labels in UXML (pure logic): a label named <c>…-glyph-&lt;id&gt;</c> shows the glyph of
    /// <c>&lt;id&gt;</c>, e.g. <c>pause-hint-glyph-back</c> → <see cref="UiGlyph.Back"/>. Ids: confirm, back, secondary,
    /// sort, tabprev, tabnext, subtabprev, subtabnext, details, map, menu, interact, ability1–4, quick1–4, skip.
    /// </summary>
    public static class GlyphNames
    {
        /// <summary>Marker in element names before the glyph id.</summary>
        public const string Marker = "-glyph-";

        /// <summary>Reads the glyph of an element name.</summary>
        /// <param name="elementName">Element name.</param>
        /// <param name="glyph">The glyph, or Confirm.</param>
        /// <returns>True if the name follows the rule.</returns>
        public static bool TryParseElementName(string elementName, out UiGlyph glyph)
        {
            glyph = UiGlyph.Confirm;
            if (string.IsNullOrEmpty(elementName))
            {
                return false;
            }

            int marker = elementName.LastIndexOf(Marker, StringComparison.Ordinal);
            return marker >= 0 && TryParseId(elementName.Substring(marker + Marker.Length), out glyph);
        }

        /// <summary>Reads a glyph id.</summary>
        /// <param name="id">Id such as <c>back</c> or <c>ability2</c>.</param>
        /// <param name="glyph">The glyph, or Confirm.</param>
        /// <returns>True for a known id.</returns>
        public static bool TryParseId(string id, out UiGlyph glyph)
        {
            switch (id)
            {
                case "confirm": glyph = UiGlyph.Confirm; return true;
                case "back": glyph = UiGlyph.Back; return true;
                case "secondary": glyph = UiGlyph.Secondary; return true;
                case "sort": glyph = UiGlyph.Sort; return true;
                case "tabprev": glyph = UiGlyph.TabPrev; return true;
                case "tabnext": glyph = UiGlyph.TabNext; return true;
                case "subtabprev": glyph = UiGlyph.SubTabPrev; return true;
                case "subtabnext": glyph = UiGlyph.SubTabNext; return true;
                case "details": glyph = UiGlyph.Details; return true;
                case "map": glyph = UiGlyph.Map; return true;
                case "menu": glyph = UiGlyph.Menu; return true;
                case "interact": glyph = UiGlyph.Interact; return true;
                case "ability1": glyph = UiGlyph.Ability1; return true;
                case "ability2": glyph = UiGlyph.Ability2; return true;
                case "ability3": glyph = UiGlyph.Ability3; return true;
                case "ability4": glyph = UiGlyph.Ability4; return true;
                case "quick1": glyph = UiGlyph.QuickSlot1; return true;
                case "quick2": glyph = UiGlyph.QuickSlot2; return true;
                case "quick3": glyph = UiGlyph.QuickSlot3; return true;
                case "quick4": glyph = UiGlyph.QuickSlot4; return true;
                case "skip": glyph = UiGlyph.Skip; return true;
                default: glyph = UiGlyph.Confirm; return false;
            }
        }
    }
}
