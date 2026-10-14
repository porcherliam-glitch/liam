using System;
using Aetherfall.Events;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// Which button glyphs the UI shows (GDD 05 1.5): follows <see cref="InputDeviceChanged"/> (keyboard, Xbox, PlayStation,
    /// Nintendo, generic) unless the option "Glyphen-Stil" fixes a family.
    /// </summary>
    public interface IGlyphService
    {
        /// <summary>Family that is shown now (style override or the detected device).</summary>
        GlyphFamily Family { get; }

        /// <summary>Family of the device the player used last.</summary>
        GlyphFamily DetectedFamily { get; }

        /// <summary>Fixed family of the option "Glyphen-Stil", or null for automatic.</summary>
        GlyphFamily? StyleOverride { get; }

        /// <summary>Raised when <see cref="Family"/> changes (views refresh their glyph labels).</summary>
        event Action Changed;

        /// <summary>Sets the option "Glyphen-Stil".</summary>
        /// <param name="family">Fixed family, or null for automatic.</param>
        void SetStyleOverride(GlyphFamily? family);

        /// <summary>Glyph text of a logical button in the current family.</summary>
        /// <param name="glyph">Logical button.</param>
        string Get(UiGlyph glyph);
    }
}
