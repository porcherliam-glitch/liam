namespace Aetherfall.Stats
{
    /// <summary>
    /// Kind of character a <see cref="StatCollection"/> belongs to. Selects the caps (GDD 03 10.5: the player is capped
    /// at 75 % resistance and 200 status resistance, enemies may reach 90 % and 400). Stored in scenes: never renumber.
    /// </summary>
    public enum StatActorKind
    {
        /// <summary>The player character (caps of GDD 03 10.5).</summary>
        Player = 0,

        /// <summary>A companion (same caps as the player).</summary>
        Companion = 1,

        /// <summary>An enemy (values from type data, wider caps, GDD 03 8.2 and 10.6).</summary>
        Enemy = 2
    }
}
