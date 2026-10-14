using UnityEngine;
using UnityEngine.InputSystem;

namespace Aetherfall.DevTools
{
    /// <summary>
    /// Shared on/off switch of the IMGUI developer overlays (architecture 14.3: toggled with F3). Since the real user interface
    /// (UI Toolkit) exists, the overlays are developer tools only and start hidden; F3 shows or hides all of them at once
    /// (state overlay of the boot scene and the overlays of the test ground). The developer inventory (Tab) and the damage
    /// numbers are not affected.
    /// </summary>
    /// <remarks>
    /// Every overlay calls <see cref="PollToggleKey"/> once per frame; the frame counter makes sure one key press toggles only
    /// once, however many overlays exist. Domain Reload is disabled: the state is reset at the start of every Play Mode session.
    /// Reads the keyboard directly (Input System), because the overlays exist only in the editor and in development builds.
    /// </remarks>
    public static class DevOverlaySwitch
    {
        private static bool _visible;
        private static int _lastPollFrame = -1;

        /// <summary>True while the developer overlays are shown.</summary>
        public static bool IsVisible => _visible;

        /// <summary>Shows or hides all overlays.</summary>
        /// <param name="visible">True = show.</param>
        public static void SetVisible(bool visible)
        {
            _visible = visible;
        }

        /// <summary>Toggles the overlays when F3 was pressed this frame (call once per frame from Update).</summary>
        public static void PollToggleKey()
        {
            int frame = Time.frameCount;
            if (frame == _lastPollFrame)
            {
                return;
            }

            _lastPollFrame = frame;
            Keyboard keyboard = Keyboard.current;
            if (keyboard != null && keyboard.f3Key.wasPressedThisFrame)
            {
                _visible = !_visible;
            }
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStatics()
        {
            _visible = false;
            _lastPollFrame = -1;
        }
    }
}
