using System;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Input;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Reads the Gameplay actions through <see cref="IInputService"/> (package-free <see cref="IGameplayInput"/>) and feeds
    /// <see cref="PlayerMotor"/> once per frame. Resolves the device-dependent sprint behaviour: on a gamepad L3 toggles
    /// (and is shared with Sneak by stick deflection, GDD 03 1.3 K3), on the keyboard Shift is held (GDD 05 4.2). The
    /// device that pressed Sprint or Sneak decides, not the globally detected active device (that one switches with a
    /// 0.3 s delay and is only meant for the button glyphs).
    /// </summary>
    /// <remarks>
    /// GameObject: the player root next to <see cref="PlayerMotor"/>. Runs before the motor in the frame (execution order -50),
    /// after <see cref="PlayerInteractor"/> (-60), which decides whether the shared gamepad button A interacted.
    /// TODO (Options step): options "Sprinten: Halten/Umschalten" per device and "Kontextregeln einzeln" (GDD 03 1.6).
    /// </remarks>
    [DefaultExecutionOrder(-50)]
    [DisallowMultipleComponent]
    public sealed class PlayerInputReader : MonoBehaviour
    {
        [Tooltip("Motor, der die Eingaben bekommt. Leer = PlayerMotor am selben GameObject.")]
        [SerializeField] private PlayerMotor motor = null;

        [Tooltip("Interaktion der Figur (optional). Leer = PlayerInteractor am selben GameObject. Ein A-Druck, der interagiert hat, springt nicht.")]
        [SerializeField] private PlayerInteractor interactor = null;

        private IGameplayInput _gameplay;
        private bool _sprintToggleMode;

        private void Awake()
        {
            if (motor == null && !TryGetComponent(out motor))
            {
                Log.Error(LogCategory.Player, "PlayerInputReader on '" + name + "' finds no PlayerMotor.");
                enabled = false;
                return;
            }

            if (interactor == null)
            {
                TryGetComponent(out interactor);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                // All installers run in the same frame: once the game state service exists, a missing input service is a
                // configuration error (InputInstaller not in the BootConfig), not a timing question.
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                if (!Services.Locator.TryGet(out IInputService inputService))
                {
                    Log.Error(LogCategory.Player, "PlayerInputReader: no IInputService registered, the player cannot be controlled. " +
                                                  "Add the InputInstaller to the BootConfig behind the GameState installer " +
                                                  "(menu Aetherfall > Testgelaende erstellen does that).");
                    return;
                }

                _gameplay = inputService.Gameplay;
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerInputReader could not resolve IInputService. " +
                                                             "Is the InputInstaller in the BootConfig (Aetherfall > Testgelände erstellen adds it)?");
            }
        }

        private void Update()
        {
            if (_gameplay == null || !_gameplay.IsActive)
            {
                return;
            }

            bool sprintPressed = _gameplay.WasPressedThisFrame(GameplayButton.Sprint);
            bool sneakPressed = _gameplay.WasPressedThisFrame(GameplayButton.Sneak);
            if (sprintPressed || sneakPressed)
            {
                // Toggle or hold follows the device of the last Sprint/Sneak press and stays until the next one, so a
                // toggled sprint survives releasing L3. Unknown (pressed and released within one frame) keeps the mode.
                DeviceKind source = _gameplay.SourceDeviceOf(sprintPressed ? GameplayButton.Sprint : GameplayButton.Sneak);
                if (source != DeviceKind.Unknown)
                {
                    _sprintToggleMode = source == DeviceKind.Gamepad;
                }
            }

            Vector2 move = _gameplay.Move;
            var input = new PlayerMovementInput
            {
                MoveX = move.x,
                MoveY = move.y,
                JumpPressed = _gameplay.WasPressedThisFrame(GameplayButton.Jump) && !InteractConsumedJump(),
                SprintPressed = sprintPressed,
                SprintHeld = _gameplay.IsPressed(GameplayButton.Sprint),
                SprintToggleMode = _sprintToggleMode,
                SneakPressed = sneakPressed,
                // Both actions in the same frame = the shared L3 button (default binding): the context rule decides.
                SprintSneakShared = sprintPressed && sneakPressed,
                // Caps Lock: on macOS the second press arrives as a release (lock state), see KeyboardPlatformRules.
                WalkTogglePressed = _gameplay.WasToggledThisFrame(GameplayButton.WalkToggle),
                LetGoPressed = _gameplay.WasPressedThisFrame(GameplayButton.Dodge)
            };
            motor.SubmitInput(in input);
        }

        private bool InteractConsumedJump()
        {
            // GDD 03 1.5: A = Jump and Interact ("A mit Ziel"). The interactor runs first; if the gamepad press interacted, it
            // must not also jump. On the keyboard Space and E are different keys, both may happen in one frame.
            return interactor != null && interactor.InteractedThisFrame && _gameplay.SourceDeviceOf(GameplayButton.Interact) == DeviceKind.Gamepad;
        }
    }
}
