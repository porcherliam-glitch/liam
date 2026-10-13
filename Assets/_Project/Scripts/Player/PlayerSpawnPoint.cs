using System;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Start position of the player in a scene. Places the referenced <see cref="PlayerMotor"/> here when the game enters
    /// <see cref="GameState.Playing"/> from <see cref="GameState.Loading"/> ("Loading → Playing: Zellen aktiv, Spieler
    /// platziert", architecture 4.4) – or right away if the game already plays – and publishes <see cref="PlayerSpawned"/>.
    /// Spawns once per scene lifetime.
    /// </summary>
    /// <remarks>
    /// GameObject: an empty object in the scene; its position and Y rotation are the spawn pose. The forward direction is
    /// drawn as a gizmo in the Scene view. Later the world streaming takes over (architecture 4.1 "DevSpawnPoint").
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerSpawnPoint : MonoBehaviour
    {
        [Tooltip("Die Spielfigur (PlayerMotor am Spieler-Objekt), die hier platziert wird.")]
        [SerializeField] private PlayerMotor player = null;

        [Tooltip("ID des Weltraums für das Event PlayerSpawned, z. B. worldspace.test.testgelaende.")]
        [SerializeField] private string worldSpaceId = "worldspace.test.testgelaende";

        private IEventBus _eventBus;
        private IGameStateService _gameState;
        private bool _subscribed;
        private bool _spawned;

        /// <summary>True after the player was placed here.</summary>
        public bool HasSpawned => _spawned;

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                IEventBus eventBus = await Services.WaitForAsync<IEventBus>(destroyCancellationToken);
                _gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                _eventBus = eventBus;
                if (_gameState.BaseState == GameState.Playing)
                {
                    Spawn();
                }

                Subscribe();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerSpawnPoint '" + name + "' could not resolve its services.");
            }
        }

        private void OnEnable()
        {
            Subscribe();
        }

        private void OnDisable()
        {
            Unsubscribe();
        }

        private void Subscribe()
        {
            if (_eventBus == null || _subscribed || !isActiveAndEnabled || _spawned)
            {
                return;
            }

            _eventBus.Subscribe<GameStateChanged>(OnGameStateChanged);
            _subscribed = true;
        }

        private void Unsubscribe()
        {
            if (_subscribed)
            {
                _eventBus.Unsubscribe<GameStateChanged>(OnGameStateChanged);
                _subscribed = false;
            }
        }

        private void OnGameStateChanged(GameStateChanged evt)
        {
            if (evt.Previous == GameState.Loading && evt.Current == GameState.Playing)
            {
                Spawn();
            }
        }

        /// <summary>
        /// Places the player here again and publishes <see cref="PlayerSpawned"/> (respawn after death, GDD 03 4.12; until
        /// checkpoints exist the spawn point is the checkpoint).
        /// </summary>
        public void Respawn()
        {
            _spawned = false;
            Spawn();
        }

        private void Spawn()
        {
            if (_spawned)
            {
                return;
            }

            if (player == null)
            {
                Log.Error(LogCategory.Player, "PlayerSpawnPoint '" + name + "': the field 'Player' is empty, nobody is spawned.");
                return;
            }

            _spawned = true;
            Vector3 position = transform.position;
            player.Teleport(position, Quaternion.Euler(0f, transform.eulerAngles.y, 0f));
            var spawned = new PlayerSpawned(position, worldSpaceId);
            Log.Info(LogCategory.Player, "Player spawned at " + position + " in '" + worldSpaceId + "'.");
            if (_eventBus != null)
            {
                _eventBus.Publish(in spawned);
            }

            Unsubscribe();
        }

        private void OnDrawGizmos()
        {
            Vector3 position = transform.position;
            Vector3 forward = Quaternion.Euler(0f, transform.eulerAngles.y, 0f) * Vector3.forward;
            Gizmos.color = new Color(0.2f, 0.9f, 0.3f, 0.9f);
            Gizmos.DrawWireSphere(position + Vector3.up * 0.9f, 0.4f);
            Gizmos.DrawLine(position, position + Vector3.up * 1.8f);
            Gizmos.DrawLine(position + Vector3.up * 0.9f, position + Vector3.up * 0.9f + forward);
        }
    }
}
