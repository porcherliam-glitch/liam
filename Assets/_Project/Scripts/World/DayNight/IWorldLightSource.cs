using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>A light the stealth AI counts: a fire, a lamp, later the player's torch (architecture 11.10).</summary>
    public interface IWorldLightSource
    {
        /// <summary>Where the light counts from (at player height).</summary>
        Vector3 Position { get; }

        /// <summary>Radius in metres.</summary>
        float Radius { get; }

        /// <summary>True while it burns.</summary>
        bool IsLit { get; }
    }
}
