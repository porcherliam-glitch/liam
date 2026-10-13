namespace Aetherfall.Player
{
    /// <summary>
    /// What the player's location saveable needs from the scene: read the pose and place the character
    /// (implemented by <see cref="PlayerPersistence"/>; a fake in tests).
    /// </summary>
    public interface IPlayerPlacement
    {
        /// <summary>Current feet position and yaw.</summary>
        PlayerPose CurrentPose { get; }

        /// <summary>Id of the world space the player is in (e.g. <c>worldspace.test.testgelaende</c>).</summary>
        string WorldSpaceId { get; }

        /// <summary>Places the character (teleport with the CharacterController switched off) and stops its movement.</summary>
        /// <param name="pose">Target pose.</param>
        /// <param name="worldSpaceId">World space of the pose.</param>
        void Place(in PlayerPose pose, string worldSpaceId);
    }
}
