using System;

namespace Aetherfall.Core
{
    /// <summary>
    /// Output target of the <see cref="Log"/> facade (e.g. the Unity console, an in-game console or a file).
    /// <see cref="Log"/> only calls a sink for messages that passed the level filter.
    /// </summary>
    /// <remarks>
    /// Implementations must not throw and must be safe to call from background threads,
    /// because <see cref="Log"/> may be used from <c>Awaitable.BackgroundThreadAsync</c> code (e.g. saving).
    /// </remarks>
    public interface ILogSink
    {
        /// <summary>Writes one message.</summary>
        /// <param name="level">Severity of the message (never <see cref="LogLevel.Off"/>).</param>
        /// <param name="category">Category of the message.</param>
        /// <param name="message">Message text without category prefix. May be empty, never null.</param>
        /// <param name="exception">Optional exception that belongs to the message, otherwise null.</param>
        void Write(LogLevel level, LogCategory category, string message, Exception exception);
    }
}
