using System.Threading;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Service that needs asynchronous initialization after all installers ran (e.g. loading data, Addressables).
    /// The bootstrapper calls <see cref="InitializeAsync"/> once, one service after another, in registration order.
    /// </summary>
    public interface IInitializable
    {
        /// <summary>Initializes the service. Do not subscribe to events of other services here (use <see cref="IPostInitializable"/>).</summary>
        /// <param name="cancellationToken">
        /// Cancelled when the boot times out (<see cref="BootConfig.InitializationTimeoutSeconds"/>) or the boot scene is unloaded.
        /// Implementations must observe it and pass it on to every awaited call.
        /// </param>
        /// <returns>An awaitable that completes when the service is ready. Never return null.</returns>
        Awaitable InitializeAsync(CancellationToken cancellationToken);
    }
}
