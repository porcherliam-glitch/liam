using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Input
{
    /// <summary>
    /// Read access to the Gameplay map without Input System types, so that consumers such as the player controller and
    /// the camera do not reference <c>Unity.InputSystem</c> themselves (architecture 3.3: only Input and UI.Framework do).
    /// Values are zero/false while the Gameplay map is disabled (menus, pause, dialogues).
    /// </summary>
    /// <remarks>Read it in <c>Update</c>; the "this frame" queries follow the Input System's dynamic update.</remarks>
    public interface IGameplayInput
    {
        /// <summary>True while the Gameplay map is enabled (game state Playing, on foot).</summary>
        bool IsActive { get; }

        /// <summary>Movement input: left stick (after the dead zone) or WASD (normalized). Magnitude 0–1.</summary>
        Vector2 Move { get; }

        /// <summary>
        /// Camera input this frame: right stick (−1–1, a rate, multiply by time) or the mouse movement in pixels since the
        /// last frame (already a distance, do not multiply by time) – see <see cref="LookIsPointerDelta"/>.
        /// </summary>
        Vector2 Look { get; }

        /// <summary>True if <see cref="Look"/> currently comes from a mouse or other pointer (pixels), false for a stick.</summary>
        bool LookIsPointerDelta { get; }

        /// <summary>
        /// Switch lock-on target this frame (GDD 03 1.5 "SwitchTarget"): the mouse wheel (positive = up). Only the sign
        /// matters; on the gamepad the target is switched by flicking the right stick, which the lock-on reads from
        /// <see cref="Look"/>.
        /// </summary>
        float SwitchTarget { get; }

        /// <summary>
        /// True in the frame a button action was pressed, i.e. its control crossed the press threshold. Also true for
        /// actions with a tap or hold interaction before the interaction decided (both actions of a shared tap/hold button
        /// report the press); read those with <see cref="WasPerformedThisFrame"/>.
        /// </summary>
        /// <param name="button">Button action.</param>
        bool WasPressedThisFrame(GameplayButton button);

        /// <summary>
        /// True in the frame a button action was performed, i.e. its interaction completed: a tap on release within the
        /// tap time, a hold once the hold time is reached, a plain button on the press. Use it for the tap/hold pairs
        /// (<see cref="GameplayButton.UseAbility"/>/<see cref="GameplayButton.AbilityWheel"/>,
        /// <see cref="GameplayButton.Map"/>/<see cref="GameplayButton.HudPeek"/>).
        /// </summary>
        /// <param name="button">Button action.</param>
        bool WasPerformedThisFrame(GameplayButton button);

        /// <summary>
        /// True in the frame a toggle button switched (<see cref="GameplayButton.WalkToggle"/>). Same as
        /// <see cref="WasPressedThisFrame"/>, except for lock keys on macOS: there Caps Lock reports its lock state, so
        /// the press that turns the lock off arrives as a release; it counts as a toggle, too
        /// (<see cref="KeyboardPlatformRules"/>).
        /// </summary>
        /// <param name="button">Button action.</param>
        bool WasToggledThisFrame(GameplayButton button);

        /// <summary>True in the frame a button action was released.</summary>
        /// <param name="button">Button action.</param>
        bool WasReleasedThisFrame(GameplayButton button);

        /// <summary>True while a button action is held.</summary>
        /// <param name="button">Button action.</param>
        bool IsPressed(GameplayButton button);

        /// <summary>
        /// Kind of device whose control currently drives the action (the one that pressed or holds it), e.g. to decide
        /// whether sprint toggles (gamepad) or is held (keyboard) by the device that triggered it, independent of the
        /// globally detected active device. <see cref="DeviceKind.Unknown"/> while the action is idle.
        /// </summary>
        /// <param name="button">Button action.</param>
        DeviceKind SourceDeviceOf(GameplayButton button);
    }
}
