namespace Aetherfall.Core
{
    /// <summary>
    /// The only allowed static access point to services (architecture 4.2).
    /// Set by <see cref="GameBootstrapper"/> during boot; null before boot, after a failed boot and after shutdown.
    /// </summary>
    /// <remarks>
    /// Rules: read <see cref="Locator"/> only in installers and in MonoBehaviours (Awake/Start, cache the result),
    /// never in Update and never in pure domain classes. Domain Reload is disabled in this project, so the
    /// static state is reset in <see cref="ResetStatics"/> when Play Mode starts.
    /// </remarks>
    public static class Services
    {
        /// <summary>Current service locator, or null if the game has not booted (yet).</summary>
        public static IServiceLocator Locator { get; private set; }

        /// <summary>Sets the current locator. Only the bootstrapper (and tests) call this.</summary>
        /// <param name="locator">New locator or null.</param>
        internal static void Set(IServiceLocator locator)
        {
            Locator = locator;
        }

        /// <summary>Clears the locator (Play Mode start, shutdown, tests).</summary>
        internal static void Reset()
        {
            Locator = null;
        }

        // Domain Reload is off: reset the static state at the start of every Play Mode session.
        [UnityEngine.RuntimeInitializeOnLoadMethod(UnityEngine.RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStatics()
        {
            Reset();
        }
    }
}
