using System;
using Aetherfall.Events;
using Aetherfall.Input;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>Unit tests for <see cref="DeviceClassifier"/> and <see cref="ActiveDeviceTracker"/> (GDD 05 1.5).</summary>
    [TestFixture]
    public sealed class DeviceDetectionTests
    {
        [TestCase("XInputControllerWindows", "Controller (Xbox One For Windows)", "Microsoft", GlyphFamily.Xbox)]
        [TestCase("XInputController", null, null, GlyphFamily.Xbox)]
        [TestCase("XboxOneGampadMacOSWireless", "Xbox Wireless Controller", "Microsoft", GlyphFamily.Xbox)]
        [TestCase("XboxGamepadMacOS", null, null, GlyphFamily.Xbox)]
        [TestCase("DualShock4GamepadHID", "Wireless Controller", "Sony Interactive Entertainment", GlyphFamily.PlayStation)]
        [TestCase("DualSenseGamepadHID", "DualSense Wireless Controller", "Sony Interactive Entertainment", GlyphFamily.PlayStation)]
        [TestCase("DualShock3GamepadHID", null, null, GlyphFamily.PlayStation)]
        [TestCase("SwitchProControllerHID", "Pro Controller", "Nintendo Co., Ltd.", GlyphFamily.Nintendo)]
        [TestCase("Gamepad", "Wireless Controller", "Sony Interactive Entertainment", GlyphFamily.PlayStation)]
        [TestCase("Gamepad", "Xbox Series X Controller", null, GlyphFamily.Xbox)]
        [TestCase("Gamepad", "Pro Controller", null, GlyphFamily.Nintendo)]
        [TestCase("Gamepad", "USB Gamepad", "DragonRise Inc.", GlyphFamily.Generic)]
        [TestCase(null, null, null, GlyphFamily.Generic)]
        [TestCase("", "", "", GlyphFamily.Generic)]
        public void ClassifyGamepad_ReturnsTheGlyphFamily(string layout, string product, string manufacturer, GlyphFamily expected)
        {
            Assert.That(DeviceClassifier.ClassifyGamepad(layout, product, manufacturer), Is.EqualTo(expected));
        }

        [Test]
        public void Tracker_StartsWithKeyboardMouse()
        {
            var tracker = new ActiveDeviceTracker();

            Assert.That(tracker.Kind, Is.EqualTo(DeviceKind.KeyboardMouse));
            Assert.That(tracker.Family, Is.EqualTo(GlyphFamily.KeyboardMouse));
        }

        [Test]
        public void Tracker_GamepadActivity_SwitchesOnceAndReportsTheChange()
        {
            var tracker = new ActiveDeviceTracker();

            Assert.That(tracker.ReportActivity(DeviceKind.Gamepad, GlyphFamily.Xbox, 1.0), Is.True);
            Assert.That(tracker.Kind, Is.EqualTo(DeviceKind.Gamepad));
            Assert.That(tracker.Family, Is.EqualTo(GlyphFamily.Xbox));
            Assert.That(tracker.ReportActivity(DeviceKind.Gamepad, GlyphFamily.Xbox, 2.0), Is.False, "same device: no change");
        }

        [Test]
        public void Tracker_Hysteresis_IgnoresSwitchesWithin300Milliseconds()
        {
            var tracker = new ActiveDeviceTracker();
            tracker.ReportActivity(DeviceKind.Gamepad, GlyphFamily.Xbox, 10.0);

            Assert.That(tracker.ReportActivity(DeviceKind.KeyboardMouse, GlyphFamily.KeyboardMouse, 10.2), Is.False);
            Assert.That(tracker.Kind, Is.EqualTo(DeviceKind.Gamepad));
            Assert.That(tracker.ReportActivity(DeviceKind.KeyboardMouse, GlyphFamily.KeyboardMouse, 10.31), Is.True);
            Assert.That(tracker.Kind, Is.EqualTo(DeviceKind.KeyboardMouse));
        }

        [Test]
        public void Tracker_OtherGamepadFamily_CountsAsChange()
        {
            var tracker = new ActiveDeviceTracker();
            tracker.ReportActivity(DeviceKind.Gamepad, GlyphFamily.Xbox, 1.0);

            Assert.That(tracker.ReportActivity(DeviceKind.Gamepad, GlyphFamily.PlayStation, 2.0), Is.True);
            Assert.That(tracker.Family, Is.EqualTo(GlyphFamily.PlayStation));
        }

        [Test]
        public void Tracker_UnknownKind_IsIgnored()
        {
            var tracker = new ActiveDeviceTracker();

            Assert.That(tracker.ReportActivity(DeviceKind.Unknown, GlyphFamily.Generic, 1.0), Is.False);
            Assert.That(tracker.Kind, Is.EqualTo(DeviceKind.KeyboardMouse));
        }

        [Test]
        public void Tracker_PointerMotion_SwitchesOnlyAbove10PixelsWithin100Milliseconds()
        {
            var tracker = new ActiveDeviceTracker();
            tracker.ReportActivity(DeviceKind.Gamepad, GlyphFamily.Xbox, 0.0);

            Assert.That(tracker.ReportPointerMotion(5f, 1.00), Is.False);
            Assert.That(tracker.ReportPointerMotion(4f, 1.05), Is.False, "9 px in 0.05 s");
            Assert.That(tracker.Kind, Is.EqualTo(DeviceKind.Gamepad));
            Assert.That(tracker.ReportPointerMotion(2f, 1.08), Is.True, "11 px in 0.08 s");
            Assert.That(tracker.Kind, Is.EqualTo(DeviceKind.KeyboardMouse));
        }

        [Test]
        public void Tracker_SlowPointerDrift_DoesNotSwitch()
        {
            var tracker = new ActiveDeviceTracker();
            tracker.ReportActivity(DeviceKind.Gamepad, GlyphFamily.Xbox, 0.0);

            for (int i = 0; i < 20; i++)
            {
                // 4 px every 0.15 s: never more than 10 px within one 0.1 s window.
                Assert.That(tracker.ReportPointerMotion(4f, 1.0 + i * 0.15), Is.False, "sample " + i);
            }

            Assert.That(tracker.Kind, Is.EqualTo(DeviceKind.Gamepad));
        }

        [Test]
        public void Tracker_ZeroOrNegativePointerMotion_IsIgnored()
        {
            var tracker = new ActiveDeviceTracker();
            tracker.ReportActivity(DeviceKind.Gamepad, GlyphFamily.Xbox, 0.0);

            Assert.That(tracker.ReportPointerMotion(0f, 1.0), Is.False);
            Assert.That(tracker.ReportPointerMotion(-50f, 1.01), Is.False);
            Assert.That(tracker.ReportPointerMotion(float.NaN, 1.02), Is.False);
        }

        [Test]
        public void Tracker_InvalidSettings_Throw()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => new ActiveDeviceTracker(hysteresisSeconds: -1));
            Assert.Throws<ArgumentOutOfRangeException>(() => new ActiveDeviceTracker(pointerThresholdPixels: 0f));
            Assert.Throws<ArgumentOutOfRangeException>(() => new ActiveDeviceTracker(pointerWindowSeconds: 0));
        }
    }
}
