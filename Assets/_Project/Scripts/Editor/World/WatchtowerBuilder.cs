using Aetherfall.Player;
using Aetherfall.World;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// The Wachturm Grauwacht (GDD 01: imperial watchtower, half a ruin, the crow's nest on top is reached by a climbing route
    /// and is the first viewpoint; task list S48) from a layout building of kind "watchtower": a stone shaft, a wooden deck
    /// and the remains of the crow's nest on top, broken battlements. The climbing route runs up the front face (local +Z):
    /// ladder, a rest point, pale worn rock (GDD 05 3.2: climbable rock is marked pale) and vines up to the edge, where the
    /// character climbs over onto the deck. Same shape as the Blender preview (Tools/Preview/eichental_preview.py,
    /// <c>build_watchtower</c>).
    /// </summary>
    public sealed class WatchtowerBuilder
    {
        /// <summary>Top of the plinth above the base (low enough to step on).</summary>
        public const float PlinthTop = 0.2f;

        /// <summary>Top of the ladder above the base.</summary>
        public const float LadderTop = 5.2f;

        /// <summary>Top of the rest point (a ledge with a pale patch) above the base.</summary>
        public const float RestTop = 6.6f;

        /// <summary>Top of the pale rock band, where the vines begin.</summary>
        public const float RockTop = 11f;

        /// <summary>Width of the climbing route on the front face.</summary>
        public const float RouteWidth = 2.2f;

        /// <summary>Thickness of the wooden deck on top of the shaft.</summary>
        public const float DeckThickness = 0.1f;

        private const int Stone = 0;
        private const int DarkStone = 1;
        private const int Wood = 2;
        private const int DarkWood = 3;
        private const int PaleRock = 4;
        private const int Vine = 5;
        private const int Leaf = 6;
        private const int Submeshes = 7;

        private readonly EichentalMaterials _materials;
        private readonly EichentalMeshLibrary _meshes;
        private readonly LayoutHeightField _heights;
        private readonly int _environmentLayer;
        private readonly Font _labelFont;
        private readonly TestGroundReport _report;

        /// <summary>Creates the builder.</summary>
        /// <param name="materials">Materials.</param>
        /// <param name="meshes">Mesh library.</param>
        /// <param name="heights">Terrain heights.</param>
        /// <param name="environmentLayer">Layer of the colliders (Environment).</param>
        /// <param name="labelFont">Font of the sign (may be null).</param>
        /// <param name="report">Protocol.</param>
        public WatchtowerBuilder(EichentalMaterials materials, EichentalMeshLibrary meshes, LayoutHeightField heights, int environmentLayer, Font labelFont,
            TestGroundReport report)
        {
            _materials = materials;
            _meshes = meshes;
            _heights = heights;
            _environmentLayer = environmentLayer;
            _labelFont = labelFont;
            _report = report;
        }

        /// <summary>Builds the tower under <paramref name="parent"/>.</summary>
        /// <param name="b">Layout building of kind watchtower.</param>
        /// <param name="parent">Parent.</param>
        public GameObject Build(LayoutBuilding b, Transform parent)
        {
            float w = (float)b.Width;
            float d = (float)b.Depth;
            float h = (float)b.WallHeight;
            var root = new GameObject(b.Name.Length > 0 ? b.Name + " (" + b.Id + ")" : b.Id);
            root.transform.SetParent(parent, false);
            root.transform.SetPositionAndRotation(
                new Vector3((float)b.Position.X, EichentalBuildingBuilder.BaseHeight(b, _heights), (float)b.Position.Z),
                Quaternion.Euler(0f, (float)b.Yaw, 0f));
            root.layer = _environmentLayer;

            Mesh mesh = _meshes.Get("Gebaeude_Wachturm_" + w + "x" + h + "x" + d, () => CreateMesh(w, d, h));
            root.AddComponent<MeshFilter>().sharedMesh = mesh;
            root.AddComponent<MeshRenderer>().sharedMaterials = new[]
            {
                _materials.Fixed("towerStone", new Color(0.5f, 0.48f, 0.45f), 0.12f),
                _materials.Fixed("towerStoneDark", new Color(0.33f, 0.31f, 0.3f), 0.1f),
                _materials.Get("wood", 0.25f),
                _materials.Get("woodDark", 0.25f),
                _materials.Fixed("climbRock", new Color(0.86f, 0.84f, 0.78f), 0.1f),
                _materials.Fixed("vine", new Color(0.22f, 0.36f, 0.14f), 0.2f),
                _materials.Fixed("vineLeaf", new Color(0.36f, 0.56f, 0.2f), 0.25f)
            };

            // The shaft (with the deck) and the plinth are solid; the crow's nest posts are thin enough to walk around.
            AddCollider(root, "Schaft", new Vector3(0f, (h + DeckThickness) * 0.5f, 0f), new Vector3(w, h + DeckThickness, d));
            AddCollider(root, "Sockel", new Vector3(0f, PlinthTop - 0.4f, 0f), new Vector3(w + 0.6f, 0.8f, d + 0.6f));
            AddBattlementColliders(root, w, d, h);

            float face = d * 0.5f;
            // All climb colliders lie (almost) in one plane, so climbing down never lands on top of the surface below.
            AddClimb(root, "Leiter", ClimbSurfaceKind.Ladder, false, PlinthTop, LadderTop, face, 0.9f, 0.1f);
            AddClimb(root, "Rastpunkt", ClimbSurfaceKind.Rock, true, LadderTop, RestTop, face, RouteWidth, 0.08f);
            AddClimb(root, "Heller Fels", ClimbSurfaceKind.Rock, false, RestTop, RockTop, face, RouteWidth, 0.08f);
            AddClimb(root, "Ranken", ClimbSurfaceKind.Vines, false, RockTop, h, face, RouteWidth, 0.12f);

            EichentalLabel.Create(root.transform, "Kletterpfad zum Krähennest", new Vector3(-2f, 2.6f, face + 0.1f), 180f, _labelFont, 0.03f);
            _report.Info("Wachturm „" + b.Name + "“: " + h.ToString("0") + " m, Kletterpfad an der Vorderseite (Leiter bis " + LadderTop.ToString("0.0") +
                         " m, Rastpunkt, heller Fels bis " + RockTop.ToString("0") + " m, Ranken bis oben), Krähennest auf der Plattform.");
            return root;
        }

        private void AddCollider(GameObject root, string name, Vector3 center, Vector3 size)
        {
            var go = new GameObject(name);
            go.transform.SetParent(root.transform, false);
            go.layer = _environmentLayer;
            BoxCollider box = go.AddComponent<BoxCollider>();
            box.center = center;
            box.size = size;
        }

        private void AddBattlementColliders(GameObject root, float w, float d, float h)
        {
            // Low walls on three sides (the front is broken where the vines arrive) keep the player on the deck.
            float y = h + DeckThickness + 0.45f;
            AddCollider(root, "Brüstung hinten", new Vector3(0f, y, -d * 0.5f + 0.25f), new Vector3(w, 0.9f, 0.5f));
            AddCollider(root, "Brüstung links", new Vector3(-w * 0.5f + 0.25f, y, 0f), new Vector3(0.5f, 0.9f, d));
            AddCollider(root, "Brüstung rechts", new Vector3(w * 0.5f - 0.25f, y, 0f), new Vector3(0.5f, 0.9f, d));
        }

        private void AddClimb(GameObject root, string name, ClimbSurfaceKind kind, bool restPoint, float bottom, float top, float face, float width,
            float depth)
        {
            var go = new GameObject("Klettern: " + name);
            go.transform.SetParent(root.transform, false);
            go.layer = _environmentLayer;
            BoxCollider box = go.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, (bottom + top) * 0.5f, face + depth * 0.5f);
            box.size = new Vector3(width, top - bottom, depth);
            ClimbSurface surface = go.AddComponent<ClimbSurface>();
            TestGroundFields.SetInt(surface, "kind", (int)kind, _report);
            TestGroundFields.SetBool(surface, "restPoint", restPoint, _report);
            TestGroundFields.SetBool(surface, "allowTopOut", true, _report);
        }

        private static Mesh CreateMesh(float w, float d, float h)
        {
            var m = new EichentalMeshBuilder(Submeshes);
            float face = d * 0.5f;

            // Plinth, shaft, string courses and a walled-up door at the back.
            Box(m, DarkStone, 0f, 0f, PlinthTop - 0.8f, w + 0.6f, d + 0.6f, 0.8f);
            Box(m, Stone, 0f, 0f, 0f, w, d, h);
            Box(m, DarkStone, 0f, 0f, 5.8f, w + 0.16f, d + 0.16f, 0.25f);
            Box(m, DarkStone, 0f, 0f, h - 0.5f, w + 0.2f, d + 0.2f, 0.3f);
            Box(m, DarkWood, 0f, -face - 0.03f, PlinthTop, 1.4f, 0.12f, 2.4f);
            Box(m, DarkStone, 0f, -face - 0.05f, PlinthTop + 2.4f, 1.8f, 0.16f, 0.3f);

            // Arrow slits on the sides.
            for (int i = 0; i < 3; i++)
            {
                float z = 3.5f + i * 4f;
                Box(m, DarkStone, -w * 0.5f - 0.02f, 0f, z, 0.06f, 0.25f, 1.1f);
                Box(m, DarkStone, w * 0.5f + 0.02f, 0f, z, 0.06f, 0.25f, 1.1f);
            }

            // Deck and broken battlements: whole at the back, gaps at the sides, the front open for the climbers.
            Box(m, Wood, 0f, 0f, h, w - 0.1f, d - 0.1f, DeckThickness);
            float top = h + DeckThickness;
            for (int i = 0; i < 5; i++)
            {
                float x = -w * 0.5f + 0.5f + i * (w - 1f) / 4f;
                Box(m, Stone, x, -face + 0.25f, top, 0.8f, 0.5f, i == 2 ? 0.6f : 1.1f);
            }

            for (int i = 0; i < 4; i++)
            {
                float y = -face + 0.6f + i * (d - 1.2f) / 3f;
                Box(m, Stone, -w * 0.5f + 0.25f, y, top, 0.5f, 0.8f, i == 3 ? 0.5f : 1.0f);
                Box(m, Stone, w * 0.5f - 0.25f, y, top, 0.5f, 0.8f, i == 1 ? 0.4f : 1.0f);
            }

            Box(m, Stone, -w * 0.5f + 0.4f, face - 0.4f, top, 0.8f, 0.8f, 0.7f);
            Box(m, Stone, w * 0.5f - 0.4f, face - 0.4f, top, 0.8f, 0.8f, 0.5f);

            // The crow's nest: four posts at the back, a half-fallen plank roof.
            float nestBack = -face + 0.9f;
            float nestFront = -face + 3.2f;
            foreach (float x in new[] { -1.4f, 1.4f })
            {
                Box(m, DarkWood, x, nestBack, top, 0.18f, 0.18f, 2.5f);
                Box(m, DarkWood, x, nestFront, top, 0.18f, 0.18f, x < 0f ? 2.5f : 1.6f);
            }

            m.AddBox(Wood, new Vector3(-0.3f, top + 2.55f, (nestBack + nestFront) * 0.5f), new Vector3(2.6f, 0.12f, 2.8f),
                Quaternion.Euler(-6f, 0f, 9f));
            Box(m, Wood, 1.0f, nestFront + 0.4f, top, 1.6f, 0.3f, 0.1f, 25f);

            // Ladder: two rails and rungs.
            float ladderHeight = LadderTop - PlinthTop;
            Box(m, DarkWood, -0.38f, face + 0.06f, PlinthTop, 0.08f, 0.08f, ladderHeight);
            Box(m, DarkWood, 0.38f, face + 0.06f, PlinthTop, 0.08f, 0.08f, ladderHeight);
            for (float y = PlinthTop + 0.3f; y < LadderTop - 0.1f; y += 0.35f)
            {
                Box(m, Wood, 0f, face + 0.06f, y, 0.84f, 0.06f, 0.06f);
            }

            // Rest point: a ledge to stand on and a pale patch above it.
            Box(m, PaleRock, 0f, face + 0.08f, LadderTop - 0.25f, RouteWidth + 0.2f, 0.16f, 0.25f);
            Box(m, PaleRock, 0f, face + 0.02f, LadderTop, RouteWidth, 0.06f, RestTop - LadderTop);

            // Pale worn rock with grips.
            Box(m, PaleRock, 0f, face + 0.02f, RestTop, RouteWidth, 0.06f, RockTop - RestTop);
            ulong seed = 48;
            for (float y = RestTop + 0.3f; y < RockTop - 0.2f; y += 0.55f)
            {
                seed = seed * 6364136223846793005UL + 1442695040888963407UL;
                float x = ((seed >> 40) % 1000) / 1000f * (RouteWidth - 0.5f) - (RouteWidth - 0.5f) * 0.5f;
                Box(m, PaleRock, x, face + 0.07f, y, 0.3f, 0.08f, 0.14f);
            }

            // Vines: hanging strands with leaf clumps, a few over the edge.
            for (int i = 0; i < 7; i++)
            {
                float x = -RouteWidth * 0.5f + 0.15f + i * (RouteWidth - 0.3f) / 6f;
                float start = RockTop - (i % 3) * 0.4f;
                Box(m, Vine, x, face + 0.05f, start, 0.07f, 0.06f, h + 0.25f - start);
                for (float y = start + 0.4f; y < h; y += 0.9f)
                {
                    Box(m, Leaf, x + (i % 2 == 0 ? 0.08f : -0.08f), face + 0.08f, y, 0.3f, 0.07f, 0.24f);
                }
            }

            return m.ToMesh("Wachturm");
        }

        /// <summary>Box in preview coordinates: x right, y front, z up, the position is the centre of the bottom face.</summary>
        private static void Box(EichentalMeshBuilder m, int submesh, float x, float y, float zBase, float sx, float sy, float sz, float yaw = 0f)
        {
            m.AddBox(submesh, new Vector3(x, zBase + sz * 0.5f, y), new Vector3(sx, sz, sy), Quaternion.Euler(0f, yaw, 0f));
        }
    }
}
