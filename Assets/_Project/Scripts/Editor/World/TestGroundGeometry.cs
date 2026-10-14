using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Builds the obstacle course of the test ground from primitives: ramps 15°/30°/45°/60°, stairs, jump platforms of
    /// rising height, gaps, a wall, a tunnel for the camera collision, pillars and floor lines every 5 m. All parts get
    /// colliders and the environment layer; labels (3D text) name each obstacle in German.
    /// </summary>
    /// <remarks>Layout: spawn at the origin facing +Z; ramps and stairs north, platforms east, gaps west, wall and tunnel south.</remarks>
    public sealed class TestGroundGeometry
    {
        private readonly Transform _root;
        private readonly int _layer;
        private readonly TestGroundMaterials _materials;
        private readonly Font _labelFont;

        /// <summary>Creates the builder.</summary>
        /// <param name="root">Parent of all environment objects.</param>
        /// <param name="layer">Layer of all environment colliders (Environment or Default).</param>
        /// <param name="materials">Materials to use.</param>
        /// <param name="labelFont">Font of the labels; null = no labels.</param>
        public TestGroundGeometry(Transform root, int layer, TestGroundMaterials materials, Font labelFont)
        {
            _root = root;
            _layer = layer;
            _materials = materials;
            _labelFont = labelFont;
        }

        /// <summary>Builds everything.</summary>
        public void BuildAll()
        {
            BuildGround();
            BuildRamps();
            BuildStairs(new Vector3(7f, 0f, 10f), 12, 0.2f, 0.35f, "Treppe (Stufen 0,2 m)");
            BuildStairs(new Vector3(12f, 0f, 10f), 5, 0.45f, 0.6f, "Hohe Stufen 0,45 m (springen)");
            BuildJumpPlatforms();
            BuildGaps();
            BuildWallAndPillars();
            BuildTunnel();
        }

        private void BuildGround()
        {
            Box("Ground", new Vector3(0f, -0.5f, 0f), new Vector3(120f, 1f, 120f), Quaternion.identity, _materials.Ground);

            // Thin lines every 5 m help to judge speed and distance; no colliders, so they cannot trip the player.
            Transform lines = Group("FloorLines");
            for (int i = -6; i <= 6; i++)
            {
                float offset = i * 5f;
                Visual(lines, "LineX " + offset, new Vector3(0f, 0.005f, offset), new Vector3(60f, 0.01f, 0.06f), _materials.Lines);
                Visual(lines, "LineZ " + offset, new Vector3(offset, 0.005f, 0f), new Vector3(0.06f, 0.01f, 60f), _materials.Lines);
            }
        }

        private void BuildRamps()
        {
            float[] angles = { 15f, 30f, 45f, 60f };
            const float height = 3f;
            const float width = 4f;
            const float startZ = 10f;
            for (int i = 0; i < angles.Length; i++)
            {
                float x = -21f + i * 6f;
                float angle = angles[i];
                float run = height / Mathf.Tan(angle * Mathf.Deg2Rad);
                Ramp("Ramp " + angle + "°", new Vector3(x, 0f, startZ), angle, height, width, _materials.Ramp);
                Box("Ramp " + angle + "° Top", new Vector3(x, height * 0.5f, startZ + run + 1.5f), new Vector3(width, height, 3f),
                    Quaternion.identity, _materials.Platform);
                string text = angle >= 50f ? "Rampe " + angle + "° (rutscht)" : "Rampe " + angle + "°";
                Label(text, new Vector3(x, 1.2f, startZ - 1f));
            }
        }

        private void BuildStairs(Vector3 start, int steps, float stepHeight, float stepDepth, string label)
        {
            const float width = 3f;
            Transform stairs = Group(label);
            for (int i = 0; i < steps; i++)
            {
                float top = (i + 1) * stepHeight;
                Box(stairs, "Step " + (i + 1), new Vector3(start.x, top * 0.5f, start.z + (i + 0.5f) * stepDepth),
                    new Vector3(width, top, stepDepth), Quaternion.identity, _materials.Stairs);
            }

            float totalHeight = steps * stepHeight;
            Box(stairs, "Top", new Vector3(start.x, totalHeight * 0.5f, start.z + steps * stepDepth + 1.5f), new Vector3(width, totalHeight, 3f),
                Quaternion.identity, _materials.Platform);
            Label(label, new Vector3(start.x, 1.2f, start.z - 1f));
        }

        private void BuildJumpPlatforms()
        {
            float[] heights = { 0.4f, 0.8f, 1.0f, 1.2f, 1.5f };
            Transform group = Group("JumpPlatforms");
            for (int i = 0; i < heights.Length; i++)
            {
                float h = heights[i];
                var center = new Vector3(20f + i * 4f, h * 0.5f, 6f);
                Box(group, "Platform " + h + " m", center, new Vector3(2.4f, h, 2.4f), Quaternion.identity, _materials.Platform);
                Label(h.ToString("0.0") + " m", new Vector3(center.x, h + 0.9f, center.z - 1.6f));
            }

            Label("Sprunghöhe 1,2 m: 1,5 m ist zu hoch", new Vector3(28f, 2.6f, 3.5f));
        }

        private void BuildGaps()
        {
            // Blocks 1 m high along +Z with gaps of 1.5 / 2.5 / 3.5 / 4.5 / 6.0 m. Flight distance at the same height with the
            // GDD 3.1 jump (1.2 m, 1.0 g rising, 1.6 g falling, ~0.89 s): ~4.4 m running, ~6.2 m sprinting; the capsule
            // (radius 0.35 m) reaches about 0.3 m over each edge, coyote time adds up to 0.6 m (running). So 4.5 m is tight
            // when running, 6.0 m needs sprinting (running reaches at most ~5.5 m even with perfect timing).
            float[] gaps = { 1.5f, 2.5f, 3.5f, 4.5f, 6.0f };
            const float x = -32f;
            const float blockLength = 4f;
            const float height = 1f;
            Transform group = Group("Gaps");
            Box(group, "Step Up", new Vector3(x, 0.25f, -12f), new Vector3(3f, 0.5f, 2f), Quaternion.identity, _materials.Stairs);
            float z = -11f;
            for (int i = 0; i <= gaps.Length; i++)
            {
                Box(group, "Block " + i, new Vector3(x, height * 0.5f, z + blockLength * 0.5f), new Vector3(3f, height, blockLength),
                    Quaternion.identity, _materials.Platform);
                z += blockLength;
                if (i < gaps.Length)
                {
                    Label("Lücke " + gaps[i].ToString("0.0") + " m", new Vector3(x, height + 1f, z + gaps[i] * 0.5f));
                    z += gaps[i];
                }
            }
        }

        private void BuildWallAndPillars()
        {
            Box("Wall", new Vector3(0f, 2f, -14f), new Vector3(12f, 4f, 0.5f), Quaternion.identity, _materials.Wall);
            Box("Wall Corner", new Vector3(6.25f, 2f, -10.75f), new Vector3(0.5f, 4f, 7f), Quaternion.identity, _materials.Wall);
            Label("Wand (Kamera weicht aus)", new Vector3(0f, 4.6f, -13.6f));

            Transform pillars = Group("Pillars");
            Box(pillars, "Pillar A", new Vector3(-6f, 2f, -5f), new Vector3(1f, 4f, 1f), Quaternion.identity, _materials.Wall);
            Box(pillars, "Pillar B", new Vector3(-3f, 2f, -7f), new Vector3(1f, 4f, 1f), Quaternion.identity, _materials.Wall);
            Box(pillars, "Pillar C", new Vector3(-8f, 2f, -9f), new Vector3(1f, 4f, 1f), Quaternion.identity, _materials.Wall);
        }

        private void BuildTunnel()
        {
            // Inner size 3 m wide, 2.6 m high, 14 m long: the camera (4 m behind the player) has to move in.
            const float x = 20f;
            const float startZ = -10f;
            const float length = 14f;
            const float innerWidth = 3f;
            const float innerHeight = 2.6f;
            const float thickness = 0.5f;
            float centerZ = startZ - length * 0.5f;
            Transform tunnel = Group("Tunnel");
            float wallX = innerWidth * 0.5f + thickness * 0.5f;
            Box(tunnel, "Wall Left", new Vector3(x - wallX, innerHeight * 0.5f, centerZ), new Vector3(thickness, innerHeight, length),
                Quaternion.identity, _materials.Tunnel);
            Box(tunnel, "Wall Right", new Vector3(x + wallX, innerHeight * 0.5f, centerZ), new Vector3(thickness, innerHeight, length),
                Quaternion.identity, _materials.Tunnel);
            Box(tunnel, "Roof", new Vector3(x, innerHeight + thickness * 0.5f, centerZ), new Vector3(innerWidth + thickness * 2f, thickness, length),
                Quaternion.identity, _materials.Tunnel);
            Label("Tunnel (Kamera-Kollision)", new Vector3(x, innerHeight + 1.2f, startZ + 0.3f));
        }

        private void Ramp(string name, Vector3 bottomEdge, float angle, float height, float width, Material material)
        {
            // A thin box tilted by the slope angle. Its top surface runs from bottomEdge (y = 0) up to the given height.
            const float thickness = 0.5f;
            const float buried = 0.5f;
            float topLength = height / Mathf.Sin(angle * Mathf.Deg2Rad);
            Quaternion rotation = Quaternion.Euler(-angle, 0f, 0f);
            Vector3 along = rotation * Vector3.forward;
            Vector3 up = rotation * Vector3.up;

            // The top surface spans from "buried" below the bottom edge (hidden in the ground) to topLength above it.
            Vector3 topCenter = bottomEdge + along * ((topLength - buried) * 0.5f);
            Vector3 center = topCenter - up * (thickness * 0.5f);
            Box(name, center, new Vector3(width, thickness, topLength + buried), rotation, material);
        }

        private Transform Group(string name)
        {
            var group = new GameObject(name);
            group.transform.SetParent(_root, false);
            group.layer = _layer;
            return group.transform;
        }

        private void Box(string name, Vector3 center, Vector3 size, Quaternion rotation, Material material)
        {
            Box(_root, name, center, size, rotation, material);
        }

        private void Box(Transform parent, string name, Vector3 center, Vector3 size, Quaternion rotation, Material material)
        {
            GameObject box = GameObject.CreatePrimitive(PrimitiveType.Cube);
            box.name = name;
            box.layer = _layer;
            box.transform.SetParent(parent, false);
            box.transform.SetPositionAndRotation(center, rotation);
            box.transform.localScale = size;
            if (box.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = material;
            }
        }

        private void Visual(Transform parent, string name, Vector3 center, Vector3 size, Material material)
        {
            GameObject box = GameObject.CreatePrimitive(PrimitiveType.Cube);
            box.name = name;
            box.layer = _layer;
            box.transform.SetParent(parent, false);
            box.transform.position = center;
            box.transform.localScale = size;
            if (box.TryGetComponent(out Collider collider))
            {
                Object.DestroyImmediate(collider);
            }

            if (box.TryGetComponent(out MeshRenderer renderer))
            {
                renderer.sharedMaterial = material;
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
        }

        private void Label(string text, Vector3 position)
        {
            if (_labelFont == null)
            {
                return;
            }

            var label = new GameObject("Label " + text);
            label.transform.SetParent(_root, false);
            label.transform.position = position;

            // Readable from the spawn point: the text faces away from the origin (TextMesh reads along its +Z axis).
            var flat = new Vector3(position.x, 0f, position.z);
            label.transform.rotation = flat.sqrMagnitude > 0.01f ? Quaternion.LookRotation(flat.normalized, Vector3.up) : Quaternion.identity;

            TextMesh mesh = label.AddComponent<TextMesh>();
            mesh.text = text;
            mesh.font = _labelFont;
            mesh.fontSize = 64;
            mesh.characterSize = 0.06f;
            mesh.anchor = TextAnchor.MiddleCenter;
            mesh.alignment = TextAlignment.Center;
            mesh.color = Color.white;
            if (!label.TryGetComponent(out MeshRenderer renderer))
            {
                renderer = label.AddComponent<MeshRenderer>();
            }

            renderer.sharedMaterial = WorldTextMaterial.For(_labelFont);
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }
    }
}
