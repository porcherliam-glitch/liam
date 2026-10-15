using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Daily routine of a village NPC (GDD 01 7.1): listens to the game clock (<c>TimeOfDayChanged</c>) and walks to the
    /// place of the current block - work, lunch, tavern, home. On the first time signal after loading it stands at once where
    /// its routine says ("Beim Laden stehen sie dort, wo ihr Plan sie vorsieht"); later changes are walked unless nobody sees
    /// the NPC, then it simply arrives. It does not walk while a dialogue, a menu or a cutscene is open.
    /// </summary>
    /// <remarks>
    /// GameObject: the NPC root (marker, figure, talk interactable move with it). The figure animates its legs from the
    /// movement (HumanoidPuppet). Walks straight lines: the generator picks places with a free line between them.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class NpcScheduleRunner : MonoBehaviour
    {
        private const float ArriveDistance = 0.15f;
        private const float TurnDegreesPerSecond = 240f;

        [Tooltip("Blöcke des Tagesablaufs (der erste passende gilt).")]
        [SerializeField] private List<NpcScheduleEntry> entries = new List<NpcScheduleEntry>();

        [Tooltip("Gehgeschwindigkeit in m/s.")]
        [Range(0.5f, 3f)] [SerializeField] private float walkSpeed = 1.3f;

        [Tooltip("Ebenen des Bodens (Gelände, Umgebung) für die Höhe.")]
        [SerializeField] private LayerMask groundLayers = 1;

        [Tooltip("Renderer der Figur (sieht sie niemand, kommt sie ohne Laufen an).")]
        [SerializeField] private List<Renderer> figure = new List<Renderer>();

        private IEventBus _bus;
        private IGameStateService _gameState;
        private int _current = -1;
        private bool _placed;
        private bool _walking;
        private Vector3 _target;
        private readonly RaycastHit[] _hits = new RaycastHit[8];

        /// <summary>The blocks of the routine.</summary>
        public IReadOnlyList<NpcScheduleEntry> Entries => entries;

        /// <summary>Index of the current block (−1 before the first time signal).</summary>
        public int CurrentIndex => _current;

        /// <summary>Activity of the current block (empty before the first time signal).</summary>
        public string CurrentActivity => _current >= 0 && _current < entries.Count ? entries[_current].Activity : string.Empty;

        /// <summary>True while the NPC walks to its next place.</summary>
        public bool IsWalking => _walking;

        /// <summary>Applies the routine for a time of day (the clock does this; tools may call it).</summary>
        /// <param name="hour">Hour 0 … 23.</param>
        /// <param name="minute">Minute 0 … 59.</param>
        public void ApplyTime(int hour, int minute)
        {
            int index = NpcScheduleRules.EntryAt(entries, hour + minute / 60.0);
            if (index < 0)
            {
                return;
            }

            if (index == _current && _placed)
            {
                return;
            }

            _current = index;
            _target = entries[index].Position;
            if (!_placed || !IsSeen())
            {
                PlaceAt(_target, entries[index].Yaw);
                _placed = true;
                _walking = false;
                return;
            }

            _walking = true;
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                Services.Locator.TryGet(out _gameState);
                if (Services.Locator.TryGet(out _bus))
                {
                    _bus.Subscribe<TimeOfDayChanged>(OnTimeOfDayChanged);
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.World, exception, "NpcScheduleRunner could not resolve its services.");
            }
        }

        private void OnDestroy()
        {
            _bus?.Unsubscribe<TimeOfDayChanged>(OnTimeOfDayChanged);
        }

        private void OnTimeOfDayChanged(TimeOfDayChanged evt)
        {
            if (isActiveAndEnabled)
            {
                ApplyTime(evt.Hour, evt.Minute);
            }
        }

        private void Update()
        {
            if (!_walking || (_gameState != null && _gameState.Current != GameState.Playing))
            {
                return;
            }

            Vector3 position = transform.position;
            Vector3 flat = new Vector3(_target.x - position.x, 0f, _target.z - position.z);
            float distance = flat.magnitude;
            if (distance <= ArriveDistance)
            {
                _walking = false;
                PlaceAt(_target, entries[_current].Yaw);
                return;
            }

            Vector3 step = flat / distance * Mathf.Min(distance, walkSpeed * Time.deltaTime);
            Vector3 next = position + step;
            next.y = GroundHeight(next, position.y + 1.5f, position.y);
            Quaternion facing = Quaternion.LookRotation(flat, Vector3.up);
            transform.SetPositionAndRotation(next, Quaternion.RotateTowards(transform.rotation, facing, TurnDegreesPerSecond * Time.deltaTime));
        }

        private void PlaceAt(Vector3 point, float yaw)
        {
            point.y = GroundHeight(point, point.y + 40f, transform.position.y);
            transform.SetPositionAndRotation(point, Quaternion.Euler(0f, yaw, 0f));
        }

        private float GroundHeight(Vector3 point, float fromHeight, float fallback)
        {
            // The highest hit below the start that is not the NPC itself (its body collider would otherwise lift it step by
            // step). While walking the ray starts just above the feet, so a roof overhead is never taken for the ground.
            var origin = new Vector3(point.x, fromHeight, point.z);
            int count = Physics.RaycastNonAlloc(origin, Vector3.down, _hits, 80f, groundLayers, QueryTriggerInteraction.Ignore);
            float best = float.NegativeInfinity;
            for (int i = 0; i < count; i++)
            {
                if (_hits[i].collider != null && !_hits[i].collider.transform.IsChildOf(transform) && _hits[i].point.y > best)
                {
                    best = _hits[i].point.y;
                }
            }

            return float.IsNegativeInfinity(best) ? fallback : best;
        }

        private bool IsSeen()
        {
            for (int i = 0; i < figure.Count; i++)
            {
                if (figure[i] != null && figure[i].isVisible)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
