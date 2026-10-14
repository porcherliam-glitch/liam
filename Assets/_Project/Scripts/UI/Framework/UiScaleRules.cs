using System;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// UI size option and scaling rules of GDD 05 1.6 (pure logic). The panel scales with the screen height (reference
    /// 1920 × 1080, so Retina and 4K keep the physical size); the UI size option multiplies that (80–150 % in steps of 10).
    /// Large sizes are limited so that nothing overlaps (GDD 05 1.6: the scaling is limited at 150 %): the logical layout
    /// keeps at least <see cref="MinLogicalWidth"/> × <see cref="MinLogicalHeight"/> pixels, the space the menus need.
    /// </summary>
    /// <remarks>
    /// The minimum comes from the layouts (Art/UI/Styles): the main menu with an open page needs about 1590 px in width
    /// (side margins 2 × 8.33 %, column 600, gap 80, page padding 98, save slot row of a damaged autosave with playtime
    /// about 555), the main menu column above its footer and the pause panel (780 px) about 830 px in height.
    /// Checked with the layout check of the HTML preview (Tools/Preview/ui, option --panel); about 2 % reserve for font
    /// differences. Result: at most about 118 % on 16:9 and 106 % on 16:10 screens; on 4:3 even 100 % becomes 89 %.
    /// </remarks>
    public static class UiScaleRules
    {
        /// <summary>Smallest UI size in percent.</summary>
        public const int MinUiPercent = 80;

        /// <summary>Largest UI size in percent.</summary>
        public const int MaxUiPercent = 150;

        /// <summary>Step of the UI size option in percent.</summary>
        public const int StepPercent = 10;

        /// <summary>Default UI size in percent.</summary>
        public const int DefaultUiPercent = 100;

        /// <summary>Reference width of the layout (px).</summary>
        public const int ReferenceWidth = 1920;

        /// <summary>Reference height of the layout (px).</summary>
        public const int ReferenceHeight = 1080;

        /// <summary>Logical width that must stay available at any UI size (main menu with an open page, see remarks).</summary>
        public const float MinLogicalWidth = 1620f;

        /// <summary>Logical height that must stay available at any UI size (main menu column with footer, pause panel).</summary>
        public const float MinLogicalHeight = 840f;

        /// <summary>Snaps a UI size to the allowed range and steps.</summary>
        /// <param name="percent">Requested size.</param>
        public static int ClampUiPercent(int percent)
        {
            int clamped = Math.Max(MinUiPercent, Math.Min(MaxUiPercent, percent));
            int steps = (int)Math.Round((clamped - MinUiPercent) / (double)StepPercent, MidpointRounding.AwayFromZero);
            return MinUiPercent + steps * StepPercent;
        }

        /// <summary>Next UI size one step up or down (stops at the ends).</summary>
        /// <param name="percent">Current size.</param>
        /// <param name="direction">-1 smaller, +1 larger.</param>
        public static int Step(int percent, int direction)
        {
            return ClampUiPercent(ClampUiPercent(percent) + Math.Sign(direction) * StepPercent);
        }

        /// <summary>
        /// Largest panel scale factor that keeps the logical layout at least <see cref="MinLogicalWidth"/> ×
        /// <see cref="MinLogicalHeight"/> on this screen (never below the smallest UI size).
        /// </summary>
        /// <param name="screenWidth">Screen width in pixels.</param>
        /// <param name="screenHeight">Screen height in pixels.</param>
        public static float MaxScaleFor(int screenWidth, int screenHeight)
        {
            if (screenWidth <= 0 || screenHeight <= 0)
            {
                return MaxUiPercent / 100f;
            }

            // The panel already scales by height/1080; the logical width is 1080 * aspect / scale.
            float aspect = screenWidth / (float)screenHeight;
            float byWidth = ReferenceHeight * aspect / MinLogicalWidth;
            float byHeight = ReferenceHeight / MinLogicalHeight;
            return Math.Max(MinUiPercent / 100f, Math.Min(byWidth, byHeight));
        }

        /// <summary>
        /// Scale factor for the panel settings (<c>PanelSettings.scale</c>, on top of the scaling by screen height): the UI
        /// size option, limited by <see cref="MaxScaleFor"/>.
        /// </summary>
        /// <param name="uiPercent">UI size option in percent.</param>
        /// <param name="screenWidth">Screen width in pixels.</param>
        /// <param name="screenHeight">Screen height in pixels.</param>
        public static float PanelScale(int uiPercent, int screenWidth, int screenHeight)
        {
            float requested = ClampUiPercent(uiPercent) / 100f;
            return Math.Min(requested, MaxScaleFor(screenWidth, screenHeight));
        }
    }
}
