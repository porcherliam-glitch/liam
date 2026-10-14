using System.Collections.Generic;
using UnityEngine;
using D = Aetherfall.EditorTools.Narrative.MiniSliceDialogueLibrary;
using Q = Aetherfall.EditorTools.Narrative.MiniSliceQuestLibrary;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Simple people of the Eichental built from primitives (legs or dress, torso, arms, head, hair, eyes) with one look per
    /// NPC: clothing colours after role and GDD 01 4.1.3 (smith with leather apron, baker with white apron, farmer with straw
    /// hat, captain in armour with a silver tabard, the grey figure in a hooded cloak, children smaller). A stand-in until the
    /// Blender models (Mini-Slice step 7); the pivot stays on the ground, the front is +Z.
    /// </summary>
    public static class VillagerFigures
    {
        /// <summary>Height of an adult figure in metres (scale 1).</summary>
        public const float AdultHeight = 1.75f;

        private static readonly Dictionary<string, Look> Looks = new Dictionary<string, Look>
        {
            [Q.Hedda] = new Look(Garment.Dress, "6E5A3C", "4F6B3A", "9A948C", "E0B49A") { Shawl = "C8B48C" },
            [D.Tobold] = new Look(Garment.Trousers, "8A7A64", "4A3A2A", "3A2A1E", "D9A07E") { Scale = 1.06f, Apron = "5A3A22", Beard = true },
            [D.Wenna] = new Look(Garment.Dress, "B07A3A", "B07A3A", "7A3A1E", "E8BFA0") { Apron = "E8E2D2" },
            [D.Lina] = new Look(Garment.Dress, "7FA3C4", "7FA3C4", "C9A45A", "EBC6AA") { Scale = 0.8f, Floating = true },
            [D.GreyFigure] = new Look(Garment.Cloak, "6B6B6E", "6B6B6E", "6B6B6E", "2A2A2E") { Scale = 1.08f, Hood = true },
            [Q.Hollmann] = new Look(Garment.Trousers, "7A8A5A", "5A4A32", "6A4A2A", "D9A07E") { StrawHat = true, Beard = true },
            [D.Pim] = new Look(Garment.Trousers, "9A6A4A", "4A4A5A", "6A4A2A", "EBA090") { Scale = 0.62f },
            [D.Ulf] = new Look(Garment.Trousers, "D8D0C0", "3A3A3A", null, "E0A888") { Scale = 1.02f, Apron = "8A7A5A", Beard = true, Stout = true },
            [Q.Corvin] = new Look(Garment.Robe, "2E3A5E", "2E3A5E", "222222", "E0B49A") { Shawl = "8C7A4A" },
            [Q.Dorn] = new Look(Garment.Trousers, "8C9096", "3A3A44", "4A4A4A", "D9A07E") { Armour = "C8CCD4" },
            [D.Brenner] = new Look(Garment.Trousers, "CFC6B0", "6A5A44", "8A8680", "E0B49A") { Cap = "E0DACA" },
            [D.Liese] = new Look(Garment.Dress, "8A4A5A", "8A4A5A", "A07A4A", "EBC6AA") { Apron = "D8CFBA" }
        };

        private enum Garment
        {
            Trousers,
            Dress,
            Robe,
            Cloak
        }

        /// <summary>Height of the figure of an NPC (for name signs).</summary>
        /// <param name="npcId">NPC id.</param>
        public static float Height(string npcId)
        {
            Look look = For(npcId);
            return AdultHeight * look.Scale + (look.Floating ? FloatHeight : 0f);
        }

        private const float FloatHeight = 0.45f;

        /// <summary>Builds the figure of an NPC under <paramref name="root"/> (unknown NPCs get a plain villager).</summary>
        /// <param name="root">NPC root (pivot on the ground).</param>
        /// <param name="npcId">NPC id.</param>
        /// <param name="materials">Materials of the Eichental.</param>
        /// <param name="withCollider">False for NPCs inside a building (no collider in the walls).</param>
        public static void Build(Transform root, string npcId, EichentalMaterials materials, bool withCollider)
        {
            Look look = For(npcId);
            var figure = new GameObject("Figur").transform;
            figure.SetParent(root, false);
            figure.localPosition = new Vector3(0f, look.Floating ? FloatHeight : 0f, 0f);
            figure.localScale = Vector3.one * look.Scale;

            Material skin = Cloth(materials, look.Skin);
            Material top = look.Floating ? materials.Glow("aether", 0.6f) : Cloth(materials, look.Top);
            Material bottom = look.Floating ? top : Cloth(materials, look.Bottom);
            Material dark = Cloth(materials, "2A221C");
            float width = look.Stout ? 1.18f : 1f;

            // Legs, dress, robe or cloak.
            if (look.Garment == Garment.Trousers)
            {
                for (int side = -1; side <= 1; side += 2)
                {
                    Part(figure, "Bein", PrimitiveType.Cube, new Vector3(0.1f * side, 0.47f, 0f), new Vector3(0.15f, 0.78f, 0.17f), bottom);
                    Part(figure, "Schuh", PrimitiveType.Cube, new Vector3(0.1f * side, 0.04f, 0.03f), new Vector3(0.15f, 0.08f, 0.25f), dark);
                }
            }
            else
            {
                bool toGround = look.Garment != Garment.Dress;
                float hem = toGround ? 0.02f : 0.1f;
                float diameter = look.Garment == Garment.Cloak ? 0.6f : look.Garment == Garment.Robe ? 0.5f : 0.46f;
                float height = 0.98f - hem;
                Part(figure, look.Garment == Garment.Cloak ? "Mantel" : look.Garment == Garment.Robe ? "Robe" : "Rock", PrimitiveType.Cylinder,
                    new Vector3(0f, hem + height * 0.5f, 0f), new Vector3(diameter * width, height * 0.5f, diameter * 0.82f), bottom);
                if (!toGround)
                {
                    for (int side = -1; side <= 1; side += 2)
                    {
                        Part(figure, "Schuh", PrimitiveType.Cube, new Vector3(0.09f * side, 0.04f, 0.04f), new Vector3(0.13f, 0.08f, 0.22f), dark);
                    }
                }
            }

            // Torso, belt, arms with hands.
            Material torso = look.Armour != null ? materials.Fixed("npc_metal_" + look.Top, Hex(look.Top), 0.55f, 0.7f) : top;
            Part(figure, "Oberkörper", PrimitiveType.Cube, new Vector3(0f, 1.17f, 0f), new Vector3(0.44f * width, 0.58f, 0.26f * width), torso);
            Part(figure, "Gürtel", PrimitiveType.Cube, new Vector3(0f, 0.9f, 0f), new Vector3(0.46f * width, 0.06f, 0.28f * width), dark);
            for (int side = -1; side <= 1; side += 2)
            {
                float x = (0.22f * width + 0.07f) * side;
                Part(figure, "Arm", PrimitiveType.Cube, new Vector3(x, 1.15f, 0f), new Vector3(0.12f, 0.56f, 0.14f), torso);
                Part(figure, "Hand", PrimitiveType.Cube, new Vector3(x, 0.83f, 0f), new Vector3(0.1f, 0.11f, 0.1f), skin);
            }

            // Head, eyes, hair and what is worn on it.
            Part(figure, "Kopf", PrimitiveType.Sphere, new Vector3(0f, 1.62f, 0f), new Vector3(0.26f, 0.27f, 0.26f), skin);
            if (!look.Hood)
            {
                for (int side = -1; side <= 1; side += 2)
                {
                    Part(figure, "Auge", PrimitiveType.Cube, new Vector3(0.05f * side, 1.64f, 0.122f), new Vector3(0.04f, 0.035f, 0.02f), dark);
                }
            }

            if (look.Hair != null && !look.Hood)
            {
                Part(figure, "Haare", PrimitiveType.Sphere, new Vector3(0f, 1.68f, -0.02f), new Vector3(0.28f, 0.2f, 0.28f), Cloth(materials, look.Hair));
            }

            if (look.Beard)
            {
                Part(figure, "Bart", PrimitiveType.Cube, new Vector3(0f, 1.54f, 0.1f), new Vector3(0.18f, 0.1f, 0.07f), Cloth(materials, look.Hair ?? "6A4A2A"));
            }

            if (look.Hood)
            {
                Part(figure, "Kapuze", PrimitiveType.Sphere, new Vector3(0f, 1.65f, -0.05f), new Vector3(0.34f, 0.36f, 0.34f), bottom);
            }

            if (look.StrawHat)
            {
                Material straw = Cloth(materials, "C8B068");
                Part(figure, "Hutkrempe", PrimitiveType.Cylinder, new Vector3(0f, 1.75f, 0f), new Vector3(0.46f, 0.012f, 0.46f), straw);
                Part(figure, "Hut", PrimitiveType.Cylinder, new Vector3(0f, 1.8f, 0f), new Vector3(0.26f, 0.05f, 0.26f), straw);
            }

            if (look.Cap != null)
            {
                Part(figure, "Mütze", PrimitiveType.Sphere, new Vector3(0f, 1.73f, -0.01f), new Vector3(0.28f, 0.13f, 0.28f), Cloth(materials, look.Cap));
            }

            // Apron, shawl, tabard and shoulder plates.
            if (look.Apron != null)
            {
                Part(figure, "Schürze", PrimitiveType.Cube, new Vector3(0f, 0.92f, 0.15f * width), new Vector3(0.38f * width, 0.66f, 0.02f), Cloth(materials, look.Apron));
            }

            if (look.Shawl != null)
            {
                Part(figure, "Tuch", PrimitiveType.Cube, new Vector3(0f, 1.38f, 0f), new Vector3(0.48f, 0.14f, 0.3f), Cloth(materials, look.Shawl));
            }

            if (look.Armour != null)
            {
                Part(figure, "Wappenrock", PrimitiveType.Cube, new Vector3(0f, 1.0f, 0.14f), new Vector3(0.3f, 0.74f, 0.02f), Cloth(materials, look.Armour));
                for (int side = -1; side <= 1; side += 2)
                {
                    Part(figure, "Schulterplatte", PrimitiveType.Sphere, new Vector3(0.27f * side, 1.43f, 0f), new Vector3(0.2f, 0.14f, 0.22f), torso);
                }
            }

            if (withCollider)
            {
                var body = new GameObject("Körper");
                body.transform.SetParent(root, false);
                CapsuleCollider capsule = body.AddComponent<CapsuleCollider>();
                capsule.height = AdultHeight * look.Scale;
                capsule.radius = 0.3f * Mathf.Max(0.7f, look.Scale);
                capsule.center = new Vector3(0f, figure.localPosition.y + capsule.height * 0.5f, 0f);
            }
        }

        private static Look For(string npcId)
        {
            return npcId != null && Looks.TryGetValue(npcId, out Look look) ? look : new Look(Garment.Trousers, "7A6A52", "4A4036", "5A4030", "D9A07E");
        }

        private static Material Cloth(EichentalMaterials materials, string hex)
        {
            return materials.Fixed("npc_" + hex, Hex(hex), 0.15f);
        }

        private static Color Hex(string hex)
        {
            return ColorUtility.TryParseHtmlString("#" + hex, out Color color) ? color : Color.grey;
        }

        private static void Part(Transform parent, string name, PrimitiveType type, Vector3 position, Vector3 scale, Material material)
        {
            GameObject part = GameObject.CreatePrimitive(type);
            part.name = name;
            part.transform.SetParent(parent, false);
            part.transform.localPosition = position;
            part.transform.localScale = scale;
            Object.DestroyImmediate(part.GetComponent<Collider>());
            part.GetComponent<MeshRenderer>().sharedMaterial = material;
        }

        private sealed class Look
        {
            public Look(Garment garment, string top, string bottom, string hair, string skin)
            {
                Garment = garment;
                Top = top;
                Bottom = bottom;
                Hair = hair;
                Skin = skin;
            }

            public Garment Garment { get; }

            public string Top { get; }

            public string Bottom { get; }

            public string Hair { get; }

            public string Skin { get; }

            public float Scale { get; set; } = 1f;

            public string Apron { get; set; }

            public string Shawl { get; set; }

            public string Armour { get; set; }

            public string Cap { get; set; }

            public bool Beard { get; set; }

            public bool Hood { get; set; }

            public bool StrawHat { get; set; }

            public bool Stout { get; set; }

            public bool Floating { get; set; }
        }
    }
}
