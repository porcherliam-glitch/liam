// Global events of the input system (architecture 4.3, event #5). Several event structs of one area may share a file
// (architecture 15.2, rule 18).

using Aetherfall.Core;

namespace Aetherfall.Events
{
    /// <summary>
    /// The player switched to another input device or glyph family (e.g. keyboard → Xbox controller). Sent by the
    /// InputService only when the kind or the glyph family actually changes; receivers (UI glyphs, cursor) read the
    /// initial value from the service itself.
    /// </summary>
    public readonly struct InputDeviceChanged : IGameEvent
    {
        /// <summary>Kind of the device that is active now.</summary>
        public readonly DeviceKind DeviceKind;

        /// <summary>Glyph family that matches the active device.</summary>
        public readonly GlyphFamily GlyphFamily;

        /// <summary>Creates the event.</summary>
        /// <param name="deviceKind">Kind of the device that is active now.</param>
        /// <param name="glyphFamily">Glyph family that matches the active device.</param>
        public InputDeviceChanged(DeviceKind deviceKind, GlyphFamily glyphFamily)
        {
            DeviceKind = deviceKind;
            GlyphFamily = glyphFamily;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "InputDeviceChanged(" + DeviceKind + ", " + GlyphFamily + ")";
        }
    }
}
