using Aetherfall.World;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Builds the buildings of a layout as blockout meshes: stone plinth, walls with a simple timber frame, door and windows, a
    /// generated roof (<see cref="RoofGeometry"/>: gable or lean-to) and type details (chapel tower, smithy chimney and anvil, mill
    /// wheel, tavern sign, guard post banner). Burned houses get dark walls with a soot band, a partly missing roof with bare
    /// rafters; collapsed ones only uneven wall stumps, rubble and fallen beams. Smouldering buildings glow (emissive embers,
    /// small orange light) and smoke. One mesh per building (several materials), box colliders for the walls.
    /// </summary>
    public sealed class EichentalBuildingBuilder
    {
        private const int Stone = 0;
        private const int Wall = 1;
        private const int Timber = 2;
        private const int Dark = 3;
        private const int DoorPart = 4;
        private const int Roof = 5;
        private const int Gable = 6;
        private const int Soot = 7;
        private const int Ember = 8;
        private const int Extra = 9;
        private const int Submeshes = 10;

        /// <summary>Roof overhang beyond the walls in metres.</summary>
        public const float RoofOverhang = 0.45f;

        /// <summary>Roof slab thickness in metres.</summary>
        public const float RoofThickness = 0.22f;

        private readonly EichentalMaterials _materials;
        private readonly EichentalMeshLibrary _meshes;
        private readonly LayoutHeightField _heights;
        private readonly EichentalSmoke _smoke;
        private readonly int _environmentLayer;

        /// <summary>Creates the builder.</summary>
        /// <param name="materials">Materials.</param>
        /// <param name="meshes">Mesh library.</param>
        /// <param name="heights">Terrain heights.</param>
        /// <param name="smoke">Smoke of smouldering ruins.</param>
        /// <param name="environmentLayer">Layer of colliders (Environment).</param>
        public EichentalBuildingBuilder(EichentalMaterials materials, EichentalMeshLibrary meshes, LayoutHeightField heights, EichentalSmoke smoke,
            int environmentLayer)
        {
            _materials = materials;
            _meshes = meshes;
            _heights = heights;
            _smoke = smoke;
            _environmentLayer = environmentLayer;
        }

        /// <summary>Base height of a building: the lowest terrain point under its corners (the plinth hides the slope).</summary>
        /// <param name="b">Building.</param>
        /// <param name="heights">Terrain heights.</param>
        public static float BaseHeight(LayoutBuilding b, LayoutHeightField heights)
        {
            double min = double.MaxValue;
            foreach (LayoutPoint c in LayoutGeometry.RectCorners(b.Position, b.Width, b.Depth, b.Yaw))
            {
                min = System.Math.Min(min, heights.Height(c.X, c.Z));
            }

            return (float)min;
        }

        /// <summary>Builds one building under <paramref name="parent"/>.</summary>
        /// <param name="b">Building.</param>
        /// <param name="index">Index in the layout (seed of the random details).</param>
        /// <param name="parent">Parent.</param>
        public GameObject Build(LayoutBuilding b, int index, Transform parent)
        {
            var root = new GameObject(b.Name.Length > 0 ? b.Name + " (" + b.Id + ")" : b.Id);
            root.transform.SetParent(parent, false);
            root.transform.position = new Vector3((float)b.Position.X, BaseHeight(b, _heights), (float)b.Position.Z);
            root.transform.rotation = Quaternion.Euler(0f, (float)b.Yaw, 0f);
            root.layer = _environmentLayer;

            float w = (float)b.Width;
            float d = (float)b.Depth;
            float h = (float)b.WallHeight;
            var mesh = new EichentalMeshBuilder(Submeshes);
            int seed = 1000 + index * 31;
            mesh.AddBox(Stone, new Vector3(0f, -0.15f, 0f), new Vector3(w + 0.3f, 0.9f, d + 0.3f), Quaternion.identity);
            if (b.State == BuildingState.Collapsed)
            {
                BuildCollapsed(mesh, root, w, d, h, seed);
            }
            else
            {
                BuildStanding(mesh, root, b, w, d, h, seed);
            }

            float rise = b.Roof == RoofKind.None || b.State == BuildingState.Collapsed ? 0f : (float)RoofGeometry.Rise(b.Roof, w, b.RoofPitch);
            BuildDetails(mesh, root, b, w, d, h, rise);
            if (b.Glow)
            {
                BuildEmbers(mesh, root, b, w, d, h, seed);
            }

            var filter = root.AddComponent<MeshFilter>();
            filter.sharedMesh = _meshes.Add("Gebaeude_" + b.Id, mesh);
            var renderer = root.AddComponent<MeshRenderer>();
            renderer.sharedMaterials = Materials(b);
            GameObjectUtility.SetStaticEditorFlags(root, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic);
            return root;
        }

        /// <summary>
        /// Random detail value 0..1 of a building, the same as jagged() in Tools/Preview/eichental_preview.py: the first float of
        /// a <see cref="Aetherfall.Utilities.Pcg32Random"/> seeded with seed + 17 · i.
        /// </summary>
        /// <param name="seed">Seed of the building (1000 + 31 · index).</param>
        /// <param name="i">Number of the detail.</param>
        public static float Jagged(int seed, int i)
        {
            return new Aetherfall.Utilities.Pcg32Random((ulong)(seed + 17 * i)).NextFloat();
        }

        private void BuildStanding(EichentalMeshBuilder mesh, GameObject root, LayoutBuilding b, float w, float d, float h, int seed)
        {
            bool burned = b.State == BuildingState.Burned;
            mesh.AddBox(Wall, new Vector3(0f, h * 0.5f, 0f), new Vector3(w, h, d), Quaternion.identity);
            AddCollider(root, new Vector3(0f, h * 0.5f, 0f), new Vector3(w, h, d));
            if (burned)
            {
                mesh.AddBox(Soot, new Vector3(0f, h * 0.81f, 0f), new Vector3(w + 0.04f, h * 0.38f, d + 0.04f), Quaternion.identity);
            }

            // Timber frame: corner posts, middle rail and wall plate.
            for (int sx = -1; sx <= 1; sx += 2)
            {
                for (int sz = -1; sz <= 1; sz += 2)
                {
                    mesh.AddBox(Timber, new Vector3(sx * (w * 0.5f - 0.1f), h * 0.5f, sz * (d * 0.5f - 0.1f)), new Vector3(0.28f, h, 0.28f), Quaternion.identity);
                }

                mesh.AddBox(Timber, new Vector3(0f, h * 0.5f, sx * (d * 0.5f + 0.02f)), new Vector3(w + 0.06f, 0.22f, 0.2f), Quaternion.identity);
                mesh.AddBox(Timber, new Vector3(0f, h - 0.11f, sx * (d * 0.5f + 0.02f)), new Vector3(w + 0.06f, 0.22f, 0.2f), Quaternion.identity);
                mesh.AddBox(Timber, new Vector3(sx * (w * 0.5f + 0.02f), h * 0.5f, 0f), new Vector3(0.2f, 0.22f, d + 0.06f), Quaternion.identity);
            }

            bool barn = b.Kind == BuildingKind.Barn;
            float doorHeight = barn ? h * 0.75f : Mathf.Min(2.4f, h * 0.6f);
            mesh.AddBox(burned ? Dark : DoorPart, new Vector3(0f, doorHeight * 0.5f, d * 0.5f + 0.03f), new Vector3(barn ? 3f : 1.2f, doorHeight, 0.12f),
                Quaternion.identity);
            int floors = h >= 5.5f && b.Kind != BuildingKind.Chapel && !barn && b.Kind != BuildingKind.Mill ? 2 : 1;
            for (int f = 0; f < floors; f++)
            {
                float y = floors == 1 ? h * 0.55f : h * (0.3f + 0.42f * f);
                for (int sx = -1; sx <= 1; sx += 2)
                {
                    mesh.AddBox(Dark, new Vector3(sx * (w * 0.5f + 0.03f), y, d * 0.18f), new Vector3(0.12f, 0.8f, 0.9f), Quaternion.identity);
                    mesh.AddBox(Dark, new Vector3(sx * (w * 0.5f + 0.03f), y, -d * 0.22f), new Vector3(0.12f, 0.8f, 0.9f), Quaternion.identity);
                }
            }

            if (b.Roof == RoofKind.None)
            {
                return;
            }

            double left = burned ? 0.25 + 0.3 * Jagged(seed, 7) : 1.0;
            double right = burned ? 0.25 * Jagged(seed, 8) : 1.0;
            MeshBuffers roof = b.Roof == RoofKind.LeanTo
                ? RoofGeometry.LeanTo(w, d, b.RoofPitch, RoofOverhang, RoofThickness, left)
                : RoofGeometry.Gable(w, d, b.RoofPitch, RoofOverhang, RoofThickness, left, right);
            mesh.AddBuffers(roof, new Vector3(0f, h, 0f), new[] { Roof, Gable });
            if (burned && b.Roof == RoofKind.Gable)
            {
                // Bare rafters where the roof burned away.
                float rise = (float)RoofGeometry.Rise(RoofKind.Gable, w, b.RoofPitch);
                float length = Mathf.Sqrt((w * 0.5f + RoofOverhang) * (w * 0.5f + RoofOverhang) + rise * rise);
                float angle = Mathf.Atan2(rise, w * 0.5f) * Mathf.Rad2Deg;
                int count = Mathf.Max(1, (int)(d / 1.3f));
                for (int i = 0; i <= count; i++)
                {
                    float z = -d * 0.5f + d * i / count;
                    for (int side = -1; side <= 1; side += 2)
                    {
                        mesh.AddBox(Timber, new Vector3(side * w * 0.25f, h + rise * 0.5f - 0.2f, z), new Vector3(length, 0.18f, 0.18f),
                            Quaternion.Euler(0f, 0f, -side * angle));
                    }
                }
            }
        }

        private void BuildCollapsed(EichentalMeshBuilder mesh, GameObject root, float w, float d, float h, int seed)
        {
            for (int side = 0; side < 4; side++)
            {
                float length = side % 2 == 0 ? w : d;
                for (int part = 0; part < 3; part++)
                {
                    float segment = length / 3f;
                    float height = h * (0.15f + 0.75f * Jagged(seed, side * 3 + part));
                    float offset = -length * 0.5f + segment * (part + 0.5f);
                    Vector3 center;
                    Vector3 size;
                    switch (side)
                    {
                        case 0:
                            center = new Vector3(offset, height * 0.5f, -d * 0.5f + 0.2f);
                            size = new Vector3(segment, height, 0.4f);
                            break;
                        case 1:
                            center = new Vector3(w * 0.5f - 0.2f, height * 0.5f, offset);
                            size = new Vector3(0.4f, height, segment);
                            break;
                        case 2:
                            center = new Vector3(offset, height * 0.5f, d * 0.5f - 0.2f);
                            size = new Vector3(segment, height, 0.4f);
                            break;
                        default:
                            center = new Vector3(-w * 0.5f + 0.2f, height * 0.5f, offset);
                            size = new Vector3(0.4f, height, segment);
                            break;
                    }

                    mesh.AddBox(Wall, center, size, Quaternion.identity);
                    mesh.AddBox(Soot, center + new Vector3(0f, height * 0.5f - 0.15f, 0f), new Vector3(size.x + 0.04f, 0.3f, size.z + 0.04f), Quaternion.identity);
                    AddCollider(root, center, size);
                }
            }

            for (int i = 0; i < 5; i++)
            {
                float s = 0.6f + Jagged(seed, 40 + i);
                var center = new Vector3((Jagged(seed, 20 + i) - 0.5f) * w * 0.7f, s * 0.3f, (Jagged(seed, 30 + i) - 0.5f) * d * 0.7f);
                mesh.AddBox(Stone, center, new Vector3(s * 1.4f, s * 0.6f, s), Quaternion.Euler(0f, -Jagged(seed, 50 + i) * 3f * Mathf.Rad2Deg, 0f));
            }

            for (int i = 0; i < 3; i++)
            {
                mesh.AddBox(Timber, new Vector3((i - 1) * w * 0.25f, 0.8f + i * 0.3f, 0f), new Vector3(0.25f, 0.25f, d * 0.8f),
                    Quaternion.Euler(18f + 20f * Jagged(seed, 60 + i), -30f * (Jagged(seed, 70 + i) - 0.5f), 0f));
            }
        }

        private void BuildDetails(EichentalMeshBuilder mesh, GameObject root, LayoutBuilding b, float w, float d, float h, float rise)
        {
            bool standing = b.State != BuildingState.Collapsed;
            switch (b.Kind)
            {
                case BuildingKind.Chapel:
                {
                    float tower = h + rise + (standing ? 3.5f : -1f);
                    var center = new Vector3(0f, tower * 0.5f, d * 0.5f - 1.4f);
                    mesh.AddBox(b.State == BuildingState.Intact ? Stone : Wall, center, new Vector3(2.8f, tower, 2.8f), Quaternion.identity);
                    AddCollider(root, center, new Vector3(2.8f, tower, 2.8f));
                    if (b.State == BuildingState.Intact)
                    {
                        mesh.AddCylinder(Roof, new Vector3(0f, tower, d * 0.5f - 1.4f), 2.2f, 0f, 3.2f, 4, Quaternion.Euler(0f, 45f, 0f));
                    }
                    else
                    {
                        for (int i = -1; i <= 1; i++)
                        {
                            mesh.AddBox(Timber, new Vector3(i * 0.8f, tower + 1.1f, d * 0.5f - 1.4f), new Vector3(0.2f, 2.4f, 0.2f), Quaternion.Euler(20f * i, 0f, 0f));
                        }
                    }

                    break;
                }

                case BuildingKind.Smithy:
                {
                    float height = h + rise + 1.2f;
                    var center = new Vector3(-w * 0.5f + 1f, height * 0.5f, -d * 0.5f + 1f);
                    mesh.AddBox(Stone, center, new Vector3(1.4f, height, 1.4f), Quaternion.identity);
                    mesh.AddBox(Extra, new Vector3(w * 0.5f + 1.5f, 0.4f, d * 0.5f + 1f), new Vector3(0.5f, 0.8f, 1f), Quaternion.identity);
                    break;
                }

                case BuildingKind.Mill:
                {
                    float radius = Mathf.Min(3.2f, h * 0.55f);
                    Quaternion axis = Quaternion.FromToRotation(Vector3.up, Vector3.right);
                    var hub = new Vector3(w * 0.5f + 0.2f, radius * 0.85f, 0f);
                    mesh.AddCylinder(Timber, hub, radius, radius, 1.1f, 20, axis);
                    for (int i = 0; i < 8; i++)
                    {
                        mesh.AddBox(DoorPart, hub + new Vector3(0.55f, 0f, 0f), new Vector3(0.25f, radius * 2.05f, 0.25f), Quaternion.Euler(i * 22.5f, 0f, 0f));
                    }

                    break;
                }

                case BuildingKind.Tavern:
                    mesh.AddBox(Timber, new Vector3(w * 0.5f - 0.6f, h * 0.7f, d * 0.5f + 0.7f), new Vector3(0.15f, 0.15f, 1.4f), Quaternion.identity);
                    mesh.AddBox(Extra, new Vector3(w * 0.5f - 0.6f, h * 0.7f - 0.4f, d * 0.5f + 1.2f), new Vector3(0.1f, 0.7f, 0.9f), Quaternion.identity);
                    break;
                case BuildingKind.Guardpost:
                    mesh.AddCylinder(Timber, new Vector3(w * 0.5f + 1f, 0f, d * 0.5f + 1f), 0.08f, 0.08f, 7.5f, 6, Quaternion.identity);
                    mesh.AddBox(Extra, new Vector3(w * 0.5f + 1f, 6.3f, d * 0.5f + 1.7f), new Vector3(0.05f, 1.8f, 1.2f), Quaternion.identity);
                    break;
            }
        }

        private void BuildEmbers(EichentalMeshBuilder mesh, GameObject root, LayoutBuilding b, float w, float d, float h, int seed)
        {
            for (int i = 0; i < 3; i++)
            {
                var center = new Vector3((Jagged(seed, 80 + i) - 0.5f) * w * 0.6f, 0.09f, (Jagged(seed, 90 + i) - 0.5f) * d * 0.6f);
                mesh.AddBox(Ember, center, new Vector3(1.2f + Jagged(seed, 95 + i), 0.18f, 0.9f),
                    Quaternion.Euler(0f, -Jagged(seed, 99 + i) * 3f * Mathf.Rad2Deg, 0f));
            }

            if (b.State == BuildingState.Burned)
            {
                for (int side = -1; side <= 1; side += 2)
                {
                    mesh.AddBox(Ember, new Vector3((Jagged(seed, 3) - 0.5f) * w * 0.2f, h - 0.1f, side * (d * 0.5f + 0.03f)), new Vector3(w * 0.7f, 0.12f, 0.3f),
                        Quaternion.identity);
                }
            }

            var lightObject = new GameObject("Glutlicht");
            lightObject.transform.SetParent(root.transform, false);
            lightObject.transform.localPosition = new Vector3(0f, 1.2f, 0f);
            Light light = lightObject.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = _materials.Color("ember");
            light.range = 9f;
            light.intensity = 2.5f;
            light.shadows = LightShadows.None;
            _smoke.Add(root.transform, new Vector3(0f, h, 0f));
        }

        private Material[] Materials(LayoutBuilding b)
        {
            bool intact = b.State == BuildingState.Intact;
            Material wall;
            if (b.Kind == BuildingKind.Chapel && b.State != BuildingState.Collapsed)
            {
                wall = intact ? _materials.Get("stone") : _materials.Fixed("stoneBurned", new Color(0.42f, 0.4f, 0.37f));
            }
            else if (intact && (b.Kind == BuildingKind.Barn || b.Kind == BuildingKind.Mill))
            {
                wall = _materials.Get("wood", 0.25f);
            }
            else
            {
                wall = _materials.Get(intact ? "plaster" : "plasterBurned", 0.15f);
            }

            string roofKey = b.Kind == BuildingKind.House || b.Kind == BuildingKind.Barn ? "thatch" : "shingle";
            Material soot = _materials.Fixed("soot", new Color(0.12f, 0.1f, 0.09f), 0.05f);
            return new[]
            {
                _materials.Get("stone", 0.15f),
                wall,
                _materials.Get(intact ? "woodDark" : "burnedWood", 0.25f),
                _materials.Fixed("window", new Color(0.08f, 0.07f, 0.07f), 0.5f),
                _materials.Fixed("door", new Color(0.25f, 0.16f, 0.1f), 0.25f),
                intact ? _materials.Get(roofKey, 0.1f) : _materials.Fixed("burnedRoof", new Color(0.11f, 0.09f, 0.08f), 0.05f),
                intact ? wall : soot,
                soot,
                _materials.Glow("ember", 3f),
                b.Kind == BuildingKind.Guardpost ? _materials.Fixed("banner", new Color(0.72f, 0.74f, 0.78f)) :
                b.Kind == BuildingKind.Smithy ? _materials.Fixed("iron", new Color(0.37f, 0.38f, 0.4f), 0.6f, 0.6f) :
                _materials.Fixed("sign", new Color(0.55f, 0.38f, 0.2f))
            };
        }

        private void AddCollider(GameObject root, Vector3 center, Vector3 size)
        {
            BoxCollider box = root.AddComponent<BoxCollider>();
            box.center = center;
            box.size = size;
        }
    }
}
