using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Input;
using Aetherfall.WorldState;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.Player
{
    /// <summary>
    /// The detective mode of the player (GDD 02 5.1 type 18, GDD 03 1.5 "Investigate", task list S37): while the Investigate
    /// button is held (R, gamepad R3 without a lock-on target) clues and trail marks within 5 m light up
    /// (<see cref="IInvestigatable"/>). With Aether sight (world flag <see cref="InvestigateRules.AetherSightFlag"/>, HQ 4) the
    /// radius is 40 m, hidden paths appear and the player only walks. Sends <see cref="InvestigateModeChanged"/> for the HUD.
    /// </summary>
    /// <remarks>
    /// GameObject: the player root. Finds candidates with an overlap query on <see cref="investigateLayers"/> (Interactable and
    /// TriggerVolume) a few times per second, like the interactor; no costs, no cooldown.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerInvestigator : MonoBehaviour
    {
        [Tooltip("Bewegung des Spielers (Aether-Sicht: nur Gehen). Leer = PlayerMotor am selben GameObject.")]
        [SerializeField] private PlayerMotor motor = null;

        [Tooltip("Lock-On des Spielers: Mit Ziel ist R3 das Anvisieren, nicht das Untersuchen. Leer = PlayerLockOn am selben GameObject.")]
        [SerializeField] private PlayerLockOn lockOn = null;

        [Tooltip("Layer der Hinweise und Spuren (Interactable und TriggerVolume).")]
        [SerializeField] private LayerMask investigateLayers = 0;

        [Tooltip("So oft pro Sekunde wird die Umgebung abgesucht, solange die Taste gehalten wird.")]
        [Range(2f, 20f)] [SerializeField] private float queriesPerSecond = 6f;

        private readonly Collider[] _hits = new Collider[256];
        private readonly HashSet<IInvestigatable> _shown = new HashSet<IInvestigatable>();
        private readonly HashSet<IInvestigatable> _found = new HashSet<IInvestigatable>();
        private readonly List<IInvestigatable> _hide = new List<IInvestigatable>();
        private IGameStateService _gameState;
        private IGameplayInput _gameplay;
        private IWorldState _world;
        private IEventBus _eventBus;
        private bool _active;
        private bool _aetherSight;
        private float _nextQuery;
        private int _publishedCount = -1;

        /// <summary>True while the detective mode is on.</summary>
        public bool IsActive => _active;

        /// <summary>True while Aether sight is on (detective mode with the learned Aether sight).</summary>
        public bool IsAetherSight => _active && _aetherSight;

        /// <summary>Number of things lit up right now.</summary>
        public int RevealedCount => _shown.Count;

        /// <summary>Holds the mode from outside (play tour, tests) as if the button were held.</summary>
        public bool ExternalHold { get; set; }

        private void Awake()
        {
            if (motor == null)
            {
                TryGetComponent(out motor);
            }

            if (lockOn == null)
            {
                TryGetComponent(out lockOn);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                locator.TryGet(out _eventBus);
                locator.TryGet(out _world);
                if (locator.TryGet(out IInputService input))
                {
                    _gameplay = input.Gameplay;
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerInvestigator could not resolve its services.");
            }
        }

        private void OnDisable()
        {
            SetMode(false, false);
        }

        private void Update()
        {
            bool held = ExternalHold || (_gameplay != null && _gameplay.IsActive && _gameplay.IsPressed(GameplayButton.Investigate));
            bool playing = _gameState != null && _gameState.Current == GameState.Playing;
            bool active = InvestigateRules.IsActive(held, lockOn != null && lockOn.HasTarget, playing);
            bool aetherSight = active && _world != null && _world.GetInt(InvestigateRules.AetherSightFlag) > 0;
            if (active != _active || aetherSight != _aetherSight)
            {
                SetMode(active, aetherSight);
            }

            if (!_active || Time.unscaledTime < _nextQuery)
            {
                return;
            }

            _nextQuery = Time.unscaledTime + 1f / queriesPerSecond;
            Scan();
        }

        private void SetMode(bool active, bool aetherSight)
        {
            bool changed = active != _active;
            _active = active;
            _aetherSight = aetherSight;
            _nextQuery = 0f;
            if (motor != null)
            {
                // GDD 03: Aether sight limits the movement to walking.
                motor.SetSenseSlow(active && aetherSight);
            }

            if (!active)
            {
                HideAll();
            }

            if (changed && active)
            {
                Log.Info(LogCategory.Player, aetherSight ? "Aether sight on." : "Investigating.");
            }

            Publish(true);
        }

        private void Scan()
        {
            Vector3 origin = transform.position + Vector3.up;
            float radius = InvestigateRules.Radius(_aetherSight);
            int count = Physics.OverlapSphereNonAlloc(origin, radius, _hits, investigateLayers, QueryTriggerInteraction.Collide);
            _found.Clear();
            for (int i = 0; i < count; i++)
            {
                IInvestigatable target = _hits[i].GetComponentInParent<IInvestigatable>();
                if (target == null || _found.Contains(target) || !target.IsWorthRevealing)
                {
                    continue;
                }

                float distance = Vector3.Distance(origin, target.InvestigatePosition);
                if (InvestigateRules.Reveals(target.InvestigateKind, _aetherSight, distance))
                {
                    _found.Add(target);
                }
            }

            _hide.Clear();
            foreach (IInvestigatable shown in _shown)
            {
                if (!_found.Contains(shown))
                {
                    _hide.Add(shown);
                }
            }

            foreach (IInvestigatable gone in _hide)
            {
                Hide(gone);
            }

            foreach (IInvestigatable target in _found)
            {
                target.SetRevealed(true, _aetherSight);
                _shown.Add(target);
            }

            Publish(false);
        }

        private void HideAll()
        {
            _hide.Clear();
            _hide.AddRange(_shown);
            foreach (IInvestigatable target in _hide)
            {
                Hide(target);
            }

            _shown.Clear();
        }

        private void Hide(IInvestigatable target)
        {
            _shown.Remove(target);
            if (target is Object unityObject && unityObject == null)
            {
                // Destroyed with its scene.
                return;
            }

            target.SetRevealed(false, false);
        }

        private void Publish(bool force)
        {
            int count = _active ? _shown.Count : 0;
            if (!force && count == _publishedCount)
            {
                return;
            }

            _publishedCount = count;
            if (_eventBus != null)
            {
                var changed = new InvestigateModeChanged(_active, _active && _aetherSight, count);
                _eventBus.Publish(in changed);
            }
        }
    }
}
