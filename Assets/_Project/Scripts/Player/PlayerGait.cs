namespace Aetherfall.Player
{
    /// <summary>Ground gait of the player (GDD 03 3.1). Drives the target speed and, later, the locomotion animation.</summary>
    public enum PlayerGait
    {
        /// <summary>No movement input.</summary>
        Idle = 0,

        /// <summary>Walking: stick below 50 % or walk mode (Caps Lock), 2.0 m/s.</summary>
        Walk = 1,

        /// <summary>Running: stick at 50 % or more, 5.0 m/s.</summary>
        Run = 2,

        /// <summary>Sprinting, 7.0 m/s; costs 12 stamina per second, starts only with at least 10 stamina.</summary>
        Sprint = 3,

        /// <summary>Sneaking, 1.8 m/s.</summary>
        Sneak = 4
    }
}
