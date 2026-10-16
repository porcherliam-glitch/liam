using System;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World.Exploration
{
    /// <summary>
    /// The top of a viewpoint (GDD 01 6.6: the crow's nest of the Wachturm Grauwacht, the Rabenfels summit): whoever stands
    /// here activates it once — the fog clears within its reveal radius and the places there are marked with "?". Activates
    /// without a button, so an object on the same spot stays free for its quest.
    /// </summary>
    /// <remarks>
    /// GameObject: a trigger collider (layer TriggerVolume) over the walkable top with a kinematic Rigidbody, like the location
    /// zones. "Already activated" lives in the exploration state, so a loaded older save can activate it again.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class ViewpointZone : MonoBehaviour
    {
        [Tooltip("Orts-ID des Aussichtspunkts (z. B. loc.eichental.wachturm_grauwacht).")]
        [SerializeField] private string placeId = "loc.region.aussicht";

        [Tooltip("Layer, die als Spieler zählen (Architektur 2.8: Layer 6 „Player“).")]
        [SerializeField] private LayerMask playerLayers = 1 << 6;

        private IExplorationService _exploration;
        private IGameStateService _gameState;

        /// <summary>Location id of the viewpoint.</summary>
        public string PlaceId => placeId ?? string.Empty;

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _exploration = await Services.WaitForAsync<IExplorationService>(destroyCancellationToken);
                Services.Locator.TryGet(out _gameState);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "ViewpointZone could not resolve IExplorationService.");
            }
        }

        private void OnTriggerEnter(Collider other)
        {
            TryActivate(other);
        }

        private void OnTriggerStay(Collider other)
        {
            TryActivate(other);
        }

        private void TryActivate(Collider other)
        {
            if (_exploration == null || (playerLayers.value & (1 << other.gameObject.layer)) == 0 ||
                (_gameState != null && _gameState.Current != GameState.Playing))
            {
                return;
            }

            ExplorationState state = _exploration.ActiveState;
            if (state != null && !state.IsViewpointActivated(PlaceId))
            {
                _exploration.ActivateViewpoint(PlaceId);
            }
        }
    }
}
