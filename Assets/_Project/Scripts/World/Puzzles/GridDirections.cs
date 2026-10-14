using System;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Helpers for <see cref="GridDirection"/>: parsing the layout letters (N, E, S, W), German names, yaw, step vector,
    /// opposite and clockwise rotation. Pure logic.
    /// </summary>
    public static class GridDirections
    {
        /// <summary>Number of directions.</summary>
        public const int Count = 4;

        /// <summary>Parses N/E/S/W (also O for "Ost", and the full English or German names, case-insensitive).</summary>
        /// <param name="text">Text.</param>
        /// <param name="direction">Parsed direction.</param>
        /// <returns>True on success.</returns>
        public static bool TryParse(string text, out GridDirection direction)
        {
            direction = GridDirection.North;
            if (string.IsNullOrEmpty(text))
            {
                return false;
            }

            switch (text.Trim().ToUpperInvariant())
            {
                case "N":
                case "NORTH":
                case "NORD":
                case "NORDEN":
                    direction = GridDirection.North;
                    return true;
                case "E":
                case "O":
                case "EAST":
                case "OST":
                case "OSTEN":
                    direction = GridDirection.East;
                    return true;
                case "S":
                case "SOUTH":
                case "SUED":
                case "SÜD":
                case "SUEDEN":
                case "SÜDEN":
                    direction = GridDirection.South;
                    return true;
                case "W":
                case "WEST":
                case "WESTEN":
                    direction = GridDirection.West;
                    return true;
                default:
                    return false;
            }
        }

        /// <summary>Letter as used in the layout file (N, E, S, W).</summary>
        /// <param name="direction">Direction.</param>
        public static string Letter(GridDirection direction)
        {
            switch (direction)
            {
                case GridDirection.East:
                    return "E";
                case GridDirection.South:
                    return "S";
                case GridDirection.West:
                    return "W";
                default:
                    return "N";
            }
        }

        /// <summary>German name for messages and debug texts (Nord, Ost, Sued, West).</summary>
        /// <param name="direction">Direction.</param>
        public static string GermanName(GridDirection direction)
        {
            switch (direction)
            {
                case GridDirection.East:
                    return "Ost";
                case GridDirection.South:
                    return "Süd";
                case GridDirection.West:
                    return "West";
                default:
                    return "Nord";
            }
        }

        /// <summary>Yaw in degrees (Unity: 0 = north, 90 = east).</summary>
        /// <param name="direction">Direction.</param>
        public static float Yaw(GridDirection direction)
        {
            return Normalize((int)direction) * 90f;
        }

        /// <summary>Nearest direction of a yaw in degrees.</summary>
        /// <param name="yaw">Yaw (any range).</param>
        public static GridDirection FromYaw(float yaw)
        {
            double wrapped = yaw % 360.0;
            if (wrapped < 0)
            {
                wrapped += 360.0;
            }

            int index = (int)Math.Round(wrapped / 90.0) % Count;
            return (GridDirection)index;
        }

        /// <summary>Unit step on x (east = +1).</summary>
        /// <param name="direction">Direction.</param>
        public static int StepX(GridDirection direction)
        {
            return direction == GridDirection.East ? 1 : direction == GridDirection.West ? -1 : 0;
        }

        /// <summary>Unit step on z (north = +1).</summary>
        /// <param name="direction">Direction.</param>
        public static int StepZ(GridDirection direction)
        {
            return direction == GridDirection.North ? 1 : direction == GridDirection.South ? -1 : 0;
        }

        /// <summary>The opposite direction.</summary>
        /// <param name="direction">Direction.</param>
        public static GridDirection Opposite(GridDirection direction)
        {
            return (GridDirection)Normalize((int)direction + 2);
        }

        /// <summary>The next direction clockwise (north → east → south → west → north).</summary>
        /// <param name="direction">Direction.</param>
        public static GridDirection Clockwise(GridDirection direction)
        {
            return (GridDirection)Normalize((int)direction + 1);
        }

        /// <summary>True if the value is one of the four defined directions.</summary>
        /// <param name="direction">Value (e.g. from a save file).</param>
        public static bool IsDefined(GridDirection direction)
        {
            int value = (int)direction;
            return value >= 0 && value < Count;
        }

        private static int Normalize(int value)
        {
            int result = value % Count;
            return result < 0 ? result + Count : result;
        }
    }
}
