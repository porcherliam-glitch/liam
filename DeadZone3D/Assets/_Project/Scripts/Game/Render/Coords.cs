using UnityEngine;

namespace DeadZone.Game
{
    /// <summary>Conversion between simulation pixels (x right, y down; 32 px = 1 tile) and Unity metres (x right, z north, y up).</summary>
    public static class Coords
    {
        /// <summary>Metres per simulation pixel: one tile (32 px) is 2 m.</summary>
        public const float S = 2f / 32f;
        public const float Tile = 2f;
        public const float WallHeight = 2.8f;

        public static Vector3 ToWorld(double x, double y, float h = 0f) => new Vector3((float)(x * S), h, (float)(-y * S));
        public static Vector2 ToSim(Vector3 p) => new Vector2(p.x / S, -p.z / S);
        /// <summary>Tile (tx, ty) south-west corner in world space.</summary>
        public static Vector3 TileCorner(int tx, int ty, float h = 0f) => new Vector3(tx * Tile, h, -(ty + 1) * Tile);
        public static Vector3 TileCenter(int tx, int ty, float h = 0f) => new Vector3((tx + 0.5f) * Tile, h, -(ty + 0.5f) * Tile);
        /// <summary>Unity yaw for a simulation angle (radians, 0 = +x, clockwise on screen because y points down).</summary>
        public static Quaternion Yaw(double simAngle) => Quaternion.Euler(0f, (float)(simAngle * Mathf.Rad2Deg) + 90f, 0f);
        public static float YawDeg(double simAngle) => (float)(simAngle * Mathf.Rad2Deg) + 90f;
    }
}
