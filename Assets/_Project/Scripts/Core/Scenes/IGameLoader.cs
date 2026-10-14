namespace Aetherfall.Core
{
    /// <summary>
    /// Loads a save the way the menus do it (guide 12, 11.5): if the save lies in another world space than the open scene, it
    /// changes the scene behind the loading screen first, then loads. For callers in assemblies that may not know the UI
    /// (quick load F9 in the player assembly); the game flow of the UI implements it.
    /// </summary>
    public interface IGameLoader
    {
        /// <summary>Starts loading the slot (fire and forget; errors are reported by the game flow).</summary>
        /// <param name="slotId">Slot id, e.g. <c>char_01/quick_0</c>.</param>
        void LoadSlot(string slotId);
    }
}
