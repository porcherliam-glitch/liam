using System;
using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Input;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// The player's interactor (architecture 11.3 "Interactor (Spieler) fragt Layer Interactable per OverlapSphere (2 m,
    /// 5 Hz) ab"): finds <see cref="IInteractable"/>s on the layers Interactable and Pickup, chooses the best one in front of
    /// the player (<see cref="InteractionSelector"/>: priority, then distance and angle), exposes its prompt and uses it when
    /// the Interact action is pressed (A with target, E). Publishes <see cref="Interacted"/>.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the player root. Runs before <see cref="PlayerInputReader"/> (execution order −60): on the gamepad
    /// A is shared by Jump and Interact (GDD 03 1.5); a press that interacted does not also jump
    /// (<see cref="InteractedThisFrame"/>).</para>
    /// <para>Only in game state Playing. The prompt is shown by the developer overlay for now (UI step: world marker with
    /// button glyph, GDD 05).</para>
    /// </remarks>
    [DefaultExecutionOrder(-60)]
    [DisallowMultipleComponent]
    public sealed class PlayerInteractor : MonoBehaviour
    {
        private const int MaxHits = 32;

        [Tooltip("Layer mit interagierbaren Objekten (Architektur 2.8: 10 „Interactable“ und 16 „Pickup“).")]
        [SerializeField] private LayerMask interactionLayers = 0;

        [Tooltip("Suchradius in Metern (Architektur 11.3: 2 m).")]
        [Range(0.5f, 5f)] [SerializeField] private float range = InteractionSelector.DefaultRange;

        [Tooltip("Halber Öffnungswinkel „vor dem Spieler“ in Grad (Vorschlag 70°). Ganz nahe Objekte zählen in jeder Richtung.")]
        [Range(10f, 180f)] [SerializeField] private float halfAngle = InteractionSelector.DefaultHalfAngle;

        [Tooltip("Suchen pro Sekunde (Architektur 11.3: 5).")]
        [Range(1f, 30f)] [SerializeField] private float queriesPerSecond = 5f;

        [Tooltip("Höhe des Suchmittelpunkts über den Füßen in Metern.")]
        [Range(0f, 2f)] [SerializeField] private float queryHeight = 0.9f;

        [Tooltip("ID des Interagierenden (reserviert: player).")]
        [SerializeField] private string interactorId = "player";

        private readonly Collider[] _hits = new Collider[MaxHits];
        private readonly List<IInteractable> _found = new List<IInteractable>(MaxHits);
        private readonly List<InteractionCandidate> _candidates = new List<InteractionCandidate>(MaxHits);
        private IGameplayInput _gameplay;
        private IGameStateService _gameState;
        private IEventBus _eventBus;
        private ICombatService _combat;
        private IInteractable _target;
        private float _nextQuery;
        private int _interactFrame = -1;

        /// <summary>The object that Interact would use now, or null.</summary>
        public IInteractable CurrentTarget => IsAlive(_target) ? _target : null;

        /// <summary>Prompt of the current target (German), or empty.</summary>
        public string CurrentPrompt
        {
            get
            {
                IInteractable target = CurrentTarget;
                return target != null ? target.InteractionPrompt : string.Empty;
            }
        }

        /// <summary>True in the frame an Interact press was used (the shared gamepad button then does not jump).</summary>
        public bool InteractedThisFrame => _interactFrame == Time.frameCount;

        /// <summary>Text of the last interaction (debug overlay), e.g. "open obj.test.truhe_holz".</summary>
        public string LastInteraction { get; private set; } = string.Empty;

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                locator.TryGet(out _eventBus);
                locator.TryGet(out _combat);
                if (locator.TryGet(out IInputService input))
                {
                    _gameplay = input.Gameplay;
                }
                else
                {
                    Log.Error(LogCategory.Player, "PlayerInteractor: no IInputService registered, the player cannot interact.");
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerInteractor could not resolve its services.");
            }
        }

        private void Update()
        {
            if (_gameState == null || _gameState.Current != GameState.Playing)
            {
                _target = null;
                return;
            }

            InteractionContext context = CreateContext();
            if (_target != null && (!IsAlive(_target) || !_target.CanInteract(context)))
            {
                _target = null;
                _nextQuery = 0f;
            }

            if (Time.time >= _nextQuery)
            {
                _nextQuery = Time.time + 1f / Mathf.Max(1f, queriesPerSecond);
                _target = FindBest(context);
            }

            if (_target == null || _gameplay == null || !_gameplay.IsActive || !_gameplay.WasPressedThisFrame(GameplayButton.Interact))
            {
                return;
            }

            Use(_target, context);
        }

        /// <summary>
        /// Uses the current target like a press of "Interagieren" (also for automated play-throughs and debug tools): only in
        /// the game state Playing and only the target the interactor found (range, facing, <c>CanInteract</c>).
        /// </summary>
        /// <returns>True if the target was used.</returns>
        public bool InteractWithCurrentTarget()
        {
            if (_gameState == null || _gameState.Current != GameState.Playing || _target == null)
            {
                return false;
            }

            return Use(_target, CreateContext());
        }

        private bool Use(IInteractable used, in InteractionContext context)
        {
            if (!IsAlive(used) || !used.CanInteract(context))
            {
                return false;
            }

            string objectId = used.InteractionObjectId;
            string verb = used.InteractionVerb;
            if (!used.Interact(context))
            {
                return false;
            }

            _interactFrame = Time.frameCount;
            _target = null;
            _nextQuery = 0f;
            LastInteraction = verb + " " + objectId;
            if (_eventBus != null)
            {
                var interacted = new Interacted(objectId, verb);
                _eventBus.Publish(in interacted);
            }

            return true;
        }

        private InteractionContext CreateContext()
        {
            return new InteractionContext(interactorId, transform.position, _combat != null && _combat.InCombat);
        }

        private IInteractable FindBest(in InteractionContext context)
        {
            // Distances are measured from the query point at hip height, not from the feet: an NPC's interaction point sits at
            // chest height (1.5 m) and would otherwise only be in range when the player almost touches the NPC.
            Vector3 origin = transform.position + Vector3.up * queryHeight;
            int count = Physics.OverlapSphereNonAlloc(origin, range + 0.5f, _hits, interactionLayers, QueryTriggerInteraction.Collide);
            _found.Clear();
            _candidates.Clear();
            for (int i = 0; i < count; i++)
            {
                IInteractable interactable = _hits[i].GetComponentInParent<IInteractable>();
                _hits[i] = null;
                if (interactable == null || _found.Contains(interactable))
                {
                    continue;
                }

                Vector3 point = interactable.InteractionPosition;
                _found.Add(interactable);
                _candidates.Add(new InteractionCandidate(point.x, point.y, point.z, interactable.InteractionPriority, interactable.CanInteract(context)));
            }

            int best = InteractionSelector.SelectBest(_candidates, _candidates.Count, origin.x, origin.y, origin.z, transform.eulerAngles.y, range, halfAngle);
            return best >= 0 ? _found[best] : null;
        }

        private static bool IsAlive(IInteractable interactable)
        {
            // Interactables are components: a destroyed one compares equal to null only through UnityEngine.Object.
            return interactable != null && !(interactable is UnityEngine.Object unityObject && unityObject == null);
        }
    }
}
