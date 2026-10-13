using System;
using Aetherfall.Core;

namespace Aetherfall.Tests
{
    /// <summary>One message recorded by <see cref="FakeLogSink"/>.</summary>
    public readonly struct CapturedLogEntry
    {
        /// <summary>Creates an entry.</summary>
        /// <param name="level">Level of the message.</param>
        /// <param name="category">Category of the message.</param>
        /// <param name="message">Message text.</param>
        /// <param name="exception">Attached exception or null.</param>
        public CapturedLogEntry(LogLevel level, LogCategory category, string message, Exception exception)
        {
            Level = level;
            Category = category;
            Message = message;
            Exception = exception;
        }

        /// <summary>Level of the message.</summary>
        public LogLevel Level { get; }

        /// <summary>Category of the message.</summary>
        public LogCategory Category { get; }

        /// <summary>Message text.</summary>
        public string Message { get; }

        /// <summary>Attached exception or null.</summary>
        public Exception Exception { get; }

        /// <inheritdoc />
        public override string ToString()
        {
            return "[" + Level + "][" + Category + "] " + Message;
        }
    }
}
