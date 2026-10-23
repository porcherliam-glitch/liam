using System.Collections.Generic;
using DeadZone.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace DeadZone.Game
{
    /// <summary>Low-poly 3D models for props and containers, built from boxes, cylinders and spheres (no asset files needed).</summary>
    public static class PropFactory
    {
        private const float Tl = Coords.Tile;
        private static readonly Dictionary<string, (Mesh mesh, Material[] mats)> Cache = new Dictionary<string, (Mesh, Material[])>();

        private static GameObject Make(string key, string name, Transform parent, System.Action<MeshBuilder> build, bool shadows = true)
        {
            if (!Cache.TryGetValue(key, out var entry) || entry.mesh == null)
            {
                var mb = new MeshBuilder();
                build(mb);
                entry = (mb.Build(key), mb.Materials);
                Cache[key] = entry;
            }
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = entry.mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterials = entry.mats;
            mr.shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            return go;
        }

        private static Material L(string hex, float smooth = 0.15f, float metal = 0f) => Mats.Lit(Mats.Hex(hex, Color.grey), smooth, metal);
        private static Material L(Color c, float smooth = 0.15f, float metal = 0f) => Mats.Lit(c, smooth, metal);

        /// <summary>Builds a prop. Models are made along +x (long axis) and rotated when the footprint is taller than wide.</summary>
        public static GameObject Build(Prop p, World world, Transform parent)
        {
            float cx = (p.tx + p.w / 2f) * Tl, cz = -(p.ty + p.h / 2f) * Tl;
            bool alongZ = p.h > p.w;
            float len = Mathf.Max(p.w, p.h) * Tl, wid = Mathf.Min(p.w, p.h) * Tl;
            string col = p.color ?? "#666666";
            GameObject go;
            switch (p.type)
            {
                case "car": go = Make("car" + col, "Car", parent, mb => Car(mb, col, len)); break;
                case "truck": go = Make("truck" + col, "Truck", parent, mb => Truck(mb, col, len)); break;
                case "dumpster": go = Make("dumpster", "Dumpster", parent, mb => { mb.BoxCenter(L("#3d6b58", 0.3f, 0.3f), new Vector3(0, 0.65f, 0), new Vector3(1.8f, 1.3f, 1.1f)); mb.BoxCenter(L("#24443a", 0.2f), new Vector3(0, 1.33f, -0.05f), new Vector3(1.9f, 0.08f, 1.2f)); }); break;
                case "bench": go = Make("bench", "Bench", parent, mb => Bench(mb)); break;
                case "tree": go = Make("tree" + col + (p.tx * 7 + p.ty) % 3, "Tree", parent, mb => Tree(mb, col, (p.tx * 7 + p.ty) % 3)); break;
                case "barrel": go = Make("barrel" + col, "Barrel", parent, mb => { mb.Cylinder(L(col, 0.35f, 0.4f), new Vector3(0, 0, 0), 0.38f, 1.0f, 12); mb.Cylinder(L(Mats.Shade(Mats.Hex(col), 0.6f), 0.3f, 0.4f), new Vector3(0, 0.3f, 0), 0.4f, 0.06f, 12, false); mb.Cylinder(L(Mats.Shade(Mats.Hex(col), 0.6f), 0.3f, 0.4f), new Vector3(0, 0.7f, 0), 0.4f, 0.06f, 12, false); }); break;
                case "barricade": go = Make("barricade" + len, "Barricade", parent, mb => Barricade(mb, len)); break;
                case "crate": go = Make("crate", "Crate", parent, mb => Crate(mb, 1.2f)); break;
                case "pallet": go = Make("pallet", "Pallet", parent, mb => { var w = L("#8a6d45"); for (int i = 0; i < 5; i++) mb.BoxCenter(w, new Vector3(-0.5f + i * 0.25f, 0.13f, 0), new Vector3(0.16f, 0.04f, 1.2f)); for (int i = 0; i < 3; i++) mb.BoxCenter(w, new Vector3(0, 0.06f, -0.5f + i * 0.5f), new Vector3(1.2f, 0.12f, 0.14f)); mb.BoxCenter(L("#7a5f3a"), new Vector3(0.1f, 0.45f, 0.1f), new Vector3(0.7f, 0.6f, 0.7f)); }); break;
                case "sandbag": go = Make("sandbag" + len, "Sandbags", parent, mb => Sandbags(mb, len)); break;
                case "tank": go = Make("tank", "Tank", parent, mb => Tank(mb)); break;
                case "pipe": go = Make("pipe" + len, "Pipe", parent, mb => { var m = L("#7a6a5a", 0.3f, 0.5f); mb.CylinderX(m, new Vector3(0, 0.55f, 0), 0.4f, len - 0.2f, true, 12); for (float x = -len / 2 + 0.6f; x < len / 2; x += 2.5f) mb.BoxCenter(L("#4a4a4a"), new Vector3(x, 0.2f, 0), new Vector3(0.2f, 0.4f, 0.9f)); }); break;
                case "tower": go = Make("tower", "Watchtower", parent, mb => Tower(mb)); break;
                case "antenna": go = Make("antenna", "Antenna", parent, mb => { mb.BoxCenter(L("#555"), new Vector3(0, 0.3f, 0), new Vector3(1.2f, 0.6f, 1.2f)); mb.Cylinder(L("#9a9a9a", 0.5f, 0.8f), new Vector3(0, 0.6f, 0), 0.1f, 9f, 6); mb.Sphere(Mats.Emissive(Color.red, Color.red, 3f), new Vector3(0, 9.7f, 0), Vector3.one * 0.18f, 6, 4); }); break;
                case "lamp": go = Make("lamp" + (p.extraction != null), "Lamp", parent, mb => Lamp(mb, p.extraction != null)); break;
                case "generator": go = Make("generator", "Generator", parent, mb => Generator(mb)); break;
                case "pillar": go = Make("pillar", "Pillar", parent, mb => mb.BoxCenter(L("#6b7076", 0.1f), new Vector3(0, Coords.WallHeight / 2, 0), new Vector3(1.6f, Coords.WallHeight, 1.6f))); break;
                default: go = Make("box" + col, p.type ?? "Prop", parent, mb => mb.BoxCenter(L(col), new Vector3(0, 0.45f, 0), new Vector3(1.2f, 0.9f, 1.2f))); break;
            }
            go.transform.localPosition = new Vector3(cx, 0, cz);
            if (alongZ) go.transform.localRotation = Quaternion.Euler(0, 90, 0);
            else if (p.type == "tree" || p.type == "barrel" || p.type == "crate") go.transform.localRotation = Quaternion.Euler(0, ((p.tx * 31 + p.ty * 17) % 360), 0);
            return go;
        }

        private static void Car(MeshBuilder mb, string col, float len)
        {
            float l = Mathf.Min(len - 0.3f, 4.2f);
            var body = L(col, 0.55f, 0.35f);
            var glass = L("#1b242c", 0.9f);
            var tyre = L("#151515", 0.1f);
            var dark = L("#2a2a2a", 0.2f);
            mb.BoxCenter(body, new Vector3(0, 0.75f, 0), new Vector3(l, 0.7f, 1.8f));
            mb.BoxCenter(glass, new Vector3(-0.2f, 1.35f, 0), new Vector3(l * 0.5f, 0.55f, 1.6f));
            mb.BoxCenter(body, new Vector3(-0.2f, 1.64f, 0), new Vector3(l * 0.47f, 0.06f, 1.62f));
            mb.BoxCenter(dark, new Vector3(l / 2 - 0.05f, 0.6f, 0), new Vector3(0.12f, 0.3f, 1.7f));
            mb.BoxCenter(Mats.Emissive(new Color(1f, 0.95f, 0.8f), new Color(1f, 0.9f, 0.7f), 0.6f), new Vector3(l / 2, 0.8f, 0.6f), new Vector3(0.05f, 0.15f, 0.3f));
            mb.BoxCenter(Mats.Emissive(new Color(1f, 0.95f, 0.8f), new Color(1f, 0.9f, 0.7f), 0.6f), new Vector3(l / 2, 0.8f, -0.6f), new Vector3(0.05f, 0.15f, 0.3f));
            foreach (float x in new[] { -l * 0.32f, l * 0.32f })
                foreach (float z in new[] { -0.82f, 0.82f })
                    mb.CylinderX(tyre, new Vector3(x, 0.36f, z), 0.36f, 0.28f, false, 10);
        }

        private static void Truck(MeshBuilder mb, string col, float len)
        {
            float l = Mathf.Min(len - 0.3f, 7f);
            var body = L(col, 0.5f, 0.3f);
            mb.BoxCenter(body, new Vector3(l / 2 - 0.9f, 1.3f, 0), new Vector3(1.7f, 1.9f, 2.0f));
            mb.BoxCenter(L("#1b242c", 0.9f), new Vector3(l / 2 - 0.05f, 1.75f, 0), new Vector3(0.08f, 0.7f, 1.8f));
            mb.BoxCenter(L("#8c8c88", 0.2f, 0.3f), new Vector3(-0.85f, 1.65f, 0), new Vector3(l - 1.9f, 2.4f, 2.1f));
            mb.BoxCenter(L("#2a2a2a"), new Vector3(0, 0.45f, 0), new Vector3(l, 0.25f, 1.6f));
            foreach (float x in new[] { -l * 0.36f, -l * 0.18f, l * 0.34f })
                foreach (float z in new[] { -0.9f, 0.9f })
                    mb.CylinderX(L("#151515", 0.1f), new Vector3(x, 0.45f, z), 0.45f, 0.32f, false, 10);
        }

        private static void Bench(MeshBuilder mb)
        {
            var wood = L("#7a5c3c", 0.2f);
            var iron = L("#2b2b2b", 0.4f, 0.6f);
            for (int i = 0; i < 3; i++) mb.BoxCenter(wood, new Vector3(0, 0.48f, -0.25f + i * 0.17f), new Vector3(3.4f, 0.05f, 0.13f));
            mb.BoxCenter(wood, new Vector3(0, 0.85f, 0.2f), new Vector3(3.4f, 0.25f, 0.06f));
            foreach (float x in new[] { -1.4f, 1.4f }) mb.BoxCenter(iron, new Vector3(x, 0.45f, 0), new Vector3(0.08f, 0.9f, 0.6f));
        }

        private static void Tree(MeshBuilder mb, string col, int variant)
        {
            var bark = L("#4a3626", 0.05f);
            Color leaf = Mats.Shade(Mats.Hex(col, new Color(0.18f, 0.3f, 0.16f)), 1.25f + variant * 0.1f);
            var leaves = L(leaf, 0.05f);
            var leaves2 = L(Mats.Shade(leaf, 0.8f), 0.05f);
            mb.Cylinder(bark, Vector3.zero, 0.22f, 2.2f, 7);
            float h = 2.6f + variant * 0.3f;
            mb.Sphere(leaves, new Vector3(0, h, 0), new Vector3(1.5f, 1.25f, 1.5f), 9, 6);
            mb.Sphere(leaves2, new Vector3(0.6f, h + 0.7f, 0.3f), new Vector3(1.0f, 0.9f, 1.0f), 8, 5);
            mb.Sphere(leaves, new Vector3(-0.5f, h + 0.5f, -0.4f), new Vector3(0.9f, 0.8f, 0.9f), 8, 5);
        }

        private static void Barricade(MeshBuilder mb, float len)
        {
            var wood = L("#6b5a3a", 0.1f);
            var stripe = L("#c9b25a", 0.2f);
            float l = len - 0.3f;
            foreach (float x in new[] { -l / 2 + 0.2f, l / 2 - 0.2f }) mb.BoxCenter(wood, new Vector3(x, 0.5f, 0), new Vector3(0.15f, 1.0f, 0.8f));
            mb.BoxCenter(stripe, new Vector3(0, 0.85f, 0), new Vector3(l, 0.22f, 0.08f));
            mb.BoxCenter(wood, new Vector3(0, 0.45f, 0), new Vector3(l, 0.18f, 0.08f));
            mb.BoxCenter(L("#7a7a74", 0.05f), new Vector3(0, 0.25f, 0.45f), new Vector3(l * 0.6f, 0.5f, 0.5f));
        }

        private static void Crate(MeshBuilder mb, float s)
        {
            var wood = L("#8a6a42", 0.15f);
            var dark = L("#5e4528", 0.1f);
            mb.BoxCenter(wood, new Vector3(0, s / 2, 0), new Vector3(s, s, s));
            foreach (float y in new[] { 0.06f, s - 0.06f })
            {
                mb.BoxCenter(dark, new Vector3(0, y, s / 2 + 0.01f), new Vector3(s, 0.1f, 0.03f));
                mb.BoxCenter(dark, new Vector3(0, y, -s / 2 - 0.01f), new Vector3(s, 0.1f, 0.03f));
                mb.BoxCenter(dark, new Vector3(s / 2 + 0.01f, y, 0), new Vector3(0.03f, 0.1f, s));
                mb.BoxCenter(dark, new Vector3(-s / 2 - 0.01f, y, 0), new Vector3(0.03f, 0.1f, s));
            }
        }

        private static void Sandbags(MeshBuilder mb, float len)
        {
            var bag = L("#9a8a62", 0.05f);
            var bag2 = L("#857653", 0.05f);
            int n = Mathf.Max(2, Mathf.RoundToInt(len / 0.75f));
            for (int row = 0; row < 3; row++)
                for (int i = 0; i < n - (row % 2); i++)
                {
                    float x = -len / 2 + 0.4f + i * (len - 0.8f) / Mathf.Max(1, n - 1) + (row % 2) * 0.35f;
                    mb.Sphere(row % 2 == 0 ? bag : bag2, new Vector3(x, 0.17f + row * 0.28f, 0), new Vector3(0.42f, 0.17f, 0.3f), 8, 5);
                }
        }

        private static void Tank(MeshBuilder mb)
        {
            var metal = L("#7d8287", 0.45f, 0.5f);
            mb.Cylinder(metal, Vector3.zero, 2.6f, 3.4f, 18);
            mb.Sphere(metal, new Vector3(0, 3.4f, 0), new Vector3(2.6f, 0.7f, 2.6f), 18, 6);
            mb.Cylinder(L("#5a5f64", 0.3f, 0.5f), new Vector3(0, 1.0f, 0), 2.65f, 0.15f, 18, false);
            mb.Cylinder(L("#5a5f64", 0.3f, 0.5f), new Vector3(0, 2.3f, 0), 2.65f, 0.15f, 18, false);
            for (int i = 0; i < 9; i++) mb.BoxCenter(L("#3a3a3a"), new Vector3(2.7f, 0.3f + i * 0.4f, 0), new Vector3(0.06f, 0.05f, 0.5f));
            mb.BoxCenter(L("#c43a2a", 0.3f), new Vector3(0, 1.6f, 2.62f), new Vector3(1.6f, 0.35f, 0.04f));
        }

        private static void Tower(MeshBuilder mb)
        {
            var wood = L("#5a5040", 0.1f);
            var roof = L("#3e4a3a", 0.2f);
            foreach (float x in new[] { -1.6f, 1.6f })
                foreach (float z in new[] { -1.6f, 1.6f })
                    mb.BoxCenter(wood, new Vector3(x, 2.6f, z), new Vector3(0.22f, 5.2f, 0.22f));
            mb.BoxCenter(wood, new Vector3(0, 5.2f, 0), new Vector3(3.8f, 0.2f, 3.8f));
            foreach (float s in new[] { -1.8f, 1.8f })
            {
                mb.BoxCenter(wood, new Vector3(s, 5.75f, 0), new Vector3(0.1f, 0.9f, 3.8f));
                mb.BoxCenter(wood, new Vector3(0, 5.75f, s), new Vector3(3.8f, 0.9f, 0.1f));
            }
            mb.BoxCenter(roof, new Vector3(0, 7.2f, 0), new Vector3(4.2f, 0.15f, 4.2f));
            foreach (float x in new[] { -1.8f, 1.8f })
                foreach (float z in new[] { -1.8f, 1.8f })
                    mb.BoxCenter(wood, new Vector3(x, 6.5f, z), new Vector3(0.12f, 1.4f, 0.12f));
            mb.BoxCenter(Mats.Emissive(new Color(1f, 0.95f, 0.8f), new Color(1f, 0.92f, 0.75f), 2f), new Vector3(1.6f, 6.4f, 1.6f), new Vector3(0.3f, 0.3f, 0.3f));
        }

        private static void Lamp(MeshBuilder mb, bool extraction)
        {
            var pole = L("#3a3d40", 0.4f, 0.6f);
            mb.Cylinder(pole, Vector3.zero, 0.09f, 4.4f, 6);
            mb.BoxCenter(pole, new Vector3(0.45f, 4.35f, 0), new Vector3(0.9f, 0.08f, 0.1f));
            var head = extraction ? Mats.Emissive(new Color(0.2f, 1f, 0.5f), new Color(0.2f, 1f, 0.5f), 3f) : Mats.Emissive(new Color(1f, 0.9f, 0.7f), new Color(1f, 0.85f, 0.6f), 1.5f);
            mb.BoxCenter(head, new Vector3(0.85f, 4.25f, 0), new Vector3(0.45f, 0.12f, 0.25f));
        }

        private static void Generator(MeshBuilder mb)
        {
            var body = L("#c49a2c", 0.35f, 0.3f);
            var dark = L("#2e2e2e", 0.3f, 0.4f);
            mb.BoxCenter(dark, new Vector3(0, 0.1f, 0), new Vector3(1.7f, 0.2f, 1.1f));
            mb.BoxCenter(body, new Vector3(0, 0.75f, 0), new Vector3(1.5f, 1.1f, 0.95f));
            mb.BoxCenter(dark, new Vector3(0.4f, 0.75f, 0.49f), new Vector3(0.5f, 0.5f, 0.04f));
            mb.Cylinder(dark, new Vector3(-0.5f, 1.3f, -0.2f), 0.08f, 0.6f, 6);
            mb.BoxCenter(Mats.Emissive(new Color(1f, 0.3f, 0.1f), new Color(1f, 0.3f, 0.1f), 2f), new Vector3(-0.3f, 1.1f, 0.49f), new Vector3(0.12f, 0.12f, 0.04f));
        }

        // ------------------------------------------------------------------ containers
        /// <summary>Container model standing on its tile with the back against the nearest wall.</summary>
        public static GameObject BuildContainer(Container c, World world, Transform parent)
        {
            GameObject go;
            switch (c.type)
            {
                case "locker": go = Make("c_locker", "Locker", parent, mb => { mb.BoxCenter(L("#4f6070", 0.35f, 0.4f), new Vector3(0, 1.0f, 0), new Vector3(0.95f, 2.0f, 0.6f)); for (int i = 0; i < 4; i++) mb.BoxCenter(L("#2d3640"), new Vector3(-0.2f, 1.6f + i * 0.07f, -0.31f), new Vector3(0.35f, 0.03f, 0.02f)); mb.BoxCenter(L("#2d3640"), new Vector3(0, 1.0f, -0.31f), new Vector3(0.02f, 1.9f, 0.02f)); }); break;
                case "fridge": go = Make("c_fridge", "Fridge", parent, mb => { mb.BoxCenter(L("#d8dcd8", 0.6f), new Vector3(0, 0.95f, 0), new Vector3(0.9f, 1.9f, 0.75f)); mb.BoxCenter(L("#8a8f90", 0.6f, 0.7f), new Vector3(0.32f, 1.2f, -0.4f), new Vector3(0.05f, 0.5f, 0.05f)); mb.BoxCenter(L("#a8aca8"), new Vector3(0, 1.25f, -0.38f), new Vector3(0.88f, 0.02f, 0.02f)); }); break;
                case "desk": go = Make("c_desk", "Desk", parent, mb => { var w = L("#6e5440", 0.25f); mb.BoxCenter(w, new Vector3(0, 0.76f, 0), new Vector3(1.6f, 0.07f, 0.85f)); foreach (float x in new[] { -0.72f, 0.72f }) foreach (float z in new[] { -0.35f, 0.35f }) mb.BoxCenter(w, new Vector3(x, 0.37f, z), new Vector3(0.07f, 0.74f, 0.07f)); mb.BoxCenter(L("#5a4434"), new Vector3(0.45f, 0.5f, 0), new Vector3(0.5f, 0.45f, 0.75f)); mb.BoxCenter(L("#1c1c1c", 0.6f), new Vector3(-0.3f, 0.98f, 0.15f), new Vector3(0.55f, 0.38f, 0.04f)); mb.BoxCenter(Mats.Emissive(new Color(0.2f, 0.4f, 0.5f), new Color(0.2f, 0.5f, 0.7f), 0.8f), new Vector3(-0.3f, 0.98f, 0.125f), new Vector3(0.5f, 0.32f, 0.01f)); }); break;
                case "medcabinet": go = Make("c_med", "MedCabinet", parent, mb => { mb.BoxCenter(L("#e4e8e8", 0.5f), new Vector3(0, 1.0f, 0.05f), new Vector3(1.0f, 1.5f, 0.45f)); var red = Mats.Emissive(new Color(0.9f, 0.15f, 0.15f), new Color(1f, 0.1f, 0.1f), 0.8f); mb.BoxCenter(red, new Vector3(0, 1.25f, -0.18f), new Vector3(0.36f, 0.1f, 0.02f)); mb.BoxCenter(red, new Vector3(0, 1.25f, -0.18f), new Vector3(0.1f, 0.36f, 0.02f)); }); break;
                case "safe": go = Make("c_safe", "Safe", parent, mb => { mb.BoxCenter(L("#3a3e44", 0.55f, 0.8f), new Vector3(0, 0.45f, 0), new Vector3(0.8f, 0.9f, 0.8f)); mb.CylinderX(L("#b0a070", 0.7f, 0.9f), new Vector3(0.1f, 0.5f, -0.42f), 0.1f, 0.05f, false, 10); mb.BoxCenter(L("#b0a070", 0.7f, 0.9f), new Vector3(-0.2f, 0.5f, -0.42f), new Vector3(0.04f, 0.25f, 0.04f)); }); break;
                case "military_crate": go = Make("c_mil", "MilitaryCrate", parent, mb => { mb.BoxCenter(L("#4b5a34", 0.2f), new Vector3(0, 0.38f, 0), new Vector3(1.5f, 0.75f, 0.85f)); mb.BoxCenter(L("#2f3a22"), new Vector3(0, 0.76f, 0), new Vector3(1.52f, 0.05f, 0.87f)); mb.BoxCenter(L("#c8b860", 0.2f), new Vector3(0, 0.45f, -0.43f), new Vector3(0.6f, 0.12f, 0.02f)); }); break;
                case "toolbox": go = Make("c_tool", "Workbench", parent, mb => { var w = L("#6a5a48", 0.2f); mb.BoxCenter(w, new Vector3(0, 0.85f, 0), new Vector3(1.6f, 0.08f, 0.75f)); foreach (float x in new[] { -0.72f, 0.72f }) mb.BoxCenter(L("#3b3b3b", 0.3f, 0.6f), new Vector3(x, 0.42f, 0), new Vector3(0.08f, 0.84f, 0.7f)); mb.BoxCenter(L("#b0322a", 0.4f, 0.4f), new Vector3(0.2f, 1.02f, 0), new Vector3(0.55f, 0.26f, 0.28f)); mb.BoxCenter(L("#808080", 0.5f, 0.8f), new Vector3(-0.4f, 0.93f, 0.1f), new Vector3(0.4f, 0.05f, 0.08f)); }); break;
                case "weapon_rack": go = Make("c_rack", "WeaponRack", parent, mb => { var w = L("#4a3e30", 0.2f); mb.BoxCenter(w, new Vector3(0, 0.1f, 0.1f), new Vector3(1.6f, 0.2f, 0.45f)); mb.BoxCenter(w, new Vector3(0, 1.1f, 0.25f), new Vector3(1.6f, 1.8f, 0.08f)); for (int i = 0; i < 4; i++) mb.BoxCenter(L("#1e1e1e", 0.4f, 0.6f), new Vector3(-0.55f + i * 0.37f, 0.9f, 0.1f), new Vector3(0.08f, 1.4f, 0.12f)); }); break;
                case "server_rack": go = Make("c_server", "ServerRack", parent, mb => { mb.BoxCenter(L("#16181b", 0.5f, 0.5f), new Vector3(0, 1.05f, 0), new Vector3(0.8f, 2.1f, 0.9f)); var g = Mats.Emissive(new Color(0.1f, 0.9f, 0.4f), new Color(0.1f, 1f, 0.4f), 2.5f); var b = Mats.Emissive(new Color(0.2f, 0.5f, 1f), new Color(0.2f, 0.5f, 1f), 2.5f); for (int i = 0; i < 7; i++) mb.BoxCenter(i % 2 == 0 ? g : b, new Vector3(-0.2f + (i % 3) * 0.15f, 0.4f + i * 0.24f, -0.46f), new Vector3(0.06f, 0.03f, 0.01f)); }); break;
                case "lab_cabinet": go = Make("c_lab", "LabCabinet", parent, mb => { mb.BoxCenter(L("#c9d6d6", 0.6f), new Vector3(0, 0.9f, 0), new Vector3(1.2f, 1.8f, 0.55f)); mb.BoxCenter(L("#22343a", 0.95f), new Vector3(0, 1.15f, -0.28f), new Vector3(1.05f, 1.1f, 0.02f)); for (int i = 0; i < 3; i++) mb.Cylinder(Mats.Emissive(new Color(0.3f, 0.9f, 0.8f), new Color(0.2f, 0.9f, 0.7f), 1.2f), new Vector3(-0.3f + i * 0.3f, 0.9f, -0.1f), 0.06f, 0.25f, 6); }); break;
                case "body": go = Make("c_body", "Body", parent, mb => { mb.Floor(Mats.Lit(new Color(0.25f, 0.03f, 0.03f), 0.6f), -0.9f, -0.7f, 0.9f, 0.7f, 0.012f); var cloth = L("#3a3f33", 0.05f); mb.BoxCenter(cloth, new Vector3(0, 0.14f, 0), new Vector3(0.75f, 0.26f, 0.45f)); mb.BoxCenter(L("#2c2c34", 0.05f), new Vector3(0.75f, 0.11f, 0.12f), new Vector3(0.8f, 0.2f, 0.18f)); mb.BoxCenter(L("#2c2c34", 0.05f), new Vector3(0.75f, 0.11f, -0.13f), new Vector3(0.8f, 0.2f, 0.18f)); mb.Sphere(L("#9a7a68", 0.2f), new Vector3(-0.55f, 0.14f, 0), Vector3.one * 0.16f, 8, 5); mb.BoxCenter(L("#4a3a2a"), new Vector3(0.1f, 0.25f, 0.35f), new Vector3(0.5f, 0.35f, 0.25f)); }); break;
                default: go = Make("c_crate", "Crate", parent, mb => Crate(mb, 1.05f)); break;
            }
            go.transform.localPosition = Coords.ToWorld(c.x, c.y);
            // back to the wall: model front faces -z (south); find the wall side
            float yaw = 0;
            if (IsWall(world, c.tx, c.ty - 1)) yaw = 0;          // wall to the north (+z)
            else if (IsWall(world, c.tx, c.ty + 1)) yaw = 180;   // wall to the south
            else if (IsWall(world, c.tx + 1, c.ty)) yaw = 90;    // wall to the east (+x)
            else if (IsWall(world, c.tx - 1, c.ty)) yaw = 270;   // wall to the west
            else yaw = (c.tx * 37 + c.ty * 11) % 360;
            go.transform.localRotation = Quaternion.Euler(0, yaw, 0);
            if (c.type != "body")
            {
                // push it towards the wall so it stands against it
                var back = go.transform.localRotation * Vector3.forward;
                go.transform.localPosition += back * 0.45f;
            }
            return go;
        }

        private static bool IsWall(World w, int tx, int ty) { int t = w.Tile(tx, ty); return t == T.WALL || t == T.WINDOW; }
    }
}
