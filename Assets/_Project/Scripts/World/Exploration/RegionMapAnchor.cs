using System;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World.Exploration
{
    /// <summary>
    /// Ties a scene to its world map (S34/S63): makes the map active while the scene is loaded and, while playing, tells the
    /// exploration service a few times per second where the player stands, so the fog clears around it.
    /// </summary>
    /// <remarks>GameObject: one per world scene ("Weltkarte"), created by the region generator.</remarks>
    [DisallowMultipleComponent]
    public sealed class RegionMapAnchor : MonoBehaviour
    {
        [Tooltip("Karte dieser Szene (Data/Regions/…/RM_….asset).")]
        [SerializeField] private RegionMapDefinition map = null;

        [Tooltip("So oft pro Sekunde wird die Spielerposition gemeldet.")]
        [Range(1f, 20f)] [SerializeField] private float ticksPerSecond = 4f;

        private IExplorationService _exploration;
        private IPlayerLocator _locator;
        private IGameStateService _gameState;
        private float _nextTick;

        /// <summary>The map of this scene.</summary>
        public RegionMapDefinition Map => map;

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            if (map == null)
            {
                Log.Warning(LogCategory.World, "RegionMapAnchor '" + name + "' has no map.");
                return;
            }

            try
            {
                _exploration = await Services.WaitForAsync<IExplorationService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                locator.TryGet(out _locator);
                locator.TryGet(out _gameState);
                _exploration.SetActiveMap(map);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "RegionMapAnchor could not resolve its services.");
            }
        }

        private void Update()
        {
            if (_exploration == null || _locator == null || _gameState == null || _gameState.Current != GameState.Playing ||
                Time.unscaledTime < _nextTick)
            {
                return;
            }

            _nextTick = Time.unscaledTime + 1f / ticksPerSecond;
            IPlayerAnchor player = _locator.Current;
            if (player != null && (player.WorldSpaceId.Length == 0 || player.WorldSpaceId == map.WorldSpaceId))
            {
                _exploration.Tick(player.Position);
            }
        }

        private void OnDestroy()
        {
            _exploration?.ClearActiveMap(map);
        }
    }
}
