using System.Collections.Generic;
using Aetherfall.Player;

namespace Aetherfall.Tests.EditMode.Gameplay
{
    /// <summary>Test double for <see cref="IPlayerPlacement"/>: stores the pose and records every placement.</summary>
    public sealed class FakePlayerPlacement : IPlayerPlacement
    {
        private readonly List<PlayerPose> _placements = new List<PlayerPose>();

        /// <summary>Creates the fake at a pose in a world space.</summary>
        /// <param name="pose">Current pose.</param>
        /// <param name="worldSpaceId">Current world space.</param>
        public FakePlayerPlacement(PlayerPose pose = default, string worldSpaceId = "worldspace.test.testgelaende")
        {
            CurrentPose = pose;
            WorldSpaceId = worldSpaceId;
        }

        /// <inheritdoc />
        public PlayerPose CurrentPose { get; set; }

        /// <inheritdoc />
        public string WorldSpaceId { get; set; }

        /// <summary>Every pose passed to <see cref="Place"/>, oldest first.</summary>
        public IReadOnlyList<PlayerPose> Placements => _placements;

        /// <inheritdoc />
        public void Place(in PlayerPose pose, string worldSpaceId)
        {
            _placements.Add(pose);
            CurrentPose = pose;
            WorldSpaceId = worldSpaceId;
        }
    }
}
