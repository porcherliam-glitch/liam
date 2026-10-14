namespace Aetherfall.WorldState
{
    /// <summary>Stored value of a flag plus the active playtime of its last change (architecture 8.1, for <c>FlagAge</c>).</summary>
    public readonly struct FlagValue
    {
        /// <summary>Value.</summary>
        public readonly int Value;

        /// <summary>Active playtime in seconds when the value was last changed.</summary>
        public readonly double ChangedAtPlaytime;

        /// <summary>Creates the value.</summary>
        /// <param name="value">Value.</param>
        /// <param name="changedAtPlaytime">Playtime of the change in seconds.</param>
        public FlagValue(int value, double changedAtPlaytime)
        {
            Value = value;
            ChangedAtPlaytime = changedAtPlaytime;
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return Value + " @" + ChangedAtPlaytime.ToString("0.0") + " s";
        }
    }
}
