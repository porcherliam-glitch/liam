using System;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Pressure plate (GDD 01 6.7 "Druckplatten"; GDD 05 3.2 "Gefahr: sichtbare Druckplatten"): pressed while a body of the
    /// given layers stands on it (player, enemies; later crates and companions), sinks visibly and writes 1 under its id into
    /// the world object states while pressed (doors with the trigger "pressurePlate" follow). <see cref="Pressed"/> fires on
    /// every new press (traps shoot).
    /// </summary>
    /// <remarks>
    /// GameObject: trigger collider over the plate on the layer TriggerVolume (14) plus kinematic Rigidbody; the visible plate is
    /// <see cref="plate"/>. The pressed state is not meaningful after loading: the plate resets it on start.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class PressurePlate : WorldStateBehaviour
    {
        [Tooltip("Stabile ID, z. B. obj.eichental.gruft_druckplatte_seitengang.")]
        [SerializeField] private string objectId = "obj.neu.druckplatte";

        [Tooltip("Layer, die die Platte drücken (Spieler 6, Gegner 7).")]
        [SerializeField] private LayerMask pressingLayers = (1 << 6) | (1 << 7);

        [Tooltip("Sichtbare Platte (sinkt beim Drücken ein).")]
        [SerializeField] private Transform plate = null;

        [Tooltip("So weit sinkt die Platte (Meter).")]
        [Range(0f, 0.2f)] [SerializeField] private float pressDepth = 0.05f;

        private readonly AreaPresence<Collider> _presence = new AreaPresence<Collider>();
        private Func<Collider, bool> _stillInside;
        private Collider _zone;
        private Vector3 _restPosition;

        /// <summary>Stable id.</summary>
        public string ObjectId => objectId ?? string.Empty;

        /// <summary>True while pressed.</summary>
        public bool IsPressed => _presence.IsInside;

        /// <summary>Raised when the plate goes down.</summary>
        public event Action<PressurePlate> Pressed;

        /// <summary>Raised when the plate comes up again.</summary>
        public event Action<PressurePlate> Released;

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            Store.SetState(ObjectId, IsPressed ? WorldObjectStates.Done : WorldObjectStates.Initial);
        }

        /// <inheritdoc />
        protected override void OnStatesReplaced()
        {
            OnStoreReady();
        }

        /// <inheritdoc />
        protected override void OnDisable()
        {
            base.OnDisable();
            _presence.Reset();
        }

        private void Awake()
        {
            _stillInside = IsStillInside;
            TryGetComponent(out _zone);
            if (plate != null)
            {
                _restPosition = plate.localPosition;
            }
        }

        private void FixedUpdate()
        {
            if (_presence.IsInside && _presence.Prune(_stillInside))
            {
                OnReleased();
            }
        }

        private void OnTriggerEnter(Collider other)
        {
            if (!IsPressing(other) || !_presence.Enter(other))
            {
                return;
            }

            SetVisual(true);
            if (IsReady)
            {
                Store.SetState(ObjectId, WorldObjectStates.Done);
            }

            Log.Debug(LogCategory.World, "Pressure plate '" + ObjectId + "' pressed by '" + other.name + "'.");
            Action<PressurePlate> pressed = Pressed;
            if (pressed != null)
            {
                pressed(this);
            }
        }

        private void OnTriggerExit(Collider other)
        {
            if (IsPressing(other) && _presence.Exit(other))
            {
                OnReleased();
            }
        }

        private void OnReleased()
        {
            SetVisual(false);
            if (IsReady)
            {
                Store.SetState(ObjectId, WorldObjectStates.Initial);
            }

            Action<PressurePlate> released = Released;
            if (released != null)
            {
                released(this);
            }
        }

        private void SetVisual(bool down)
        {
            if (plate != null)
            {
                plate.localPosition = _restPosition + Vector3.down * (down ? pressDepth : 0f);
            }
        }

        private bool IsStillInside(Collider other)
        {
            return other != null && other.enabled && other.gameObject.activeInHierarchy && _zone != null && _zone.enabled &&
                   _zone.bounds.Intersects(other.bounds);
        }

        private bool IsPressing(Collider other)
        {
            return other != null && !other.isTrigger && (pressingLayers.value & (1 << other.gameObject.layer)) != 0;
        }
    }
}
