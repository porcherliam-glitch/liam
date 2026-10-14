using System.Threading;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Waits for the next frame. Logic classes that poll once per frame (<see cref="SceneLoader"/>, the game flow) take one
    /// in their constructor, so EditMode tests can pass a wait that completes at once; in Unity
    /// <see cref="Awaitable.NextFrameAsync"/> really waits for the next player loop update.
    /// </summary>
    /// <param name="ct">Cancels the wait.</param>
    public delegate Awaitable FrameWait(CancellationToken ct);

    /// <summary>Default <see cref="FrameWait"/> implementations.</summary>
    public static class FrameWaits
    {
        /// <summary>Waits for the next frame with <see cref="Awaitable.NextFrameAsync"/>.</summary>
        public static readonly FrameWait NextFrame = ct => Awaitable.NextFrameAsync(ct);
    }
}
