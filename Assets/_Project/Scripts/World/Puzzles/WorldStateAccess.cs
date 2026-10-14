using Aetherfall.Core;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Resolves the world object states for scene components (call once in <c>Start</c> after the boot, cache the result).
    /// Without the <see cref="WorldObjectsInstaller"/> in the BootConfig a component gets its own local store and a warning:
    /// it still works on its own, but nothing is saved and objects do not see each other's states.
    /// </summary>
    public static class WorldStateAccess
    {
        /// <summary>The registered store, or a new local one.</summary>
        /// <param name="owner">Name of the asking component (log).</param>
        /// <returns>The store; never null.</returns>
        public static IWorldObjectStateStore ResolveStore(string owner)
        {
            IServiceLocator locator = Services.Locator;
            if (locator != null && locator.TryGet(out IWorldObjectStateStore store))
            {
                return store;
            }

            Log.Warning(LogCategory.World, owner + ": no IWorldObjectStateStore registered (WorldObjectsInstaller missing in the BootConfig; " +
                                           "menu Aetherfall > Gruft erstellen adds it). Using a local state: not saved, not shared.");
            return new WorldObjectStateStore();
        }

        /// <summary>The event bus, or null before the boot.</summary>
        public static IEventBus ResolveEventBus()
        {
            IServiceLocator locator = Services.Locator;
            return locator != null && locator.TryGet(out IEventBus bus) ? bus : null;
        }
    }
}
