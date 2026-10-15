namespace Aetherfall.UI.Screens
{
    /// <summary>The ranged stance as the HUD shows it (crosshair while aiming, arrows left; GDD 03 6.1, GDD 05 1.2).</summary>
    public readonly struct HudRangedInfo
    {
        /// <summary>True while aiming over the shoulder (the crosshair is shown).</summary>
        public readonly bool Aiming;

        /// <summary>Draw 0–1.</summary>
        public readonly float Draw01;

        /// <summary>Arrows of the selected type in the bag.</summary>
        public readonly int Arrows;

        /// <summary>Name of the selected arrow type, e.g. "Feuerpfeil".</summary>
        public readonly string AmmoName;

        /// <summary>Creates the info.</summary>
        /// <param name="aiming">True while aiming.</param>
        /// <param name="draw01">Draw 0..1.</param>
        /// <param name="arrows">Arrows in the bag.</param>
        /// <param name="ammoName">Name of the selected arrow type.</param>
        public HudRangedInfo(bool aiming, float draw01, int arrows, string ammoName = "")
        {
            Aiming = aiming;
            Draw01 = draw01 < 0f ? 0f : draw01 > 1f ? 1f : draw01;
            Arrows = arrows > 0 ? arrows : 0;
            AmmoName = ammoName ?? string.Empty;
        }
    }
}
