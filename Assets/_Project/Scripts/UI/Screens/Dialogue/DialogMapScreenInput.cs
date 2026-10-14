using System;
using Aetherfall.Input;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// Reads the action map "Dialog" (GDD 03 1.5) for the dialogue screen: DialogNavigate, DialogSubmit (A / Cross / E / Space
    /// / Enter / left mouse button), DialogBack (B / Circle / right mouse button) and, once they exist in
    /// GameInputBindings, DialogDirect1-9 (keys 1-9) and DialogAuto (X / F). Active only while the input service
    /// has the Dialog map on (game state Dialogue; off under the pause menu).
    /// </summary>
    /// <remarks>
    /// A press of DialogSubmit by the mouse is reported as <see cref="DialogueInputFrame.PointerSubmitPressed"/>: it chooses the
    /// answer under the pointer, never the focused one (a click on a greyed answer must not confirm another answer).
    /// </remarks>
    public sealed class DialogMapScreenInput : IDialogueScreenInput
    {
        /// <summary>Name prefix of the direct choice actions ("DialogDirect1" ... "DialogDirect9").</summary>
        public const string DirectPrefix = "DialogDirect";

        /// <summary>Name of the action that switches automatic continue.</summary>
        public const string AutoName = "DialogAuto";

        private readonly IInputService _input;
        private readonly InputAction _navigate;
        private readonly InputAction _submit;
        private readonly InputAction _back;
        private readonly InputAction[] _direct = new InputAction[9];
        private readonly InputAction _auto;

        /// <summary>Creates the reader.</summary>
        /// <param name="input">Input service.</param>
        public DialogMapScreenInput(IInputService input)
        {
            _input = input ?? throw new ArgumentNullException(nameof(input));
            InputActionMap map = input.Actions.Dialog;
            _navigate = map.FindAction(InputActionNames.Dialog.DialogNavigate, true);
            _submit = map.FindAction(InputActionNames.Dialog.DialogSubmit, true);
            _back = map.FindAction(InputActionNames.Dialog.DialogBack, true);
            for (int i = 0; i < _direct.Length; i++)
            {
                _direct[i] = map.FindAction(DirectPrefix + (i + 1), false);
            }

            _auto = map.FindAction(AutoName, false);
        }

        /// <inheritdoc />
        public bool IsActive => _input.ActiveMap == ActionMapId.Dialog;

        /// <inheritdoc />
        public void Read(ref DialogueInputFrame frame)
        {
            Vector2 navigate = _navigate.ReadValue<Vector2>();
            frame.NavigateX = navigate.x;
            frame.NavigateY = navigate.y;
            if (_submit.WasPressedThisFrame())
            {
                if (IsMouse(_submit.activeControl))
                {
                    frame.PointerSubmitPressed = true;
                }
                else
                {
                    frame.SubmitPressed = true;
                }
            }

            frame.SubmitHeld = _submit.IsPressed();
            frame.BackPressed = _back.WasPressedThisFrame();
            for (int i = 0; i < _direct.Length; i++)
            {
                if (_direct[i] != null && _direct[i].WasPressedThisFrame())
                {
                    frame.DirectNumber = i + 1;
                    break;
                }
            }

            frame.AutoTogglePressed = _auto != null && _auto.WasPressedThisFrame();
        }

        private static bool IsMouse(InputControl control)
        {
            if (control != null)
            {
                return control.device is Mouse;
            }

            // Pressed and released within one frame: the action has no active control any more.
            Mouse mouse = Mouse.current;
            return mouse != null && mouse.leftButton.wasPressedThisFrame;
        }
    }
}
