using System;
using System.Collections.Generic;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Turns the rooms and corridors of a <see cref="DungeonLayout"/> into geometry that the Unity generator and the Blender
    /// preview build in the same way: walkable <see cref="Pieces"/> (rooms, corridor segments as ramps, flat joints), a 1 m
    /// grid of floor cells and the <see cref="Walls"/> on every boundary between floor and void, plus lintels above openings
    /// into lower corridors and risers at steps. Pure logic, deterministic.
    /// </summary>
    /// <remarks>
    /// <para>Cell (i, k) covers [i, i+1) × [k, k+1); it belongs to the first piece that contains its centre (rooms first, then
    /// corridors in file order). Corridor segments are trimmed by half the width at inner points, where a flat square at the
    /// point's height joins them, so a ramp never cuts through the joint.</para>
    /// <para>The algorithm is mirrored in Tools/Preview/gruft_preview.py; change both together.</para>
    /// </remarks>
    public sealed class DungeonGeometry
    {
        /// <summary>Walls reach this far below the floor (no gaps at steps and ramps).</summary>
        public const float FoundationDepth = 1f;

        /// <summary>Thickness of floor and ceiling boxes.</summary>
        public const float SlabThickness = 0.5f;

        /// <summary>Height differences below this are ignored (lintels, risers).</summary>
        public const float HeightTolerance = 0.05f;

        private readonly List<DungeonFloorPiece> _pieces;
        private readonly List<DungeonWallSegment> _walls = new List<DungeonWallSegment>();
        private readonly int[] _cells;

        private DungeonGeometry(List<DungeonFloorPiece> pieces, int minX, int minZ, int sizeX, int sizeZ)
        {
            _pieces = pieces;
            MinCellX = minX;
            MinCellZ = minZ;
            CellsX = sizeX;
            CellsZ = sizeZ;
            _cells = new int[Math.Max(0, sizeX * sizeZ)];
            for (int i = 0; i < _cells.Length; i++)
            {
                _cells[i] = -1;
            }
        }

        /// <summary>Walkable pieces in ownership order.</summary>
        public IReadOnlyList<DungeonFloorPiece> Pieces => _pieces;

        /// <summary>Wall segments (merged runs).</summary>
        public IReadOnlyList<DungeonWallSegment> Walls => _walls;

        /// <summary>Smallest cell x.</summary>
        public int MinCellX { get; }

        /// <summary>Smallest cell z.</summary>
        public int MinCellZ { get; }

        /// <summary>Number of cells along x.</summary>
        public int CellsX { get; }

        /// <summary>Number of cells along z.</summary>
        public int CellsZ { get; }

        /// <summary>Number of floor cells.</summary>
        public int FloorCellCount { get; private set; }

        /// <summary>Builds the geometry of a layout.</summary>
        /// <param name="layout">Layout (rooms and corridors are used).</param>
        /// <returns>The geometry.</returns>
        public static DungeonGeometry Build(DungeonLayout layout)
        {
            if (layout == null)
            {
                throw new ArgumentNullException(nameof(layout));
            }

            List<DungeonFloorPiece> pieces = CreatePieces(layout);
            float minX = float.MaxValue;
            float minZ = float.MaxValue;
            float maxX = float.MinValue;
            float maxZ = float.MinValue;
            for (int i = 0; i < pieces.Count; i++)
            {
                minX = Math.Min(minX, pieces[i].MinX);
                minZ = Math.Min(minZ, pieces[i].MinZ);
                maxX = Math.Max(maxX, pieces[i].MaxX);
                maxZ = Math.Max(maxZ, pieces[i].MaxZ);
            }

            if (pieces.Count == 0)
            {
                return new DungeonGeometry(pieces, 0, 0, 0, 0);
            }

            int cellMinX = (int)Math.Floor(minX) - 1;
            int cellMinZ = (int)Math.Floor(minZ) - 1;
            int cellMaxX = (int)Math.Ceiling(maxX) + 1;
            int cellMaxZ = (int)Math.Ceiling(maxZ) + 1;
            var geometry = new DungeonGeometry(pieces, cellMinX, cellMinZ, cellMaxX - cellMinX, cellMaxZ - cellMinZ);
            geometry.AssignCells();
            geometry.BuildWalls();
            return geometry;
        }

        /// <summary>Creates the pieces of the rooms and corridors (rooms first).</summary>
        /// <param name="layout">Layout.</param>
        public static List<DungeonFloorPiece> CreatePieces(DungeonLayout layout)
        {
            var pieces = new List<DungeonFloorPiece>();
            foreach (DungeonRoom room in layout.Rooms)
            {
                DungeonRect r = room.Bounds;
                pieces.Add(new DungeonFloorPiece(room.Id, true, r.X, r.MaxX, r.Z, r.MaxZ, false, room.FloorY, room.FloorY, room.Height));
            }

            foreach (DungeonCorridor corridor in layout.Corridors)
            {
                AddCorridorPieces(corridor, pieces);
            }

            return pieces;
        }

        /// <summary>True if the cell has a floor.</summary>
        /// <param name="cellX">Cell x.</param>
        /// <param name="cellZ">Cell z.</param>
        public bool IsFloorCell(int cellX, int cellZ)
        {
            return PieceIndex(cellX, cellZ) >= 0;
        }

        /// <summary>The piece owning a cell, or null.</summary>
        /// <param name="cellX">Cell x.</param>
        /// <param name="cellZ">Cell z.</param>
        public DungeonFloorPiece PieceAtCell(int cellX, int cellZ)
        {
            int index = PieceIndex(cellX, cellZ);
            return index >= 0 ? _pieces[index] : null;
        }

        /// <summary>The piece at a point: the first piece containing it, otherwise the owner of its cell; null if none.</summary>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        public DungeonFloorPiece PieceAt(float x, float z)
        {
            for (int i = 0; i < _pieces.Count; i++)
            {
                if (_pieces[i].Contains(x, z))
                {
                    return _pieces[i];
                }
            }

            return PieceAtCell((int)Math.Floor(x), (int)Math.Floor(z));
        }

        /// <summary>Floor height at a point, NaN outside every piece.</summary>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        public float FloorAt(float x, float z)
        {
            DungeonFloorPiece piece = PieceAt(x, z);
            return piece != null ? piece.FloorAt(x, z) : float.NaN;
        }

        /// <summary>Ceiling height at a point, NaN outside every piece.</summary>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        public float CeilingAt(float x, float z)
        {
            DungeonFloorPiece piece = PieceAt(x, z);
            return piece != null ? piece.CeilingAt(x, z) : float.NaN;
        }

        /// <summary>True if the point lies on a floor cell.</summary>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        public bool IsOnFloor(float x, float z)
        {
            return IsFloorCell((int)Math.Floor(x), (int)Math.Floor(z));
        }

        /// <summary>
        /// True if a wall-mounted object at the point is next to the floor: within <paramref name="tolerance"/> of a floor cell.
        /// </summary>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        /// <param name="tolerance">Distance in metres.</param>
        public bool IsNearFloor(float x, float z, float tolerance)
        {
            int minX = (int)Math.Floor(x - tolerance);
            int maxX = (int)Math.Floor(x + tolerance);
            int minZ = (int)Math.Floor(z - tolerance);
            int maxZ = (int)Math.Floor(z + tolerance);
            for (int i = minX; i <= maxX; i++)
            {
                for (int k = minZ; k <= maxZ; k++)
                {
                    if (IsFloorCell(i, k))
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        /// <summary>
        /// Floor cells reachable from a start point by walking and jumping: a step up between neighbouring cells may be at
        /// most <paramref name="maxStepUp"/> metres (jump height 1.2 m, GDD 03 3.1); steps down are always fine.
        /// </summary>
        /// <param name="startX">Start x.</param>
        /// <param name="startZ">Start z.</param>
        /// <param name="maxStepUp">Largest step up.</param>
        /// <returns>Set of reachable cells as packed keys (<see cref="CellKey"/>).</returns>
        public HashSet<long> ReachableCells(float startX, float startZ, float maxStepUp)
        {
            var reached = new HashSet<long>();
            int sx = (int)Math.Floor(startX);
            int sz = (int)Math.Floor(startZ);
            if (!IsFloorCell(sx, sz))
            {
                return reached;
            }

            var open = new Queue<long>();
            open.Enqueue(CellKey(sx, sz));
            reached.Add(CellKey(sx, sz));
            while (open.Count > 0)
            {
                long key = open.Dequeue();
                int cx = (int)(key >> 32);
                int cz = (int)(key & 0xFFFFFFFF);
                for (int d = 0; d < 4; d++)
                {
                    int nx = cx + (d == 0 ? 1 : d == 1 ? -1 : 0);
                    int nz = cz + (d == 2 ? 1 : d == 3 ? -1 : 0);
                    long next = CellKey(nx, nz);
                    if (reached.Contains(next) || !IsFloorCell(nx, nz))
                    {
                        continue;
                    }

                    float edgeX = (cx + nx + 1) * 0.5f;
                    float edgeZ = (cz + nz + 1) * 0.5f;
                    float here = ClampedFloor(PieceAtCell(cx, cz), edgeX, edgeZ);
                    float there = ClampedFloor(PieceAtCell(nx, nz), edgeX, edgeZ);
                    if (there - here > maxStepUp + HeightTolerance)
                    {
                        continue;
                    }

                    reached.Add(next);
                    open.Enqueue(next);
                }
            }

            return reached;
        }

        /// <summary>Packs a cell into one key.</summary>
        /// <param name="cellX">Cell x.</param>
        /// <param name="cellZ">Cell z.</param>
        public static long CellKey(int cellX, int cellZ)
        {
            return ((long)cellX << 32) | (uint)cellZ;
        }

        private static float ClampedFloor(DungeonFloorPiece piece, float x, float z)
        {
            float cx = Math.Max(piece.MinX, Math.Min(piece.MaxX, x));
            float cz = Math.Max(piece.MinZ, Math.Min(piece.MaxZ, z));
            return piece.FloorAt(cx, cz);
        }

        private static void AddCorridorPieces(DungeonCorridor corridor, List<DungeonFloorPiece> pieces)
        {
            List<DungeonCorridorPoint> points = corridor.Points;
            float half = corridor.Width * 0.5f;
            int count = points.Count;
            for (int i = 0; i + 1 < count; i++)
            {
                DungeonCorridorPoint a = points[i];
                DungeonCorridorPoint b = points[i + 1];
                bool alongX = Math.Abs(a.Z - b.Z) < 1e-4f;
                float ax = a.X;
                float az = a.Z;
                float bx = b.X;
                float bz = b.Z;
                float dirX = Math.Sign(bx - ax);
                float dirZ = Math.Sign(bz - az);
                if (i > 0)
                {
                    ax += dirX * half;
                    az += dirZ * half;
                }

                if (i + 2 < count)
                {
                    bx -= dirX * half;
                    bz -= dirZ * half;
                }

                if (alongX)
                {
                    bool increasing = bx >= ax;
                    pieces.Add(new DungeonFloorPiece(corridor.Id, false, Math.Min(ax, bx), Math.Max(ax, bx), a.Z - half, a.Z + half, true,
                        increasing ? a.Y : b.Y, increasing ? b.Y : a.Y, corridor.Height));
                }
                else
                {
                    bool increasing = bz >= az;
                    pieces.Add(new DungeonFloorPiece(corridor.Id, false, a.X - half, a.X + half, Math.Min(az, bz), Math.Max(az, bz), false,
                        increasing ? a.Y : b.Y, increasing ? b.Y : a.Y, corridor.Height));
                }
            }

            for (int i = 1; i + 1 < count; i++)
            {
                DungeonCorridorPoint v = points[i];
                pieces.Add(new DungeonFloorPiece(corridor.Id, false, v.X - half, v.X + half, v.Z - half, v.Z + half, false, v.Y, v.Y, corridor.Height));
            }
        }

        private int PieceIndex(int cellX, int cellZ)
        {
            int ix = cellX - MinCellX;
            int iz = cellZ - MinCellZ;
            if (ix < 0 || iz < 0 || ix >= CellsX || iz >= CellsZ)
            {
                return -1;
            }

            return _cells[iz * CellsX + ix];
        }

        private void AssignCells()
        {
            int count = 0;
            for (int iz = 0; iz < CellsZ; iz++)
            {
                for (int ix = 0; ix < CellsX; ix++)
                {
                    float cx = MinCellX + ix + 0.5f;
                    float cz = MinCellZ + iz + 0.5f;
                    for (int p = 0; p < _pieces.Count; p++)
                    {
                        if (_pieces[p].Contains(cx, cz))
                        {
                            _cells[iz * CellsX + ix] = p;
                            count++;
                            break;
                        }
                    }
                }
            }

            FloorCellCount = count;
        }

        private void BuildWalls()
        {
            var edges = new Dictionary<string, List<DungeonWallSegment>>(StringComparer.Ordinal);
            for (int iz = 0; iz < CellsZ; iz++)
            {
                for (int ix = 0; ix < CellsX; ix++)
                {
                    int index = _cells[iz * CellsX + ix];
                    if (index < 0)
                    {
                        continue;
                    }

                    int cellX = MinCellX + ix;
                    int cellZ = MinCellZ + iz;
                    DungeonFloorPiece piece = _pieces[index];
                    AddEdge(edges, piece, cellX, cellZ, 1, 0);
                    AddEdge(edges, piece, cellX, cellZ, -1, 0);
                    AddEdge(edges, piece, cellX, cellZ, 0, 1);
                    AddEdge(edges, piece, cellX, cellZ, 0, -1);
                }
            }

            var keys = new List<string>(edges.Keys);
            keys.Sort(StringComparer.Ordinal);
            foreach (string key in keys)
            {
                List<DungeonWallSegment> list = edges[key];
                list.Sort((a, b) => a.Start.CompareTo(b.Start));
                DungeonWallSegment current = null;
                foreach (DungeonWallSegment edge in list)
                {
                    if (current != null && Math.Abs(edge.Start - current.End) < 1e-4f)
                    {
                        current.End = edge.End;
                        current.Bottom = Math.Min(current.Bottom, edge.Bottom);
                        current.Top = Math.Max(current.Top, edge.Top);
                        continue;
                    }

                    current = edge;
                    _walls.Add(current);
                }
            }
        }

        private void AddEdge(Dictionary<string, List<DungeonWallSegment>> edges, DungeonFloorPiece piece, int cellX, int cellZ, int dx, int dz)
        {
            int nx = cellX + dx;
            int nz = cellZ + dz;
            bool alongX = dz != 0;
            float line = dx > 0 ? cellX + 1 : dx < 0 ? cellX : dz > 0 ? cellZ + 1 : cellZ;
            float start = alongX ? cellX : cellZ;
            float midX = dx != 0 ? line : cellX + 0.5f;
            float midZ = dz != 0 ? line : cellZ + 0.5f;
            int facing = dx + dz;
            float floor = ClampedFloor(piece, midX, midZ);
            float ceiling = floor + piece.Height;
            DungeonFloorPiece neighbour = PieceAtCell(nx, nz);
            if (neighbour == null)
            {
                Add(edges, new DungeonWallSegment
                {
                    AlongX = alongX,
                    Line = line,
                    Start = start,
                    End = start + 1f,
                    Bottom = floor - FoundationDepth,
                    Top = ceiling,
                    Facing = facing,
                    Kind = DungeonWallKind.Wall
                });
                return;
            }

            if (ReferenceEquals(neighbour, piece))
            {
                return;
            }

            float otherFloor = ClampedFloor(neighbour, midX, midZ);
            float otherCeiling = otherFloor + neighbour.Height;
            if (ceiling > otherCeiling + HeightTolerance)
            {
                Add(edges, new DungeonWallSegment
                {
                    AlongX = alongX,
                    Line = line,
                    Start = start,
                    End = start + 1f,
                    Bottom = otherCeiling,
                    Top = ceiling,
                    Facing = facing,
                    Kind = DungeonWallKind.Lintel
                });
            }

            if (otherFloor > floor + HeightTolerance)
            {
                Add(edges, new DungeonWallSegment
                {
                    AlongX = alongX,
                    Line = line,
                    Start = start,
                    End = start + 1f,
                    Bottom = floor,
                    Top = otherFloor,
                    Facing = facing,
                    Kind = DungeonWallKind.Riser
                });
            }
        }

        private static void Add(Dictionary<string, List<DungeonWallSegment>> edges, DungeonWallSegment segment)
        {
            string key = (int)segment.Kind + "|" + (segment.AlongX ? "x" : "z") + "|" +
                         segment.Line.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture) + "|" + segment.Facing;
            if (!edges.TryGetValue(key, out List<DungeonWallSegment> list))
            {
                list = new List<DungeonWallSegment>();
                edges.Add(key, list);
            }

            list.Add(segment);
        }
    }
}
