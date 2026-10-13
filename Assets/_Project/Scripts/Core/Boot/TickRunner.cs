using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Central per-frame runner for <see cref="ITickable"/> services (architecture 4.1); <see cref="IUnscaledTickable"/>s get
    /// the unscaled frame time. Lives in the boot scene next to
    /// <see cref="GameBootstrapper"/>, which hands over the tickables after the boot completed and removes them on shutdown.
    /// </summary>
    /// <remarks>
    /// GameObject: <c>GameBootstrapper</c> in <c>Boot.unity</c>. If the component is missing, the bootstrapper adds it.
    /// Runs early in the frame (execution order -1000) so services are updated before gameplay MonoBehaviours.
    /// </remarks>
    [DefaultExecutionOrder(-1000)]
    [DisallowMultipleComponent]
    public sealed class TickRunner : MonoBehaviour
    {
        private readonly TickLoop _loop = new TickLoop();

        /// <summary>Number of tickables currently driven by this runner.</summary>
        public int TickableCount => _loop.Count;

        /// <summary>Sets the tickables (called by <see cref="GameBootstrapper"/> after PostInitialize).</summary>
        /// <param name="tickables">Tickables in registration order.</param>
        internal void SetTickables(IReadOnlyList<ITickable> tickables)
        {
            _loop.SetTickables(tickables);
        }

        /// <summary>Stops ticking all services (called on shutdown or boot failure).</summary>
        internal void ClearTickables()
        {
            _loop.Clear();
        }

        private void Update()
        {
            _loop.Tick(Time.deltaTime, Time.unscaledDeltaTime);
        }
    }
}
