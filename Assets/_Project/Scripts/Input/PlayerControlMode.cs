namespace Aetherfall.Input
{
    /// <summary>
    /// Control mode of the player while the game state is <see cref="Aetherfall.Core.GameState.Playing"/>
    /// (architecture 4.4: "Playing" on foot uses the Gameplay map, mounted the Riding map).
    /// </summary>
    public enum PlayerControlMode
    {
        /// <summary>On foot (default).</summary>
        OnFoot = 0,

        /// <summary>Mounted on a riding animal (set by the riding system, Phase 2).</summary>
        Mounted = 1
    }
}
