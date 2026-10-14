using System;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Connects the player of the gameplay scene with the UI of the boot scene: <see cref="PlayerHudLink"/> registers itself
    /// when the scene starts and unregisters when it is unloaded.
    /// </summary>
    public interface IPlayerHudRegistry
    {
        /// <summary>The registered player, or null (main menu, loading).</summary>
        IPlayerHudSource Current { get; }

        /// <summary>Raised when the player registered or unregistered.</summary>
        event Action Changed;

        /// <summary>Registers the player (replaces an earlier one).</summary>
        /// <param name="source">Player.</param>
        void Register(IPlayerHudSource source);

        /// <summary>Unregisters the player if it is the current one.</summary>
        /// <param name="source">Player.</param>
        void Unregister(IPlayerHudSource source);
    }
}
