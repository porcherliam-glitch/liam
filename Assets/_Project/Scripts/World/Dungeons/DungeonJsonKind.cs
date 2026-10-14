namespace Aetherfall.World.Dungeons
{
    /// <summary>Kind of a <see cref="DungeonJsonValue"/>.</summary>
    public enum DungeonJsonKind
    {
        /// <summary>The literal <c>null</c>.</summary>
        Null = 0,

        /// <summary><c>true</c> or <c>false</c>.</summary>
        Boolean = 1,

        /// <summary>A number (read as double, invariant culture).</summary>
        Number = 2,

        /// <summary>A string.</summary>
        String = 3,

        /// <summary>An array.</summary>
        Array = 4,

        /// <summary>An object with unique keys.</summary>
        Object = 5
    }
}
