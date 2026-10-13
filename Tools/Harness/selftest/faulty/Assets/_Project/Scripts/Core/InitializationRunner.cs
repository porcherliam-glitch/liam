using System.Collections.Generic;
using System.Threading;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>Initializes services one after another, in installation order.</summary>
    public sealed class InitializationRunner
    {
        private readonly List<IInitializable> _services = new List<IInitializable>();

        /// <summary>Number of services that finished initializing.</summary>
        public int CompletedCount { get; private set; }

        /// <summary>Adds a service to the end of the queue.</summary>
        public void Add(IInitializable service)
        {
            _services.Add(service);
        }

        /// <summary>Initializes all services sequentially.</summary>
        public async Awaitable RunAsync(CancellationToken ct)
        {
            for (int i = 0; i < _services.Count; i++)
            {
                ct.ThrowIfCancellationRequested();
                await _services[i].InitializeAsync(ct);
                CompletedCount++;
            }
        }
    }
}
