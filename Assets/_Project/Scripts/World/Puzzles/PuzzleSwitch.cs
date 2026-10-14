using System;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Generic switch used with the Interact action (GDD 01 6.7 "Hebel und Sequenzen"): a grave slab that sinks when pressed
    /// (<see cref="SwitchMode.Momentary"/>, the <see cref="SequencePuzzleController"/> lets it spring back), or a lever
    /// (<see cref="SwitchMode.Toggle"/>/<see cref="SwitchMode.OneWay"/>) whose state is saved under its id, so doors with the
    /// trigger "lever" open. The interactor publishes <c>Interacted(id, use)</c> (quest objective "Interagiere").
    /// </summary>
    /// <remarks>
    /// GameObject: the switch with a trigger collider on the layer Interactable (10) for the interactor and the moving part as
    /// child (<see cref="movingPart"/>). Built by the menu "Aetherfall > Gruft erstellen" from the layout objects
    /// <c>grave_slab</c> and <c>lever</c>.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class PuzzleSwitch : WorldStateBehaviour, IInteractable
    {
        [Tooltip("Stabile ID (obj.<region>.<name>), z. B. obj.eichental.gruft_grabplatte_eiche. Nie ändern – der Spielstand nutzt sie.")]
        [SerializeField] private string objectId = "obj.neu.schalter";

        [Tooltip("Hinweistext, z. B. „Drücken: Grabplatte mit Eiche“.")]
        [SerializeField] private string prompt = "Benutzen";

        [Tooltip("Grabplatte (sinkt ein, das Rätsel lässt sie zurückspringen) oder Hebel (an/aus, wird gespeichert).")]
        [SerializeField] private SwitchMode mode = SwitchMode.Momentary;

        [Tooltip("Bewegliches Teil (Platte oder Hebelarm).")]
        [SerializeField] private Transform movingPart = null;

        [Tooltip("Grabplatte: so weit sinkt das Teil ein (lokale Verschiebung in Metern).")]
        [SerializeField] private Vector3 pressedOffset = new Vector3(0f, -0.08f, 0f);

        [Tooltip("Hebel: Drehung des Arms um seine x-Achse in Grad, wenn er an ist.")]
        [Range(-120f, 120f)] [SerializeField] private float onAngle = 70f;

        [Tooltip("Geschwindigkeit der Bewegung (1/s).")]
        [Range(1f, 30f)] [SerializeField] private float speed = 10f;

        private Vector3 _restPosition;
        private Quaternion _restRotation;
        private bool _hasRest;
        private bool _pressed;
        private float _blend;

        /// <summary>Stable id.</summary>
        public string ObjectId => objectId ?? string.Empty;

        /// <summary>Mode.</summary>
        public SwitchMode Mode => mode;

        /// <summary>True while pressed (slab) or on (lever).</summary>
        public bool IsPressed => _pressed;

        /// <summary>True while it cannot be used (puzzle solved).</summary>
        public bool IsLocked { get; private set; }

        /// <summary>Raised after the switch was used (before the interactor publishes Interacted).</summary>
        public event Action<PuzzleSwitch> Used;

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
            if (IsLocked || !isActiveAndEnabled)
            {
                return false;
            }

            // A pressed slab waits until the puzzle lets it spring back; a one-way lever stays on.
            return mode == SwitchMode.Toggle || !_pressed;
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            if (!CanInteract(context))
            {
                return false;
            }

            if (mode == SwitchMode.Momentary)
            {
                SetPressed(true, false);
            }
            else
            {
                bool on = mode == SwitchMode.OneWay || !_pressed;
                SetPressed(on, false);
                if (IsReady)
                {
                    Store.SetState(ObjectId, on ? WorldObjectStates.Done : WorldObjectStates.Initial);
                }
            }

            Action<PuzzleSwitch> used = Used;
            if (used != null)
            {
                used(this);
            }

            return true;
        }

        /// <summary>Sets the pressed (on) state of the visual.</summary>
        /// <param name="pressed">True for down/on.</param>
        /// <param name="instant">True: jump there without animation (loading).</param>
        public void SetPressed(bool pressed, bool instant)
        {
            _pressed = pressed;
            if (instant)
            {
                _blend = pressed ? 1f : 0f;
                ApplyVisual();
            }
        }

        /// <summary>Locks or unlocks the switch.</summary>
        /// <param name="locked">True: cannot be used.</param>
        public void SetLocked(bool locked)
        {
            IsLocked = locked;
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
            if (movingPart != null)
            {
                _restPosition = movingPart.localPosition;
                _restRotation = movingPart.localRotation;
                _hasRest = true;
            }
        }

        private void Update()
        {
            float target = _pressed ? 1f : 0f;
            if (Mathf.Approximately(_blend, target))
            {
                return;
            }

            _blend = Mathf.MoveTowards(_blend, target, speed * Time.deltaTime);
            ApplyVisual();
        }

        private void ApplyStoredState()
        {
            if (mode != SwitchMode.Momentary)
            {
                SetPressed(Store.GetState(ObjectId) == WorldObjectStates.Done, true);
            }
        }

        private void ApplyVisual()
        {
            if (!_hasRest)
            {
                return;
            }

            if (mode == SwitchMode.Momentary)
            {
                movingPart.localPosition = _restPosition + pressedOffset * _blend;
            }
            else
            {
                movingPart.localRotation = _restRotation * Quaternion.Euler(onAngle * _blend, 0f, 0f);
            }
        }
    }
}
