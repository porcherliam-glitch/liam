using System;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// The layout file cannot be read: broken JSON (with line and column) or a missing or wrongly typed field (with its path).
    /// The message is German, because the editor menu shows it to the client.
    /// </summary>
    public sealed class DungeonLayoutException : Exception
    {
        /// <summary>Creates the exception.</summary>
        /// <param name="message">German message.</param>
        public DungeonLayoutException(string message) : base(message)
        {
        }

        /// <summary>Creates the exception with an inner cause.</summary>
        /// <param name="message">German message.</param>
        /// <param name="inner">Cause.</param>
        public DungeonLayoutException(string message, Exception inner) : base(message, inner)
        {
        }
    }
}
