using System;
using Aetherfall.World.Dungeons;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Builds the shell of a dungeon from <see cref="DungeonGeometry"/> with primitives on the layer Environment: one floor box
    /// and one ceiling box per walkable piece (ramps as tilted boxes), wall boxes on every floor/void boundary (body on the void
    /// side, ends lengthened by the wall thickness so corners close), lintels above openings into lower corridors and risers at
    /// steps. The same rules build the Blender preview (Tools/Preview/gruft_preview.py).
    /// </summary>
    public static class GruftGeometryBuilder
    {
        private const float StepFaceThickness = 0.3f;

        /// <summary>Builds floors, ceilings and walls under <paramref name="parent"/>.</summary>
        /// <param name="geometry">Geometry of the layout.</param>
        /// <param name="wallThickness">Wall thickness of the layout.</param>
        /// <param name="parent">Parent object.</param>
        /// <param name="materials">Materials.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        /// <param name="report">Protocol.</param>
        public static void Build(DungeonGeometry geometry, float wallThickness, Transform parent, GruftMaterials materials, int environmentLayer,
            TestGroundReport report)
        {
            var floors = Group(parent, "Boeden", environmentLayer);
            var ceilings = Group(parent, "Decken", environmentLayer);
            var walls = Group(parent, "Waende", environmentLayer);
            int ramps = 0;
            for (int i = 0; i < geometry.Pieces.Count; i++)
            {
                DungeonFloorPiece piece = geometry.Pieces[i];
                string name = piece.OwnerId + " " + (i + 1);
                Slab(floors, "Boden " + name, piece, 0f, -DungeonGeometry.SlabThickness, materials.Floor, environmentLayer);
                Slab(ceilings, "Decke " + name, piece, piece.Height, 0f, materials.Ceiling, environmentLayer);
                if (piece.IsSloped)
                {
                    ramps++;
                }
            }

            int wallCount = 0;
            int lintels = 0;
            int risers = 0;
            for (int i = 0; i < geometry.Walls.Count; i++)
            {
                DungeonWallSegment wall = geometry.Walls[i];
                float thickness = wall.Kind == DungeonWallKind.Wall ? wallThickness : StepFaceThickness;
                float extension = wall.Kind == DungeonWallKind.Wall ? thickness : 0f;
                float length = wall.Length + 2f * extension;
                float height = wall.Top - wall.Bottom;
                if (wall.Kind == DungeonWallKind.Wall)
                {
                    // The wall reaches over the ceiling slab, so no light leaks at the top edge.
                    height += DungeonGeometry.SlabThickness;
                }

                if (!(height > 0.01f) || !(length > 0.01f))
                {
                    continue;
                }

                float along = (wall.Start + wall.End) * 0.5f;
                float across = wall.Line + wall.Facing * thickness * 0.5f;
                Vector3 center = wall.AlongX
                    ? new Vector3(along, wall.Bottom + height * 0.5f, across)
                    : new Vector3(across, wall.Bottom + height * 0.5f, along);
                Vector3 size = wall.AlongX ? new Vector3(length, height, thickness) : new Vector3(thickness, height, length);
                string prefix = wall.Kind == DungeonWallKind.Wall ? "Wand" : wall.Kind == DungeonWallKind.Lintel ? "Sturz" : "Stufe";
                Box(walls, prefix + " " + (i + 1), center, Quaternion.identity, size, materials.Wall, environmentLayer, true);
                switch (wall.Kind)
                {
                    case DungeonWallKind.Lintel:
                        lintels++;
                        break;
                    case DungeonWallKind.Riser:
                        risers++;
                        break;
                    default:
                        wallCount++;
                        break;
                }
            }

            report.Info("Gruft-Hülle: " + geometry.Pieces.Count + " Boden-/Deckenstücke (" + ramps + " Rampen), " + wallCount + " Wände, " + lintels +
                        " Stürze, " + risers + " Stufen, " + geometry.FloorCellCount + " begehbare m².");
        }

        /// <summary>Creates a primitive box with collider.</summary>
        /// <param name="parent">Parent.</param>
        /// <param name="name">Name.</param>
        /// <param name="center">World centre.</param>
        /// <param name="rotation">World rotation.</param>
        /// <param name="size">Size.</param>
        /// <param name="material">Material.</param>
        /// <param name="layer">Layer.</param>
        /// <param name="solid">Keep the collider.</param>
        /// <returns>The object.</returns>
        public static GameObject Box(Transform parent, string name, Vector3 center, Quaternion rotation, Vector3 size, Material material, int layer,
            bool solid)
        {
            GameObject box = GameObject.CreatePrimitive(PrimitiveType.Cube);
            box.name = name;
            box.layer = layer;
            box.transform.SetParent(parent, false);
            box.transform.SetPositionAndRotation(center, rotation);
            box.transform.localScale = size;
            if (!solid && box.TryGetComponent(out Collider collider))
            {
                Object.DestroyImmediate(collider);
            }

            if (material != null && box.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = material;
            }

            return box;
        }

        private static void Slab(Transform parent, string name, DungeonFloorPiece piece, float offset, float extraDown, Material material, int layer)
        {
            float thickness = DungeonGeometry.SlabThickness;
            float cx = (piece.MinX + piece.MaxX) * 0.5f;
            float cz = (piece.MinZ + piece.MaxZ) * 0.5f;
            float width = piece.MaxX - piece.MinX;
            float depth = piece.MaxZ - piece.MinZ;
            float midY = (piece.YAtMin + piece.YAtMax) * 0.5f + offset;
            // Floor: the slab lies below the surface (extraDown = -thickness); ceiling: above it (extraDown = 0).
            float centerOffset = extraDown < 0f ? -thickness * 0.5f : thickness * 0.5f;
            if (!piece.IsSloped)
            {
                Box(parent, name, new Vector3(cx, midY + centerOffset, cz), Quaternion.identity, new Vector3(width, thickness, depth), material, layer, true);
                return;
            }

            float rise = piece.YAtMax - piece.YAtMin;
            float run = piece.Length;
            float slopeLength = (float)Math.Sqrt(run * run + rise * rise);
            float angle = (float)(Math.Atan2(rise, run) * 180.0 / Math.PI);
            Quaternion rotation;
            Vector3 size;
            Vector3 normal;
            if (piece.AlongX)
            {
                // Rising towards +x: rotate around z (positive angle lifts +x).
                rotation = Quaternion.Euler(0f, 0f, angle);
                size = new Vector3(slopeLength, thickness, depth);
            }
            else
            {
                // Rising towards +z: rotate around x (negative angle lifts +z).
                rotation = Quaternion.Euler(-angle, 0f, 0f);
                size = new Vector3(width, thickness, slopeLength);
            }

            normal = rotation * Vector3.up;
            Vector3 center = new Vector3(cx, midY, cz) + normal * centerOffset;
            Box(parent, name, center, rotation, size, material, layer, true);
        }

        private static Transform Group(Transform parent, string name, int layer)
        {
            var group = new GameObject(name);
            group.layer = layer;
            group.transform.SetParent(parent, false);
            return group.transform;
        }
    }
}
