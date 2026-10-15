namespace Aetherfall.Combat
{
    /// <summary>German names of the status effects and corruption stages for the HUD and debug views. TODO (localization step): string table keys.</summary>
    public static class StatusEffectNames
    {
        /// <summary>Name of an effect.</summary>
        /// <param name="effect">Effect.</param>
        public static string German(StatusEffectId effect)
        {
            switch (effect)
            {
                case StatusEffectId.Burning: return "Brennen";
                case StatusEffectId.Freezing: return "Frieren";
                case StatusEffectId.Shock: return "Schock";
                case StatusEffectId.Poison: return "Gift";
                case StatusEffectId.Bleeding: return "Blutung";
                case StatusEffectId.Stun: return "Betäubt";
                case StatusEffectId.Curse: return "Verflucht";
                case StatusEffectId.AetherCorruption: return "Verderbnis";
                default: return "–";
            }
        }

        /// <summary>Name of a corruption stage (GDD 01 A3).</summary>
        /// <param name="stage">Stage.</param>
        public static string German(CorruptionStage stage)
        {
            switch (stage)
            {
                case CorruptionStage.Touched: return "Berührt";
                case CorruptionStage.Permeated: return "Durchdrungen";
                case CorruptionStage.Marked: return "Gezeichnet";
                case CorruptionStage.Flooded: return "Überflutet";
                default: return "Rein";
            }
        }
    }
}
