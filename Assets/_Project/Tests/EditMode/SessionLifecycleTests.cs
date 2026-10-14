using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Tests.Shared;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode
{
    /// <summary>
    /// Session start and end of the services with run-time caches (<see cref="SessionLifecycle"/>): BeginSession on
    /// Loading → Playing, EndSession when returning to the main menu, nothing for loads inside the game, failing services do
    /// not stop the others.
    /// </summary>
    [TestFixture]
    public sealed class SessionLifecycleTests
    {
        private LogCapture _log;
        private EventBus _bus;
        private List<string> _calls;

        [SetUp]
        public void SetUp()
        {
            _log = new LogCapture();
            _bus = new EventBus();
            _calls = new List<string>();
        }

        [TearDown]
        public void TearDown()
        {
            _bus.Dispose();
            _log.Dispose();
        }

        [Test]
        public void NewGame_BeginsTheSessionAndTheMainMenuEndsIt()
        {
            var lifecycle = new SessionLifecycle(_bus, new ISessionService[] { new RecordingSession("a", _calls), new RecordingSession("b", _calls) });

            Change(GameState.Boot, GameState.MainMenu);
            Change(GameState.MainMenu, GameState.Loading);
            Change(GameState.Loading, GameState.Playing);
            Assert.That(lifecycle.IsSessionActive, Is.True);
            Change(GameState.Playing, GameState.Paused);
            Change(GameState.Paused, GameState.MainMenu);

            Assert.That(_calls, Is.EqualTo(new[] { "a.begin", "b.begin", "b.end", "a.end" }));
            Assert.That(lifecycle.IsSessionActive, Is.False);
            lifecycle.Dispose();
        }

        [Test]
        public void LoadInTheGame_KeepsTheSession()
        {
            var lifecycle = new SessionLifecycle(_bus, new ISessionService[] { new RecordingSession("a", _calls) });
            Change(GameState.Loading, GameState.Playing);
            Change(GameState.Playing, GameState.Paused);
            Change(GameState.Paused, GameState.Loading);
            Change(GameState.Loading, GameState.Playing);

            Assert.That(_calls, Is.EqualTo(new[] { "a.begin" }));
            lifecycle.Dispose();
        }

        [Test]
        public void BootToMainMenu_EndsNothing()
        {
            var lifecycle = new SessionLifecycle(_bus, new ISessionService[] { new RecordingSession("a", _calls) });
            Change(GameState.Boot, GameState.MainMenu);

            Assert.That(_calls, Is.Empty);
            lifecycle.Dispose();
        }

        [Test]
        public void FailingService_IsLoggedAndTheOthersRun()
        {
            var lifecycle = new SessionLifecycle(_bus, new ISessionService[] { new ThrowingSession(), new RecordingSession("b", _calls), null });
            Change(GameState.Loading, GameState.Playing);

            Assert.That(_calls, Is.EqualTo(new[] { "b.begin" }));
            Assert.That(_log.Sink.ErrorCount, Is.EqualTo(1));
            Assert.That(lifecycle.ServiceCount, Is.EqualTo(2));
            lifecycle.Dispose();
        }

        [Test]
        public void AfterDispose_NothingIsCalled()
        {
            var lifecycle = new SessionLifecycle(_bus, new ISessionService[] { new RecordingSession("a", _calls) });
            lifecycle.Dispose();
            Change(GameState.Loading, GameState.Playing);

            Assert.That(_calls, Is.Empty);
        }

        private void Change(GameState previous, GameState current)
        {
            var evt = new GameStateChanged(previous, current);
            _bus.Publish(in evt);
        }

        private sealed class RecordingSession : ISessionService
        {
            private readonly string _name;
            private readonly List<string> _calls;

            public RecordingSession(string name, List<string> calls)
            {
                _name = name;
                _calls = calls;
            }

            public void BeginSession()
            {
                _calls.Add(_name + ".begin");
            }

            public void EndSession()
            {
                _calls.Add(_name + ".end");
            }
        }

        private sealed class ThrowingSession : ISessionService
        {
            public void BeginSession()
            {
                throw new InvalidOperationException("test");
            }

            public void EndSession()
            {
                throw new InvalidOperationException("test");
            }
        }
    }
}
