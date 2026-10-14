using System;
using Aetherfall.Core;

namespace Aetherfall.World.Dungeons
{
    /// <summary>Default <see cref="IWorldTravelService"/> (pure state; cleared at the end of a session).</summary>
    public sealed class WorldTravelService : IWorldTravelService, ISessionService
    {
        /// <inheritdoc />
        public string PendingAnchorId { get; private set; } = string.Empty;

        /// <inheritdoc />
        public void SetPendingAnchor(string anchorId)
        {
            PendingAnchorId = anchorId ?? string.Empty;
        }

        /// <inheritdoc />
        public bool TryConsume(string anchorId)
        {
            if (string.IsNullOrEmpty(anchorId) || !string.Equals(PendingAnchorId, anchorId, StringComparison.Ordinal))
            {
                return false;
            }

            PendingAnchorId = string.Empty;
            return true;
        }

        /// <inheritdoc />
        public void BeginSession()
        {
        }

        /// <inheritdoc />
        public void EndSession()
        {
            PendingAnchorId = string.Empty;
        }
    }
}
