using System.Collections.Generic;
using Aetherfall.World;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Landscape part of the Eichental: vegetation (<see cref="VegetationScatter"/>: trees from trunk and lumpy crown, bushes,
    /// boulders), landmark rocks, fields with crop rows, fences, brooks (water ribbons at the river level of
    /// <see cref="LayoutHeightField"/>), bridges and the Aether rift (glowing tear, crystal shards, fracture lines, turquoise
    /// light). Same shapes and numbers as the Blender preview (Tools/Preview/eichental_preview.py).
    /// </summary>
    public sealed class EichentalNatureBuilder
    {
        private readonly RegionLayout _layout;
        private readonly LayoutHeightField _heights;
        private readonly EichentalMaterials _materials;
        private readonly EichentalMeshLibrary _meshes;
        private readonly int _environmentLayer;
        private readonly int _waterLayer;
        private readonly TestGroundReport _report;

        /// <summary>Creates the builder.</summary>
        /// <param name="layout">Layout.</param>
        /// <param name="heights">Terrain heights.</param>
        /// <param name="materials">Materials.</param>
        /// <param name="meshes">Mesh library.</param>
        /// <param name="environmentLayer">Environment layer.</param>
        /// <param name="waterLayer">Water layer.</param>
        /// <param name="report">Protocol.</param>
        public EichentalNatureBuilder(RegionLayout layout, LayoutHeightField heights, EichentalMaterials materials, EichentalMeshLibrary meshes,
            int environmentLayer, int waterLayer, TestGroundReport report)
        {
            _layout = layout;
            _heights = heights;
            _materials = materials;
            _meshes = meshes;
            _environmentLayer = environmentLayer;
            _waterLayer = waterLayer;
            _report = report;
        }

        private float H(double x, double z)
        {
            return (float)_heights.Height(x, z);
        }

        /// <summary>Scattered and landmark vegetation.</summary>
        /// <param name="parent">Parent.</param>
        public void BuildVegetation(Transform parent)
        {
            List<VegetationInstance> plants = VegetationScatter.Scatter(_layout);
            var counts = new Dictionary<VegetationKind, int>();
            for (int i = 0; i < plants.Count; i++)
            {
                VegetationInstance p = plants[i];
                int variant = i % 2;
                var go = new GameObject(p.Kind + " " + i);
                go.transform.SetParent(parent, false);
                go.transform.position = new Vector3((float)p.X, H(p.X, p.Z) - 0.15f, (float)p.Z);
                go.transform.rotation = Quaternion.Euler(0f, (float)p.Yaw, 0f);
                float s = (float)p.Scale;
                go.transform.localScale = new Vector3(s, s, s);
                go.layer = _environmentLayer;
                go.AddComponent<MeshFilter>().sharedMesh = PlantMesh(p.Kind, variant);
                go.AddComponent<MeshRenderer>().sharedMaterials = PlantMaterials(p.Kind);
                if (p.Kind == VegetationKind.Rock)
                {
                    MeshCollider collider = go.AddComponent<MeshCollider>();
                    collider.sharedMesh = go.GetComponent<MeshFilter>().sharedMesh;
                    collider.convex = true;
                }
                else if (p.Kind != VegetationKind.Bush)
                {
                    CapsuleCollider trunk = go.AddComponent<CapsuleCollider>();
                    trunk.radius = p.Kind == VegetationKind.Linden ? 0.6f : 0.35f;
                    trunk.height = 4f;
                    trunk.center = new Vector3(0f, 2f, 0f);
                }

                // No static batching: the GPU Resident Drawer (architecture 1.2) draws these instanced.
                counts[p.Kind] = counts.TryGetValue(p.Kind, out int n) ? n + 1 : 1;
            }

            var summary = new List<string>();
            foreach (KeyValuePair<VegetationKind, int> pair in counts)
            {
                summary.Add(pair.Key + " " + pair.Value);
            }

            _report.Info("Vegetation: " + plants.Count + " Objekte (" + string.Join(", ", summary) + "), Platzierung wie in der Blender-Vorschau.");
        }

        /// <summary>
        /// Landmark rocks (Rabenfels, Wolfskopf): <see cref="RockGeometry.Landmark"/> with its flat underside at the pivot, which
        /// sits <see cref="RockGeometry.LandmarkSink"/> × height under the terrain at the centre (plus the lift of the layout).
        /// The convex collider uses the coarser blob (80 triangles, PhysX allows 255).
        /// </summary>
        /// <param name="parent">Parent.</param>
        public void BuildRocks(Transform parent)
        {
            foreach (LayoutRock rock in _layout.Rocks)
            {
                var go = new GameObject(rock.Name.Length > 0 ? rock.Name : rock.Id);
                go.transform.SetParent(parent, false);
                float x = (float)rock.Position.X;
                float z = (float)rock.Position.Z;
                go.transform.position = new Vector3(x, (float)RockGeometry.LandmarkBaseHeight(_heights.Height(x, z), rock.SizeY, rock.Lift), z);
                go.transform.rotation = Quaternion.Euler(0f, (float)rock.Yaw, 0f);
                go.transform.localScale = new Vector3((float)rock.SizeX, (float)rock.SizeY, (float)rock.SizeZ);
                go.layer = _environmentLayer;
                go.AddComponent<MeshFilter>().sharedMesh = RockMesh(rock.Variant, RockGeometry.LandmarkRenderSubdivisions);
                go.AddComponent<MeshRenderer>().sharedMaterial = _materials.Get("rock", 0.15f);
                MeshCollider collider = go.AddComponent<MeshCollider>();
                collider.sharedMesh = RockMesh(rock.Variant, RockGeometry.LandmarkColliderSubdivisions);
                collider.convex = true;
                GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic);
            }

            _report.Info("Felsen: " + _layout.Rocks.Count + " (Unterseite am Drehpunkt, " + RockGeometry.LandmarkSink.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) +
                         " × Höhe im Boden; Collider mit " + BlobGeometry.TriangleCount(RockGeometry.LandmarkColliderSubdivisions) + " Dreiecken).");
        }

        /// <summary>Fields with crop rows (ripe wheat, burned, stubble); no colliders, the player walks through.</summary>
        /// <param name="parent">Parent.</param>
        public void BuildFields(Transform parent)
        {
            foreach (LayoutField field in _layout.Fields)
            {
                float height;
                float width;
                Material material;
                switch (field.State)
                {
                    case FieldState.Ripe:
                        height = 0.95f;
                        width = 0.75f;
                        material = _materials.Get("wheat", 0.1f);
                        break;
                    case FieldState.Burned:
                        height = 0.22f;
                        width = 0.6f;
                        material = _materials.Get("wheatBurned", 0.05f);
                        break;
                    default:
                        height = 0.16f;
                        width = 0.7f;
                        material = _materials.Get("stubble", 0.05f);
                        break;
                }

                var mesh = new EichentalMeshBuilder(1);
                int rows = (int)(field.Width / field.RowSpacing);
                int segments = Mathf.Max(1, (int)(field.Depth / 4.0));
                Quaternion rotation = Quaternion.Euler(0f, (float)field.Yaw, 0f);
                for (int r = 0; r < rows; r++)
                {
                    double lx = -field.Width * 0.5 + field.RowSpacing * (r + 0.5);
                    for (int s = 0; s < segments; s++)
                    {
                        double lz = -field.Depth * 0.5 + field.Depth * (s + 0.5) / segments;
                        LayoutPoint offset = LayoutGeometry.RotateLocal(lx, lz, field.Yaw);
                        double x = field.Center.X + offset.X;
                        double z = field.Center.Z + offset.Z;
                        mesh.AddBox(0, new Vector3((float)x, H(x, z) + height * 0.5f - 0.05f, (float)z),
                            new Vector3(width, height, (float)(field.Depth / segments * 1.02)), rotation);
                    }
                }

                var go = new GameObject(field.Name.Length > 0 ? field.Name : field.Id);
                go.transform.SetParent(parent, false);
                go.AddComponent<MeshFilter>().sharedMesh = _meshes.Add("Feld_" + field.Id, mesh);
                go.AddComponent<MeshRenderer>().sharedMaterial = material;
            }
        }

        /// <summary>Wooden fences: a post every 2.5 m, two rails, one box collider per section.</summary>
        /// <param name="parent">Parent.</param>
        public void BuildFences(Transform parent)
        {
            foreach (LayoutFence fence in _layout.Fences)
            {
                var points = new List<LayoutPoint>(fence.Points);
                if (fence.Closed)
                {
                    points.Add(fence.Points[0]);
                }

                var go = new GameObject(fence.Name.Length > 0 ? fence.Name : fence.Id);
                go.transform.SetParent(parent, false);
                go.layer = _environmentLayer;
                var mesh = new EichentalMeshBuilder(1);
                float height = (float)fence.Height;
                for (int k = 0; k < points.Count - 1; k++)
                {
                    LayoutPoint a = points[k];
                    LayoutPoint b = points[k + 1];
                    double length = a.DistanceTo(b);
                    int n = Mathf.Max(1, (int)System.Math.Ceiling(length / 2.5));
                    for (int s = 0; s <= n; s++)
                    {
                        double f = (double)s / n;
                        double x = LayoutGeometry.Lerp(a.X, b.X, f);
                        double z = LayoutGeometry.Lerp(a.Z, b.Z, f);
                        mesh.AddBox(0, new Vector3((float)x, H(x, z) + (height + 0.3f) * 0.5f - 0.3f, (float)z), new Vector3(0.14f, height + 0.3f, 0.14f),
                            Quaternion.identity);
                    }

                    for (int s = 0; s < n; s++)
                    {
                        double f0 = (double)s / n;
                        double f1 = (double)(s + 1) / n;
                        var p0 = new Vector3((float)LayoutGeometry.Lerp(a.X, b.X, f0), 0f, (float)LayoutGeometry.Lerp(a.Z, b.Z, f0));
                        var p1 = new Vector3((float)LayoutGeometry.Lerp(a.X, b.X, f1), 0f, (float)LayoutGeometry.Lerp(a.Z, b.Z, f1));
                        p0.y = H(p0.x, p0.z);
                        p1.y = H(p1.x, p1.z);
                        Vector3 along = p1 - p0;
                        Quaternion rotation = Quaternion.LookRotation(along.normalized, Vector3.up);
                        Vector3 middle = (p0 + p1) * 0.5f;
                        foreach (float rail in new[] { 0.45f, 0.9f })
                        {
                            mesh.AddBox(0, middle + new Vector3(0f, rail * height, 0f), new Vector3(0.08f, 0.1f, along.magnitude), rotation);
                        }

                        var section = new GameObject("Zaunfeld");
                        section.transform.SetParent(go.transform, false);
                        section.transform.SetPositionAndRotation(middle + new Vector3(0f, height * 0.5f, 0f), rotation);
                        section.layer = _environmentLayer;
                        section.AddComponent<BoxCollider>().size = new Vector3(0.2f, height, along.magnitude);
                    }
                }

                go.AddComponent<MeshFilter>().sharedMesh = _meshes.Add("Zaun_" + fence.Id, mesh);
                go.AddComponent<MeshRenderer>().sharedMaterial = _materials.Get("wood", 0.25f);
            }
        }

        /// <summary>Water surfaces of the brooks: a ribbon along the polyline at the falling water level, edges under the banks.</summary>
        /// <param name="parent">Parent.</param>
        public void BuildWater(Transform parent)
        {
            for (int r = 0; r < _layout.Rivers.Count; r++)
            {
                LayoutRiver river = _layout.Rivers[r];
                float half = (float)(river.Width * 0.5 + river.Bank * 0.8);
                var samples = new List<Vector3>();
                var directions = new List<Vector3>();
                for (int k = 0; k < river.Points.Count - 1; k++)
                {
                    LayoutPoint a = river.Points[k];
                    LayoutPoint b = river.Points[k + 1];
                    double length = a.DistanceTo(b);
                    int steps = Mathf.Max(1, (int)System.Math.Ceiling(length / 2.0));
                    bool last = k == river.Points.Count - 2;
                    for (int s = 0; s < steps + (last ? 1 : 0); s++)
                    {
                        double f = (double)s / steps;
                        samples.Add(new Vector3((float)LayoutGeometry.Lerp(a.X, b.X, f), (float)_heights.WaterLevel(r, k, f),
                            (float)LayoutGeometry.Lerp(a.Z, b.Z, f)));
                        directions.Add(new Vector3((float)((b.X - a.X) / length), 0f, (float)((b.Z - a.Z) / length)));
                    }
                }

                var mesh = new EichentalMeshBuilder(1);
                for (int i = 0; i < samples.Count - 1; i++)
                {
                    Vector3 n0 = new Vector3(-directions[i].z, 0f, directions[i].x) * half;
                    Vector3 n1 = new Vector3(-directions[i + 1].z, 0f, directions[i + 1].x) * half;
                    mesh.AddQuad(0, samples[i] + n0, samples[i] - n0, samples[i + 1] - n1, samples[i + 1] + n1, Vector3.up);
                }

                var go = new GameObject(river.Name.Length > 0 ? river.Name : river.Id);
                go.transform.SetParent(parent, false);
                go.layer = _waterLayer;
                go.AddComponent<MeshFilter>().sharedMesh = _meshes.Add("Wasser_" + river.Id, mesh);
                MeshRenderer renderer = go.AddComponent<MeshRenderer>();
                renderer.sharedMaterial = _materials.Water();
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
        }

        /// <summary>
        /// Bridges, deck at the higher bank, with colliders. Stone: deck slab, parapets and an arch ring under the deck
        /// (<see cref="BridgeGeometry.StoneArch"/>, top = underside of the deck). Wood: planks, rails and posts.
        /// </summary>
        /// <param name="parent">Parent.</param>
        public void BuildBridges(Transform parent)
        {
            foreach (LayoutBridge bridge in _layout.Bridges)
            {
                float half = (float)bridge.Length * 0.5f;
                LayoutPoint e0 = LayoutGeometry.RotateLocal(0.0, -half, bridge.Yaw);
                LayoutPoint e1 = LayoutGeometry.RotateLocal(0.0, half, bridge.Yaw);
                float deck = Mathf.Max(H(bridge.Position.X + e0.X, bridge.Position.Z + e0.Z), H(bridge.Position.X + e1.X, bridge.Position.Z + e1.Z));
                var go = new GameObject(bridge.Name.Length > 0 ? bridge.Name : bridge.Id);
                go.transform.SetParent(parent, false);
                go.transform.SetPositionAndRotation(new Vector3((float)bridge.Position.X, deck, (float)bridge.Position.Z),
                    Quaternion.Euler(0f, (float)bridge.Yaw, 0f));
                go.layer = _environmentLayer;
                float width = (float)bridge.Width;
                float length = (float)bridge.Length;
                var mesh = new EichentalMeshBuilder(1);
                if (bridge.Kind == BridgeKind.Stone)
                {
                    float deckThickness = (float)BridgeGeometry.DeckThickness;
                    mesh.AddBox(0, new Vector3(0f, -deckThickness * 0.5f, 0f), new Vector3(width, deckThickness, length), Quaternion.identity);
                    mesh.AddBuffers(BridgeGeometry.StoneArch(width, length), Vector3.zero, new[] { 0 });
                    for (int side = -1; side <= 1; side += 2)
                    {
                        mesh.AddBox(0, new Vector3(side * (width * 0.5f + 0.2f), 0.35f, 0f), new Vector3(0.4f, 0.7f, length), Quaternion.identity);
                        AddBox(go, new Vector3(side * (width * 0.5f + 0.2f), 0.35f, 0f), new Vector3(0.4f, 0.7f, length));
                    }
                }
                else
                {
                    mesh.AddBox(0, new Vector3(0f, -0.12f, 0f), new Vector3(width, 0.25f, length), Quaternion.identity);
                    for (int side = -1; side <= 1; side += 2)
                    {
                        mesh.AddBox(0, new Vector3(side * width * 0.5f, 1f, 0f), new Vector3(0.12f, 0.12f, length), Quaternion.identity);
                        for (int p = -1; p <= 1; p++)
                        {
                            mesh.AddBox(0, new Vector3(side * width * 0.5f, 0.55f, p * length * 0.45f), new Vector3(0.15f, 1.1f, 0.15f), Quaternion.identity);
                        }

                        AddBox(go, new Vector3(side * width * 0.5f, 0.55f, 0f), new Vector3(0.15f, 1.1f, length));
                    }
                }

                AddBox(go, new Vector3(0f, -0.3f, 0f), new Vector3(width, 0.6f, length));
                go.AddComponent<MeshFilter>().sharedMesh = _meshes.Add("Bruecke_" + bridge.Id, mesh);
                go.AddComponent<MeshRenderer>().sharedMaterial = bridge.Kind == BridgeKind.Stone ? _materials.Get("stone", 0.15f) : _materials.Get("wood", 0.25f);
            }
        }

        /// <summary>The rift: glowing tear (core almost white, turquoise rim), crystal shards, fracture lines and a turquoise light.</summary>
        /// <param name="parent">Parent.</param>
        public void BuildRift(Transform parent)
        {
            LayoutRift rift = _layout.Rift;
            if (rift == null)
            {
                return;
            }

            float cx = (float)rift.Center.X;
            float cz = (float)rift.Center.Z;
            float floor = H(cx, cz);
            var root = new GameObject(rift.Name.Length > 0 ? rift.Name : rift.Id);
            root.transform.SetParent(parent, false);
            root.transform.position = new Vector3(cx, floor, cz);

            // Tear: a jagged vertical sliver, two-sided, with a wider rim behind it (same random sequence as the preview).
            var tearRandom = new Aetherfall.Utilities.Pcg32Random(rift.CrystalSeed + 99UL);
            const int steps = 12;
            var left = new Vector3[steps + 1];
            var right = new Vector3[steps + 1];
            float height = (float)rift.TearHeight;
            float width = (float)rift.TearWidth;
            for (int i = 0; i <= steps; i++)
            {
                float t = (float)i / steps;
                float profile = Mathf.Pow(Mathf.Sin(Mathf.PI * t), 0.8f);
                float jag = (tearRandom.NextFloat() - 0.5f) * 0.9f;
                left[i] = new Vector3(-width * 0.5f * profile + jag * profile, 1f + t * height, 0f);
                right[i] = new Vector3(width * 0.5f * profile + jag * profile * 0.6f, 1f + t * height, 0f);
            }

            var tear = new EichentalMeshBuilder(2);
            for (int i = 0; i < steps; i++)
            {
                foreach (float side in new[] { 1f, -1f })
                {
                    tear.AddQuad(0, left[i], left[i + 1], right[i + 1], right[i], new Vector3(0f, 0f, side));
                    tear.AddQuad(1, left[i] * 1.9f + new Vector3(0f, -0.9f * left[i].y, 0.03f * side), left[i + 1] * 1.9f + new Vector3(0f, -0.9f * left[i + 1].y, 0.03f * side),
                        right[i + 1] * 1.9f + new Vector3(0f, -0.9f * right[i + 1].y, 0.03f * side), right[i] * 1.9f + new Vector3(0f, -0.9f * right[i].y, 0.03f * side),
                        new Vector3(0f, 0f, side));
                }
            }

            var tearObject = new GameObject("Riss (Licht)");
            tearObject.transform.SetParent(root.transform, false);
            tearObject.transform.localRotation = Quaternion.Euler(0f, (float)rift.TearYaw, 0f);
            tearObject.AddComponent<MeshFilter>().sharedMesh = _meshes.Add("Riss_Spalt", tear);
            MeshRenderer tearRenderer = tearObject.AddComponent<MeshRenderer>();
            tearRenderer.sharedMaterials = new[] { _materials.Glow("aetherCore", 6f), _materials.Glow("aether", 3f) };
            tearRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            var crystals = new EichentalMeshBuilder(1);
            foreach (RiftCrystal c in LayoutPlacement.RiftCrystals(rift))
            {
                float h = (float)c.Height;
                var position = new Vector3((float)c.X - cx, H(c.X, c.Z) - floor - 0.2f, (float)c.Z - cz);
                Quaternion rotation = Quaternion.Euler((float)c.TiltX, (float)c.Yaw, (float)c.TiltZ);
                crystals.AddCylinder(0, position, 0.35f * h * 0.5f, 0f, h, 5, rotation);
            }

            var crackRandom = new Aetherfall.Utilities.Pcg32Random(rift.CrystalSeed + 7UL);
            for (int i = 0; i < 9; i++)
            {
                float a = i / 9f * Mathf.PI * 2f + crackRandom.NextFloat() * 0.4f;
                float length = (float)rift.Radius * (0.9f + 0.9f * crackRandom.NextFloat());
                float start = (float)rift.Radius * 0.55f;
                float mx = Mathf.Sin(a) * (start + length * 0.5f);
                float mz = Mathf.Cos(a) * (start + length * 0.5f);
                float turn = (crackRandom.NextFloat() - 0.5f) * 0.5f;
                crystals.AddBox(0, new Vector3(mx, H(cx + mx, cz + mz) - floor + 0.02f, mz), new Vector3(0.25f, 0.08f, length),
                    Quaternion.Euler(0f, (a - turn) * Mathf.Rad2Deg, 0f));
            }

            var crystalObject = new GameObject("Kristalle und Bruchlinien");
            crystalObject.transform.SetParent(root.transform, false);
            crystalObject.AddComponent<MeshFilter>().sharedMesh = _meshes.Add("Riss_Kristalle", crystals);
            crystalObject.AddComponent<MeshRenderer>().sharedMaterial = _materials.Glow("aether", 2.5f);

            var lightObject = new GameObject("Aetherlicht");
            lightObject.transform.SetParent(root.transform, false);
            lightObject.transform.localPosition = new Vector3(0f, 6f, 0f);
            Light light = lightObject.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = _materials.Color("aether");
            light.range = (float)rift.LightRange;
            light.intensity = 4f;
            light.shadows = LightShadows.Soft;

            var marker = root.AddComponent<QuestObjectMarker>();
            TestGroundFields.SetString(marker, "objectId", rift.Id, _report);
            TestGroundFields.SetString(marker, "questId", "quest.main.asche_ueber_eichental", _report);
            TestGroundFields.SetString(marker, "locationId", "loc.eichental.riss_eichental", _report);
            _report.Info("Riss bei " + rift.Center + ": Spalt " + rift.TearHeight + " m, " + rift.Crystals + " Kristalle, 9 Bruchlinien, Aether-Licht " +
                         rift.LightRange + " m (GDD 05, 3.4).");
        }

        private Mesh PlantMesh(VegetationKind kind, int variant)
        {
            return _meshes.Get("Pflanze_" + kind + "_" + variant, () =>
            {
                ulong seed = (ulong)(500 + variant * 13 + kind.ToString().Length);
                switch (kind)
                {
                    case VegetationKind.Oak:
                        return Tree(0.38f, 4.2f, 8, seed, new[]
                        {
                            Crown(0f, 6.2f, 0f, 3.6f, 3.0f, 3.4f, 2), Crown(1.6f, 5.0f, 0.8f, 2.2f, 1.8f, 2.0f, 1), Crown(-1.5f, 5.3f, -0.9f, 2.0f, 1.7f, 2.2f, 1)
                        });
                    case VegetationKind.Beech:
                        return Tree(0.32f, 5.0f, 8, seed, new[] { Crown(0f, 7.4f, 0f, 3.0f, 4.2f, 3.0f, 2) });
                    case VegetationKind.Birch:
                        return Tree(0.17f, 7.5f, 6, seed, new[] { Crown(0f, 8.0f, 0f, 1.8f, 3.8f, 1.8f, 1), Crown(0.4f, 6.2f, 0.3f, 1.4f, 1.6f, 1.3f, 1) });
                    case VegetationKind.Linden:
                        return Tree(0.6f, 5.0f, 10, seed, new[]
                        {
                            Crown(0f, 8.6f, 0f, 5.4f, 4.6f, 5.2f, 2), Crown(2.6f, 7.0f, 1.0f, 3.0f, 2.4f, 2.8f, 1), Crown(-2.4f, 7.2f, -1.4f, 3.0f, 2.4f, 2.6f, 1)
                        });
                    case VegetationKind.Dead:
                    {
                        var dead = new EichentalMeshBuilder(1);
                        dead.AddCylinder(0, new Vector3(0f, -0.3f, 0f), 0.3f, 0.21f, 6f, 6, Quaternion.identity);
                        var random = new Aetherfall.Utilities.Pcg32Random(seed);
                        for (int i = 0; i < 4; i++)
                        {
                            float angle = random.NextFloat() * 360f;
                            float tilt = 40f + 20f * random.NextFloat();
                            dead.AddCylinder(0, new Vector3(0f, 3.2f + i * 0.7f, 0f), 0.12f, 0.04f, 2.6f, 5, Quaternion.Euler(tilt, angle, 0f));
                        }

                        return dead.ToMesh("Pflanze_Dead");
                    }

                    case VegetationKind.Bush:
                    {
                        var bush = new EichentalMeshBuilder(1);
                        bush.AddBlob(0, new Vector3(0f, 0.7f, 0f), new Vector3(1.5f, 1.05f, 1.4f), 2, seed, 0.45f);
                        return bush.ToMesh("Pflanze_Bush");
                    }

                    default:
                    {
                        // Reaches below the pivot (no flat bottom), so the boulder stays half buried on slopes.
                        var rock = new EichentalMeshBuilder(1);
                        rock.AddBuffers(RockGeometry.Boulder(seed), Vector3.zero, new[] { 0 });
                        return rock.ToMesh("Pflanze_Rock");
                    }
                }
            });
        }

        private static float[] Crown(float x, float y, float z, float rx, float ry, float rz, int subdivisions)
        {
            return new[] { x, y, z, rx, ry, rz, subdivisions };
        }

        private static Mesh Tree(float radius, float height, int segments, ulong seed, float[][] crowns)
        {
            var tree = new EichentalMeshBuilder(2);
            tree.AddCylinder(0, new Vector3(0f, -0.3f, 0f), radius, radius * 0.7f, height, segments, Quaternion.identity);
            for (int i = 0; i < crowns.Length; i++)
            {
                float[] c = crowns[i];
                tree.AddBlob(1, new Vector3(c[0], c[1], c[2]), new Vector3(c[3], c[4], c[5]), (int)c[6], seed + (ulong)i, 0.35f);
            }

            return tree.ToMesh("Baum");
        }

        private Material[] PlantMaterials(VegetationKind kind)
        {
            switch (kind)
            {
                case VegetationKind.Oak:
                    return new[] { _materials.Get("barkOak", 0.2f), _materials.Get("leafOak", 0.15f) };
                case VegetationKind.Beech:
                    return new[] { _materials.Fixed("barkBeech", new Color(0.48f, 0.46f, 0.42f)), _materials.Get("leafBeech", 0.15f) };
                case VegetationKind.Birch:
                    return new[] { _materials.Get("barkBirch", 0.2f), _materials.Get("leafBirch", 0.15f) };
                case VegetationKind.Linden:
                    return new[] { _materials.Get("barkOak", 0.2f), _materials.Get("leafLinden", 0.15f) };
                case VegetationKind.Dead:
                    return new[] { _materials.Get("burnedWood", 0.1f) };
                case VegetationKind.Bush:
                    return new[] { _materials.Get("bush", 0.15f) };
                default:
                    return new[] { _materials.Get("rock", 0.15f) };
            }
        }

        private Mesh RockMesh(int variant, int subdivisions)
        {
            return _meshes.Get("Fels_" + variant + (subdivisions == RockGeometry.LandmarkRenderSubdivisions ? string.Empty : "_Collider"), () =>
            {
                var rock = new EichentalMeshBuilder(1);
                rock.AddBuffers(RockGeometry.Landmark(variant, subdivisions), Vector3.zero, new[] { 0 });
                return rock.ToMesh("Fels");
            });
        }

        private void AddBox(GameObject go, Vector3 center, Vector3 size)
        {
            BoxCollider box = go.AddComponent<BoxCollider>();
            box.center = center;
            box.size = size;
        }
    }
}
