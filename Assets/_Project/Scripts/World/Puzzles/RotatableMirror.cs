using System;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// A mirror on a stand that turns one step clockwise per use (GDD 02 11.7: "3 drehbare Spiegel (je 4 Stellungen)"): its
    /// pivot points in the direction the mirror sends the Aether beam (north, east, south, west). The direction is saved under
    /// the mirror id (start position = nothing saved). The <see cref="MirrorPuzzleController"/> or the arena beam read it; the
    /// boss reads the pivot's forward direction for the stun beam (GDD 02 11.7, phase 2).
    /// </summary>
    /// <remarks>
    /// GameObject: the stand with a trigger collider on the layer Interactable; <see cref="pivot"/> is the turning part (frame,
    /// glass and the arrow marker that shows the beam direction).
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class RotatableMirror : WorldStateBehaviour, IInteractable
    {
        [Tooltip("Stabile ID, z. B. obj.eichental.gruft_spiegel_1.")]
        [SerializeField] private string objectId = "obj.neu.spiegel";

        [Tooltip("Hinweistext, z. B. „Drehen: Spiegel 1“.")]
        [SerializeField] private string prompt = "Drehen: Spiegel";

        [Tooltip("Richtung, in die der Spiegel den Strahl am Anfang lenkt („stehen schief“).")]
        [SerializeField] private GridDirection startDirection = GridDirection.North;

        [Tooltip("Drehbarer Teil; seine Vorwärtsrichtung (z) zeigt in die Strahlrichtung.")]
        [SerializeField] private Transform pivot = null;

        [Tooltip("Drehgeschwindigkeit in Grad pro Sekunde.")]
        [Range(30f, 720f)] [SerializeField] private float turnSpeed = 240f;

        private GridDirection _direction;
        private float _shownYaw;

        /// <summary>Stable id.</summary>
        public string ObjectId => objectId ?? string.Empty;

        /// <summary>Current direction of the beam leaving the mirror.</summary>
        public GridDirection Direction => _direction;

        /// <summary>Start direction.</summary>
        public GridDirection StartDirection => startDirection;

        /// <summary>The turning part (beam direction = its forward).</summary>
        public Transform Pivot => pivot != null ? pivot : transform;

        /// <summary>True while it cannot be turned (puzzle solved).</summary>
        public bool IsLocked { get; private set; }

        /// <summary>Raised after a turn by the player.</summary>
        public event Action<RotatableMirror> Rotated;

        /// <inheritdoc />
        public string InteractionObjectId => ObjectId;

        /// <inheritdoc />
        public string InteractionVerb => InteractionVerbs.Use;

        /// <inheritdoc />
        public string InteractionPrompt => prompt ?? string.Empty;

        /// <inheritdoc />
        public int InteractionPriority => 5;

        /// <inheritdoc />
        public Vector3 InteractionPosition => transform.position;

        /// <inheritdoc />
        public bool CanInteract(in InteractionContext context)
        {
            return !IsLocked && isActiveAndEnabled;
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            if (!CanInteract(context))
            {
                return false;
            }

            _direction = GridDirections.Clockwise(_direction);
            if (IsReady)
            {
                Store.SetState(ObjectId, _direction == startDirection ? WorldObjectStates.Initial : WorldObjectStates.FromDirection(_direction));
            }

            Action<RotatableMirror> rotated = Rotated;
            if (rotated != null)
            {
                rotated(this);
            }

            return true;
        }

        /// <summary>Locks or unlocks the mirror.</summary>
        /// <param name="locked">True: cannot be turned.</param>
        public void SetLocked(bool locked)
        {
            IsLocked = locked;
        }

        /// <summary>Direction stored for a mirror id (start direction if nothing is stored).</summary>
        /// <param name="store">Store.</param>
        /// <param name="id">Mirror id.</param>
        /// <param name="start">Start direction.</param>
        public static GridDirection StoredDirection(IWorldObjectStateStore store, string id, GridDirection start)
        {
            return store != null && WorldObjectStates.TryGetDirection(store.GetState(id), out GridDirection direction) ? direction : start;
        }

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            ApplyStoredState();
        }

        /// <inheritdoc />
        protected override void OnStatesReplaced()
        {
            ApplyStoredState();
        }

        private void Awake()
        {
            _direction = startDirection;
            _shownYaw = GridDirections.Yaw(_direction);
            ApplyYaw();
        }

        private void Update()
        {
            float target = GridDirections.Yaw(_direction);
            if (Mathf.Approximately(Mathf.DeltaAngle(_shownYaw, target), 0f))
            {
                return;
            }

            _shownYaw = Mathf.MoveTowardsAngle(_shownYaw, target, turnSpeed * Time.deltaTime);
            ApplyYaw();
        }

        private void ApplyStoredState()
        {
            _direction = StoredDirection(Store, ObjectId, startDirection);
            _shownYaw = GridDirections.Yaw(_direction);
            ApplyYaw();
        }

        private void ApplyYaw()
        {
            // World yaw: the stand itself is not rotated by the generator, so the pivot's local yaw is the world yaw.
            Pivot.localRotation = Quaternion.Euler(0f, _shownYaw, 0f);
        }
    }
}
