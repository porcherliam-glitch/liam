namespace Aetherfall.UI.Screens
{
    /// <summary>The locked-on target as the HUD shows it (top centre: name, health, poise; GDD 05 1.2 boss/target bar).</summary>
    public readonly struct HudTargetInfo
    {
        /// <summary>Changes whenever another target is locked on (the bars snap instead of animating).</summary>
        public readonly int Version;

        /// <summary>Display name, e.g. "Grauwolf" or "Trainingspuppe".</summary>
        public readonly string Name;

        /// <summary>Health 0..1.</summary>
        public readonly float Health01;

        /// <summary>Poise build-up 0..1 (1 = broken).</summary>
        public readonly float Poise01;

        /// <summary>True while the poise is broken (stunned, open for a finisher).</summary>
        public readonly bool PoiseBroken;

        /// <summary>Creates the info.</summary>
        /// <param name="version">Target version.</param>
        /// <param name="name">Display name.</param>
        /// <param name="health01">Health 0..1.</param>
        /// <param name="poise01">Poise build-up 0..1.</param>
        /// <param name="poiseBroken">True while stunned.</param>
        public HudTargetInfo(int version, string name, float health01, float poise01, bool poiseBroken)
        {
            Version = version;
            Name = name ?? string.Empty;
            Health01 = health01;
            Poise01 = poise01;
            PoiseBroken = poiseBroken;
        }
    }
}
