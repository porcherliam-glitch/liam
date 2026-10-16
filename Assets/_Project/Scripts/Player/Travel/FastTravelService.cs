using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.GameTime;
using Aetherfall.Inventory;
using Aetherfall.SaveSystem;
using Aetherfall.World.Exploration;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Fast travel between the discovered travel points of the current map (S50, GDD 03 3.4, GDD 01 6.6). Checks the rules
    /// (<see cref="FastTravelRules"/>), shows the loading screen, lets the game clock jump by the travel time, places the player
    /// at the arrival point, sends <c>PlayerSpawned</c> (camera, companion) and <c>FastTravelCompleted</c> (autosave).
    /// </summary>
    public sealed class FastTravelService : IFastTravelService
    {
        private readonly IExplorationService _exploration;
        private readonly IPlayerLocator _players;
        private readonly IGameStateService _gameState;
        private readonly IGameClock _clock;
        private readonly ICombatService _combat;
        private readonly IInventoryService _inventory;
        private readonly ISaveManager _saves;
        private readonly IEventBus _eventBus;

        /// <summary>Creates the service (all but the exploration, the locator and the game state may be null).</summary>
        /// <param name="exploration">Exploration (maps, travel points).</param>
        /// <param name="players">Player locator.</param>
        /// <param name="gameState">Game state.</param>
        /// <param name="clock">Game clock (null: no time passes).</param>
        /// <param name="combat">Combat state (null: never in combat).</param>
        /// <param name="inventory">Inventory (null: never overloaded).</param>
        /// <param name="saves">Save manager (null: no save locks).</param>
        /// <param name="eventBus">Event bus (null: no events).</param>
        public FastTravelService(IExplorationService exploration, IPlayerLocator players, IGameStateService gameState, IGameClock clock,
            ICombatService combat, IInventoryService inventory, ISaveManager saves, IEventBus eventBus)
        {
            _exploration = exploration ?? throw new ArgumentNullException(nameof(exploration));
            _players = players ?? throw new ArgumentNullException(nameof(players));
            _gameState = gameState ?? throw new ArgumentNullException(nameof(gameState));
            _clock = clock;
            _combat = combat;
            _inventory = inventory;
            _saves = saves;
            _eventBus = eventBus;
        }

        /// <inheritdoc />
        public bool IsTravelling { get; private set; }

        /// <inheritdoc />
        public FastTravelBlock Check(string placeId, out string reasonKey)
        {
            reasonKey = string.Empty;
            ExplorationState state = _exploration.ActiveState;
            IPlayerAnchor player = _players.Current;
            MapPlace place = null;
            bool unlocked = state != null && state.Map.TryGetPlace(placeId, out place) && state.IsWaypointUnlocked(placeId);
            bool saveLocked = false;
            if (_saves != null && !_saves.IsSaveAllowed(out string blocked) && blocked != SaveReasonKeys.Busy)
            {
                // A save being written is no reason; falling, climbing, a boss fight or a timed stage are.
                saveLocked = true;
                reasonKey = blocked;
            }

            bool overloaded = _inventory != null && !EncumbranceRules.AllowsFastTravel(_inventory.PlayerEncumbrance.Level);
            float distance = player != null && place != null ? FlatDistance(player.Position, place) : float.MaxValue;
            return FastTravelRules.Check(new FastTravelContext(state != null && player != null, unlocked, _combat != null && _combat.InCombat,
                overloaded, saveLocked, distance));
        }

        /// <inheritdoc />
        public double HoursTo(string placeId)
        {
            ExplorationState state = _exploration.ActiveState;
            IPlayerAnchor player = _players.Current;
            if (state == null || player == null || !state.Map.TryGetPlace(placeId, out MapPlace place))
            {
                return 0.0;
            }

            return FastTravelRules.TravelHours(FlatDistance(player.Position, place), _clock != null ? _clock.RealSecondsPerGameDay : 2880.0);
        }

        /// <inheritdoc />
        public async Awaitable<bool> TravelAsync(string placeId)
        {
            FastTravelBlock block = Check(placeId, out string reason);
            if (IsTravelling || block != FastTravelBlock.None)
            {
                Log.Info(LogCategory.Player, "Fast travel to '" + placeId + "' refused: " + (IsTravelling ? "already travelling" : block + " " + reason) + ".");
                return false;
            }

            ExplorationState state = _exploration.ActiveState;
            state.Map.TryGetPlace(placeId, out MapPlace place);
            IPlayerAnchor player = _players.Current;
            double hours = HoursTo(placeId);
            double before = _clock != null ? _clock.TotalGameMinutes : 0.0;
            float started = Time.realtimeSinceStartup;
            ILoadingScreen loading = null;
            IsTravelling = true;
            try
            {
                if (!_gameState.SwitchBase(GameState.Loading, "Schnellreise"))
                {
                    return false;
                }

                if (Services.Locator != null)
                {
                    Services.Locator.TryGet(out loading);
                }

                loading?.Show("Schnellreise nach " + place.DisplayName);
                _clock?.AdvanceHours((float)hours, "travel." + place.Id);
                var arrival = new Vector3(place.ArrivalX, place.ArrivalY, place.ArrivalZ);
                player.Place(arrival, place.ArrivalYaw);
                Publish(new PlayerSpawned(arrival, player.WorldSpaceId));
                double after = _clock != null ? _clock.TotalGameMinutes : before;

                // Back to Playing at once: the place zone at the arrival fires on the next physics step, and its quest messages
                // must not fall into the loading state. The loading screen still covers the two frames in which camera and
                // companion settle (architecture 15.2 rule 10: the service uses the exit token).
                _gameState.SwitchBase(GameState.Playing, "Schnellreise");
                await Awaitable.NextFrameAsync(Application.exitCancellationToken);
                await Awaitable.NextFrameAsync(Application.exitCancellationToken);
                loading?.Hide();
                Log.Info(LogCategory.Player, "Fast travel to '" + place.Id + "': " + FastTravelRules.Describe(hours) + " game time, " +
                                             (Time.realtimeSinceStartup - started).ToString("0.00") + " s real time.");
                Publish(new FastTravelCompleted(place.Id, place.DisplayName, hours, before, after));
                return true;
            }
            catch (OperationCanceledException)
            {
                // The game quits while travelling.
                return false;
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "Fast travel to '" + placeId + "' failed.");
                return false;
            }
            finally
            {
                if (_gameState.Current == GameState.Loading)
                {
                    _gameState.SwitchBase(GameState.Playing, "Schnellreise abgebrochen");
                }

                if (loading != null && loading.IsVisible)
                {
                    loading.Hide();
                }

                IsTravelling = false;
            }
        }

        private static float FlatDistance(Vector3 from, MapPlace place)
        {
            float dx = place.ArrivalX - from.x;
            float dz = place.ArrivalZ - from.z;
            return Mathf.Sqrt(dx * dx + dz * dz);
        }

        private void Publish<T>(T evt) where T : struct, IGameEvent
        {
            _eventBus?.Publish(in evt);
        }
    }
}
