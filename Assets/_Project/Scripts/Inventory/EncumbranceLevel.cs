namespace Aetherfall.Inventory
{
    /// <summary>Load stages of GDD 04 1.3 (load ÷ carry capacity).</summary>
    public enum EncumbranceLevel
    {
        /// <summary>Up to 90 %: no effect (German "Normal").</summary>
        Normal = 0,

        /// <summary>Above 90 to 100 %: no penalty, auto pickup only takes gold, quest items and keys (German "Fast voll").</summary>
        AlmostFull = 1,

        /// <summary>Above 100 to 125 %: max. 3 m/s, no sprint, only a dodge step, no fast travel, stamina regeneration −25 % (German "Ueberladen").</summary>
        Overloaded = 2,

        /// <summary>Above 125 %: max. 1.5 m/s, no jumping, stamina regeneration −50 % (German "Schwer ueberladen").</summary>
        HeavilyOverloaded = 3
    }
}
