using System.Collections.Generic;
using Aetherfall.Combat;
using UnityEngine;
using D = Aetherfall.EditorTools.Narrative.MiniSliceDialogueLibrary;
using Q = Aetherfall.EditorTools.Narrative.MiniSliceQuestLibrary;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// The people of the Eichental: one base villager from Blender (<see cref="CharacterModels.Villager"/>) with one look per NPC
    /// after role and GDD 01 4.1.3. The look keeps the optional pieces the person wears (smith with leather apron and beard,
    /// baker with white apron, farmer with straw hat, miller with cap, captain in armour with a silver tabard, scholar in a
    /// robe, the grey figure in a hooded cloak) and colours the material slots of the model; children are smaller, Lina floats
    /// in the light of the rift. <see cref="HumanoidPuppet"/> lets them breathe. Pivot on the ground, front +Z.
    /// </summary>
    public static class VillagerFigures
    {
        /// <summary>Height of an adult figure in metres (scale 1).</summary>
        public const float AdultHeight = 1.75f;

        private const float FloatHeight = 0.45f;

        private const string Dark = "2A221C";

        private static readonly Dictionary<string, Look> Looks = new Dictionary<string, Look>
        {
            [Q.Hedda] = new Look(Garment.Dress, "6E5A3C", "4F6B3A", "9A948C", "E0B49A") { Shawl = "C8B48C" },
            [D.Tobold] = new Look(Garment.Trousers, "8A7A64", "4A3A2A", "3A2A1E", "D9A07E") { Scale = 1.06f, Apron = "5A3A22", Beard = true },
            [D.Wenna] = new Look(Garment.Dress, "B07A3A", "B07A3A", "7A3A1E", "E8BFA0") { Apron = "E8E2D2" },
            [D.Lina] = new Look(Garment.Dress, "7FA3C4", "7FA3C4", "C9A45A", "EBC6AA") { Scale = 0.8f, Floating = true },
            [D.GreyFigure] = new Look(Garment.Cloak, "6B6B6E", "6B6B6E", null, "2A2A2E") { Scale = 1.08f, Hood = true },
            [Q.Hollmann] = new Look(Garment.Trousers, "7A8A5A", "5A4A32", "6A4A2A", "D9A07E") { StrawHat = true, Beard = true },
            [D.Pim] = new Look(Garment.Trousers, "9A6A4A", "4A4A5A", "6A4A2A", "EBA090") { Scale = 0.62f },
            [D.Ulf] = new Look(Garment.Trousers, "D8D0C0", "3A3A3A", null, "E0A888") { Scale = 1.02f, Apron = "8A7A5A", Beard = true, Stout = true },
            [Q.Corvin] = new Look(Garment.Robe, "2E3A5E", "2E3A5E", "222222", "E0B49A") { Shawl = "8C7A4A" },
            [Q.Dorn] = new Look(Garment.Trousers, "8C9096", "3A3A44", "4A4A4A", "D9A07E") { Armour = "C8CCD4" },
            [D.Brenner] = new Look(Garment.Trousers, "CFC6B0", "6A5A44", "8A8680", "E0B49A") { Cap = "E0DACA" },
            [D.Liese] = new Look(Garment.Dress, "8A4A5A", "8A4A5A", "A07A4A", "EBC6AA") { Apron = "D8CFBA" },
            // Ser Maren Falkenried: plate over a dark blue gambeson, silver tabard of the Silberwacht, auburn braid.
            [D.Maren] = new Look(Garment.Trousers, "9AA0A8", "26304A", "8A4A2A", "E8BFA0") { Armour = "D8DCE4", Braid = true, Scale = 1.03f }
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

        /// <summary>Builds the figure of an NPC under <paramref name="root"/> (unknown NPCs get a plain villager).</summary>
        /// <param name="root">NPC root (pivot on the ground).</param>
        /// <param name="npcId">NPC id.</param>
        /// <param name="materials">Materials of the Eichental.</param>
        /// <param name="withCollider">False for NPCs inside a building (no collider in the walls).</param>
        /// <param name="report">Protocol.</param>
        /// <returns>The figure (with <see cref="HumanoidPuppet"/>), or null if the model is missing.</returns>
        public static Transform Build(Transform root, string npcId, EichentalMaterials materials, bool withCollider, TestGroundReport report)
        {
            Look look = For(npcId);
            Transform figure = CharacterModels.Instantiate(CharacterModels.Villager, root, "Figur", root.gameObject.layer, report);
            if (figure == null)
            {
                return null;
            }

            figure.localPosition = new Vector3(0f, look.Floating ? FloatHeight : 0f, 0f);
            figure.localScale = new Vector3(look.Scale * (look.Stout ? 1.12f : 1f), look.Scale, look.Scale * (look.Stout ? 1.1f : 1f));
            KeepPieces(figure, look);
            Colour(figure, look, materials);
            HumanoidPuppet puppet = figure.gameObject.AddComponent<HumanoidPuppet>();
            puppet.BindByName(figure);

            if (withCollider)
            {
                var body = new GameObject("Körper");
                body.transform.SetParent(root, false);
                CapsuleCollider capsule = body.AddComponent<CapsuleCollider>();
                capsule.height = AdultHeight * look.Scale;
                capsule.radius = 0.3f * Mathf.Max(0.7f, look.Scale);
                capsule.center = new Vector3(0f, figure.localPosition.y + capsule.height * 0.5f, 0f);
            }

            return figure;
        }

        private static void KeepPieces(Transform figure, Look look)
        {
            bool hair = look.Hair != null && !look.Hood;
            var wanted = new HashSet<string>
            {
                hair ? "Acc_Haare" : string.Empty,
                hair && (look.Garment == Garment.Dress || look.Braid) ? "Acc_Zopf" : string.Empty,
                look.Hair == null && !look.Hood ? "Acc_Haarkranz" : string.Empty,
                look.Beard ? "Acc_Bart" : string.Empty,
                look.StrawHat ? "Acc_Strohhut" : string.Empty,
                look.Cap != null ? "Acc_Muetze" : string.Empty,
                look.Hood ? "Acc_Kapuze" : string.Empty,
                look.Apron != null ? "Acc_Schuerze" : string.Empty,
                look.Apron != null ? "Acc_Latz" : string.Empty,
                look.Shawl != null ? "Acc_Tuch" : string.Empty,
                look.Garment == Garment.Dress ? "Acc_Rock" : string.Empty,
                look.Garment == Garment.Robe ? "Acc_Robe" : string.Empty,
                look.Garment == Garment.Cloak ? "Acc_Mantel" : string.Empty,
                look.Armour != null ? "Acc_Wappenrock" : string.Empty,
                look.Armour != null ? "Acc_Ruestung" : string.Empty
            };

            foreach (Transform part in figure.GetComponentsInChildren<Transform>(true))
            {
                if (part != null && part.name.StartsWith("Acc_", System.StringComparison.Ordinal) && !wanted.Contains(part.name))
                {
                    Object.DestroyImmediate(part.gameObject);
                }
            }
        }

        private static void Colour(Transform figure, Look look, EichentalMaterials materials)
        {
            Material glow = look.Floating ? materials.Glow("aether", 0.6f) : null;
            string accent = look.Shawl ?? look.Cap ?? look.Armour ?? (look.StrawHat ? "C8B068" : look.Bottom);
            foreach (Renderer part in figure.GetComponentsInChildren<Renderer>(true))
            {
                Material[] slots = part.sharedMaterials;
                for (int i = 0; i < slots.Length; i++)
                {
                    string slot = slots[i] != null ? slots[i].name : string.Empty;
                    switch (slot)
                    {
                        case "Dorf_Haut":
                            slots[i] = Cloth(materials, look.Skin);
                            break;
                        case "Dorf_Haare":
                            slots[i] = Cloth(materials, look.Hair ?? "6A4A2A");
                            break;
                        case "Dorf_Oberteil":
                        case "Dorf_Aermel":
                            slots[i] = glow != null ? glow : Cloth(materials, look.Top);
                            break;
                        case "Dorf_Unterteil":
                            slots[i] = glow != null ? glow : Cloth(materials, look.Bottom);
                            break;
                        case "Dorf_Schuhe":
                        case "Dorf_Guertel":
                            slots[i] = Cloth(materials, Dark);
                            break;
                        case "Dorf_Schuerze":
                            slots[i] = Cloth(materials, look.Apron ?? look.Top);
                            break;
                        case "Dorf_Akzent":
                            slots[i] = Cloth(materials, accent);
                            break;
                        case "Dorf_Metall":
                            slots[i] = materials.Fixed("npc_metal_" + look.Top, Hex(look.Top), 0.55f, 0.7f);
                            break;
                    }
                }

                part.sharedMaterials = slots;
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

            public bool Braid { get; set; }

            public bool Hood { get; set; }

            public bool StrawHat { get; set; }

            public bool Stout { get; set; }

            public bool Floating { get; set; }
        }
    }
}
