using Aetherfall.Player;
using UnityEngine;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Looks of the five warrior techniques (GDD 03 11.4): a ring of steel-coloured sparks for the Wirbelklinge, a burst of
    /// sparks in front for the Schildschlag, a red (Spott) or golden (Kriegsschrei) shock wave that runs over the ground, and a
    /// ring of dust for the Fußfeger. Built with the helpers of <see cref="SpellVisualsBuilder"/>.
    /// </summary>
    public static class TechniqueVisualsBuilder
    {
        private static readonly Color Steel = new Color(0.92f, 0.95f, 1f);
        private static readonly Color SteelDeep = new Color(0.55f, 0.65f, 0.8f);
        private static readonly Color Spark = new Color(1f, 0.9f, 0.55f);
        private static readonly Color SparkDeep = new Color(1f, 0.55f, 0.2f);
        private static readonly Color TauntRed = new Color(1f, 0.35f, 0.25f);
        private static readonly Color TauntDeep = new Color(0.7f, 0.1f, 0.05f);
        private static readonly Color CryGold = new Color(1f, 0.85f, 0.4f);
        private static readonly Color CryDeep = new Color(0.85f, 0.55f, 0.15f);
        private static readonly Color Dust = new Color(0.75f, 0.68f, 0.55f, 0.8f);
        private static readonly Color DustDeep = new Color(0.45f, 0.4f, 0.32f, 0.6f);

        /// <summary>Builds the look of one technique (by id) under the player; null for an unknown id.</summary>
        /// <param name="player">Player root.</param>
        /// <param name="abilityId">Technique id (<see cref="TechniqueAssets"/>).</param>
        /// <param name="report">Protocol.</param>
        public static AbilityVisual Build(Transform player, string abilityId, TestGroundReport report)
        {
            switch (abilityId)
            {
                case TechniqueAssets.Whirl:
                    return Ring(player, "Technik_Wirbelklinge", Steel, SteelDeep, 0.9f, 7f, 10f, 160, 0.25f, report);
                case TechniqueAssets.ShieldBash:
                    return ShieldBash(player, report);
                case TechniqueAssets.Taunt:
                    return Shout(player, "Technik_Spott", TauntRed, TauntDeep, 22f, report);
                case TechniqueAssets.WarCry:
                    return Shout(player, "Technik_Kriegsschrei", CryGold, CryDeep, 18f, report);
                case TechniqueAssets.Sweep:
                    return Ring(player, "Technik_Fussfeger", Dust, DustDeep, 0.15f, 5f, 8f, 140, 0.6f, report);
                default:
                    return null;
            }
        }

        private static AbilityVisual Ring(Transform player, string name, Color bright, Color deep, float height, float speedMin, float speedMax, int count,
            float size, TestGroundReport report)
        {
            AbilityVisual visual = SpellVisualsBuilder.Root(player, name, out GameObject root);
            ParticleSystem ring = SpellVisualsBuilder.Burst(root.transform, "Ring", bright, deep, 0.25f, 0.4f, speedMin, speedMax, size * 0.5f, size, count,
                ParticleSystemShapeType.Circle, 0.5f, report);
            ring.transform.localPosition = new Vector3(0f, height, 0f);
            ring.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);
            ParticleSystem.ShapeModule shape = ring.shape;
            shape.radiusThickness = 0f;
            TestGroundFields.SetReference(visual, "castEffect", ring, report);
            return visual;
        }

        private static AbilityVisual ShieldBash(Transform player, TestGroundReport report)
        {
            AbilityVisual visual = SpellVisualsBuilder.Root(player, "Technik_Schildschlag", out GameObject root);
            ParticleSystem burst = SpellVisualsBuilder.Burst(root.transform, "Funken", Spark, SparkDeep, 0.2f, 0.4f, 4f, 9f, 0.08f, 0.2f, 70,
                ParticleSystemShapeType.Cone, 0.3f, report);
            burst.transform.localPosition = new Vector3(0f, 1.1f, 0.7f);
            TestGroundFields.SetReference(visual, "castEffect", burst, report);
            TestGroundFields.SetReference(visual, "flash", SpellVisualsBuilder.Flash(root.transform, Spark, 6f, 4f), report);
            return visual;
        }

        private static AbilityVisual Shout(Transform player, string name, Color bright, Color deep, float speed, TestGroundReport report)
        {
            AbilityVisual visual = SpellVisualsBuilder.Root(player, name, out GameObject root);
            ParticleSystem wave = SpellVisualsBuilder.Burst(root.transform, "Welle", bright, deep, 0.4f, 0.5f, speed * 0.9f, speed, 0.35f, 0.7f, 200,
                ParticleSystemShapeType.Circle, 0.6f, report);
            wave.transform.localPosition = new Vector3(0f, 0.3f, 0f);
            wave.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);
            ParticleSystem.ShapeModule shape = wave.shape;
            shape.radiusThickness = 0f;
            TestGroundFields.SetReference(visual, "castEffect", wave, report);
            ParticleSystem glow = SpellVisualsBuilder.Burst(root.transform, "Schrei", bright, deep, 0.3f, 0.5f, 1f, 3f, 0.3f, 0.6f, 1,
                ParticleSystemShapeType.Sphere, 0.4f, report);
            glow.transform.localPosition = new Vector3(0f, 1.6f, 0f);
            TestGroundFields.SetReference(visual, "impactEffect", glow, report);
            TestGroundFields.SetInt(visual, "impactParticles", 30, report);
            TestGroundFields.SetReference(visual, "flash", SpellVisualsBuilder.Flash(root.transform, bright, 10f, 4f), report);
            return visual;
        }
    }
}
