using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Death of the player for the combat test (GDD 03 4.12, simplified): publishes <see cref="PlayerDied"/> (architecture
    /// 4.3, event #13), waits 3 s and respawns the player at the spawn point with full health and stamina. No XP or gold
    /// loss; enemies lose their target and return to their anchors.
    /// </summary>
    /// <remarks>
    /// GameObject: the player root. TODO (checkpoint/save step): restart at the last autosave or checkpoint, reset enemies,
    /// death screen in the UI.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerRespawn : MonoBehaviour
    {
        [Tooltip("Kampf-Wurzel des Spielers. Leer = Combatant am selben GameObject.")]
        [SerializeField] private Combatant combatant = null;

        [Tooltip("Kampfsteuerung des Spielers. Leer = PlayerCombatController am selben GameObject.")]
        [SerializeField] private PlayerCombatController combat = null;

        [Tooltip("Werte mit Ausdauer (wird beim Wiederbeleben aufgefüllt). Leer = CharacterStatsComponent am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Startpunkt, an dem der Spieler wieder erscheint (PlayerSpawnPoint in der Szene).")]
        [SerializeField] private PlayerSpawnPoint spawnPoint = null;

        [Tooltip("Sekunden vom Tod bis zum Wiedererscheinen (Vorschlag: 3).")]
        [Range(0.5f, 30f)] [SerializeField] private float respawnDelay = 3f;

        [Tooltip("Regions-ID für das Ereignis PlayerDied (leer, bis es das Welt-System gibt).")]
        [SerializeField] private string regionId = "";

        private IEventBus _eventBus;
        private ICombatService _combatService;
        private float _respawnRemaining = -1f;

        /// <summary>True between death and respawn.</summary>
        public bool IsWaitingForRespawn => _respawnRemaining >= 0f;

        /// <summary>Seconds until the respawn (negative if alive).</summary>
        public float RespawnRemaining => _respawnRemaining;

        private void Awake()
        {
            if (combatant == null)
            {
                TryGetComponent(out combatant);
            }

            if (combat == null)
            {
                TryGetComponent(out combat);
            }

            if (stats == null)
            {
                TryGetComponent(out stats);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _eventBus = await Services.WaitForAsync<IEventBus>(destroyCancellationToken);
                Services.Locator.TryGet(out _combatService);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerRespawn could not resolve its services.");
            }
        }

        private void OnEnable()
        {
            Health health = combatant != null ? combatant.Health : null;
            if (health != null)
            {
                health.Died += OnDied;
            }
        }

        private void OnDisable()
        {
            Health health = combatant != null ? combatant.Health : null;
            if (health != null)
            {
                health.Died -= OnDied;
            }
        }

        private void Update()
        {
            if (_respawnRemaining < 0f)
            {
                return;
            }

            _respawnRemaining -= Time.deltaTime;
            if (_respawnRemaining < 0f)
            {
                Respawn();
            }
        }

        private void OnDied(DamageInfo killingDamage)
        {
            string killer = combat != null ? combat.LastAttackerTypeId : string.Empty;
            var died = new PlayerDied(transform.position, killer, regionId);
            Log.Info(LogCategory.Player, "Player died (killer '" + killer + "'), respawn in " + respawnDelay + " s.");
            if (_eventBus != null)
            {
                _eventBus.Publish(in died);
            }

            _respawnRemaining = respawnDelay;
        }

        private void Respawn()
        {
            _respawnRemaining = -1f;
            if (combat != null)
            {
                combat.ResetAfterRespawn();
            }
            else if (combatant != null)
            {
                combatant.ResetForRespawn();
            }

            if (stats != null)
            {
                stats.Stamina.Refill();
            }

            if (_combatService != null)
            {
                _combatService.ResetCombatState();
            }

            if (spawnPoint != null)
            {
                spawnPoint.Respawn();
            }
            else
            {
                Log.Warning(LogCategory.Player, "PlayerRespawn: the field 'Spawn Point' is empty, the player is revived where it died.");
            }
        }
    }
}
