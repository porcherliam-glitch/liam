namespace Aetherfall.Events
{
    /// <summary>
    /// Button glyph family shown in the UI (GDD 05 1.5, architecture 11.1 "Glyphen"). One <c>GlyphSet</c> asset per family
    /// will map control paths to sprites. Values may be serialized (option "Glyphen-Stil"); never renumber them.
    /// </summary>
    public enum GlyphFamily
    {
        /// <summary>Keyboard and mouse labels of the active keyboard layout.</summary>
        KeyboardMouse = 0,

        /// <summary>Xbox controllers (and XInput devices such as Steam Input virtual controllers).</summary>
        Xbox = 1,

        /// <summary>PlayStation controllers (DualShock, DualSense).</summary>
        PlayStation = 2,

        /// <summary>Nintendo Switch Pro controller (position-based A/B labels, GDD 05 1.5).</summary>
        Nintendo = 3,

        /// <summary>Any other gamepad: position symbols (south, east, west, north button).</summary>
        Generic = 4
    }
}
