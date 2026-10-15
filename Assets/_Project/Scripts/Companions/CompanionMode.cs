namespace Aetherfall.Companions
{
    /// <summary>
    /// Combat behaviour of a companion (GDD 03 13.1). The world value <c>stat.begleiter.&lt;name&gt;.kampfmodus</c> stores it;
    /// 0 is the default of Maren (defensive). Values may be stored: never renumber.
    /// </summary>
    public enum CompanionMode
    {
        /// <summary>Fights enemies that attack the player or her; stays within 6 m of the player (Maren's default).</summary>
        Defensive = 0,

        /// <summary>Attacks the player's lock-on target, else the nearest enemy; chases up to 25 m.</summary>
        Aggressive = 1,

        /// <summary>Keeps 6–8 m behind the player and only fights what comes within 4 m of her.</summary>
        Supportive = 2,

        /// <summary>Does not fight, follows 3 m behind; enemies leave her alone.</summary>
        Passive = 3
    }
}
