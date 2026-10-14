using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.World.Puzzles;
using UnityEngine;

namespace Aetherfall.World.Gameplay
{
    /// <summary>
    /// Arrow trap (GDD 02 11.7: "Falsche Reihenfolge: Pfeilfalle, 10 % Leben"; GDD 01 6.7 visible pressure plates): fires when
    /// the given puzzle reports a wrong step (<c>PuzzleFailed</c>) or the given pressure plate goes down. Each shot takes a
    /// share of the player's maximum health (not blockable, no kill protection – a full-health player survives many shots)
    /// and lets an arrow fly from every slit to the player.
    /// </summary>
    /// <remarks>GameObject: "Pfeilfalle" near the slits; each slit has a child arrow (thin object, off at start).</remarks>
    [DisallowMultipleComponent]
    public sealed class ArrowTrap : WorldStateBehaviour
    {
        private const float FlightSeconds = 0.25f;

        [Tooltip("Fallen-ID, z. B. trap.eichental.gruft_pfeilfalle (Quelle des Schadens).")]
        [SerializeField] private string trapId = "trap.neu";

        [Tooltip("Rätsel, dessen Fehlversuch die Falle auslöst (leer = keins).")]
        [SerializeField] private string puzzleId = string.Empty;

        [Tooltip("Druckplatte, die die Falle auslöst (leer = keine).")]
        [SerializeField] private string pressurePlateId = string.Empty;

        [Tooltip("Anteil am maximalen Leben pro Auslösung (GDD 02, 11.7: 10 %).")]
        [Range(0f, 1f)] [SerializeField] private float healthFraction = 0.1f;

        [Tooltip("Pfeile (je Schlitz ein Kind-Objekt, aus bis zum Schuss).")]
        [SerializeField] private List<Transform> arrows = new List<Transform>();

        [Tooltip("Mindestabstand zwischen zwei Schüssen (Sekunden).")]
        [Range(0f, 5f)] [SerializeField] private float cooldownSeconds = 1f;

        private readonly List<Vector3> _arrowStarts = new List<Vector3>();
        private ICombatService _combat;
        private Vector3 _flightTarget;
        private float _flightTime = -1f;
        private float _cooldown;

        /// <summary>Trap id.</summary>
        public string TrapId => trapId ?? string.Empty;

        /// <summary>Number of shots in this scene lifetime (debug, tests).</summary>
        public int Shots { get; private set; }

        /// <summary>Fires the trap now (also used by debug tools).</summary>
        public void Fire()
        {
            if (_cooldown > 0f)
            {
                return;
            }

            _cooldown = cooldownSeconds;
            Shots++;
            Combatant player = FindPlayer();
            if (player != null && player.Health != null)
            {
                Health health = player.Health;
                float amount = TrapDamage.Amount(health.Max, healthFraction);
                health.ApplyDamage(new DamageInfo(amount, TrapId, DamageType.Stab));
                _flightTarget = player.transform.position + Vector3.up * 1.2f;
                Log.Info(LogCategory.World, "Trap '" + TrapId + "' hits the player for " + amount.ToString("0.#") + ".");
            }
            else
            {
                _flightTarget = transform.position;
                Log.Info(LogCategory.World, "Trap '" + TrapId + "' fires (no player found).");
            }

            StartFlight();
        }

        /// <inheritdoc />
        protected override void OnStoreReady()
        {
            IServiceLocator locator = Services.Locator;
            if (locator != null)
            {
                locator.TryGet(out _combat);
            }
        }

        /// <inheritdoc />
        protected override void OnStateChanged(string id)
        {
            if (!string.IsNullOrEmpty(pressurePlateId) && id == pressurePlateId && Store.GetState(id) == WorldObjectStates.Done)
            {
                Fire();
            }
        }

        /// <inheritdoc />
        protected override void SubscribeEvents()
        {
            if (EventBus != null)
            {
                EventBus.Subscribe<PuzzleFailed>(OnPuzzleFailed);
            }
        }

        /// <inheritdoc />
        protected override void UnsubscribeEvents()
        {
            if (EventBus != null)
            {
                EventBus.Unsubscribe<PuzzleFailed>(OnPuzzleFailed);
            }
        }

        private void Awake()
        {
            for (int i = 0; i < arrows.Count; i++)
            {
                _arrowStarts.Add(arrows[i] != null ? arrows[i].position : Vector3.zero);
                if (arrows[i] != null)
                {
                    arrows[i].gameObject.SetActive(false);
                }
            }
        }

        private void Update()
        {
            if (_cooldown > 0f)
            {
                _cooldown -= Time.deltaTime;
            }

            if (_flightTime < 0f)
            {
                return;
            }

            _flightTime += Time.deltaTime;
            float t = Mathf.Clamp01(_flightTime / FlightSeconds);
            for (int i = 0; i < arrows.Count; i++)
            {
                if (arrows[i] != null)
                {
                    arrows[i].position = Vector3.Lerp(_arrowStarts[i], _flightTarget, t);
                }
            }

            if (t >= 1f)
            {
                _flightTime = -1f;
                SetArrowsActive(false);
            }
        }

        private void OnPuzzleFailed(PuzzleFailed evt)
        {
            if (!string.IsNullOrEmpty(puzzleId) && evt.PuzzleId == puzzleId)
            {
                Fire();
            }
        }

        private void StartFlight()
        {
            if (arrows.Count == 0)
            {
                return;
            }

            for (int i = 0; i < arrows.Count; i++)
            {
                if (arrows[i] == null)
                {
                    continue;
                }

                arrows[i].position = _arrowStarts[i];
                Vector3 direction = _flightTarget - _arrowStarts[i];
                if (direction.sqrMagnitude > 0.01f)
                {
                    arrows[i].rotation = Quaternion.LookRotation(direction);
                }
            }

            SetArrowsActive(true);
            _flightTime = 0f;
        }

        private void SetArrowsActive(bool active)
        {
            for (int i = 0; i < arrows.Count; i++)
            {
                if (arrows[i] != null)
                {
                    arrows[i].gameObject.SetActive(active);
                }
            }
        }

        private Combatant FindPlayer()
        {
            if (_combat == null)
            {
                return null;
            }

            IReadOnlyList<Combatant> combatants = _combat.Combatants;
            for (int i = 0; i < combatants.Count; i++)
            {
                Combatant combatant = combatants[i];
                if (combatant != null && combatant.Team == CombatTeam.Player && combatant.IsAlive)
                {
                    return combatant;
                }
            }

            return null;
        }
    }
}
