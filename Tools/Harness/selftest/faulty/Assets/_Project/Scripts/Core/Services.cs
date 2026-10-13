using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>The only static access point to the services (reset because Domain Reload is off).</summary>
    public static class Services
    {
        /// <summary>The current event bus, or null before boot.</summary>
        public static IEventBus Bus { get; private set; }

        internal static void Set(IEventBus bus)
        {
            Bus = bus;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStatics()
        {
            Bus = null;
        }
    }
}
