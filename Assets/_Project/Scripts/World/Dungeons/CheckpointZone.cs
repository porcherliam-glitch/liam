using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.World.Puzzles;
using UnityEngine;

namespace Aetherfall.World.Dungeons
{
    /// <summary>
    /// Checkpoint before a boss (GDD 03 4.12 "Wiedereinstieg am letzten Checkpoint"; GDD 05 5.3 "Vor einem Bosskampf
    /// (Vorkammer, nicht in der Arena)"): when the player enters, the scene's spawn point moves to <see cref="respawnPoint"/>
    /// (the player respawns here after death), the checkpoint is stored as reached (1) and an autosave is requested. After a
    /// load the spawn point moves here again as soon as the player was placed (not before: arriving through the entrance still
    /// starts at the entrance).
    /// </summary>
    /// <remarks>
    /// GameObject: trigger volume with <see cref="PlayerPresenceZone"/> (layer TriggerVolume) in the antechamber;
    /// <see cref="spawnPoint"/> is the transform of the scene's PlayerSpawnPoint.
    /// </remarks>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(PlayerPresenceZone))]
    public sealed class CheckpointZone : WorldStateBehaviour
    {
        [Tooltip("Stabile ID, z. B. checkpoint.gruft.vorkammer.")]
        [SerializeField] private string checkpointId = "checkpoint.neu";

        [Tooltip("Transform des PlayerSpawnPoint dieser Szene.")]
        [SerializeField] private Transform spawnPoint = null;

        [Tooltip("Hier erscheint der Spieler nach dem Tod (Position und Blickrichtung).")]
        [SerializeField] private Transform respawnPoint = null;

        [Tooltip("Beim Betreten automatisch speichern.")]
        [SerializeField] private bool autosave = true;

        private PlayerPresenceZone _zone;
        private IWorldAutosave _autosave;

        /// <summary>Checkpoint id.</summary>
        public string CheckpointId => checkpointId ?? string.Empty;

        /// <summary>True once reached (in this save).</summary>
        public bool IsReached => IsReady && Store.GetState(CheckpointId) == WorldObjectStates.Done;

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            IServiceLocator locator = Services.Locator;
            if (locator != null)
            {
                locator.TryGet(out _autosave);
            }
        }

        /// <inheritdoc />
        protected override void OnEnable()
        {
            base.OnEnable();
            if (_zone != null)
            {
                _zone.Entered += OnEntered;
            }
        }

        /// <inheritdoc />
        protected override void OnDisable()
        {
            base.OnDisable();
            if (_zone != null)
            {
                _zone.Entered -= OnEntered;
            }
        }

        /// <inheritdoc />
        protected override void SubscribeEvents()
        {
            if (EventBus != null)
            {
                EventBus.Subscribe<PlayerSpawned>(OnPlayerSpawned);
            }
        }

        /// <inheritdoc />
        protected override void UnsubscribeEvents()
        {
            if (EventBus != null)
            {
                EventBus.Unsubscribe<PlayerSpawned>(OnPlayerSpawned);
            }
        }

        private void Awake()
        {
            TryGetComponent(out _zone);
        }

        private void OnEntered()
        {
            MoveSpawnPoint();
            if (!IsReady)
            {
                return;
            }

            bool first = !IsReached;
            Store.SetState(CheckpointId, WorldObjectStates.Done);
            if (first)
            {
                Log.Info(LogCategory.World, "Checkpoint '" + CheckpointId + "' reached.");
            }

            if (autosave && _autosave != null)
            {
                _autosave.RequestAutosave(CheckpointId);
            }
        }

        private void OnPlayerSpawned(PlayerSpawned evt)
        {
            if (IsReached)
            {
                MoveSpawnPoint();
            }
        }

        private void MoveSpawnPoint()
        {
            if (spawnPoint == null || respawnPoint == null)
            {
                return;
            }

            spawnPoint.SetPositionAndRotation(respawnPoint.position, Quaternion.Euler(0f, respawnPoint.eulerAngles.y, 0f));
        }
    }
}
