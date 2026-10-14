namespace Aetherfall.UI.Framework
{
    /// <summary>One discrete focus step (stick, D-pad, WASD or arrow keys after <see cref="NavigationRepeater"/>).</summary>
    public enum NavDirection
    {
        /// <summary>No step.</summary>
        None = 0,

        /// <summary>Up.</summary>
        Up = 1,

        /// <summary>Down.</summary>
        Down = 2,

        /// <summary>Left.</summary>
        Left = 3,

        /// <summary>Right.</summary>
        Right = 4
    }
}
