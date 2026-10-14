using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Generic door, gate or portcullis that follows a rule (<see cref="WorldDoorRules"/>): opens when a puzzle is solved
    /// (gate of the crypt, seal door), when another object reaches a state (hidden door behind the freed grave robber), when a
    /// lever is on, a plate is pressed or a boss is beaten (escape route) – or, as arena gate, closes while the boss fight runs
    /// (GDD 03 9.6 "Arena geschlossen"). A state under the door's own id (quest action "Tuer(id, auf)", condition gate of
    /// Aetherfall.World.Gameplay) overrides the rule. The moving part slides by <see cref="openOffset"/>; its collider moves
    /// with it.
    /// </summary>
    /// <remarks>
    /// GameObject: the door root (unmoved) with the moving part as child (solid collider on the layer Environment). Doors derive
    /// their state from the store, so they need no own save entry.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class WorldDoor : WorldStateBehaviour
    {
        [Tooltip("Stabile ID, z. B. door.eichental.gruft_tor (Zustand für Quest-Aktionen „Tür auf/zu“).")]
        [SerializeField] private string doorId = "door.neu";

        [Tooltip("Was die Tür öffnet.")]
        [SerializeField] private DoorTriggerKind trigger = DoorTriggerKind.Manual;

        [Tooltip("ID des Auslösers: Rätsel, Objekt, Hebel, Druckplatte oder Boss.")]
        [SerializeField] private string triggerId = string.Empty;

        [Tooltip("Nur „Objektzustand“: dieser Zustand öffnet die Tür (1 = erledigt/offen).")]
        [SerializeField] private int requiredState = WorldObjectStates.Done;

        [Tooltip("Im neuen Spiel offen (Arena-Tor: offen, schließt im Bosskampf).")]
        [SerializeField] private bool startsOpen = false;

        [Tooltip("Bewegliches Teil (Torflügel, Gitter, Wandstück).")]
        [SerializeField] private Transform movingPart = null;

        [Tooltip("Verschiebung des beweglichen Teils, wenn offen (lokal, Meter). Steintor: nach unten, Fallgitter: nach oben.")]
        [SerializeField] private Vector3 openOffset = new Vector3(0f, -5f, 0f);

        [Tooltip("Öffnungsgeschwindigkeit in Metern pro Sekunde.")]
        [Range(0.2f, 20f)] [SerializeField] private float speed = 2f;

        private Vector3 _closedPosition;
        private bool _hasPart;
        private bool _open;
        private bool _encounterRunning;
        private float _blend;

        /// <summary>Stable id.</summary>
        public string DoorId => doorId ?? string.Empty;

        /// <summary>True while open (or opening).</summary>
        public bool IsOpen => _open;

        /// <summary>Trigger kind.</summary>
        public DoorTriggerKind Trigger => trigger;

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            Evaluate(true);
        }

        /// <inheritdoc />
        protected override void OnStateChanged(string id)
        {
            if (id == DoorId || id == triggerId)
            {
                Evaluate(false);
            }
        }

        /// <inheritdoc />
        protected override void OnStatesReplaced()
        {
            _encounterRunning = false;
            Evaluate(true);
        }

        /// <inheritdoc />
        protected override void SubscribeEvents()
        {
            if (EventBus != null && trigger == DoorTriggerKind.BossArena)
            {
                EventBus.Subscribe<BossEncounterStarted>(OnEncounterStarted);
                EventBus.Subscribe<BossEncounterEnded>(OnEncounterEnded);
            }
        }

        /// <inheritdoc />
        protected override void UnsubscribeEvents()
        {
            if (EventBus != null && trigger == DoorTriggerKind.BossArena)
            {
                EventBus.Unsubscribe<BossEncounterStarted>(OnEncounterStarted);
                EventBus.Unsubscribe<BossEncounterEnded>(OnEncounterEnded);
            }
        }

        private void Awake()
        {
            if (movingPart != null)
            {
                _closedPosition = movingPart.localPosition;
                _hasPart = true;
            }

            _open = startsOpen;
            _blend = startsOpen ? 1f : 0f;
            ApplyVisual();
        }

        private void Update()
        {
            float target = _open ? 1f : 0f;
            if (Mathf.Approximately(_blend, target))
            {
                return;
            }

            float length = openOffset.magnitude;
            float step = length > 0.01f ? speed / length * Time.deltaTime : 1f;
            _blend = Mathf.MoveTowards(_blend, target, step);
            ApplyVisual();
        }

        private void OnEncounterStarted(BossEncounterStarted evt)
        {
            if (evt.BossId == triggerId)
            {
                _encounterRunning = true;
                Evaluate(false);
            }
        }

        private void OnEncounterEnded(BossEncounterEnded evt)
        {
            if (evt.BossId == triggerId)
            {
                _encounterRunning = false;
                Evaluate(false);
            }
        }

        private void Evaluate(bool instant)
        {
            int triggerState = string.IsNullOrEmpty(triggerId) ? WorldObjectStates.Initial : Store.GetState(triggerId);
            bool open = WorldDoorRules.IsOpen(trigger, triggerState, requiredState, startsOpen, Store.GetState(DoorId), _encounterRunning);
            if (open != _open)
            {
                Log.Info(LogCategory.World, "Door '" + DoorId + "' " + (open ? "opens" : "closes") + ".");
            }

            _open = open;
            if (instant)
            {
                _blend = open ? 1f : 0f;
                ApplyVisual();
            }
        }

        private void ApplyVisual()
        {
            if (_hasPart)
            {
                movingPart.localPosition = _closedPosition + openOffset * _blend;
            }
        }
    }
}
