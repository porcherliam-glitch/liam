using System;
using System.Collections.Generic;
using Aetherfall.World.Puzzles;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Builds the run-time puzzle logic from layout data, so the generator, the validator, the tests and the puzzle components
    /// use the same positions and rules. Pure logic.
    /// </summary>
    public static class DungeonPuzzleFactory
    {
        /// <summary>Creates the sequence logic of a <c>sequence</c> puzzle.</summary>
        /// <param name="puzzle">Puzzle data.</param>
        public static SequencePuzzle CreateSequencePuzzle(DungeonPuzzle puzzle)
        {
            if (puzzle == null || !puzzle.IsSequence)
            {
                throw new ArgumentException("A sequence puzzle is required.", nameof(puzzle));
            }

            return new SequencePuzzle(puzzle.Steps);
        }

        /// <summary>Creates the light logic of a <c>mirror</c> puzzle in its start position, bounded by its room.</summary>
        /// <param name="layout">Layout (positions of source, target and mirrors).</param>
        /// <param name="puzzle">Puzzle data.</param>
        /// <exception cref="ArgumentException">Not a mirror puzzle, or an object is missing.</exception>
        public static MirrorPuzzle CreateMirrorPuzzle(DungeonLayout layout, DungeonPuzzle puzzle)
        {
            if (layout == null || puzzle == null || !puzzle.IsMirror)
            {
                throw new ArgumentException("A mirror puzzle of a layout is required.", nameof(puzzle));
            }

            DungeonObject source = Require(layout, puzzle.Source);
            DungeonObject target = Require(layout, puzzle.Target);
            var mirrors = new List<MirrorSetup>(puzzle.Mirrors.Count);
            foreach (DungeonPuzzleMirror mirror in puzzle.Mirrors)
            {
                DungeonObject item = Require(layout, mirror.Id);
                mirrors.Add(new MirrorSetup(mirror.Id, new PlanarPoint(item.X, item.Z), mirror.Start));
            }

            DungeonRoom room = RoomAt(layout, source.X, source.Z);
            if (room == null)
            {
                return new MirrorPuzzle(new PlanarPoint(source.X, source.Z), puzzle.SourceDirection, new PlanarPoint(target.X, target.Z), mirrors);
            }

            DungeonRect bounds = room.Bounds;
            return new MirrorPuzzle(new PlanarPoint(source.X, source.Z), puzzle.SourceDirection, new PlanarPoint(target.X, target.Z), mirrors,
                bounds.X, bounds.MaxX, bounds.Z, bounds.MaxZ);
        }

        /// <summary>The room containing a point (inclusive borders with 0.5 m tolerance for wall-mounted objects), or null.</summary>
        /// <param name="layout">Layout.</param>
        /// <param name="x">X.</param>
        /// <param name="z">Z.</param>
        public static DungeonRoom RoomAt(DungeonLayout layout, float x, float z)
        {
            foreach (DungeonRoom room in layout.Rooms)
            {
                if (room.Bounds.Contains(x, z))
                {
                    return room;
                }
            }

            foreach (DungeonRoom room in layout.Rooms)
            {
                if (room.Bounds.ContainsWithin(x, z, 0.5f))
                {
                    return room;
                }
            }

            return null;
        }

        private static DungeonObject Require(DungeonLayout layout, string id)
        {
            DungeonObject item = layout.FindObject(id);
            if (item == null)
            {
                throw new ArgumentException("Object '" + id + "' is missing in the layout.", nameof(id));
            }

            return item;
        }
    }
}
