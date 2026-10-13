using System.Threading;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>A service that loads data after it has been installed.</summary>
    public interface IInitializable
    {
        /// <summary>Loads data; must honour <paramref name="ct"/>.</summary>
        Awaitable InitializeAsync(CancellationToken ct);
    }
}
