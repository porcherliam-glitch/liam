using System;
using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using Unity.Cinemachine;
using UnityEngine;

namespace Aetherfall.CameraSystem
{
    /// <summary>
    /// Camera shake on hits (architecture 11.2 "Kamera-Shake: CinemachineImpulseSource an Treffern", GDD 03 2.2/4.11):
    /// listens to <see cref="ICombatService.HitLanded"/> and sends an impulse with the amplitude and duration of the hit
    /// (combo finisher 0.02, heavy 0.04, critical 0.06, poise break 0.07, player hit 0.03/0.08 …). Every Cinemachine camera
    /// needs a <see cref="CinemachineImpulseListener"/> to feel it. Switchable (field "Shake an") with a global strength
    /// (option 0–100 %, GDD 05); at 0 there is no replacement effect either.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: "CameraShake" next to a <see cref="CinemachineImpulseSource"/> (channel 1, uniform, shape bump).</para>
    /// <para>The source's definition is never changed: Cinemachine 3.1 reads <c>ImpulseDuration</c> of a running impulse
    /// live (<c>SignalSource.SignalDuration</c>), so changing it for a new hit would squash or cut a shake that is still
    /// running. Each shake duration (rounded to 10 ms) gets its own copy of the source's settings instead.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class CameraImpulseOnHit : MonoBehaviour
    {
        [Tooltip("Impulsquelle. Leer = CinemachineImpulseSource am selben GameObject.")]
        [SerializeField] private CinemachineImpulseSource impulseSource = null;

        [Tooltip("Kamera-Wackeln bei Treffern an/aus (Option, GDD 05).")]
        [SerializeField] private bool shakeEnabled = true;

        [Tooltip("Stärke 0–100 % (GDD 05: Option „Kamera-Wackeln“). 1 = Werte aus GDD 03, 4.11.")]
        [Range(0f, 1f)] [SerializeField] private float strength = 1f;

        [Tooltip("Nur Treffer, an denen der Spieler beteiligt ist (als Angreifer oder Ziel).")]
        [SerializeField] private bool onlyPlayerHits = true;

        private readonly List<CinemachineImpulseDefinition> _byDuration = new List<CinemachineImpulseDefinition>(8);
        private ICombatService _service;
        private bool _subscribed;

        /// <summary>Shake on hits (option).</summary>
        public bool ShakeEnabled
        {
            get => shakeEnabled;
            set => shakeEnabled = value;
        }

        private void Awake()
        {
            if (impulseSource == null)
            {
                TryGetComponent(out impulseSource);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                Services.Locator.TryGet(out _service);
                Subscribe();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Camera, exception, "CameraImpulseOnHit could not resolve ICombatService.");
            }
        }

        private void OnEnable()
        {
            Subscribe();
        }

        private void OnDisable()
        {
            if (_subscribed)
            {
                _service.HitLanded -= OnHitLanded;
                _subscribed = false;
            }
        }

        private void Subscribe()
        {
            if (_service == null || _subscribed || !isActiveAndEnabled)
            {
                return;
            }

            _service.HitLanded += OnHitLanded;
            _subscribed = true;
        }

        private void OnHitLanded(HitReport report)
        {
            if (!shakeEnabled || strength <= 0f || impulseSource == null || report.ShakeAmplitude <= 0f)
            {
                return;
            }

            bool playerInvolved = (report.Attacker != null && report.Attacker.Team == CombatTeam.Player) ||
                                  (report.Target != null && report.Target.Team == CombatTeam.Player);
            if (onlyPlayerHits && !playerInvolved)
            {
                return;
            }

            CinemachineImpulseDefinition template = impulseSource.ImpulseDefinition;
            if (template == null)
            {
                return;
            }

            // Legacy impulses take their length from the time envelope, not from ImpulseDuration.
            bool ownDuration = report.ShakeDuration > 0f && template.ImpulseType != CinemachineImpulseDefinition.ImpulseTypes.Legacy;
            CinemachineImpulseDefinition definition = ownDuration ? DefinitionFor(template, report.ShakeDuration) : template;

            // Mostly vertical with a random sideways part, amplitude in impulse units (about metres, GDD 03 4.11).
            float side = UnityEngine.Random.Range(-0.6f, 0.6f);
            Vector3 velocity = new Vector3(side, -1f, 0f).normalized * (report.ShakeAmplitude * strength);
            definition.CreateEvent(impulseSource.transform.position, velocity);
        }

        private CinemachineImpulseDefinition DefinitionFor(CinemachineImpulseDefinition template, float duration)
        {
            float rounded = Mathf.Max(0.01f, Mathf.Round(duration * 100f) * 0.01f);
            CinemachineImpulseDefinition definition = null;
            for (int i = 0; i < _byDuration.Count; i++)
            {
                if (Mathf.Abs(_byDuration[i].ImpulseDuration - rounded) < 0.001f)
                {
                    definition = _byDuration[i];
                    break;
                }
            }

            if (definition == null)
            {
                // One small object per distinct duration (the feedback table has only a few).
                definition = new CinemachineImpulseDefinition { ImpulseDuration = rounded };
                _byDuration.Add(definition);
            }

            // Settings follow the source (changes in the inspector apply); the duration of this copy never changes.
            definition.ImpulseChannel = template.ImpulseChannel;
            definition.ImpulseShape = template.ImpulseShape;
            definition.CustomImpulseShape = template.CustomImpulseShape;
            definition.ImpulseType = template.ImpulseType;
            definition.DissipationRate = template.DissipationRate;
            definition.DissipationDistance = template.DissipationDistance;
            definition.PropagationSpeed = template.PropagationSpeed;
            return definition;
        }
    }
}
