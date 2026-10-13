namespace Aetherfall.Core
{
    /// <summary>
    /// Marker for <see cref="ITickable"/> services that need real time instead of game time: the <see cref="TickRunner"/>
    /// passes <c>Time.unscaledDeltaTime</c> to their <see cref="ITickable.Tick"/>, also while <c>Time.timeScale</c> is 0.
    /// </summary>
    /// <remarks>
    /// Used by counters that follow the columns of architecture table 4.4 instead of the time scale, e.g. the playtime
    /// counter and the autosave interval: in the hub menus the game is paused (time scale 0) but the playtime still runs.
    /// Such services decide themselves (by game state) whether to count.
    /// </remarks>
    public interface IUnscaledTickable : ITickable
    {
    }
}
