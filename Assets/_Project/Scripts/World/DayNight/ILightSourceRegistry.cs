using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>The registered light sources of the loaded scenes (architecture 11.10 "registrierte Lichtquellen").</summary>
    public interface ILightSourceRegistry
    {
        /// <summary>Number of registered sources.</summary>
        int Count { get; }

        /// <summary>Adds a source (twice counts once).</summary>
        /// <param name="source">Source.</param>
        void Register(IWorldLightSource source);

        /// <summary>Removes a source.</summary>
        /// <param name="source">Source.</param>
        void Unregister(IWorldLightSource source);

        /// <summary>True if a lit source reaches the position (distance up to its radius).</summary>
        /// <param name="position">Position.</param>
        bool AnyLitWithin(Vector3 position);
    }
}
