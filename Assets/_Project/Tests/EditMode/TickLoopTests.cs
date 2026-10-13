using System;
using System.Collections.Generic;
using Aetherfall.Core;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>Unit tests for <see cref="TickLoop"/>, the pure logic behind <see cref="TickRunner"/>.</summary>
    [TestFixture]
    public sealed class TickLoopTests
    {
        private LogCapture _log;
        private List<string> _calls;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _calls = new List<string>();
        }

        [TearDown]
        public void TearDown()
        {
            _log.Dispose();
        }

        [Test]
        public void Tick_CallsAllTickablesInOrderWithDeltaTime()
        {
            var first = new RecordingTickable("first", _calls);
            var second = new RecordingTickable("second", _calls);
            var loop = new TickLoop();
            loop.SetTickables(new ITickable[] { first, null, second });

            loop.Tick(0.5f);

            Assert.That(loop.Count, Is.EqualTo(2), "Null entries are ignored.");
            Assert.That(_calls, Is.EqualTo(new[] { "first", "second" }));
            Assert.That(first.LastDeltaTime, Is.EqualTo(0.5f));
        }

        [Test]
        public void Tick_ThrowingTickable_IsLoggedOnceAndSkippedAfterwards()
        {
            var first = new RecordingTickable("first", _calls);
            var broken = new ThrowingTickable();
            var last = new RecordingTickable("last", _calls);
            var loop = new TickLoop();
            loop.SetTickables(new ITickable[] { first, broken, last });

            loop.Tick(0.1f);
            loop.Tick(0.1f);

            Assert.That(_calls, Is.EqualTo(new[] { "first", "last", "first", "last" }));
            Assert.That(broken.Calls, Is.EqualTo(1));
            Assert.That(loop.IsFaulted(1), Is.True);
            Assert.That(_log.Sink.ErrorCount, Is.EqualTo(1), _log.Sink.Dump());
            Assert.That(_log.Sink.Entries[0].Message, Does.Contain(nameof(ThrowingTickable)));
        }

        [Test]
        public void Clear_StopsTicking()
        {
            var tickable = new RecordingTickable("only", _calls);
            var loop = new TickLoop();
            loop.SetTickables(new ITickable[] { tickable });

            loop.Clear();
            loop.Tick(0.1f);

            Assert.That(loop.Count, Is.EqualTo(0));
            Assert.That(_calls.Count, Is.EqualTo(0));
        }

        [Test]
        public void SetTickables_Null_ResultsInEmptyLoop()
        {
            var loop = new TickLoop();
            loop.SetTickables(null);

            Assert.DoesNotThrow(() => loop.Tick(0.1f));
            Assert.That(loop.Count, Is.EqualTo(0));
        }

        private sealed class RecordingTickable : ITickable
        {
            private readonly string _name;
            private readonly List<string> _calls;

            public RecordingTickable(string name, List<string> calls)
            {
                _name = name;
                _calls = calls;
            }

            public float LastDeltaTime { get; private set; }

            public void Tick(float deltaTime)
            {
                LastDeltaTime = deltaTime;
                _calls.Add(_name);
            }
        }

        private sealed class ThrowingTickable : ITickable
        {
            public int Calls { get; private set; }

            public void Tick(float deltaTime)
            {
                Calls++;
                throw new InvalidOperationException("Test exception in Tick.");
            }
        }
    }
}
