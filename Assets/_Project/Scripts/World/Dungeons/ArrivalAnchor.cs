using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Arrival point of a scene change (architecture 10.8: "Spieler am Eingangs-Anker"): if the <see cref="IWorldTravelService"/>
    /// expects the player at this anchor, the anchor moves the spawn point of the scene to its own pose in <c>Awake</c> – before
    /// the spawn point places the player (Loading → Playing). Without a pending anchor (new game, start in the editor) the spawn
    /// point stays where it is. With <see cref="AutosaveOnArrival"/> it requests an autosave once the player is placed (GDD 05
    /// 5.3: "nach dem Verlassen von Dungeons").
    /// </summary>
    /// <remarks>
    /// GameObject: an empty object at the arrival pose (position on the floor, Y rotation = view direction). <see cref="spawnPoint"/>
    /// is the transform of the scene's PlayerSpawnPoint (World may not reference the player assembly, so it moves the transform).
    /// "Autosave On Arrival" is on for the anchor in front of a dungeon entrance in the world (Eichental) and off inside the
    /// dungeon (the entrance portal already saved before the travel).
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class ArrivalAnchor : MonoBehaviour
    {
        [Tooltip("Anker-ID, z. B. anchor.gruft.eingang oder anchor.eichental.gruft_eingang.")]
        [SerializeField] private string anchorId = "anchor.neu";

        [Tooltip("Transform des PlayerSpawnPoint dieser Szene.")]
        [SerializeField] private Transform spawnPoint = null;

        [Tooltip("Nach der Ankunft automatisch speichern, sobald die Spielfigur steht (an: Ankunftspunkt vor einem Dungeon-Eingang " +
                 "in der Welt, GDD 05, 5.3 „nach dem Verlassen von Dungeons“; aus: Ankunft im Dungeon, dort hat der Eingang schon " +
                 "gespeichert).")]
        [SerializeField] private bool autosaveOnArrival = false;

        private IEventBus _eventBus;
        private ArrivalAutosave _arrivalSave;
        private bool _subscribed;

        /// <summary>Anchor id.</summary>
        public string AnchorId => anchorId ?? string.Empty;

        /// <summary>True if the anchor saves after an arrival.</summary>
        public bool AutosaveOnArrival => autosaveOnArrival;

        /// <summary>True if the player arrived here in this scene lifetime.</summary>
        public bool Arrived { get; private set; }

        /// <summary>Moves the spawn point to this anchor (also used by tests and debug tools).</summary>
        public void MoveSpawnPointHere()
        {
            if (spawnPoint == null)
            {
                Log.Warning(LogCategory.World, "ArrivalAnchor '" + AnchorId + "': the field 'Spawn Point' is empty.");
                return;
            }

            spawnPoint.SetPositionAndRotation(transform.position, Quaternion.Euler(0f, transform.eulerAngles.y, 0f));
        }

        private void Awake()
        {
            IServiceLocator locator = Services.Locator;
            if (locator == null || !locator.TryGet(out IWorldTravelService travel))
            {
                return;
            }

            if (!travel.TryConsume(AnchorId))
            {
                return;
            }

            MoveSpawnPointHere();
            Arrived = true;
            Log.Info(LogCategory.World, "Arrival at anchor '" + AnchorId + "'.");
            if (autosaveOnArrival)
            {
                locator.TryGet(out IWorldAutosave autosave);
                locator.TryGet(out _eventBus);
                _arrivalSave = new ArrivalAutosave(autosave, AnchorId);
                _arrivalSave.Arm();
            }
        }

        private void OnEnable()
        {
            if (_eventBus == null || _subscribed || _arrivalSave == null || !_arrivalSave.IsArmed)
            {
                return;
            }

            _eventBus.Subscribe<PlayerSpawned>(OnPlayerSpawned);
            _subscribed = true;
        }

        private void OnDisable()
        {
            Unsubscribe();
        }

        private void Unsubscribe()
        {
            if (!_subscribed)
            {
                return;
            }

            _eventBus.Unsubscribe<PlayerSpawned>(OnPlayerSpawned);
            _subscribed = false;
        }

        private void OnPlayerSpawned(PlayerSpawned evt)
        {
            // The spawn point placed the player here (Loading -> Playing): the scene is ready to be saved.
            _arrivalSave.NotifyPlayerSpawned();
            Unsubscribe();
        }

        private void OnDrawGizmos()
        {
            Vector3 position = transform.position;
            Vector3 forward = Quaternion.Euler(0f, transform.eulerAngles.y, 0f) * Vector3.forward;
            Gizmos.color = new Color(0.18f, 0.9f, 0.84f, 0.9f);
            Gizmos.DrawWireCube(position + Vector3.up * 0.05f, new Vector3(1f, 0.1f, 1f));
            Gizmos.DrawLine(position + Vector3.up * 0.5f, position + Vector3.up * 0.5f + forward * 1.5f);
        }
    }
}
