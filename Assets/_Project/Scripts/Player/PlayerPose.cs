namespace Aetherfall.Player
{
    /// <summary>Position of the player's feet and facing (yaw) as plain floats (save data, teleports; no Unity types).</summary>
    public readonly struct PlayerPose
    {
        /// <summary>World X in metres.</summary>
        public readonly float X;

        /// <summary>World Y (height of the feet) in metres.</summary>
        public readonly float Y;

        /// <summary>World Z in metres.</summary>
        public readonly float Z;

        /// <summary>Facing in degrees (0 = +Z, clockwise seen from above).</summary>
        public readonly float Yaw;

        /// <summary>Creates a pose.</summary>
        /// <param name="x">World X.</param>
        /// <param name="y">World Y.</param>
        /// <param name="z">World Z.</param>
        /// <param name="yaw">Facing in degrees.</param>
        public PlayerPose(float x, float y, float z, float yaw)
        {
            X = x;
            Y = y;
            Z = z;
            Yaw = yaw;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "PlayerPose(" + X + ", " + Y + ", " + Z + ", yaw " + Yaw + ")";
        }
    }
}
