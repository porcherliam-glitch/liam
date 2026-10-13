using System;
using UnityEngine.InputSystem;

namespace Aetherfall.Input
{
    /// <summary>Input System implementation of <see cref="IUiInput"/>: resolves the UI button actions once, reads them without allocations.</summary>
    public sealed class UiInput : IUiInput
    {
        private readonly InputActionMap _map;
        private readonly InputAction[] _buttons;

        /// <summary>Resolves the UI button actions (throws if one is missing).</summary>
        /// <param name="actions">The action instance of the input service.</param>
        public UiInput(GameInputActions actions)
        {
            if (actions == null)
            {
                throw new ArgumentNullException(nameof(actions));
            }

            _map = actions.UI;
            Array values = Enum.GetValues(typeof(UiButton));
            int count = 0;
            foreach (object value in values)
            {
                count = Math.Max(count, (int)value + 1);
            }

            _buttons = new InputAction[count];
            foreach (object value in values)
            {
                var button = (UiButton)value;
                _buttons[(int)button] = _map.FindAction(InputActionNames.ForUiButton(button), true);
            }
        }

        /// <inheritdoc />
        public bool IsActive => _map.enabled;

        /// <inheritdoc />
        public bool WasPressedThisFrame(UiButton button)
        {
            int index = (int)button;
            if (index < 0 || index >= _buttons.Length)
            {
                throw new ArgumentOutOfRangeException(nameof(button), button, "Unknown UI button.");
            }

            return _buttons[index].WasPressedThisFrame();
        }
    }
}
