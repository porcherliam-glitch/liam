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
            Sword = TestGroundAssets.EnsureMaterial("TestSword", new Color(0.78f, 0.8f, 0.85f), report);
            Shield = TestGroundAssets.EnsureMaterial("TestShield", new Color(0.55f, 0.35f, 0.18f), report);
            Wolf = TestGroundAssets.EnsureMaterial("TestWolf", new Color(0.46f, 0.43f, 0.4f), report);
            AetherWolf = TestGroundAssets.EnsureMaterial("TestAetherWolf", new Color(0.27f, 0.33f, 0.4f), report);
            Crystal = TestGroundAssets.EnsureMaterial("TestCrystal", new Color(0.2f, 0.95f, 0.85f), report);
            Dummy = TestGroundAssets.EnsureMaterial("TestDummy", new Color(0.82f, 0.7f, 0.42f), report);
            Arena = TestGroundAssets.EnsureMaterial("TestArena", new Color(0.4f, 0.33f, 0.27f), report);
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

        /// <summary>Placeholder sword.</summary>
        public Material Sword { get; }

        /// <summary>Placeholder shield.</summary>
        public Material Shield { get; }

        /// <summary>Grey wolf.</summary>
        public Material Wolf { get; }

        /// <summary>Aether wolf.</summary>
        public Material AetherWolf { get; }

        /// <summary>Crystal core (weak point).</summary>
        public Material Crystal { get; }

        /// <summary>Training dummy.</summary>
        public Material Dummy { get; }

        /// <summary>Arena floor marking.</summary>
        public Material Arena { get; }
    }
}
