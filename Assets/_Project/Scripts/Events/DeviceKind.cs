namespace Aetherfall.Events
{
    /// <summary>
    /// Kind of the input device the player used last (architecture 11.1 "device detection", GDD 05 1.5).
    /// Payload of <see cref="InputDeviceChanged"/>. Values may be serialized (options); never renumber them.
    /// </summary>
    public enum DeviceKind
    {
        /// <summary>No device detected yet.</summary>
        Unknown = 0,

        /// <summary>Keyboard and mouse.</summary>
        KeyboardMouse = 1,

        /// <summary>Any gamepad (Xbox, PlayStation, Nintendo or generic).</summary>
        Gamepad = 2
    }
}
