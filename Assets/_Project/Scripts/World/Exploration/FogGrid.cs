using System;

namespace Aetherfall.World.Exploration
{
    /// <summary>
    /// The fog of war of a map (GDD 01 6.6: the fog clears within 60 m around the player, the revealed area is saved): a grid of
    /// square cells over the playable area, one bit each. Stored as Base64 (row by row from south to north, west to east,
    /// lowest bit first). Pure logic.
    /// </summary>
    public sealed class FogGrid
    {
        private readonly byte[] _bits;
        private int _revealed;

        /// <summary>Creates a grid with every cell in fog.</summary>
        /// <param name="originX">West edge in world metres.</param>
        /// <param name="originZ">South edge in world metres.</param>
        /// <param name="cellSize">Cell size in metres (&gt; 0).</param>
        /// <param name="columns">Cells from west to east (≥ 1).</param>
        /// <param name="rows">Cells from south to north (≥ 1).</param>
        public FogGrid(float originX, float originZ, float cellSize, int columns, int rows)
        {
            OriginX = originX;
            OriginZ = originZ;
            CellSize = cellSize > 0f ? cellSize : 1f;
            Columns = Math.Max(1, columns);
            Rows = Math.Max(1, rows);
            _bits = new byte[(Columns * Rows + 7) / 8];
        }

        /// <summary>West edge in world metres.</summary>
        public float OriginX { get; }

        /// <summary>South edge in world metres.</summary>
        public float OriginZ { get; }

        /// <summary>Cell size in metres.</summary>
        public float CellSize { get; }

        /// <summary>Cells from west to east.</summary>
        public int Columns { get; }

        /// <summary>Cells from south to north.</summary>
        public int Rows { get; }

        /// <summary>Number of revealed cells.</summary>
        public int RevealedCells => _revealed;

        /// <summary>Share of revealed cells (0–1).</summary>
        public float RevealedFraction => (float)_revealed / (Columns * Rows);

        /// <summary>True if the cell is revealed (cells outside the grid count as fog).</summary>
        /// <param name="column">Column (west to east).</param>
        /// <param name="row">Row (south to north).</param>
        public bool IsCellRevealed(int column, int row)
        {
            if (column < 0 || row < 0 || column >= Columns || row >= Rows)
            {
                return false;
            }

            int index = row * Columns + column;
            return (_bits[index >> 3] & (1 << (index & 7))) != 0;
        }

        /// <summary>True if the world position lies in a revealed cell.</summary>
        /// <param name="x">World x.</param>
        /// <param name="z">World z.</param>
        public bool IsRevealed(float x, float z)
        {
            return IsCellRevealed((int)Math.Floor((x - OriginX) / CellSize), (int)Math.Floor((z - OriginZ) / CellSize));
        }

        /// <summary>Reveals every cell whose centre lies within <paramref name="radius"/> of the point.</summary>
        /// <param name="x">World x.</param>
        /// <param name="z">World z.</param>
        /// <param name="radius">Radius in metres.</param>
        /// <returns>Number of cells that were in fog before.</returns>
        public int Reveal(float x, float z, float radius)
        {
            if (!(radius > 0f))
            {
                return 0;
            }

            int minColumn = Math.Max(0, (int)Math.Floor((x - radius - OriginX) / CellSize));
            int maxColumn = Math.Min(Columns - 1, (int)Math.Floor((x + radius - OriginX) / CellSize));
            int minRow = Math.Max(0, (int)Math.Floor((z - radius - OriginZ) / CellSize));
            int maxRow = Math.Min(Rows - 1, (int)Math.Floor((z + radius - OriginZ) / CellSize));
            float radiusSquared = radius * radius;
            int added = 0;
            for (int row = minRow; row <= maxRow; row++)
            {
                float dz = OriginZ + (row + 0.5f) * CellSize - z;
                for (int column = minColumn; column <= maxColumn; column++)
                {
                    float dx = OriginX + (column + 0.5f) * CellSize - x;
                    if (dx * dx + dz * dz <= radiusSquared && Set(row * Columns + column))
                    {
                        added++;
                    }
                }
            }

            return added;
        }

        /// <summary>Reveals the whole grid (debug).</summary>
        /// <returns>Number of cells that were in fog before.</returns>
        public int RevealAll()
        {
            int added = 0;
            for (int i = 0; i < Columns * Rows; i++)
            {
                if (Set(i))
                {
                    added++;
                }
            }

            return added;
        }

        /// <summary>The bits as Base64 (for the save).</summary>
        public string ToBase64()
        {
            return Convert.ToBase64String(_bits);
        }

        /// <summary>
        /// Loads saved bits. A grid of another size (an older save, a changed map) is resampled: a cell is revealed if the old
        /// cell under its centre was revealed. Broken data leaves the grid in fog.
        /// </summary>
        /// <param name="bits">Base64 bits.</param>
        /// <param name="originX">West edge of the saved grid.</param>
        /// <param name="originZ">South edge of the saved grid.</param>
        /// <param name="cellSize">Cell size of the saved grid.</param>
        /// <param name="columns">Columns of the saved grid.</param>
        /// <param name="rows">Rows of the saved grid.</param>
        /// <returns>False if the data could not be read.</returns>
        public bool Load(string bits, float originX, float originZ, float cellSize, int columns, int rows)
        {
            Array.Clear(_bits, 0, _bits.Length);
            _revealed = 0;
            if (string.IsNullOrEmpty(bits))
            {
                return true;
            }

            byte[] data;
            try
            {
                data = Convert.FromBase64String(bits);
            }
            catch (FormatException)
            {
                return false;
            }

            if (columns <= 0 || rows <= 0 || data.Length < (columns * rows + 7) / 8)
            {
                return false;
            }

            bool same = columns == Columns && rows == Rows && Math.Abs(cellSize - CellSize) < 1e-4f && Math.Abs(originX - OriginX) < 1e-3f &&
                        Math.Abs(originZ - OriginZ) < 1e-3f;
            var old = new FogGrid(originX, originZ, cellSize, columns, rows);
            Array.Copy(data, old._bits, old._bits.Length);
            for (int row = 0; row < Rows; row++)
            {
                for (int column = 0; column < Columns; column++)
                {
                    bool revealed = same
                        ? old.IsCellRevealed(column, row)
                        : old.IsRevealed(OriginX + (column + 0.5f) * CellSize, OriginZ + (row + 0.5f) * CellSize);
                    if (revealed)
                    {
                        Set(row * Columns + column);
                    }
                }
            }

            return true;
        }

        private bool Set(int index)
        {
            int mask = 1 << (index & 7);
            if ((_bits[index >> 3] & mask) != 0)
            {
                return false;
            }

            _bits[index >> 3] = (byte)(_bits[index >> 3] | mask);
            _revealed++;
            return true;
        }
    }
}
