using Aetherfall.Input;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>
    /// <see cref="KeyboardPlatformRules"/>: Caps Lock as walk/run toggle must switch once per physical press on Windows
    /// (key reports press and release) and on macOS (key reports the lock state: press = lock on, release = lock off).
    /// </summary>
    [TestFixture]
    public sealed class KeyboardPlatformRulesTests
    {
        [Test]
        public void Windows_TogglesOnPressOnly()
        {
            Assert.That(KeyboardPlatformRules.IsToggle(true, false, false), Is.True, "press");
            Assert.That(KeyboardPlatformRules.IsToggle(false, true, false), Is.False, "release of the same press");
            Assert.That(KeyboardPlatformRules.IsToggle(false, false, false), Is.False, "nothing");
        }

        [Test]
        public void MacOS_PressAndReleaseOfTheLockKeyEachToggleOnce()
        {
            Assert.That(KeyboardPlatformRules.IsToggle(true, false, true), Is.True, "lock turns on (press)");
            Assert.That(KeyboardPlatformRules.IsToggle(false, true, true), Is.True, "lock turns off (release)");
            Assert.That(KeyboardPlatformRules.IsToggle(false, false, true), Is.False, "nothing");
        }

        [Test]
        public void ThreePhysicalPresses_WalkOnOffOn_OnBothPlatforms()
        {
            // Events per physical press: Windows reports press + release, macOS alternately press or release.
            bool[][] windows = { new[] { true, false }, new[] { false, true }, new[] { true, false }, new[] { false, true }, new[] { true, false }, new[] { false, true } };
            bool[][] macOS = { new[] { true, false }, new[] { false, false }, new[] { false, true }, new[] { false, false }, new[] { true, false }, new[] { false, false } };

            Assert.That(CountToggles(windows, false), Is.EqualTo(3), "Windows");
            Assert.That(CountToggles(macOS, true), Is.EqualTo(3), "macOS");
            Assert.That(CountToggles(macOS, false), Is.EqualTo(2), "macOS events with the Windows rule: the second press would be lost");
        }

        private static int CountToggles(bool[][] frames, bool lockKeysReportLockState)
        {
            int toggles = 0;
            foreach (bool[] frame in frames)
            {
                if (KeyboardPlatformRules.IsToggle(frame[0], frame[1], lockKeysReportLockState))
                {
                    toggles++;
                }
            }

            return toggles;
        }
    }
}
