namespace Aetherfall.Core
{
    /// <summary>
    /// Service whose runtime caches belong to one game session (save game), e.g. world state, quests or inventory
    /// (architecture 4, lifecycle). The state itself is always set through loading (also for "new game").
    /// </summary>
    public interface ISessionService
    {
        /// <summary>Called when a session starts (new game or loaded save), after the state was loaded.</summary>
        void BeginSession();

        /// <summary>
        /// Called when the session ends: switching to the main menu or before another save is loaded.
        /// Clear caches and release scene subscriptions here.
        /// </summary>
        void EndSession();
    }
}
