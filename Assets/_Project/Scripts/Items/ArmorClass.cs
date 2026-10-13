namespace Aetherfall.Items
{
    /// <summary>
    /// Armor classes (GDD 03 3.2, GDD 04 K30): cloth light, leather medium, plate heavy; cloaks are classless. Values are
    /// stored in assets: never renumber.
    /// </summary>
    public enum ArmorClass
    {
        /// <summary>Classless (cloak, not armor).</summary>
        None = 0,

        /// <summary>Light (German "Stoff").</summary>
        Light = 1,

        /// <summary>Medium (German "Leder").</summary>
        Medium = 2,

        /// <summary>Heavy (German "Platte").</summary>
        Heavy = 3
    }
}
