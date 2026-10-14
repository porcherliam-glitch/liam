using System;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Location zone in the world (architecture 4.3 "AreaEntered", guide 08 11.3): sends <c>AreaEntered(areaId)</c> when the
    /// player enters the trigger volume, once per visit. Quest objectives "Gehe zu Ort" (GDD 02 5.1 type 6) and "Erreiche Ort
    /// innerhalb einer Zeit" count it.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: an empty object on the layer TriggerVolume (14, architecture 2.8) with a trigger collider (BoxCollider
    /// with "Is Trigger") and a kinematic Rigidbody, so the player's CharacterController always raises trigger messages. The
    /// test ground menu creates "Uebungsplatz" (German name) this way.</para>
    /// <para>A player who already stands in the zone when a quest stage starts must leave and enter it again.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class AreaTrigger : MonoBehaviour
    {
        [Tooltip("Orts-ID für das Ereignis AreaEntered, z. B. loc.test.uebungsplatz (GDD 02, 2.3: Präfix loc.).")]
        [SerializeField] private string areaId = "loc.test.ort";

        [Tooltip("Layer, die als Spieler zählen (Architektur 2.8: Layer 6 „Player“).")]
        [SerializeField] private LayerMask playerLayers = 1 << 6;

        private readonly AreaPresence _presence = new AreaPresence();
        private IEventBus _eventBus;

        /// <summary>Location id of the zone.</summary>
        public string AreaId => areaId ?? string.Empty;

        /// <summary>True while the player is inside.</summary>
        public bool IsPlayerInside => _presence.IsInside;

        private void Awake()
        {
            if (TryGetComponent(out Collider zone) && !zone.isTrigger)
            {
                Log.Warning(LogCategory.World, "AreaTrigger '" + name + "': the collider is not a trigger - switched to 'Is Trigger'.");
                zone.isTrigger = true;
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _eventBus = await Services.WaitForAsync<IEventBus>(destroyCancellationToken);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "AreaTrigger could not resolve IEventBus.");
            }
        }

        private void OnDisable()
        {
            _presence.Reset();
        }

        private void OnTriggerEnter(Collider other)
        {
            if (!IsPlayer(other) || !_presence.Enter())
            {
                return;
            }

            Log.Debug(LogCategory.World, "Area entered: " + AreaId);
            if (_eventBus != null)
            {
                var entered = new AreaEntered(AreaId);
                _eventBus.Publish(in entered);
            }
        }

        private void OnTriggerExit(Collider other)
        {
            if (IsPlayer(other))
            {
                _presence.Exit();
            }
        }

        private bool IsPlayer(Collider other)
        {
            return other != null && (playerLayers.value & (1 << other.gameObject.layer)) != 0;
        }
    }
}
