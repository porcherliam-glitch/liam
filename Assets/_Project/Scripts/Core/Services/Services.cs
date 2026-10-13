using System.Threading;
using UnityEngine;

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

        /// <summary>
        /// Waits frame by frame until <see cref="Locator"/> can resolve <typeparamref name="T"/> and returns the service.
        /// Completes in the same frame if the service is already registered.
        /// </summary>
        /// <remarks>
        /// For MonoBehaviours outside the boot scene: in the editor the boot scene is loaded after them (EditorBootstrap), so
        /// their <c>Awake</c>/<c>Start</c> may run before the services exist. Call this once in <c>Start</c>, pass
        /// <c>destroyCancellationToken</c> and cache the result (architecture 4.2, rule 1). If the boot fails, the services
        /// never appear and the wait ends only when the token is cancelled.
        /// </remarks>
        /// <typeparam name="T">Registered service interface.</typeparam>
        /// <param name="cancellationToken">Ends the wait (e.g. <c>MonoBehaviour.destroyCancellationToken</c>).</param>
        /// <returns>The service; never null.</returns>
        /// <exception cref="System.OperationCanceledException">The token was cancelled before the service appeared.</exception>
        public static async Awaitable<T> WaitForAsync<T>(CancellationToken cancellationToken) where T : class
        {
            while (true)
            {
                cancellationToken.ThrowIfCancellationRequested();
                IServiceLocator locator = Locator;
                if (locator != null && locator.TryGet(out T service))
                {
                    return service;
                }

                await Awaitable.NextFrameAsync(cancellationToken);
            }
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
