using System;
using System.Globalization;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Axis-aligned rectangle on the ground plane: <c>[X, X + Width) × [Z, Z + Depth)</c> in metres (Unity x = east,
    /// z = north). Rooms, location zones, checkpoints and the boss encounter area use it. Immutable value type.
    /// </summary>
    public readonly struct DungeonRect
    {
        /// <summary>Creates the rectangle.</summary>
        /// <param name="x">West edge.</param>
        /// <param name="z">South edge.</param>
        /// <param name="width">Size along x.</param>
        /// <param name="depth">Size along z.</param>
        public DungeonRect(float x, float z, float width, float depth)
        {
            X = x;
            Z = z;
            Width = width;
            Depth = depth;
        }

        /// <summary>West edge.</summary>
        public float X { get; }

        /// <summary>South edge.</summary>
        public float Z { get; }

        /// <summary>Size along x.</summary>
        public float Width { get; }

        /// <summary>Size along z.</summary>
        public float Depth { get; }

        /// <summary>East edge (exclusive).</summary>
        public float MaxX => X + Width;

        /// <summary>North edge (exclusive).</summary>
        public float MaxZ => Z + Depth;

        /// <summary>Centre on x.</summary>
        public float CenterX => X + Width * 0.5f;

        /// <summary>Centre on z.</summary>
        public float CenterZ => Z + Depth * 0.5f;

        /// <summary>True if the point lies inside (west and south edges inclusive, east and north exclusive).</summary>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        public bool Contains(float x, float z)
        {
            return x >= X && x < MaxX && z >= Z && z < MaxZ;
        }

        /// <summary>True if the point lies inside or on the border, with a tolerance.</summary>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        /// <param name="tolerance">Tolerance in metres.</param>
        public bool ContainsWithin(float x, float z, float tolerance)
        {
            return x >= X - tolerance && x <= MaxX + tolerance && z >= Z - tolerance && z <= MaxZ + tolerance;
        }

        /// <summary>True if the two rectangles share area (touching borders do not count).</summary>
        /// <param name="other">Other rectangle.</param>
        public bool Overlaps(in DungeonRect other)
        {
            return X < other.MaxX && other.X < MaxX && Z < other.MaxZ && other.Z < MaxZ;
        }

        /// <summary>True if <paramref name="other"/> lies completely inside.</summary>
        /// <param name="other">Other rectangle.</param>
        public bool Encloses(in DungeonRect other)
        {
            const float epsilon = 1e-4f;
            return other.X >= X - epsilon && other.MaxX <= MaxX + epsilon && other.Z >= Z - epsilon && other.MaxZ <= MaxZ + epsilon;
        }

        /// <summary>True if all four values are whole numbers (aligned to the 1 m grid).</summary>
        public bool IsGridAligned => IsWhole(X) && IsWhole(Z) && IsWhole(Width) && IsWhole(Depth);

        /// <inheritdoc />
        public override string ToString()
        {
            return "[" + Format(X) + ".." + Format(MaxX) + "] x [" + Format(Z) + ".." + Format(MaxZ) + "]";
        }

        private static bool IsWhole(float value)
        {
            return Math.Abs(value - Math.Round(value)) < 1e-4;
        }

        private static string Format(float value)
        {
            return value.ToString("0.##", CultureInfo.InvariantCulture);
        }
    }
}
