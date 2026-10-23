using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;

namespace Aetherfall.Cinematics
{
    /// <summary>
    /// Default <see cref="ICutsceneService"/> (S58). Requests wait in a short queue until a cutscene may start: the game is in a
    /// state that may stack the Cutscene state (Playing; a dialogue is replaced), the player is not in combat, and the loaded scene
    /// has registered a player for the id. A request made while a new game loads therefore starts with the switch from Loading to
    /// Playing, so the first picture of the game is already the black title card. Without a recording the request is dropped after
    /// a short grace time in Playing (logged), and <c>CutsceneFinished(skipped)</c> tells the waiting quest.
    /// </summary>
    /// <remarks>
    /// Skipping turns the screen black at once, stops the player, leaves the Cutscene state and reports the end as skipped. Death,
    /// another system leaving the Cutscene state, a scene that goes away and the end of a session all count as skipping. Not
    /// saved: a cutscene that was cut off by a load is not played again (stage start actions run once).
    /// </remarks>
    public sealed class CutsceneService : ICutsceneService, ICutscenePlaybackHost, IUnscaledTickable, IPostInitializable, ISessionService, IDisposable
    {
        /// <summary>Most waiting requests.</summary>
        public const int MaxQueue = 4;

        private readonly IEventBus _bus;
        private readonly IGameStateService _state;
        private readonly bool _enabled;
        private readonly float _missingPlayerGrace;
        private readonly List<ICutscenePlayer> _players = new List<ICutscenePlayer>();
        private readonly List<PendingRequest> _queue = new List<PendingRequest>();
        private ICutscenePlayer _current;
        private string _currentId = string.Empty;
        private bool _ending;
        private bool _inCombat;
        private bool _subscribed;

        /// <summary>Creates the service.</summary>
        /// <param name="bus">Event bus.</param>
        /// <param name="state">Game state service.</param>
        /// <param name="enabled">False: every request ends at once as skipped (option, tests).</param>
        /// <param name="missingPlayerGrace">Seconds of Playing to wait for a scene's recording before a request is dropped.</param>
        public CutsceneService(IEventBus bus, IGameStateService state, bool enabled = true, float missingPlayerGrace = 2f)
        {
            _bus = bus ?? throw new ArgumentNullException(nameof(bus));
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _enabled = enabled;
            _missingPlayerGrace = missingPlayerGrace > 0f ? missingPlayerGrace : 0f;
        }

        /// <inheritdoc />
        public event Action Changed;

        /// <inheritdoc />
        public bool IsPlaying => _current != null;

        /// <inheritdoc />
        public bool IsPending => _queue.Count > 0;

        /// <inheritdoc />
        public string CurrentId => _currentId;

        /// <inheritdoc />
        public double CurrentTime => _current != null ? _current.Time : 0d;

        /// <inheritdoc />
        public double CurrentDuration => _current != null ? _current.Duration : 0d;

        /// <inheritdoc />
        public bool CanSkip => _current != null && !_ending;

        /// <inheritdoc />
        public CutsceneOverlay Overlay { get; private set; } = CutsceneOverlay.Empty;

        /// <inheritdoc />
        public int OverlayRevision { get; private set; }

        /// <summary>Registered scene players (tests, tools).</summary>
        public int PlayerCount => _players.Count;

        /// <inheritdoc />
        public void PostInitialize()
        {
            if (_subscribed)
            {
                return;
            }

            _bus.Subscribe<GameStateChanged>(OnGameStateChanged);
            _bus.Subscribe<CombatStateChanged>(OnCombatStateChanged);
            _bus.Subscribe<PlayerDied>(OnPlayerDied);
            _subscribed = true;
        }

        /// <inheritdoc />
        public void Dispose()
        {
            if (!_subscribed)
            {
                return;
            }

            _bus.Unsubscribe<GameStateChanged>(OnGameStateChanged);
            _bus.Unsubscribe<CombatStateChanged>(OnCombatStateChanged);
            _bus.Unsubscribe<PlayerDied>(OnPlayerDied);
            _subscribed = false;
        }

        /// <inheritdoc />
        public bool Request(string cutsceneId, string sourceId)
        {
            if (string.IsNullOrEmpty(cutsceneId) || !_enabled)
            {
                Log.Info(LogCategory.Cinematics, "Cutscene '" + cutsceneId + "' not played (" + (_enabled ? "no id" : "cutscenes off") + ").");
                Publish(new CutsceneFinished(cutsceneId, true));
                return false;
            }

            if (cutsceneId == _currentId || IndexOf(cutsceneId) >= 0)
            {
                return true;
            }

            if (_queue.Count >= MaxQueue)
            {
                Log.Warning(LogCategory.Cinematics, "Cutscene '" + cutsceneId + "' refused: " + MaxQueue + " requests wait already.");
                return false;
            }

            _queue.Add(new PendingRequest(cutsceneId, sourceId ?? string.Empty));
            Log.Info(LogCategory.Cinematics, "Cutscene '" + cutsceneId + "' requested by '" + sourceId + "'.");
            TryStartNext();
            return true;
        }

        /// <inheritdoc />
        public bool Skip(string reason)
        {
            if (!CanSkip)
            {
                return false;
            }

            Log.Info(LogCategory.Cinematics, "Cutscene '" + _currentId + "' skipped after " + CurrentTime.ToString("0.0") + " s (" + reason + ").");
            End(true, true);
            return true;
        }

        /// <inheritdoc />
        public void Register(ICutscenePlayer player)
        {
            if (player == null || _players.Contains(player))
            {
                return;
            }

            _players.Add(player);
            TryStartNext();
        }

