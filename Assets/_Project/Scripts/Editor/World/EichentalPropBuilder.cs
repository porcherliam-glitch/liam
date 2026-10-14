using Aetherfall.Quests;
using Aetherfall.World;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Small set pieces of the Eichental from the layout (<see cref="LayoutProp"/>): well, campfire with light, cart, signpost,
    /// wayside cross, barricades that close the paths at the map edge, the notice board (<see cref="QuestBoard"/> with the
    /// layout id, glitters while it offers something), refugee tents, hay bales, sheep, crates, barrels, the facade of the crypt
    /// entrance (closed until the dungeon exists), the wolf den mouth and the cairn on the Rabenfels. Same shapes as the Blender
    /// preview (Tools/Preview/eichental_preview.py, <c>build_prop</c>); one shared mesh per kind, simple box colliders.
    /// </summary>
    public sealed class EichentalPropBuilder
    {
        private readonly EichentalMaterials _materials;
        private readonly EichentalMeshLibrary _meshes;
        private readonly LayoutHeightField _heights;
        private readonly int _environmentLayer;
        private readonly int _interactableLayer;
        private readonly Font _labelFont;
        private readonly TestGroundReport _report;

        /// <summary>Creates the builder.</summary>
        /// <param name="materials">Materials.</param>
        /// <param name="meshes">Mesh library.</param>
        /// <param name="heights">Terrain heights.</param>
        /// <param name="environmentLayer">Environment layer (colliders).</param>
        /// <param name="interactableLayer">Interactable layer or −1 (notice board).</param>
        /// <param name="labelFont">Font of the signs (may be null).</param>
        /// <param name="report">Protocol.</param>
        public EichentalPropBuilder(EichentalMaterials materials, EichentalMeshLibrary meshes, LayoutHeightField heights, int environmentLayer,
            int interactableLayer, Font labelFont, TestGroundReport report)
        {
            _materials = materials;
            _meshes = meshes;
            _heights = heights;
            _environmentLayer = environmentLayer;
            _interactableLayer = interactableLayer;
            _labelFont = labelFont;
            _report = report;
        }

        /// <summary>Builds all props of the layout under <paramref name="parent"/>.</summary>
        /// <param name="layout">Layout.</param>
        /// <param name="parent">Parent.</param>
        public void BuildAll(RegionLayout layout, Transform parent)
        {
            int boards = 0;
            foreach (LayoutProp prop in layout.Props)
            {
                GameObject go = Build(prop, parent);
                if (prop.Kind == PropKind.NoticeBoard)
                {
                    AddNoticeBoard(go, prop);
                    boards++;
                }
            }

            _report.Info("Requisiten: " + layout.Props.Count + " (Brunnen, Lagerfeuer, Karren, Zelte, Sperren an den Wegen aus der Karte, " +
                         boards + " Anschlagbrett, Gruft-Eingang als geschlossene Fassade).");
        }

        private GameObject Build(LayoutProp prop, Transform parent)
        {
            float x = (float)prop.Position.X;
            float z = (float)prop.Position.Z;
            var go = new GameObject(prop.Name.Length > 0 ? prop.Name + " (" + prop.Id + ")" : prop.Id);
            go.transform.SetParent(parent, false);
            go.transform.SetPositionAndRotation(new Vector3(x, (float)_heights.Height(x, z), z), Quaternion.Euler(0f, (float)prop.Yaw, 0f));
            go.layer = _environmentLayer;

            Material[] materials;
            Mesh mesh = Shape(prop.Kind, out materials);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterials = materials;
            GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.BatchingStatic);

            switch (prop.Kind)
            {
                case PropKind.Well:
                    AddCollider(go, new Vector3(0f, 0.45f, 0f), new Vector3(2.1f, 0.9f, 2.1f));
                    break;
                case PropKind.Campfire:
                    AddCollider(go, new Vector3(0f, 0.25f, 0f), new Vector3(1.5f, 0.5f, 1.5f));
                    AddLight(go.transform, new Vector3(0f, 1f, 0f), _materials.Color("ember"), 12f, 2.2f);
                    break;
                case PropKind.Cart:
                    AddCollider(go, new Vector3(0f, 0.65f, 0.3f), new Vector3(1.9f, 1.3f, 3.4f));
                    break;
                case PropKind.Signpost:
                    AddCollider(go, new Vector3(0f, 1.2f, 0f), new Vector3(0.25f, 2.4f, 0.25f));
                    break;
                case PropKind.WaysideCross:
                    AddCollider(go, new Vector3(0f, 1.3f, 0f), new Vector3(0.8f, 2.6f, 0.8f));
                    break;
                case PropKind.Barricade:
                    // Closes the path at the map edge: high enough that nobody jumps over it.
                    AddCollider(go, new Vector3(0f, 1.5f, 0f), new Vector3(12.8f, 3f, 2.8f));
                    break;
                case PropKind.NoticeBoard:
                    AddCollider(go, new Vector3(0f, 1.15f, 0f), new Vector3(2f, 2.3f, 0.3f));
                    break;
                case PropKind.Tent:
                    AddCollider(go, new Vector3(0f, 1f, 0f), new Vector3(2.8f, 2f, 4f));
                    break;
                case PropKind.HayBale:
                    AddCollider(go, new Vector3(0f, 0.7f, 0f), new Vector3(1.2f, 1.4f, 1.4f));
                    break;
                case PropKind.Sheep:
                    AddCollider(go, new Vector3(0f, 0.55f, 0.1f), new Vector3(0.7f, 1.1f, 1.5f));
                    break;
                case PropKind.CrateStack:
                    AddCollider(go, new Vector3(0.1f, 0.85f, 0.1f), new Vector3(3f, 1.7f, 1.3f));
                    break;
                case PropKind.Barrel:
                    AddCollider(go, new Vector3(0f, 0.5f, 0f), new Vector3(2.5f, 1f, 0.8f));
                    break;
                case PropKind.CryptEntrance:
                    AddCollider(go, new Vector3(-2.3f, 1.8f, 0f), new Vector3(1f, 4.6f, 1f));
                    AddCollider(go, new Vector3(2.3f, 1.8f, 0f), new Vector3(1f, 4.6f, 1f));
                    AddCollider(go, new Vector3(0f, 4.55f, 0f), new Vector3(5.8f, 1.1f, 1.3f));
                    // The dark doorway is closed for now: "Die vergessene Gruft" is its own scene (a later step).
                    AddCollider(go, new Vector3(0f, 1.45f, -0.4f), new Vector3(3.6f, 3.9f, 0.5f));
                    EichentalLabel.Create(go.transform, "Die vergessene Gruft\n(Eingang folgt später)", new Vector3(0f, 5.8f, 0.8f), 180f, _labelFont, 0.05f);
                    break;
                case PropKind.CaveMouth:
                    AddCollider(go, new Vector3(0f, 1.3f, -0.2f), new Vector3(4f, 3f, 0.4f));
                    break;
                case PropKind.Cairn:
                    AddCollider(go, new Vector3(0f, 0.7f, 0f), new Vector3(0.9f, 1.4f, 0.9f));
                    break;
            }

            return go;
        }

        private void AddNoticeBoard(GameObject go, LayoutProp prop)
        {
            // GDD 02 7.6: objects that give quests glitter instead of showing "!".
            var marker = new GameObject("Glitzern");
            marker.transform.SetParent(go.transform, false);
            Material glint = _materials.Glow("questMarker", 3f);
            float[] sparks = { -0.4f, 2.55f, 0.16f, 0.1f, 2.7f, 0.22f, 0.5f, 2.5f, 0.12f };
            for (int i = 0; i < sparks.Length; i += 3)
            {
                GameObject spark = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                spark.name = "Funke " + (i / 3 + 1);
                spark.transform.SetParent(marker.transform, false);
                spark.transform.localPosition = new Vector3(sparks[i], sparks[i + 1], 0.1f);
                spark.transform.localScale = Vector3.one * sparks[i + 2];
                Object.DestroyImmediate(spark.GetComponent<Collider>());
                spark.GetComponent<MeshRenderer>().sharedMaterial = glint;
            }

            marker.SetActive(false);

            var trigger = new GameObject("Interaktion");
            trigger.transform.SetParent(go.transform, false);
            trigger.layer = _interactableLayer >= 0 ? _interactableLayer : 0;
            BoxCollider box = trigger.AddComponent<BoxCollider>();
            box.isTrigger = true;
            box.center = new Vector3(0f, 1.2f, 0.3f);
            box.size = new Vector3(2.2f, 2.4f, 1.2f);

            QuestBoard logic = go.AddComponent<QuestBoard>();
            TestGroundFields.SetString(logic, "boardId", prop.Id, _report);
            TestGroundFields.SetString(logic, "displayName", prop.Name, _report);
            TestGroundFields.SetReference(logic, "availableMarker", marker, _report);
            EichentalLabel.Create(go.transform, "Anschlagbrett (E / A: lesen)", new Vector3(0f, 2.9f, 0f), 180f, _labelFont, 0.035f);
            _report.Info("Anschlagbrett „" + prop.Name + "“ (" + prop.Id + ") bei " + prop.Position + ": QuestBoard mit dieser ID. Aushänge kommen mit den " +
                         "Quest-Daten des Mini-Slice; bis dahin zeigt es nur „Lesen“.");
        }

        private Mesh Shape(PropKind kind, out Material[] materials)
        {
            Material wood = _materials.Get("wood", 0.25f);
            Material dark = _materials.Get("woodDark", 0.25f);
            Material stone = _materials.Get("stone", 0.15f);
            switch (kind)
            {
                case PropKind.Well:
                    materials = new[] { stone, _materials.Water(), dark, _materials.Get("shingle", 0.2f) };
                    return _meshes.Get("Requisit_Brunnen", () =>
                    {
                        var m = new EichentalMeshBuilder(4);
                        Cyl(m, 0, 0f, 0f, 0f, 1.1f, 0.9f, 16);
                        Cyl(m, 1, 0f, 0f, 0f, 0.85f, 0.92f, 16);
                        Box(m, 2, -0.95f, 0f, 0f, 0.15f, 0.15f, 2.4f);
                        Box(m, 2, 0.95f, 0f, 0f, 0.15f, 0.15f, 2.4f);
                        Box(m, 3, 0f, 0f, 2.4f, 2.4f, 1.4f, 0.12f);
                        return m.ToMesh("Brunnen");
                    });
                case PropKind.Campfire:
                    materials = new[] { stone, _materials.Glow("ember", 4f), wood };
                    return _meshes.Get("Requisit_Lagerfeuer", () =>
                    {
                        var m = new EichentalMeshBuilder(3);
                        Cyl(m, 0, 0f, 0f, 0f, 0.8f, 0.25f, 10);
                        m.AddCylinder(1, new Vector3(0f, 0.2f, 0f), 0.45f, 0.1f, 0.6f, 8, Quaternion.identity);
                        for (int i = 0; i < 4; i++)
                        {
                            float a = i * 1.57f;
                            Box(m, 2, Mathf.Sin(a) * 2f, Mathf.Cos(a) * 2f, 0f, 1.6f, 0.4f, 0.4f, -(a + 1.57f) * Mathf.Rad2Deg);
                        }

                        return m.ToMesh("Lagerfeuer");
                    });
                case PropKind.Cart:
                    materials = new[] { wood, dark };
                    return _meshes.Get("Requisit_Karren", () =>
                    {
                        var m = new EichentalMeshBuilder(2);
                        Box(m, 0, 0f, 0f, 0.6f, 1.6f, 2.6f, 0.6f);
                        for (int side = -1; side <= 1; side += 2)
                        {
                            m.AddCylinder(1, new Vector3(side * 0.9f - 0.06f, 0.6f, -0.3f), 0.6f, 0.6f, 0.12f, 12,
                                Quaternion.FromToRotation(Vector3.up, Vector3.right));
                        }

                        Box(m, 0, 0f, 2.2f, 0.55f, 0.12f, 2f, 0.12f);
                        return m.ToMesh("Karren");
                    });
                case PropKind.Signpost:
                    materials = new[] { dark, wood };
                    return _meshes.Get("Requisit_Wegweiser", () =>
                    {
                        var m = new EichentalMeshBuilder(2);
                        Box(m, 0, 0f, 0f, 0f, 0.15f, 0.15f, 2.4f);
                        Box(m, 1, 0.5f, 0f, 1.9f, 1.4f, 0.06f, 0.3f);
                        Box(m, 1, -0.4f, 0f, 1.45f, 1.2f, 0.06f, 0.3f, -0.3f * Mathf.Rad2Deg);
                        return m.ToMesh("Wegweiser");
                    });
                case PropKind.WaysideCross:
                    materials = new[] { stone, dark, _materials.Get("plaster", 0.2f) };
                    return _meshes.Get("Requisit_Wegkreuz", () =>
                    {
                        var m = new EichentalMeshBuilder(3);
                        Box(m, 0, 0f, 0f, 0f, 0.8f, 0.8f, 0.5f);
                        Box(m, 1, 0f, 0f, 0.5f, 0.2f, 0.2f, 2.2f);
                        Box(m, 1, 0f, 0f, 2f, 1f, 0.18f, 0.18f);
                        Box(m, 2, 0f, 0.15f, 0.9f, 0.6f, 0.06f, 0.45f);
                        return m.ToMesh("Wegkreuz");
                    });
                case PropKind.Barricade:
                    materials = new[] { _materials.Get("barkOak", 0.2f), dark };
                    return _meshes.Get("Requisit_Sperre", () =>
                    {
                        var m = new EichentalMeshBuilder(2);
                        for (int i = 0; i < 3; i++)
                        {
                            float height = 0.35f + (i == 1 ? 0.6f : 0f);
                            Quaternion along = Quaternion.Euler(0f, -4f * (i - 1), 0f) * Quaternion.FromToRotation(Vector3.up, Vector3.right);
                            Vector3 start = new Vector3(0f, height, (i - 1) * 0.9f) - along * new Vector3(0f, 6f, 0f);
                            m.AddCylinder(0, start, 0.35f, 0.32f, 12f, 10, along);
                        }

                        Box(m, 1, 6.4f, 1.6f, 0f, 0.12f, 0.12f, 1.4f);
                        return m.ToMesh("Sperre");
                    });
                case PropKind.NoticeBoard:
                    materials = new[] { dark, wood, _materials.Get("shingle", 0.2f), _materials.Fixed("paper", new Color(0.93f, 0.9f, 0.8f)) };
                    return _meshes.Get("Requisit_Anschlagbrett", () =>
                    {
                        var m = new EichentalMeshBuilder(4);
                        Box(m, 0, -0.85f, 0f, 0f, 0.14f, 0.14f, 2.2f);
                        Box(m, 0, 0.85f, 0f, 0f, 0.14f, 0.14f, 2.2f);
                        Box(m, 1, 0f, 0f, 1f, 1.8f, 0.08f, 1.1f);
                        Box(m, 2, 0f, 0f, 2.2f, 2.1f, 0.4f, 0.12f);
                        Box(m, 3, -0.4f, 0.05f, 1.3f, 0.45f, 0.02f, 0.6f);
                        Box(m, 3, 0.35f, 0.05f, 1.2f, 0.4f, 0.02f, 0.5f);
                        return m.ToMesh("Anschlagbrett");
                    });
                case PropKind.Tent:
                    materials = new[] { _materials.Get("cloth", 0.1f) };
                    return _meshes.Get("Requisit_Zelt", () =>
                    {
                        var m = new EichentalMeshBuilder(1);
                        const float w = 1.6f;
                        const float d = 2f;
                        const float h = 2.2f;
                        Vector3 fl = new Vector3(-w, 0f, d), fr = new Vector3(w, 0f, d), ft = new Vector3(0f, h, d);
                        Vector3 bl = new Vector3(-w, 0f, -d), br = new Vector3(w, 0f, -d), bt = new Vector3(0f, h, -d);
                        m.AddTriangle(0, fl, fr, ft, Vector3.forward);
                        m.AddTriangle(0, bl, br, bt, Vector3.back);
                        m.AddQuad(0, fl, ft, bt, bl, new Vector3(-h, w, 0f));
                        m.AddQuad(0, fr, ft, bt, br, new Vector3(h, w, 0f));
                        return m.ToMesh("Zelt");
                    });
                case PropKind.HayBale:
                    materials = new[] { _materials.Get("thatch", 0.1f) };
                    return _meshes.Get("Requisit_Heu", () =>
                    {
                        var m = new EichentalMeshBuilder(1);
                        m.AddCylinder(0, new Vector3(-0.6f, 0.7f, 0f), 0.7f, 0.7f, 1.2f, 14, Quaternion.FromToRotation(Vector3.up, Vector3.right));
                        return m.ToMesh("Heu");
                    });
                case PropKind.Sheep:
                    materials = new[] { _materials.Get("sheep", 0.1f), _materials.Fixed("sheepHead", new Color(0.2f, 0.18f, 0.17f)) };
                    return _meshes.Get("Requisit_Schaf", () =>
                    {
                        var m = new EichentalMeshBuilder(2);
                        Box(m, 0, 0f, 0f, 0.4f, 0.7f, 1.2f, 0.7f);
                        Box(m, 1, 0f, 0.75f, 0.8f, 0.3f, 0.4f, 0.35f);
                        for (int sx = -1; sx <= 1; sx += 2)
                        {
                            for (int sy = -1; sy <= 1; sy += 2)
                            {
                                Box(m, 1, sx * 0.22f, sy * 0.4f, 0f, 0.12f, 0.12f, 0.45f);
                            }
                        }

                        return m.ToMesh("Schaf");
                    });
                case PropKind.CrateStack:
                    materials = new[] { wood, _materials.Get("cloth", 0.1f) };
                    return _meshes.Get("Requisit_Kisten", () =>
                    {
                        var m = new EichentalMeshBuilder(2);
                        Box(m, 0, 0f, 0f, 0f, 1f, 1f, 0.9f);
                        Box(m, 0, 1.1f, 0.1f, 0f, 0.9f, 0.9f, 0.8f, -0.3f * Mathf.Rad2Deg);
                        Box(m, 0, 0.3f, 0.1f, 0.9f, 0.8f, 0.8f, 0.7f, -0.6f * Mathf.Rad2Deg);
                        Box(m, 1, -0.9f, 0.3f, 0f, 0.7f, 0.5f, 0.5f);
                        return m.ToMesh("Kisten");
                    });
                case PropKind.Barrel:
                    materials = new[] { wood };
                    return _meshes.Get("Requisit_Faesser", () =>
                    {
                        var m = new EichentalMeshBuilder(1);
                        for (int i = 0; i < 3; i++)
                        {
                            Cyl(m, 0, (i - 1) * 0.85f, 0f, 0f, 0.4f, 1f, 12);
                        }

                        return m.ToMesh("Faesser");
                    });
                case PropKind.CryptEntrance:
                    materials = new[]
                    {
                        _materials.Fixed("cryptStone", new Color(0.55f, 0.53f, 0.5f), 0.15f), _materials.Fixed("void", new Color(0.01f, 0.01f, 0.012f), 0f),
                        _materials.Fixed("relief", new Color(0.42f, 0.4f, 0.38f), 0.15f)
                    };
                    return _meshes.Get("Requisit_Gruft", () =>
                    {
                        var m = new EichentalMeshBuilder(3);
                        Box(m, 0, -2.3f, 0f, -0.5f, 1f, 1f, 4.6f);
                        Box(m, 0, 2.3f, 0f, -0.5f, 1f, 1f, 4.6f);
                        Box(m, 0, 0f, 0f, 4f, 5.8f, 1.3f, 1.1f);
                        Box(m, 1, 0f, -0.55f, -0.5f, 3.6f, 0.2f, 3.9f);
                        for (int i = 0; i < 2; i++)
                        {
                            Box(m, 0, 0f, 0.85f + i * 0.6f, -0.3f, 3.6f, 0.6f, 0.3f - i * 0.12f);
                        }

                        Box(m, 2, 0f, 0.66f, 4.25f, 1.2f, 0.1f, 0.6f);
                        return m.ToMesh("Gruft");
                    });
                case PropKind.CaveMouth:
                    materials = new[] { _materials.Fixed("void", new Color(0.01f, 0.01f, 0.012f), 0f) };
                    return _meshes.Get("Requisit_Hoehle", () =>
                    {
                        var m = new EichentalMeshBuilder(1);
                        Box(m, 0, 0f, -0.2f, -0.3f, 4f, 0.3f, 3f);
                        return m.ToMesh("Hoehle");
                    });
                default:
                    materials = new[] { stone };
                    return _meshes.Get("Requisit_Steinmann", () =>
                    {
                        var m = new EichentalMeshBuilder(1);
                        for (int i = 0; i < 4; i++)
                        {
                            float s = 0.9f - i * 0.18f;
                            Box(m, 0, 0f, 0f, i * 0.33f, s, s, 0.35f, -i * 0.7f * Mathf.Rad2Deg);
                        }

                        return m.ToMesh("Steinmann");
                    });
            }
        }

        /// <summary>
        /// Box in the coordinates of the Blender preview: x right, y front, z up, the position is the centre of the bottom face;
        /// <paramref name="yaw"/> in Unity degrees (clockwise seen from above).
        /// </summary>
        private static void Box(EichentalMeshBuilder m, int submesh, float x, float y, float zBase, float sx, float sy, float sz, float yaw = 0f)
        {
            m.AddBox(submesh, new Vector3(x, zBase + sz * 0.5f, y), new Vector3(sx, sz, sy), Quaternion.Euler(0f, yaw, 0f));
        }

        /// <summary>Upright cylinder in preview coordinates (base centre).</summary>
        private static void Cyl(EichentalMeshBuilder m, int submesh, float x, float y, float zBase, float radius, float height, int segments)
        {
            m.AddCylinder(submesh, new Vector3(x, zBase, y), radius, radius, height, segments, Quaternion.identity);
        }

        private void AddCollider(GameObject go, Vector3 center, Vector3 size)
        {
            BoxCollider box = go.AddComponent<BoxCollider>();
            box.center = center;
            box.size = size;
        }

        private static void AddLight(Transform parent, Vector3 localPosition, Color color, float range, float intensity)
        {
            var lightObject = new GameObject("Feuerlicht");
            lightObject.transform.SetParent(parent, false);
            lightObject.transform.localPosition = localPosition;
            Light light = lightObject.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = color;
            light.range = range;
            light.intensity = intensity;
            light.shadows = LightShadows.None;
        }
    }
}
