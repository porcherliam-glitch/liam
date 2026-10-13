using Aetherfall.Events;

namespace Aetherfall.Input
{
    /// <summary>
    /// The input service (architecture 11.1, §7.3): owns the one instance of the game's actions, enables the action map
    /// that belongs to the current game state (<see cref="ActionMapTable"/>), detects the active device and publishes
    /// <see cref="InputDeviceChanged"/>.
    /// </summary>
    public interface IInputService
    {
        /// <summary>Package-free read access to the Gameplay map (player controller, camera).</summary>
        IGameplayInput Gameplay { get; }

        /// <summary>
        /// All actions (Input System types). For systems that reference <c>Unity.InputSystem</c> themselves: UI input
        /// module, rebinding menu, glyph lookup.
        /// </summary>
        GameInputActions Actions { get; }

        /// <summary>The map that is enabled right now.</summary>
        ActionMapId ActiveMap { get; }

        /// <summary>
        /// Kind of the device the player used last (switches with 0.3 s hysteresis; meant for button glyphs). Which device
        /// triggered a particular action tells <see cref="IGameplayInput.SourceDeviceOf"/>.
        /// </summary>
        DeviceKind ActiveDeviceKind { get; }

        /// <summary>Glyph family of the device the player used last.</summary>
        GlyphFamily ActiveGlyphFamily { get; }

        /// <summary>On foot or mounted; selects Gameplay or Riding while the game state is Playing.</summary>
        PlayerControlMode ControlMode { get; }

        /// <summary>Switches between on foot and mounted (called by the riding system) and updates the active map.</summary>
        /// <param name="mode">New control mode.</param>
        void SetControlMode(PlayerControlMode mode);
    }
}
