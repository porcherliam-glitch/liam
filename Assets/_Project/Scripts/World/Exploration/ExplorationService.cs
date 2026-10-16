using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World.Exploration
{
    /// <summary>
    /// Default <see cref="IExplorationService"/>. Keeps one <see cref="ExplorationState"/> per map; saved maps whose scene is not
    /// loaded yet wait as data until their map becomes active. Entered places (<c>AreaEntered</c>) are only remembered and
    /// turned into discoveries on the next <see cref="Tick"/>, which the scene anchor calls only while playing: a scene loads
    /// with the player at its start point before the save is restored, and that place must not count (or count twice).
    /// </summary>
    public sealed class ExplorationService : IExplorationService, IPostInitializable, IDisposable
    {
        /// <summary>The fog is cleared again only after the player moved this far (metres).</summary>
        public const float TickStep = 2f;

        private readonly Dictionary<string, ExplorationState> _states = new Dictionary<string, ExplorationState>(StringComparer.Ordinal);
        private readonly Dictionary<string, MapExplorationDto> _pending = new Dictionary<string, MapExplorationDto>(StringComparer.Ordinal);
        private readonly List<string> _enteredAreas = new List<string>();
        private readonly IEventBus _eventBus;
        private bool _subscribed;
        private Vector3 _lastTick;
        private bool _hasLastTick;

        /// <summary>Creates the service.</summary>
        /// <param name="eventBus">Event bus (null: no events, no discovery through location triggers).</param>
        public ExplorationService(IEventBus eventBus)
        {
            _eventBus = eventBus;
        }

        /// <inheritdoc />
        public RegionMapDefinition ActiveMap { get; private set; }

        /// <inheritdoc />
        public ExplorationState ActiveState { get; private set; }

        /// <inheritdoc />
        public int Revision { get; private set; }

        /// <inheritdoc />
        public event Action Changed;

        /// <inheritdoc />
        public void PostInitialize()
        {
            if (_eventBus != null && !_subscribed)
            {
                _eventBus.Subscribe<AreaEntered>(OnAreaEntered);
                _subscribed = true;
            }
        }

        /// <inheritdoc />
        public void Dispose()
        {
            if (_eventBus != null && _subscribed)
            {
                _eventBus.Unsubscribe<AreaEntered>(OnAreaEntered);
                _subscribed = false;
            }
        }

        /// <inheritdoc />
        public void SetActiveMap(RegionMapDefinition map)
        {
            if (map == null)
            {
                return;
            }

            ActiveMap = map;
            ActiveState = StateFor(map);
            _hasLastTick = false;
            Bump();
        }

        /// <inheritdoc />
        public void ClearActiveMap(RegionMapDefinition map)
        {
            if (map == null || !ReferenceEquals(map, ActiveMap))
            {
                return;
            }

            ActiveMap = null;
            ActiveState = null;
            _hasLastTick = false;
            _enteredAreas.Clear();
            Bump();
        }

        /// <inheritdoc />
        public void Tick(Vector3 position)
        {
            ExplorationState state = ActiveState;
            if (state == null)
            {
                return;
            }

            if (!state.Announced)
            {
                // GDD 05 "Region entdeckt" (P0): the first time the player stands in the region.
                state.Announced = true;
                Publish(new RegionDiscovered(state.Map.MapId, state.Map.RegionName));
            }

            if (_enteredAreas.Count > 0)
            {
                var entered = new List<string>(_enteredAreas);
                _enteredAreas.Clear();
                foreach (string area in entered)
                {
                    Discover(area);
                }
            }

            Vector3 flat = new Vector3(position.x, 0f, position.z);
            if (_hasLastTick && (flat - _lastTick).sqrMagnitude < TickStep * TickStep)
            {
                return;
            }

            _lastTick = flat;
            _hasLastTick = true;
            DiscoverAt(state, position);
            if (state.RevealAround(position.x, position.z, state.Map.RevealRadius) > 0)
            {
                Bump();
            }
        }

        /// <inheritdoc />
        public bool ActivateViewpoint(string placeId)
        {
            ExplorationState state = ActiveState;
            if (state == null || !state.ActivateViewpoint(placeId, out int revealed))
            {
                return false;
            }

            state.Map.TryGetPlace(placeId, out MapPlace place);
            Log.Info(LogCategory.World, "Viewpoint '" + placeId + "' activated: " + revealed + " places marked, fog " +
                                        (state.Fog.RevealedFraction * 100f).ToString("0") + " % clear.");
            Bump();
            Publish(new ViewpointActivated(placeId, state.Map.MapId, place != null ? place.DisplayName : placeId, revealed));
            return true;
        }

        /// <inheritdoc />
        public void RevealAll()
        {
            if (ActiveState != null && ActiveState.Fog.RevealAll() > 0)
            {
                Bump();
            }
        }

        /// <inheritdoc />
        public ExplorationDto Capture()
        {
            var dto = new ExplorationDto();
            var ids = new List<string>(_states.Keys);
            foreach (string id in _pending.Keys)
            {
                if (!_states.ContainsKey(id))
                {
                    ids.Add(id);
                }
            }

            ids.Sort(StringComparer.Ordinal);
            foreach (string id in ids)
            {
                dto.Maps.Add(_states.TryGetValue(id, out ExplorationState state) ? state.ToDto() : _pending[id]);
            }

            return dto;
        }

        /// <inheritdoc />
        public void Restore(ExplorationDto data)
        {
            _pending.Clear();
            _enteredAreas.Clear();
            if (data != null && data.Maps != null)
            {
                foreach (MapExplorationDto map in data.Maps)
                {
                    if (map != null && !string.IsNullOrEmpty(map.MapId))
                    {
                        _pending[map.MapId] = map;
                    }
                }
            }

            // Maps already in use load at once; the others when their scene sets them active.
            foreach (KeyValuePair<string, ExplorationState> pair in _states)
            {
                _pending.TryGetValue(pair.Key, out MapExplorationDto saved);
                pair.Value.Load(saved);
                _pending.Remove(pair.Key);
            }

            _hasLastTick = false;
            Bump();
        }

        private ExplorationState StateFor(RegionMapDefinition map)
        {
            if (_states.TryGetValue(map.MapId, out ExplorationState state) && ReferenceEquals(state.Map, map))
            {
                return state;
            }

            MapExplorationDto saved = state != null ? state.ToDto() : null;
            if (_pending.TryGetValue(map.MapId, out MapExplorationDto pending))
            {
                saved = pending;
                _pending.Remove(map.MapId);
            }

            state = new ExplorationState(map);
            state.Load(saved);
            _states[map.MapId] = state;
            return state;
        }

        private void DiscoverAt(ExplorationState state, Vector3 position)
        {
            // Standing in a place discovers it too: the start village, or a place the player was in when a game was loaded.
            foreach (MapPlace place in state.Map.Places)
            {
                if (place != null && place.ShowOnMap && !place.IsViewpoint && !state.IsDiscovered(place.Id) && place.Contains(position.x, position.z))
                {
                    Discover(place.Id);
                }
            }
        }

        private void OnAreaEntered(AreaEntered evt)
        {
            if (!_enteredAreas.Contains(evt.AreaId))
            {
                _enteredAreas.Add(evt.AreaId);
            }
        }

        private void Discover(string areaId)
        {
            ExplorationState state = ActiveState;
            if (state == null || !state.Discover(areaId, out MapPlace place))
            {
                return;
            }

            Bump();
            Publish(new LocationDiscovered(place.Id, state.Map.MapId, place.DisplayName));
        }

        private void Bump()
        {
            Revision++;
            Changed?.Invoke();
        }

        private void Publish<T>(T evt) where T : struct, IGameEvent
        {
            _eventBus?.Publish(in evt);
        }
    }
}
