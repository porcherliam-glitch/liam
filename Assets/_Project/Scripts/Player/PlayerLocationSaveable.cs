using System;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Aetherfall.Utilities;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Saves and restores where the player stands (section <c>player</c>, load order 110, architecture 9.2): world space,
    /// cell + local position (512 m cells, architecture 9.7) and yaw. Loading teleports the character through
    /// <see cref="IPlayerPlacement"/>; after the load (<see cref="IPostLoad"/>) it publishes <see cref="PlayerSpawned"/>.
    /// </summary>
    /// <remarks>A new game (data null) changes nothing: the spawn point places the player. As header contributor it writes the
    /// world space into the save header, so loading can open the right scene first (guide 12, 11.5).</remarks>
    public sealed class PlayerLocationSaveable : Saveable<PlayerLocationDto>, IPostLoad, ISaveHeaderContributor
    {
        /// <summary>Save key (table 9.2).</summary>
        public const string Key = "player";

        /// <summary>Load order (table 9.2).</summary>
        public const int Order = 110;

        /// <summary>Movement mode id for walking characters.</summary>
        public const string OnFootMode = "onFoot";

        private readonly IPlayerPlacement _placement;
        private readonly IEventBus _eventBus;
        private bool _placedByLoad;

        /// <summary>Creates the saveable.</summary>
        /// <param name="placement">Access to the character in the scene.</param>
        /// <param name="eventBus">Bus for <see cref="PlayerSpawned"/> after a load; null = no event.</param>
        public PlayerLocationSaveable(IPlayerPlacement placement, IEventBus eventBus) : base(Key, Order)
        {
            _placement = placement ?? throw new ArgumentNullException(nameof(placement));
            _eventBus = eventBus;
        }

        /// <summary>Converts a pose into the DTO (cell + local position).</summary>
        /// <param name="pose">World pose.</param>
        /// <param name="worldSpaceId">World space id.</param>
        public static PlayerLocationDto ToDto(in PlayerPose pose, string worldSpaceId)
        {
            int cellX = WorldGrid.CellIndex(pose.X);
            int cellZ = WorldGrid.CellIndex(pose.Z);
            return new PlayerLocationDto
            {
                WorldSpaceId = worldSpaceId ?? string.Empty,
                CellX = cellX,
                CellZ = cellZ,
                LocalX = (float)WorldGrid.LocalCoordinate(pose.X, cellX),
                LocalY = pose.Y,
                LocalZ = (float)WorldGrid.LocalCoordinate(pose.Z, cellZ),
                Yaw = pose.Yaw,
                Mounted = false,
                MovementMode = OnFootMode
            };
        }

        /// <summary>Converts the DTO back into a world pose.</summary>
        /// <param name="data">Saved location.</param>
        public static PlayerPose ToPose(PlayerLocationDto data)
        {
            return new PlayerPose(
                (float)WorldGrid.WorldCoordinate(data.CellX, data.LocalX),
                data.LocalY,
                (float)WorldGrid.WorldCoordinate(data.CellZ, data.LocalZ),
                data.Yaw);
        }

        /// <inheritdoc />
        public void Contribute(SaveHeader header)
        {
            if (header != null)
            {
                header.Location.WorldSpaceId = _placement.WorldSpaceId ?? string.Empty;
            }
        }

        /// <inheritdoc />
        public void OnAfterLoad(in LoadContext ctx)
        {
            if (!_placedByLoad || _eventBus == null)
            {
                return;
            }

            _placedByLoad = false;
            PlayerPose pose = _placement.CurrentPose;

            // Fields instead of the constructor: keeps this class usable in tests outside Unity.
            Vector3 position = default;
            position.x = pose.X;
            position.y = pose.Y;
            position.z = pose.Z;
            var spawned = new PlayerSpawned(position, _placement.WorldSpaceId);
            _eventBus.Publish(in spawned);
        }

        /// <inheritdoc />
        protected override PlayerLocationDto Capture()
        {
            return ToDto(_placement.CurrentPose, _placement.WorldSpaceId);
        }

        /// <inheritdoc />
        protected override void Restore(PlayerLocationDto data, in LoadContext ctx)
        {
            _placedByLoad = false;
            if (data == null)
            {
                return;
            }

            PlayerPose pose = ToPose(data);
            _placement.Place(pose, data.WorldSpaceId);
            _placedByLoad = true;
            Log.Info(LogCategory.Player, "Player placed from save '" + ctx.SlotId + "' at " + pose + ".");
        }
    }
}
