using System.Collections.Generic;
using Aetherfall.Events;
using Aetherfall.Input;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>Gameplay map reader for tests: buttons listed in <see cref="PressedThisFrame"/> count as pressed in this frame.</summary>
    public sealed class FakeGameplayInput : IGameplayInput
    {
        /// <summary>Buttons pressed in the current frame (clear it to simulate the next frame).</summary>
        public HashSet<GameplayButton> PressedThisFrame { get; } = new HashSet<GameplayButton>();

        /// <inheritdoc />
        public bool IsActive { get; set; } = true;

        /// <inheritdoc />
        public Vector2 Move => default;

        /// <inheritdoc />
        public Vector2 Look => default;

        /// <inheritdoc />
        public bool LookIsPointerDelta => false;

        /// <inheritdoc />
        public float SwitchTarget => 0f;

        /// <inheritdoc />
        public float CycleAmmo => 0f;

        /// <inheritdoc />
        public bool WasPressedThisFrame(GameplayButton button)
        {
            return PressedThisFrame.Contains(button);
        }

        /// <inheritdoc />
        public bool WasPerformedThisFrame(GameplayButton button)
        {
            return PressedThisFrame.Contains(button);
        }

        /// <inheritdoc />
        public bool WasToggledThisFrame(GameplayButton button)
        {
            return false;
        }

        /// <inheritdoc />
        public bool WasReleasedThisFrame(GameplayButton button)
        {
            return false;
        }

        /// <inheritdoc />
        public bool IsPressed(GameplayButton button)
        {
            return PressedThisFrame.Contains(button);
        }

        /// <inheritdoc />
        public DeviceKind SourceDeviceOf(GameplayButton button)
        {
            return DeviceKind.KeyboardMouse;
        }
    }
}
