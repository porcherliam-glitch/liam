using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Default <see cref="ILightSourceRegistry"/>: a plain list of the fires and lamps of the loaded scenes (about ten in
    /// Eichental). Positions are read when asked, so moving sources (a carried torch later) count where they are.
    /// </summary>
    public sealed class LightSourceRegistry : ILightSourceRegistry
    {
        private readonly List<IWorldLightSource> _sources = new List<IWorldLightSource>();

        /// <inheritdoc />
        public int Count => _sources.Count;

        /// <inheritdoc />
        public void Register(IWorldLightSource source)
        {
            if (source != null && !_sources.Contains(source))
            {
                _sources.Add(source);
            }
        }

        /// <inheritdoc />
        public void Unregister(IWorldLightSource source)
        {
            _sources.Remove(source);
        }

        /// <inheritdoc />
        public bool AnyLitWithin(Vector3 position)
        {
            for (int i = 0; i < _sources.Count; i++)
            {
                IWorldLightSource source = _sources[i];
                if (source == null || !source.IsLit)
                {
                    continue;
                }

                float radius = source.Radius;
                if ((source.Position - position).sqrMagnitude <= radius * radius)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
