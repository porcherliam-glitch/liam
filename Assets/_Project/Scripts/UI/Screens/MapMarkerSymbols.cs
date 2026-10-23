using Aetherfall.UI.Framework;
using Aetherfall.World.Exploration;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The six symbols of the own markers (GDD 05 1.8): glyph, colour tone (USS classes <c>…--tone-own0</c> to <c>own5</c>, colours
    /// <c>--marker-own-0</c> to <c>-5</c> in Tokens.uss) and German name. The glyphs exist in every common UI font (WGL4).
    /// </summary>
    public static class MapMarkerSymbols
    {
        private static readonly string[] Glyphs = { "●", "▲", "■", "◆", "♣", "♥" };

        // Built once: the HUD asks for them every frame (no allocation per frame).
        private static readonly string[] Tones = { "own0", "own1", "own2", "own3", "own4", "own5" };

        private static readonly string[] NameKeys =
        {
            UiTextKeys.MapMarkerSymbol0, UiTextKeys.MapMarkerSymbol1, UiTextKeys.MapMarkerSymbol2,
            UiTextKeys.MapMarkerSymbol3, UiTextKeys.MapMarkerSymbol4, UiTextKeys.MapMarkerSymbol5
        };

        /// <summary>Glyph of a symbol.</summary>
        /// <param name="symbol">Symbol index (wraps).</param>
        public static string Glyph(int symbol)
        {
            return Glyphs[MapMarkerRules.ClampSymbol(symbol)];
        }

        /// <summary>Colour tone of a symbol (USS class suffix).</summary>
        /// <param name="symbol">Symbol index (wraps).</param>
        public static string Tone(int symbol)
        {
            return Tones[MapMarkerRules.ClampSymbol(symbol)];
        }

        /// <summary>German name of a symbol, e.g. "Gefahr".</summary>
        /// <param name="symbol">Symbol index (wraps).</param>
        public static string Name(int symbol)
        {
            return UiTexts.Get(NameKeys[MapMarkerRules.ClampSymbol(symbol)]);
        }
    }
}
