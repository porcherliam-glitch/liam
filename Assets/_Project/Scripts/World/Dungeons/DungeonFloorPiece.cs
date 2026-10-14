using System;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// A walkable piece of a dungeon: a room (flat), a corridor segment (flat or a ramp along its axis) or the flat square that
    /// joins two corridor segments. The floor height inside is interpolated linearly along <see cref="AlongX"/>; the ceiling
    /// lies <see cref="Height"/> above the floor. The Unity generator builds one floor box and one ceiling box per piece.
    /// </summary>
    public sealed class DungeonFloorPiece
    {
        /// <summary>Creates a piece.</summary>
        /// <param name="ownerId">Room or corridor id.</param>
        /// <param name="isRoom">True for a room.</param>
        /// <param name="minX">West edge.</param>
        /// <param name="maxX">East edge.</param>
        /// <param name="minZ">South edge.</param>
        /// <param name="maxZ">North edge.</param>
        /// <param name="alongX">True: the height changes along x; false: along z.</param>
        /// <param name="yAtMin">Floor height at the west (alongX) or south edge.</param>
        /// <param name="yAtMax">Floor height at the east (alongX) or north edge.</param>
        /// <param name="height">Clear height.</param>
        public DungeonFloorPiece(string ownerId, bool isRoom, float minX, float maxX, float minZ, float maxZ, bool alongX, float yAtMin, float yAtMax,
            float height)
        {
            OwnerId = ownerId ?? string.Empty;
            IsRoom = isRoom;
            MinX = Math.Min(minX, maxX);
            MaxX = Math.Max(minX, maxX);
            MinZ = Math.Min(minZ, maxZ);
            MaxZ = Math.Max(minZ, maxZ);
            AlongX = alongX;
            YAtMin = yAtMin;
            YAtMax = yAtMax;
            Height = height;
        }

        /// <summary>Room or corridor id.</summary>
        public string OwnerId { get; }

        /// <summary>True for a room.</summary>
        public bool IsRoom { get; }

        /// <summary>West edge.</summary>
        public float MinX { get; }

        /// <summary>East edge.</summary>
        public float MaxX { get; }

        /// <summary>South edge.</summary>
        public float MinZ { get; }

        /// <summary>North edge.</summary>
        public float MaxZ { get; }

        /// <summary>True: the height changes along x; false: along z.</summary>
        public bool AlongX { get; }

        /// <summary>Floor height at the lower edge of the slope axis.</summary>
        public float YAtMin { get; }

        /// <summary>Floor height at the upper edge of the slope axis.</summary>
        public float YAtMax { get; }

        /// <summary>Clear height.</summary>
        public float Height { get; }

        /// <summary>True if the floor is not level.</summary>
        public bool IsSloped => Math.Abs(YAtMax - YAtMin) > 1e-4f;

        /// <summary>Length along the slope axis.</summary>
        public float Length => AlongX ? MaxX - MinX : MaxZ - MinZ;

        /// <summary>Slope angle in degrees.</summary>
        public float SlopeDegrees => Length > 0f ? (float)(Math.Atan(Math.Abs(YAtMax - YAtMin) / Length) * 180.0 / Math.PI) : 0f;

        /// <summary>True if the point lies inside (west/south inclusive, east/north exclusive).</summary>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        public bool Contains(float x, float z)
        {
            return x >= MinX && x < MaxX && z >= MinZ && z < MaxZ;
        }

        /// <summary>Floor height at a point (clamped to the piece).</summary>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        public float FloorAt(float x, float z)
        {
            if (!IsSloped)
            {
                return YAtMin;
            }

            float t = AlongX ? (x - MinX) / (MaxX - MinX) : (z - MinZ) / (MaxZ - MinZ);
            t = Math.Max(0f, Math.Min(1f, t));
            return YAtMin + (YAtMax - YAtMin) * t;
        }

        /// <summary>Ceiling height at a point.</summary>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        public float CeilingAt(float x, float z)
        {
            return FloorAt(x, z) + Height;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return OwnerId + " [" + MinX + ".." + MaxX + "]x[" + MinZ + ".." + MaxZ + "] y " + YAtMin + ".." + YAtMax;
        }
    }
}