        /// <inheritdoc />
        public void Unregister(ICutscenePlayer player)
        {
            if (!_players.Remove(player))
            {
                return;
            }

            if (ReferenceEquals(player, _current))
            {
                // The scene went away while its cutscene played.
                End(true, false);
            }
        }

        /// <inheritdoc />
        public void Tick(float deltaTime)
        {
            if (_current == null && _queue.Count > 0 && _state.Current == GameState.Playing && FindPlayer(_queue[0].Id) == null)
            {
                PendingRequest head = _queue[0];
                head.Waited += deltaTime > 0f ? deltaTime : 0f;
                _queue[0] = head;
                if (head.Waited >= _missingPlayerGrace)
                {
                    _queue.RemoveAt(0);
                    Log.Warning(LogCategory.Cinematics, "Cutscene '" + head.Id + "' has no recording in this scene – not played.");
                    Publish(new CutsceneFinished(head.Id, true));
                }
            }

            TryStartNext();
        }

        /// <inheritdoc />
        public void SetOverlay(in CutsceneOverlay overlay)
        {
            if (_current == null || _ending || Overlay.SameAs(overlay))
            {
                return;
            }

            Overlay = overlay;
            OverlayRevision++;
        }

        /// <inheritdoc />
        public void Finished(ICutscenePlayer player)
        {
            if (_ending || !ReferenceEquals(player, _current))
            {
                return;
            }

            Log.Info(LogCategory.Cinematics, "Cutscene '" + _currentId + "' played to the end.");
            End(false, false);
        }

        /// <inheritdoc />
        public void BeginSession()
        {
        }

        /// <inheritdoc />
        public void EndSession()
        {
            _queue.Clear();
            if (_current != null)
            {
                End(true, true);
            }
        }

        private void TryStartNext()
        {
            if (_current != null || _queue.Count == 0 || _inCombat || !GameStateTransitions.CanPush(_state.Current, GameState.Cutscene))
            {
                return;
            }

            PendingRequest next = _queue[0];
            ICutscenePlayer player = FindPlayer(next.Id);
            if (player == null)
            {
                return;
            }

            _queue.RemoveAt(0);
            _current = player;
            _currentId = next.Id;
            SetOverlayInternal(CutsceneOverlay.Black);
            if (!_state.Push(GameState.Cutscene, "Zwischensequenz " + next.Id))
            {
                // Refused after all: wait for the next chance.
                _current = null;
                _currentId = string.Empty;
                _queue.Insert(0, next);
                return;
            }

            Log.Info(LogCategory.Cinematics, "Cutscene '" + next.Id + "' starts (" + player.Duration.ToString("0.0") + " s).");
            Publish(new CutsceneStarted(next.Id, next.Source));
            Changed?.Invoke();
            player.Play(this);
        }

        private void End(bool skipped, bool stopPlayer)
        {
            ICutscenePlayer player = _current;
            string id = _currentId;
            if (player == null)
            {
                return;
            }

            _ending = true;
            try
            {
                // Skipping hides the picture at once; the screen fades the veil away after the state switch.
                SetOverlayInternal(skipped ? CutsceneOverlay.Black : CutsceneOverlay.Empty);
                if (stopPlayer)
                {
                    player.Stop();
                }

                _current = null;
                _currentId = string.Empty;
                if (_state.Current == GameState.Cutscene)
                {
                    _state.Pop(GameState.Cutscene);
                }
            }
            finally
            {
                _ending = false;
            }

            Publish(new CutsceneFinished(id, skipped));
            Changed?.Invoke();
            TryStartNext();
        }

        private void OnGameStateChanged(GameStateChanged evt)
        {
            if (evt.Current == GameState.MainMenu || (evt.Current == GameState.Loading && evt.Previous != GameState.Loading))
            {
                // A new game, a load or the main menu: nothing waits from the old session.
                _queue.Clear();
            }

            if (evt.Current == GameState.MainMenu)
            {
                // The fight of the old session is over (the combat service resets itself at the end of the session as well).
                _inCombat = false;
            }

            if (_ending)
            {
                // Our own pop: the end is reported first, the next cutscene starts afterwards.
                return;
            }

            if (_current != null && evt.Previous == GameState.Cutscene && evt.Current != GameState.Cutscene)
            {
                // Someone else left the Cutscene state (death screen, load): the cutscene is over.
                End(true, true);
                return;
            }

            TryStartNext();
        }

        private void OnCombatStateChanged(CombatStateChanged evt)
        {
            _inCombat = evt.InCombat;
            TryStartNext();
        }

        private void OnPlayerDied(PlayerDied evt)
        {
            if (_current != null)
            {
                End(true, true);
            }
        }

        private void SetOverlayInternal(in CutsceneOverlay overlay)
        {
            Overlay = overlay;
            OverlayRevision++;
        }

        private ICutscenePlayer FindPlayer(string id)
        {
            for (int i = _players.Count - 1; i >= 0; i--)
            {
                if (_players[i] != null && _players[i].CutsceneId == id)
                {
                    return _players[i];
                }
            }

            return null;
        }

        private int IndexOf(string id)
        {
            for (int i = 0; i < _queue.Count; i++)
            {
                if (_queue[i].Id == id)
                {
                    return i;
                }
            }

            return -1;
        }

        private void Publish<T>(T evt) where T : struct, IGameEvent
        {
            _bus.Publish(in evt);
        }

        private struct PendingRequest
        {
            public PendingRequest(string id, string source)
            {
                Id = id;
                Source = source;
                Waited = 0f;
            }

            public string Id;
            public string Source;
            public float Waited;
        }
    }
}
