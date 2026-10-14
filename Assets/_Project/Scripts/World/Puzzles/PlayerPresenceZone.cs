using System;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Knows whether the player is inside a trigger volume (puzzle rooms for the hint timer, checkpoints, pressure plates):
    /// <see cref="Entered"/> once per visit, <see cref="Exited"/> when the last collider left. Like <see cref="AreaTrigger"/> it
    /// keeps the colliders in an <see cref="AreaPresence{TKey}"/> and prunes those gone without <c>OnTriggerExit</c>
    /// (teleport, load, respawn). Publishes no global event.
    /// </summary>
    /// <remarks>GameObject: trigger collider (BoxCollider "Is Trigger") and kinematic Rigidbody on the layer TriggerVolume (14).</remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerPresenceZone : MonoBehaviour
    {
        [Tooltip("Layer, die als Spieler zählen (Architektur 2.8: Layer 6 „Player“).")]
        [SerializeField] private LayerMask playerLayers = 1 << 6;

        private readonly AreaPresence<Collider> _presence = new AreaPresence<Collider>();
        private Collider _zone;
        private Func<Collider, bool> _stillInside;

        /// <summary>True while the player is inside.</summary>
        public bool IsPlayerInside => _presence.IsInside;

        /// <summary>Raised when the player enters (once per visit).</summary>
        public event Action Entered;

        /// <summary>Raised when the player left.</summary>
        public event Action Exited;

        private void Awake()
        {
            _stillInside = IsStillInside;
            if (TryGetComponent(out _zone) && !_zone.isTrigger)
            {
                _zone.isTrigger = true;
            }
        }

        private void OnDisable()
        {
            _presence.Reset();
        }

        private void FixedUpdate()
        {
            if (_presence.IsInside && _presence.Prune(_stillInside))
            {
                Raise(Exited);
            }
        }

        private void OnTriggerEnter(Collider other)
        {
            if (IsPlayer(other) && _presence.Enter(other))
            {
                Raise(Entered);
            }
        }

        private void OnTriggerExit(Collider other)
        {
            if (IsPlayer(other) && _presence.Exit(other))
            {
                Raise(Exited);
            }
        }

        private bool IsStillInside(Collider other)
        {
            return other != null && other.enabled && other.gameObject.activeInHierarchy && _zone != null && _zone.enabled &&
                   _zone.bounds.Intersects(other.bounds);
        }

        private bool IsPlayer(Collider other)
        {
            return other != null && (playerLayers.value & (1 << other.gameObject.layer)) != 0;
        }

        private static void Raise(Action handler)
        {
            if (handler != null)
            {
                handler();
            }
        }
    }
}
