using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Death of the player (GDD 03 4.12, simplified): publishes <see cref="PlayerDied"/> (architecture 4.3, event #13) and
    /// blocks saving while dead. Then either the death screen of the UI decides (<see cref="RespawnNow"/> or loading a save),
    /// or – without UI – the player respawns automatically after <c>respawnDelay</c> at the spawn point with full health and
    /// stamina. No XP or gold loss; enemies lose their target and return to their anchors.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the player root. The UI (<c>PlayerHudLink</c>) switches <see cref="AutoRespawn"/> off when its death
    /// screen is ready, so the player chooses between "load the last save" and "respawn at the spawn point".</para>
    /// <para>Loading a save while dead (<see cref="GameLoaded"/>) revives the player where the save placed it: the combat state
    /// is reset, the health keeps the loaded value. TODO (checkpoint step): checkpoints instead of the spawn point, reset
    /// enemies.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerRespawn : MonoBehaviour
    {
        /// <summary>Id of the save lock while the player is dead.</summary>
        public const string DeadBlockerId = "player.dead";

        [Tooltip("Kampf-Wurzel des Spielers. Leer = Combatant am selben GameObject.")]
        [SerializeField] private Combatant combatant = null;

        [Tooltip("Kampfsteuerung des Spielers. Leer = PlayerCombatController am selben GameObject.")]
        [SerializeField] private PlayerCombatController combat = null;

        [Tooltip("Werte mit Ausdauer (wird beim Wiederbeleben aufgefüllt). Leer = CharacterStatsComponent am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Startpunkt, an dem der Spieler wieder erscheint (PlayerSpawnPoint in der Szene).")]
        [SerializeField] private PlayerSpawnPoint spawnPoint = null;

        [Tooltip("Automatisch nach der Verzögerung wiederbeleben. Der Todesbildschirm der Oberfläche schaltet das zur Laufzeit ab " +
                 "und lässt den Spieler wählen.")]
        [SerializeField] private bool autoRespawn = true;

        [Tooltip("Sekunden vom Tod bis zum automatischen Wiedererscheinen (Vorschlag: 3).")]
        [Range(0.5f, 30f)] [SerializeField] private float respawnDelay = 3f;

        [Tooltip("Regions-ID für das Ereignis PlayerDied (leer, bis es das Welt-System gibt).")]
        [SerializeField] private string regionId = "";

        private IEventBus _eventBus;
        private ICombatService _combatService;
        private ISaveManager _saves;
        private float _respawnRemaining = -1f;
        private bool _autoRespawn;
        private bool _dead;
        private bool _subscribed;

        /// <summary>True between death and respawn (or a load that revived the player).</summary>
        public bool IsDead => _dead;

        /// <summary>True while the automatic respawn counts down.</summary>
        public bool IsWaitingForRespawn => _respawnRemaining >= 0f;

        /// <summary>Seconds until the automatic respawn (negative if none is pending).</summary>
        public float RespawnRemaining => _respawnRemaining;

        /// <summary>
        /// True: respawn automatically after the delay. The death screen sets false; a death that is already counting down is
        /// then left to the death screen.
        /// </summary>
        public bool AutoRespawn
        {
            get => _autoRespawn;
            set
            {
                _autoRespawn = value;
                if (!value)
                {
                    _respawnRemaining = -1f;
                }
            }
        }

        /// <summary>Respawns the player at the spawn point now (death screen: "Am Spawnpunkt wiederbeleben"). Only while dead.</summary>
        /// <returns>True if the player was dead and respawned.</returns>
        public bool RespawnNow()
        {
            if (!_dead)
            {
                return false;
            }

            Respawn();
            return true;
        }

        private void Awake()
        {
            _autoRespawn = autoRespawn;
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
                IServiceLocator locator = Services.Locator;
                locator.TryGet(out _combatService);
                locator.TryGet(out _saves);
                SubscribeBus();
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

            SubscribeBus();
        }

        private void OnDisable()
        {
            Health health = combatant != null ? combatant.Health : null;
            if (health != null)
            {
                health.Died -= OnDied;
            }

            if (_subscribed)
            {
                _eventBus.Unsubscribe<GameLoaded>(OnGameLoaded);
                _subscribed = false;
            }
        }

        private void OnDestroy()
        {
            SetDeadBlocker(false);
        }

        private void SubscribeBus()
        {
            if (_eventBus == null || _subscribed || !isActiveAndEnabled)
            {
                return;
            }

            _eventBus.Subscribe<GameLoaded>(OnGameLoaded);
            _subscribed = true;
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
            _dead = true;
            SetDeadBlocker(true);
            Log.Info(LogCategory.Player, "Player died (killer '" + killer + "'), " +
                                         (_autoRespawn ? "respawn in " + respawnDelay + " s." : "waiting for the death screen."));
            if (_eventBus != null)
            {
                _eventBus.Publish(in died);
            }

            _respawnRemaining = _autoRespawn ? respawnDelay : -1f;
        }

        private void OnGameLoaded(GameLoaded evt)
        {
            if (!_dead)
            {
                return;
            }

            Health health = combatant != null ? combatant.Health : null;
            if (health != null && health.IsDead)
            {
                // The save had no health section for the player: revive at the spawn point instead.
                Respawn();
                return;
            }

            _dead = false;
            _respawnRemaining = -1f;
            SetDeadBlocker(false);
            if (combat != null)
            {
                combat.ResetAfterLoad();
            }
            else if (combatant != null)
            {
                combatant.ResetTransientState();
            }

            if (_combatService != null)
            {
                _combatService.ResetCombatState();
            }

            Log.Info(LogCategory.Player, "Player revived by loading '" + evt.SlotId + "'.");
        }

        private void Respawn()
        {
            _respawnRemaining = -1f;
            _dead = false;
            SetDeadBlocker(false);
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

        private void SetDeadBlocker(bool blocked)
        {
            if (_saves == null)
            {
                return;
            }

            if (blocked)
            {
                _saves.AddBlocker(DeadBlockerId, SaveReasonKeys.Dead);
            }
            else
            {
                _saves.RemoveBlocker(DeadBlockerId);
            }
        }
    }
}
