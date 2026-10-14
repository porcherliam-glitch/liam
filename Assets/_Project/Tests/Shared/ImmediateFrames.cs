using System.Threading;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.Tests.Shared
{
    /// <summary>
    /// <see cref="FrameWait"/> for EditMode tests: completes at once (honouring cancellation), so code that polls once per
    /// frame finishes synchronously both in Unity and in the harness.
    /// </summary>
    public static class ImmediateFrames
    {
        /// <summary>A frame wait that is already complete.</summary>
        public static readonly FrameWait Wait = ct =>
        {
            ct.ThrowIfCancellationRequested();
            var source = new AwaitableCompletionSource();
            source.SetResult();
            return source.Awaitable;
        };
    }
}
