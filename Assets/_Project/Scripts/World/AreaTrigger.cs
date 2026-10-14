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
    /// <para>Teleports (load, respawn) disable the CharacterController for a moment, and Unity sends no <c>OnTriggerExit</c>
    /// for a collider disabled or destroyed inside a trigger. The zone therefore keeps the player's colliders in a set
    /// (<see cref="AreaPresence{TKey}"/>) and checks it in <c>FixedUpdate</c> while the player counts as inside: a collider
    /// that is gone, disabled or no longer overlapping the zone's bounds is removed, so the next visit sends
    /// <c>AreaEntered</c> again.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class AreaTrigger : MonoBehaviour
    {
        [Tooltip("Orts-ID für das Ereignis AreaEntered, z. B. loc.test.uebungsplatz (GDD 02, 2.3: Präfix loc.).")]
        [SerializeField] private string areaId = "loc.test.ort";

        [Tooltip("Layer, die als Spieler zählen (Architektur 2.8: Layer 6 „Player“).")]
        [SerializeField] private LayerMask playerLayers = 1 << 6;

        private readonly AreaPresence<Collider> _presence = new AreaPresence<Collider>();
        private Collider _zone;
        private Func<Collider, bool> _stillInside;
        private IEventBus _eventBus;

        /// <summary>Location id of the zone.</summary>
        public string AreaId => areaId ?? string.Empty;

        /// <summary>True while the player is inside.</summary>
        public bool IsPlayerInside => _presence.IsInside;

        private void Awake()
        {
            _stillInside = IsStillInside;
            if (!TryGetComponent(out _zone))
            {
                Log.Warning(LogCategory.World, "AreaTrigger '" + name + "' needs a trigger collider (e.g. a BoxCollider with 'Is Trigger').");
                return;
            }

            if (!_zone.isTrigger)
            {
                Log.Warning(LogCategory.World, "AreaTrigger '" + name + "': the collider is not a trigger - switched to 'Is Trigger'.");
                _zone.isTrigger = true;
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

        private void FixedUpdate()
        {
            // Exits that Unity never reports (collider disabled or destroyed inside the trigger, e.g. by a teleport).
            if (_presence.IsInside && _presence.Prune(_stillInside))
            {
                Log.Debug(LogCategory.World, "Area left without OnTriggerExit (teleport, load or respawn): " + AreaId);
            }
        }

        private void OnTriggerEnter(Collider other)
        {
            if (!IsPlayer(other) || !_presence.Enter(other))
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
                _presence.Exit(other);
            }
        }

        private bool IsStillInside(Collider other)
        {
            // The bounds of both colliders contain their shapes, so a collider that really overlaps the zone is never removed.
            return other != null && other.enabled && other.gameObject.activeInHierarchy && _zone != null && _zone.enabled &&
                   _zone.bounds.Intersects(other.bounds);
        }

        private bool IsPlayer(Collider other)
        {
            return other != null && (playerLayers.value & (1 << other.gameObject.layer)) != 0;
        }
    }
}
