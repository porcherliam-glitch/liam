using System;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Player;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Bridge from the player character (gameplay scene) to the UI of the boot scene: registers itself as
    /// <see cref="IPlayerHudSource"/> with <see cref="IPlayerHudRegistry"/>, so the HUD shows health, stamina, mana, the
    /// locked-on target and the interaction prompt, and the death screen can respawn the player. As soon as the UI root with
    /// the death screen takes the player over, it switches the automatic respawn of <see cref="PlayerRespawn"/> off.
    /// </summary>
    /// <remarks>
    /// GameObject: the player root (the menu "Aetherfall > Testgelaende erstellen" adds it and sets the references).
    /// Waits in <c>Start</c> for the UI services (in the editor the boot scene may load after the test scene); without the UI
    /// installer nothing happens and the player respawns automatically as before.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerHudLink : MonoBehaviour, IPlayerHudSource
    {
        [Tooltip("Lebenspunkte der Figur. Leer = DamageableComponent am selben GameObject.")]
        [SerializeField] private DamageableComponent health = null;

        [Tooltip("Werte mit Ausdauer und Mana. Leer = CharacterStatsComponent am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Zielerfassung (Lock-On) für die Zielanzeige oben. Leer = PlayerLockOn am selben GameObject.")]
        [SerializeField] private PlayerLockOn lockOn = null;

        [Tooltip("Interaktion für den Hinweis „[E] Aufheben“. Leer = PlayerInteractor am selben GameObject.")]
        [SerializeField] private PlayerInteractor interactor = null;

        [Tooltip("Tod und Wiederbeleben (der Todesbildschirm schaltet das automatische Wiederbeleben ab). Leer = PlayerRespawn am selben GameObject.")]
        [SerializeField] private PlayerRespawn respawn = null;

        [Tooltip("Kamera-Transform für den Kompass (Main Camera).")]
        [SerializeField] private Transform cameraTransform = null;

        private IPlayerHudRegistry _registry;
        private Combatant _target;
        private string _targetName = string.Empty;
        private int _targetVersion;
        private bool _subscribed;

        /// <inheritdoc />
        public ResourcePool Health => health != null && health.Health != null ? health.Health.Pool : null;

        /// <inheritdoc />
        public ResourcePool Stamina => stats != null ? stats.Stamina : null;

        /// <inheritdoc />
        public ResourcePool Mana => stats != null ? stats.Mana : null;

        /// <inheritdoc />
        public bool IsDead => respawn != null ? respawn.IsDead : health != null && health.Health != null && health.Health.IsDead;

        /// <inheritdoc />
        public string InteractionPrompt => interactor != null ? interactor.CurrentPrompt : string.Empty;

        /// <inheritdoc />
        public float CameraYaw => cameraTransform != null ? cameraTransform.eulerAngles.y : transform.eulerAngles.y;

        /// <inheritdoc />
        public bool CanRespawn => respawn != null;

        /// <inheritdoc />
        public bool TryGetTarget(out HudTargetInfo target)
        {
            if (_target == null || !_target.IsAlive)
            {
                target = default;
                return false;
            }

            Health targetHealth = _target.Health;
            PoiseMeter poise = _target.Poise;
            float health01 = targetHealth != null && targetHealth.Max > 0f ? targetHealth.Current / targetHealth.Max : 0f;
            float poise01 = poise != null ? (poise.IsStunned ? 1f : poise.BuildupNormalized) : 0f;
            target = new HudTargetInfo(_targetVersion, _targetName, health01, poise01, poise != null && poise.IsStunned);
            return true;
        }

        /// <inheritdoc />
        public void SetAutoRespawn(bool enabled)
        {
            if (respawn != null)
            {
                respawn.AutoRespawn = enabled;
            }
        }

        /// <inheritdoc />
        public void Respawn()
        {
            if (respawn != null)
            {
                respawn.RespawnNow();
            }
        }

        private void Awake()
        {
            if (health == null)
            {
                TryGetComponent(out health);
            }

            if (stats == null)
            {
                TryGetComponent(out stats);
            }

            if (lockOn == null)
            {
                TryGetComponent(out lockOn);
            }

            if (interactor == null)
            {
                TryGetComponent(out interactor);
            }

            if (respawn == null)
            {
                TryGetComponent(out respawn);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                IPlayerHudRegistry registry = await Services.WaitForAsync<IPlayerHudRegistry>(destroyCancellationToken);
                _registry = registry;
                registry.Register(this);
                Log.Info(LogCategory.UI, "PlayerHudLink: player connected to the HUD and the death screen.");
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.UI, exception, "PlayerHudLink could not connect to the UI.");
            }
        }

        private void OnEnable()
        {
            if (lockOn != null && !_subscribed)
            {
                lockOn.TargetChanged += OnTargetChanged;
                _subscribed = true;
                OnTargetChanged(lockOn.Target);
            }
        }

        private void OnDisable()
        {
            if (lockOn != null && _subscribed)
            {
                lockOn.TargetChanged -= OnTargetChanged;
                _subscribed = false;
            }
        }

        private void OnDestroy()
        {
            if (_registry != null)
            {
                _registry.Unregister(this);
                _registry = null;
            }
        }

        private void OnTargetChanged(Combatant target)
        {
            _target = target;
            _targetVersion++;
            _targetName = target != null ? DisplayNameOf(target) : string.Empty;
        }

        private static string DisplayNameOf(Combatant target)
        {
            if (target.TryGetComponent(out EnemyController enemy) && enemy.Definition != null &&
                !string.IsNullOrEmpty(enemy.Definition.DisplayName))
            {
                return enemy.Definition.DisplayName;
            }

            return target.gameObject.name;
        }
    }
}
