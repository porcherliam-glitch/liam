using System;
using Aetherfall.Events;

namespace Aetherfall.Input
{
    /// <summary>
    /// Maps a gamepad to its glyph family (GDD 05 1.5) from the strings the Input System reports: layout name (e.g.
    /// <c>XInputControllerWindows</c>, <c>DualSenseGamepadHID</c>, <c>SwitchProControllerHID</c>), product and
    /// manufacturer. Pure logic without Input System calls, so it is testable without the package and does not depend on
    /// platform-specific device classes.
    /// </summary>
    /// <remarks>
    /// Order: layout name first (most reliable), then manufacturer and product. Steam Input exposes its virtual controller
    /// as an XInput device and therefore counts as Xbox (open check point in GDD 05 1.5).
    /// </remarks>
    public static class DeviceClassifier
    {
        /// <summary>Returns the glyph family of a gamepad.</summary>
        /// <param name="layout">Layout name of the device (<c>InputDevice.layout</c>); may be null.</param>
        /// <param name="product">Product name of the device description; may be null.</param>
        /// <param name="manufacturer">Manufacturer of the device description; may be null.</param>
        /// <returns>Xbox, PlayStation, Nintendo or Generic – never KeyboardMouse.</returns>
        public static GlyphFamily ClassifyGamepad(string layout, string product, string manufacturer)
        {
            if (Contains(layout, "XInput") || Contains(layout, "Xbox"))
            {
                return GlyphFamily.Xbox;
            }

            if (Contains(layout, "DualShock") || Contains(layout, "DualSense"))
            {
                return GlyphFamily.PlayStation;
            }

            if (Contains(layout, "SwitchPro") || Contains(layout, "Nintendo"))
            {
                return GlyphFamily.Nintendo;
            }

            if (Contains(product, "Xbox") || Contains(manufacturer, "Microsoft"))
            {
                return GlyphFamily.Xbox;
            }

            if (Contains(manufacturer, "Sony") || Contains(product, "DualSense") || Contains(product, "DualShock"))
            {
                return GlyphFamily.PlayStation;
            }

            if (Contains(manufacturer, "Nintendo") || Contains(product, "Pro Controller"))
            {
                return GlyphFamily.Nintendo;
            }

            return GlyphFamily.Generic;
        }

        private static bool Contains(string text, string part)
        {
            return !string.IsNullOrEmpty(text) && text.IndexOf(part, StringComparison.OrdinalIgnoreCase) >= 0;
        }
    }
}
