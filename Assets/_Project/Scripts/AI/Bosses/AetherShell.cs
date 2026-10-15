using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Aether shell of the Prolog-Rissbrut (GDD 02 11.1 s60: "Nutze die neue Kraft", tutorial of the Aether-Stoß): while the
    /// shimmering shell holds, the boss takes only a quarter of the damage. A hit with the Aether-Stoß shatters it: the boss
    /// staggers and takes full damage until the shell has grown back (it fades in for a moment before it holds again).
    /// </summary>
    /// <remarks>
    /// GameObject: the boss root next to <see cref="Combatant"/>; listens to <see cref="AbilityUsedAt"/> with the boss as
    /// target. The shell visual is a child (sphere with a see-through Aether material).
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class AetherShell : MonoBehaviour
    {
        [Tooltip("Fähigkeit, die die Schale bricht.")]
        [SerializeField] private string breakingAbilityId = "ability.aether.aether_stoss";

        [Tooltip("Schadensfaktor, solange die Schale hält (0,25 = ein Viertel).")]
        [Range(0f, 1f)] [SerializeField] private float shieldedDamageFactor = 0.25f;

        [Tooltip("So lange ist die Schale nach dem Bruch weg (Sekunden).")]
        [Range(2f, 60f)] [SerializeField] private float exposedSeconds = 12f;

        [Tooltip("So lange taumelt der Boss nach dem Bruch (Sekunden).")]
        [Range(0f, 6f)] [SerializeField] private float staggerSeconds = 3f;

        [Tooltip("So lange wächst die Schale sichtbar nach, bevor sie wieder schützt (Sekunden).")]
        [Range(0.2f, 4f)] [SerializeField] private float regrowSeconds = 1.5f;

        [Tooltip("Sichtbare Schale (Kind-Objekt).")]
        [SerializeField] private Transform shell = null;

        [Tooltip("Partikel beim Bruch (Splitter; optional).")]
        [SerializeField] private ParticleSystem shatterBurst = null;

        private Combatant _combatant;
        private ICrowdControlTarget _control;
        private IEventBus _bus;
        private AetherShellState _state;
        private Vector3 _shellScale = Vector3.one;

        /// <summary>True while the shell protects the boss.</summary>
        public bool IsIntact => _state == null || _state.IsIntact;

        /// <summary>Number of times the shell broke.</summary>
        public int BreakCount { get; private set; }

        /// <summary>Raised when the shell breaks.</summary>
        public event Action Shattered;

        /// <summary>Breaks the shell now (the Aether-Stoß does this; tools may call it).</summary>
        public void Shatter()
        {
            if (_state == null || !_state.TryBreak())
            {
                return;
            }

            BreakCount++;
            Apply();
            if (shatterBurst != null)
            {
                shatterBurst.Play(true);
            }

            if (_control != null && staggerSeconds > 0f)
            {
                _control.Stagger(staggerSeconds);
            }

            Shattered?.Invoke();
            Log.Info(LogCategory.AI, "'" + name + "': Aether shell shattered.");
        }

        private void Awake()
        {
            TryGetComponent(out _combatant);
            TryGetComponent(out _control);
            if (shell != null)
            {
                _shellScale = shell.localScale;
            }

            _state = new AetherShellState(shieldedDamageFactor, exposedSeconds, regrowSeconds);
        }

        private void OnEnable()
        {
            _state?.Restore();
            Apply();
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                if (Services.Locator.TryGet(out _bus))
                {
                    _bus.Subscribe<AbilityUsedAt>(OnAbilityUsed);
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.AI, exception, "AetherShell could not resolve its services.");
            }
        }

        private void OnDestroy()
        {
            _bus?.Unsubscribe<AbilityUsedAt>(OnAbilityUsed);
        }

        private void OnAbilityUsed(AbilityUsedAt evt)
        {
            if (_combatant != null && evt.AbilityId == breakingAbilityId && evt.TargetId.Length > 0 && evt.TargetId == _combatant.CombatantId)
            {
                Shatter();
            }
        }

        private void Update()
        {
            if (_state == null)
            {
                return;
            }

            if (_combatant != null && !_combatant.IsAlive)
            {
                // The shell falls apart with its master.
                if (shell != null && shell.gameObject.activeSelf)
                {
                    shell.gameObject.SetActive(false);
                }

                return;
            }

            if (_state.IsIntact)
            {
                return;
            }

            _state.Tick(Time.deltaTime);
            Apply();
        }

        private void Apply()
        {
            if (_state == null)
            {
                return;
            }

            if (_combatant != null)
            {
                _combatant.DamageTakenFactor = _state.DamageFactor;
            }

            if (shell != null)
            {
                bool visible = _state.IsIntact || _state.IsRegrowing;
                if (shell.gameObject.activeSelf != visible)
                {
                    shell.gameObject.SetActive(visible);
                }

                shell.localScale = _shellScale * (_state.IsIntact ? 1f : 0.2f + 0.8f * _state.GrowFraction);
            }
        }
    }
}
