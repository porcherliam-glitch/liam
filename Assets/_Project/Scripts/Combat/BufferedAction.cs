namespace Aetherfall.Combat
{
    /// <summary>A combat input kept in the <see cref="InputBuffer"/> (GDD 03 4.4).</summary>
    public enum BufferedAction
    {
        /// <summary>Nothing buffered.</summary>
        None = 0,

        /// <summary>Light attack (buffer 200 ms).</summary>
        LightAttack = 1,

        /// <summary>Heavy attack (buffer 200 ms).</summary>
        HeavyAttack = 2,

        /// <summary>Dodge (buffer 150 ms, overrides attacks).</summary>
        Dodge = 3,

        /// <summary>Block press = parry attempt (buffer 150 ms, overrides attacks).</summary>
        Parry = 4
    }
}
