using System;

namespace Aetherfall.Utilities
{
    /// <summary>
    /// Conversion between world coordinates and the streaming cell grid (architecture 10: cells of 512 × 512 m on the XZ
    /// plane, cell (0, 0) starts at the world origin). Saves store positions as cell + local position (architecture 9.7),
    /// so they survive a later floating origin. Pure math on doubles, no Unity types.
    /// </summary>
    public static class WorldGrid
    {
        /// <summary>Edge length of a streaming cell in metres (architecture 10.1).</summary>
        public const double CellSize = 512.0;

        /// <summary>Cell index along one axis that contains the world coordinate.</summary>
        /// <param name="worldCoordinate">World X or Z in metres.</param>
        public static int CellIndex(double worldCoordinate)
        {
            return (int)Math.Floor(worldCoordinate / CellSize);
        }

        /// <summary>Position inside the cell along one axis, in [0, <see cref="CellSize"/>).</summary>
        /// <param name="worldCoordinate">World X or Z in metres.</param>
        /// <param name="cellIndex">Cell index along the same axis (see <see cref="CellIndex"/>).</param>
        public static double LocalCoordinate(double worldCoordinate, int cellIndex)
        {
            return worldCoordinate - cellIndex * CellSize;
        }

        /// <summary>World coordinate of a local position inside a cell along one axis.</summary>
        /// <param name="cellIndex">Cell index.</param>
        /// <param name="localCoordinate">Position inside the cell in metres.</param>
        public static double WorldCoordinate(int cellIndex, double localCoordinate)
        {
            return cellIndex * CellSize + localCoordinate;
        }
    }
}
