using System;
using Aetherfall.Events;

namespace Aetherfall.Input
{
    /// <summary>
    /// Decides which input device is "active" from activity reports (GDD 05 1.5, "Wechselregeln"): every gamepad button
    /// or a stick deflection above 50 % selects the gamepad, every key press, mouse click or more than 10 pixels of mouse
    /// movement within 0.1 s selects keyboard and mouse. After a switch, further switches are ignored for 0.3 s
    /// (hysteresis against flickering). Pure logic; the caller passes the time.
    /// </summary>
    public sealed class ActiveDeviceTracker
    {
        /// <summary>Minimum time between two switches in seconds (GDD 05 1.5).</summary>
        public const double DefaultHysteresisSeconds = 0.3;

        /// <summary>Mouse movement in pixels that counts as keyboard/mouse activity (GDD 05 1.5).</summary>
        public const float DefaultPointerThresholdPixels = 10f;

        /// <summary>Window in seconds in which the mouse movement is summed up (GDD 05 1.5).</summary>
        public const double DefaultPointerWindowSeconds = 0.1;

        private readonly double _hysteresisSeconds;
        private readonly float _pointerThresholdPixels;
        private readonly double _pointerWindowSeconds;
        private double _lastSwitchTime = double.NegativeInfinity;
        private double _pointerWindowStart = double.NegativeInfinity;
        private float _pointerAccumulated;

        /// <summary>Creates a tracker with the values of GDD 05 1.5 unless others are given.</summary>
        /// <param name="initialKind">Device kind before any activity.</param>
        /// <param name="initialFamily">Glyph family before any activity.</param>
        /// <param name="hysteresisSeconds">Minimum time between two switches (≥ 0).</param>
        /// <param name="pointerThresholdPixels">Mouse movement that counts as activity (&gt; 0).</param>
        /// <param name="pointerWindowSeconds">Window for summing up mouse movement (&gt; 0).</param>
        public ActiveDeviceTracker(
            DeviceKind initialKind = DeviceKind.KeyboardMouse,
            GlyphFamily initialFamily = GlyphFamily.KeyboardMouse,
            double hysteresisSeconds = DefaultHysteresisSeconds,
            float pointerThresholdPixels = DefaultPointerThresholdPixels,
            double pointerWindowSeconds = DefaultPointerWindowSeconds)
        {
            if (hysteresisSeconds < 0d || double.IsNaN(hysteresisSeconds))
            {
                throw new ArgumentOutOfRangeException(nameof(hysteresisSeconds), hysteresisSeconds, "Must be 0 or more.");
            }

            if (!(pointerThresholdPixels > 0f))
            {
                throw new ArgumentOutOfRangeException(nameof(pointerThresholdPixels), pointerThresholdPixels, "Must be greater than 0.");
            }

            if (!(pointerWindowSeconds > 0d))
            {
                throw new ArgumentOutOfRangeException(nameof(pointerWindowSeconds), pointerWindowSeconds, "Must be greater than 0.");
            }

            Kind = initialKind;
            Family = initialFamily;
            _hysteresisSeconds = hysteresisSeconds;
            _pointerThresholdPixels = pointerThresholdPixels;
            _pointerWindowSeconds = pointerWindowSeconds;
        }

        /// <summary>Kind of the active device.</summary>
        public DeviceKind Kind { get; private set; }

        /// <summary>Glyph family of the active device.</summary>
        public GlyphFamily Family { get; private set; }

        /// <summary>
        /// Reports qualifying activity of a device (a button press, a stick above 50 %, a key press, a mouse click).
        /// </summary>
        /// <param name="kind">Kind of the device that was used.</param>
        /// <param name="family">Glyph family of that device.</param>
        /// <param name="time">Current time in seconds (unscaled, monotonic).</param>
        /// <returns>True if the active device kind or glyph family changed.</returns>
        public bool ReportActivity(DeviceKind kind, GlyphFamily family, double time)
        {
            if (kind == DeviceKind.Unknown || (kind == Kind && family == Family))
            {
                return false;
            }

            if (time - _lastSwitchTime < _hysteresisSeconds)
            {
                return false;
            }

            Kind = kind;
            Family = family;
            _lastSwitchTime = time;
            ResetPointerWindow();
            return true;
        }

        /// <summary>
        /// Reports mouse movement. Counts as keyboard/mouse activity once more than the threshold was moved within the window.
        /// </summary>
        /// <param name="pixels">Distance the mouse moved since the last report, in pixels (≥ 0).</param>
        /// <param name="time">Current time in seconds (unscaled, monotonic).</param>
        /// <returns>True if this switched the active device to keyboard and mouse.</returns>
        public bool ReportPointerMotion(float pixels, double time)
        {
            if (!(pixels > 0f))
            {
                return false;
            }

            if (time - _pointerWindowStart > _pointerWindowSeconds)
            {
                _pointerWindowStart = time;
                _pointerAccumulated = 0f;
            }

            _pointerAccumulated += pixels;
            if (_pointerAccumulated <= _pointerThresholdPixels)
            {
                return false;
            }

            ResetPointerWindow();
            return ReportActivity(DeviceKind.KeyboardMouse, GlyphFamily.KeyboardMouse, time);
        }

        private void ResetPointerWindow()
        {
            _pointerWindowStart = double.NegativeInfinity;
            _pointerAccumulated = 0f;
        }
    }
}
