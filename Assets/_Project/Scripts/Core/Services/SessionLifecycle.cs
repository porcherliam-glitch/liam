using System;
using System.Collections.Generic;

namespace Aetherfall.Core
{
    /// <summary>
    /// Calls <see cref="ISessionService.BeginSession"/> and <see cref="ISessionService.EndSession"/> of all services at the game
    /// state changes that start and end a game session (architecture 4 "Lebenszyklus"): a session begins when the game
    /// switches from Loading to Playing (new game or a save loaded from the main menu) and ends when the game returns to the
    /// main menu. Loading another save inside the game keeps the session; every saveable resets its own state in
    /// <c>Load</c> (architecture 9.1). Created by the <see cref="GameBootstrapper"/> after PostInitialize.
    /// </summary>
    /// <remarks>
    /// Pure C#: listens to <see cref="GameStateChanged"/> on the event bus. An exception of one service is logged and does
    /// not stop the others.
    /// </remarks>
    public sealed class SessionLifecycle : IDisposable
    {
        private readonly IEventBus _bus;
        private readonly List<ISessionService> _services;
        private bool _active;
        private bool _disposed;

        /// <summary>Creates the lifecycle and subscribes to the game state.</summary>
        /// <param name="bus">Event bus.</param>
        /// <param name="services">Services with a session (order: registration order; EndSession runs in reverse).</param>
        public SessionLifecycle(IEventBus bus, IEnumerable<ISessionService> services)
        {
            _bus = bus ?? throw new ArgumentNullException(nameof(bus));
            _services = new List<ISessionService>();
            if (services != null)
            {
                foreach (ISessionService service in services)
                {
                    if (service != null)
                    {
                        _services.Add(service);
                    }
                }
            }

            _bus.Subscribe<GameStateChanged>(OnGameStateChanged);
        }

        /// <summary>True between the start of a session and its end.</summary>
        public bool IsSessionActive => _active;

        /// <summary>Number of services with a session.</summary>
        public int ServiceCount => _services.Count;

        /// <summary>Unsubscribes (no EndSession: the services are disposed right after).</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _bus.Unsubscribe<GameStateChanged>(OnGameStateChanged);
            _disposed = true;
        }

        private void OnGameStateChanged(GameStateChanged evt)
        {
            if (evt.Previous == GameState.Loading && evt.Current == GameState.Playing && !_active)
            {
                _active = true;
                for (int i = 0; i < _services.Count; i++)
                {
                    Call(_services[i], true);
                }

                return;
            }

            if (evt.Current == GameState.MainMenu && _active)
            {
                _active = false;
                for (int i = _services.Count - 1; i >= 0; i--)
                {
                    Call(_services[i], false);
                }
            }
        }

        private static void Call(ISessionService service, bool begin)
        {
            try
            {
                if (begin)
                {
                    service.BeginSession();
                }
                else
                {
                    service.EndSession();
                }
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Core, exception, (begin ? "BeginSession" : "EndSession") + " of " + service.GetType().Name + " failed.");
            }
        }
    }
}
