using Aetherfall.World.Dungeons;
using UnityEditor;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Materials of the crypt in <see cref="GruftPaths.MaterialFolder"/> (URP/Lit; glowing parts with emission). Colours come
    /// from the atmosphere of the layout (GDD 05 3.4: dark stone, warm torch light, Aether turquoise #2FE6D6). Existing
    /// materials are reused unchanged.
    /// </summary>
    public sealed class GruftMaterials
    {
        private const string LitShaderName = "Universal Render Pipeline/Lit";
        private const string FallbackShaderName = "Standard";

        private readonly TestGroundReport _report;

        /// <summary>Loads or creates all materials.</summary>
        /// <param name="atmosphere">Colours of the layout.</param>
        /// <param name="report">Protocol.</param>
        public GruftMaterials(DungeonAtmosphere atmosphere, TestGroundReport report)
        {
            _report = report;
            Color stone = Parse(atmosphere.StoneColor, new Color(0.36f, 0.35f, 0.32f));
            Color floor = Parse(atmosphere.FloorColor, new Color(0.27f, 0.26f, 0.24f));
            Color ceiling = Parse(atmosphere.CeilingColor, new Color(0.18f, 0.17f, 0.16f));
            Color torch = Parse(atmosphere.TorchColor, new Color(1f, 0.6f, 0.29f));
            Color aether = Parse(atmosphere.AetherColor, new Color(0.18f, 0.9f, 0.84f));
            Wall = Ensure("Gruft_Wand", stone, Color.black, 0.15f);
            Floor = Ensure("Gruft_Boden", floor, Color.black, 0.1f);
            Ceiling = Ensure("Gruft_Decke", ceiling, Color.black, 0.05f);
            Trim = Ensure("Gruft_Stein_Hell", stone * 1.35f, Color.black, 0.2f);
            Relief = Ensure("Gruft_Relief", new Color(0.62f, 0.58f, 0.5f), Color.black, 0.25f);
            Wood = Ensure("Gruft_Holz", new Color(0.36f, 0.24f, 0.14f), Color.black, 0.15f);
            Iron = Ensure("Gruft_Eisen", new Color(0.3f, 0.31f, 0.33f), Color.black, 0.55f);
            Bone = Ensure("Gruft_Knochen", new Color(0.82f, 0.78f, 0.66f), Color.black, 0.2f);
            Armor = Ensure("Gruft_Ruestung", new Color(0.42f, 0.4f, 0.36f), Color.black, 0.5f);
            KnightArmor = Ensure("Gruft_Ritter", new Color(0.55f, 0.52f, 0.44f), Color.black, 0.6f);
            Cloth = Ensure("Gruft_Stoff", new Color(0.42f, 0.18f, 0.12f), Color.black, 0.05f);
            Soot = Ensure("Gruft_Russ", new Color(0.05f, 0.05f, 0.05f), Color.black, 0.0f);
            Gold = Ensure("Gruft_Gold", new Color(0.85f, 0.66f, 0.25f), Color.black, 0.7f);
            Mirror = Ensure("Gruft_Spiegel", new Color(0.82f, 0.88f, 0.9f), Color.black, 0.95f);
            Flame = Ensure("Gruft_Flamme", torch, torch * 3f, 0f);
            AetherGlow = Ensure("Gruft_Aether", aether, aether * 4f, 0.3f);
            AetherBeam = Ensure("Gruft_Aether_Strahl", aether, aether * 6f, 0f);
            Daylight = Ensure("Gruft_Tageslicht", new Color(0.8f, 0.85f, 1f), new Color(0.8f, 0.85f, 1f) * 1.5f, 0f);
            Nightlight = Ensure("Gruft_Nachtlicht", new Color(0.35f, 0.4f, 0.55f), new Color(0.16f, 0.2f, 0.34f), 0f);
            Npc = Ensure("Gruft_Fenn", new Color(0.45f, 0.36f, 0.25f), Color.black, 0.1f);
        }

        /// <summary>Walls, columns, sarcophagi.</summary>
        public Material Wall { get; }

        /// <summary>Floor slabs.</summary>
        public Material Floor { get; }

        /// <summary>Ceiling slabs.</summary>
        public Material Ceiling { get; }

        /// <summary>Lighter stone (gates, frames, altar).</summary>
        public Material Trim { get; }

        /// <summary>Reliefs, slabs, inscriptions.</summary>
        public Material Relief { get; }

        /// <summary>Wood (chests, lever handles, crates).</summary>
        public Material Wood { get; }

        /// <summary>Iron (portcullis, bars, chests, lever).</summary>
        public Material Iron { get; }

        /// <summary>Bones of the skeletons.</summary>
        public Material Bone { get; }

        /// <summary>Rusty armor of the skeletons.</summary>
        public Material Armor { get; }

        /// <summary>Armor of the knight.</summary>
        public Material KnightArmor { get; }

        /// <summary>Cloth (tabard of the knight).</summary>
        public Material Cloth { get; }

        /// <summary>Soot marks.</summary>
        public Material Soot { get; }

        /// <summary>Gold (seal stone, blade fragment).</summary>
        public Material Gold { get; }

        /// <summary>Mirror glass.</summary>
        public Material Mirror { get; }

        /// <summary>Torch flame (emissive).</summary>
        public Material Flame { get; }

        /// <summary>Aether crack and glow (emissive).</summary>
        public Material AetherGlow { get; }

        /// <summary>Aether beam (strongly emissive).</summary>
        public Material AetherBeam { get; }

        /// <summary>Daylight in the exits.</summary>
        public Material Daylight { get; }

        /// <summary>Exit glow at night (S35).</summary>
        public Material Nightlight { get; }

        /// <summary>The grave robber Fenn.</summary>
        public Material Npc { get; }

        /// <summary>Parses a colour "#RRGGBB".</summary>
        /// <param name="hex">Text.</param>
        /// <param name="fallback">Colour if the text is invalid.</param>
        public static Color Parse(string hex, Color fallback)
        {
            return !string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out Color color) ? color : fallback;
        }

        private Material Ensure(string fileName, Color color, Color emission, float smoothness)
        {
            string path = GruftPaths.MaterialFolder + "/" + fileName + ".mat";
            Material existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null)
            {
                return existing;
            }

            Shader shader = Shader.Find(LitShaderName);
            if (shader == null)
            {
                _report.Warning("Shader „" + LitShaderName + "“ nicht gefunden (URP fehlt?). " + fileName + " nutzt „" + FallbackShaderName + "“.");
                shader = Shader.Find(FallbackShaderName);
            }

            var material = new Material(shader) { name = fileName };
            color.a = 1f;
            if (material.HasProperty("_BaseColor"))
            {
                material.SetColor("_BaseColor", color);
            }

            if (material.HasProperty("_Color"))
            {
                material.SetColor("_Color", color);
            }

            if (material.HasProperty("_Smoothness"))
            {
                material.SetFloat("_Smoothness", smoothness);
            }

            if (emission.maxColorComponent > 0f && material.HasProperty("_EmissionColor"))
            {
                material.EnableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", emission);
                material.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            }

            AssetDatabase.CreateAsset(material, path);
            _report.Info("Material angelegt: " + path);
            return material;
        }
    }
}
