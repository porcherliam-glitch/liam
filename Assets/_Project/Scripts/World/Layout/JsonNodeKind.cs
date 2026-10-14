namespace Aetherfall.World
{
    /// <summary>Kind of a value in a parsed JSON document (<see cref="JsonNode"/>).</summary>
    public enum JsonNodeKind
    {
        /// <summary><c>null</c>.</summary>
        Null = 0,

        /// <summary><c>true</c> or <c>false</c>.</summary>
        Boolean = 1,

        /// <summary>Number (always read as double).</summary>
        Number = 2,

        /// <summary>String.</summary>
        String = 3,

        /// <summary>Array.</summary>
        Array = 4,

        /// <summary>Object with named members.</summary>
        Object = 5
    }
}
