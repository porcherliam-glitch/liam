using System;
using Aetherfall.Core;

namespace Aetherfall.Tests
{
    /// <summary>
    /// Isolates a test from the static <see cref="Log"/> state: resets <see cref="Log"/>, installs a <see cref="FakeLogSink"/>
    /// and, on <see cref="Dispose"/>, resets <see cref="Log"/> again and restores the previous sink.
    /// Create it in <c>[SetUp]</c> and dispose it in <c>[TearDown]</c>.
    /// </summary>
    public sealed class LogCapture : IDisposable
    {
        private readonly ILogSink _previousSink;
        private bool _disposed;

        /// <summary>Starts capturing with default levels (global <see cref="Log.DefaultMinLevel"/>).</summary>
        public LogCapture()
        {
            _previousSink = Log.Sink;
            Log.Reset();
            Sink = new FakeLogSink();
            Log.SetSink(Sink);
        }

        /// <summary>The sink that records all messages during the test.</summary>
        public FakeLogSink Sink { get; }

        /// <summary>Restores the defaults and the sink that was active before.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            Log.Reset();
            Log.SetSink(_previousSink);
        }
    }
}
