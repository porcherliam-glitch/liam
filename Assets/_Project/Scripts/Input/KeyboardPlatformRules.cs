namespace Aetherfall.Input
{
    /// <summary>
    /// Platform differences of the keyboard (platform adapter class, architecture 15.2 #15: the only place in the input
    /// code with a platform <c>#if</c>).
    /// </summary>
    /// <remarks>
    /// <para><b>Lock keys on macOS:</b> the operating system reports the lock state, not the physical key. Caps Lock reads as
    /// held while the lock is on, so the first press of the key reports a press (lock on) and the second press only a
    /// release (lock off). Unity closed this as "By Design" (issue tracker: "OSX keyboard when caps lock is active the key
    /// is always read as pressed"). A toggle on Caps Lock therefore has to count press and release there.</para>
    /// <para>Consequence for "any key" checks: while Caps Lock is on, <c>Keyboard.anyKey.wasPressedThisFrame</c> never
    /// reports a press on macOS (open Input System issue ISXB-1748); the single keys are not affected, so
    /// <see cref="InputDeviceActivityPoller"/> checks them one by one.</para>
    /// </remarks>
    public static class KeyboardPlatformRules
    {
        /// <summary>
        /// True on platforms where lock keys (Caps Lock) report the lock state instead of the key: macOS editor and macOS
        /// player. A Windows editor with the macOS build target counts as Windows (the editor's keyboard decides).
        /// </summary>
        public static bool LockKeysReportLockState
        {
            get
            {
#if UNITY_EDITOR_OSX || (UNITY_STANDALONE_OSX && !UNITY_EDITOR)
                return true;
#else
                return false;
#endif
            }
        }

        /// <summary>Decides whether a toggle button (walk/run on Caps Lock) switched this frame.</summary>
        /// <param name="pressed">The action was pressed this frame.</param>
        /// <param name="lockKeyReleased">A lock key bound to the action was released this frame.</param>
        /// <param name="lockKeysReportLockState">Platform rule, normally <see cref="LockKeysReportLockState"/>.</param>
        /// <returns>
        /// True for a press; on platforms that report the lock state also for the release of a lock key (the second press
        /// of Caps Lock), so every physical press toggles exactly once.
        /// </returns>
        public static bool IsToggle(bool pressed, bool lockKeyReleased, bool lockKeysReportLockState)
        {
            return pressed || (lockKeysReportLockState && lockKeyReleased);
        }
    }
}
