namespace Aetherfall.Combat
{
    /// <summary>Stages of the player's Aether corruption bar (GDD 01 A3): 0–24, 25–49, 50–74, 75–99, 100.</summary>
    public enum CorruptionStage
    {
        /// <summary>Rein, 0–24: nothing.</summary>
        Pure = 0,

        /// <summary>Berührt, 25–49: +5 % Aether damage, −5 % healing.</summary>
        Touched = 1,

        /// <summary>Durchdrungen, 50–74: +10 % Aether damage, −10 % healing and stamina regeneration.</summary>
        Permeated = 2,

        /// <summary>Gezeichnet, 75–99: +15 % Aether damage, −15 % healing.</summary>
        Marked = 3,

        /// <summary>Überflutet, 100: 20 s +25 % Aether damage and 2 % max health per second, then the bar falls to 60.</summary>
        Flooded = 4
    }
}
