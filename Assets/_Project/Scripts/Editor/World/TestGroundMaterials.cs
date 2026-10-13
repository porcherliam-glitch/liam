using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>The coloured URP/Lit materials of the test ground (assets in Assets/_Project/Art/Materials/Test/).</summary>
    public sealed class TestGroundMaterials
    {
        /// <summary>Loads or creates all materials.</summary>
        /// <param name="report">Protocol.</param>
        public TestGroundMaterials(TestGroundReport report)
        {
            Ground = TestGroundAssets.EnsureMaterial("TestGround", new Color(0.45f, 0.47f, 0.45f), report);
            Lines = TestGroundAssets.EnsureMaterial("TestLines", new Color(0.25f, 0.27f, 0.27f), report);
            Ramp = TestGroundAssets.EnsureMaterial("TestRamp", new Color(0.92f, 0.55f, 0.18f), report);
            Stairs = TestGroundAssets.EnsureMaterial("TestStairs", new Color(0.25f, 0.5f, 0.85f), report);
            Platform = TestGroundAssets.EnsureMaterial("TestPlatform", new Color(0.35f, 0.7f, 0.35f), report);
            Wall = TestGroundAssets.EnsureMaterial("TestWall", new Color(0.7f, 0.3f, 0.28f), report);
            Tunnel = TestGroundAssets.EnsureMaterial("TestTunnel", new Color(0.5f, 0.35f, 0.7f), report);
            Player = TestGroundAssets.EnsureMaterial("TestPlayer", new Color(0.85f, 0.9f, 0.95f), report);
            Nose = TestGroundAssets.EnsureMaterial("TestPlayerNose", new Color(0.95f, 0.8f, 0.1f), report);
        }

        /// <summary>Floor.</summary>
        public Material Ground { get; }

        /// <summary>Floor lines every 5 m.</summary>
        public Material Lines { get; }

        /// <summary>Ramps.</summary>
        public Material Ramp { get; }

        /// <summary>Stairs.</summary>
        public Material Stairs { get; }

        /// <summary>Platforms and blocks.</summary>
        public Material Platform { get; }

        /// <summary>Walls and pillars.</summary>
        public Material Wall { get; }

        /// <summary>Tunnel.</summary>
        public Material Tunnel { get; }

        /// <summary>Player body.</summary>
        public Material Player { get; }

        /// <summary>Player "nose" (facing direction).</summary>
        public Material Nose { get; }
    }
}
