using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Marks an obstacle that ends a boss charge (GDD 02 11.6: the stone blocks in Grimmbart's quarry). A charging boss that
    /// runs into it breaks its poise and is stunned (see <see cref="BossController"/>).
    /// </summary>
    /// <remarks>GameObject: the block with its collider (layer Environment).</remarks>
    [DisallowMultipleComponent]
    public sealed class BossChargeStopper : MonoBehaviour
    {
    }
}
