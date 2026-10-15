using System;
using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// "Lasst fallen!" (GDD 02 11.6 phase 2): Grimmbart shouts to the crane and three quarry stones fall - one where the player
    /// stands, two close by. A dark shadow grows on the ground for 1.5 s, then the stone lands and hits everyone within 1.6 m
    /// (Wucht). The stones lie there for a while and stop a charge like the stone blocks of the arena.
    /// </summary>
    /// <remarks>
    /// GameObject: the boss root next to <see cref="BossController"/>. Stones and shadows are switched-off children of the
    /// arena (the stones carry a collider and a <see cref="BossChargeStopper"/>).
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class BossCraneDrop : MonoBehaviour
    {
        /// <summary>Key of the special attack.</summary>
        public const string SpecialKey = "kran";

        private enum StoneState
        {
            Idle,
            Warning,
            Falling,
            Lying
        }

        [Tooltip("Boss. Leer = BossController am selben GameObject.")]
        [SerializeField] private BossController boss = null;

        [Tooltip("Angriffsdaten des Steinschlags (Wucht, Haltung).")]
        [SerializeField] private AttackDefinition stoneAttack = null;

        [Tooltip("Fallende Steine (anfangs aus).")]
        [SerializeField] private List<Transform> stones = new List<Transform>();

        [Tooltip("Schatten am Boden (anfangs aus), gleiche Anzahl wie die Steine.")]
        [SerializeField] private List<Transform> shadows = new List<Transform>();

        [Tooltip("Arena-Fläche (min x, min z, max x, max z): Steine fallen nur hier.")]
        [SerializeField] private Vector4 arena = new Vector4(-15f, -15f, 15f, 15f);

        [Tooltip("Ebenen des Bodens (Gelände).")]
        [SerializeField] private LayerMask groundLayers = 1;

        [Tooltip("Vorwarnzeit: so lange wächst der Schatten (GDD: 1,5 s).")]
        [Range(0.5f, 3f)] [SerializeField] private float warningSeconds = 1.5f;

        [Tooltip("Fallhöhe in Metern.")]
        [Range(4f, 30f)] [SerializeField] private float dropHeight = 12f;

        [Tooltip("Trefferradius beim Aufschlag (Meter).")]
        [Range(0.5f, 4f)] [SerializeField] private float radius = 1.6f;

        [Tooltip("Schaden eines Steins vor der Formel.")]
        [Range(10f, 300f)] [SerializeField] private float damage = 70f;

        [Tooltip("So lange bleibt ein gefallener Stein liegen (Sekunden).")]
        [Range(1f, 60f)] [SerializeField] private float lingerSeconds = 12f;

        private readonly List<StoneState> _states = new List<StoneState>();
        private readonly List<float> _timers = new List<float>();
        private readonly List<Vector3> _targets = new List<Vector3>();
        private Vector3[] _shadowScales = Array.Empty<Vector3>();
        private ICombatService _combat;
        private AttackSpec _attack;
        private System.Random _random;
        private bool _subscribed;

        /// <summary>Number of stones that landed so far.</summary>
        public int Landed { get; private set; }

        /// <summary>Number of combatants the stones hit so far.</summary>
        public int Hits { get; private set; }

        /// <summary>Number of stones in the air or warning right now.</summary>
        public int Pending
        {
            get
            {
                int count = 0;
                for (int i = 0; i < _states.Count; i++)
                {
                    if (_states[i] == StoneState.Warning || _states[i] == StoneState.Falling)
                    {
                        count++;
                    }
                }

                return count;
            }
        }

        /// <summary>Lets the stones fall around a point (the special attack does this at the player).</summary>
        /// <param name="center">Ground point of the first stone.</param>
        public void Drop(Vector3 center)
        {
            int count = Mathf.Min(stones.Count, shadows.Count);
            for (int i = 0; i < count; i++)
            {
                Vector3 point = center;
                if (i > 0)
                {
                    float angle = (float)(_random.NextDouble() * Math.PI * 2.0);
                    float distance = 3f + (float)_random.NextDouble() * 1.5f;
                    point += new Vector3(Mathf.Cos(angle), 0f, Mathf.Sin(angle)) * distance;
                }

                point.x = Mathf.Clamp(point.x, arena.x + 1f, arena.z - 1f);
                point.z = Mathf.Clamp(point.z, arena.y + 1f, arena.w - 1f);
                point = Ground(point);
                _targets[i] = point;
                _states[i] = StoneState.Warning;
                _timers[i] = 0f;
                stones[i].gameObject.SetActive(false);
                if (shadows[i] != null)
                {
                    shadows[i].position = point + Vector3.up * 0.05f;
                    shadows[i].localScale = _shadowScales[i] * 0.2f;
                    shadows[i].gameObject.SetActive(true);
                }
            }
        }

        private void Awake()
        {
            if (boss == null)
            {
                TryGetComponent(out boss);
            }

            _random = new System.Random(name.GetHashCode());
            _shadowScales = new Vector3[shadows.Count];
            for (int i = 0; i < shadows.Count; i++)
            {
                _shadowScales[i] = shadows[i] != null ? shadows[i].localScale : Vector3.one;
            }

            for (int i = 0; i < stones.Count; i++)
            {
                _states.Add(StoneState.Idle);
                _timers.Add(0f);
                _targets.Add(Vector3.zero);
            }

            _attack = stoneAttack != null ? stoneAttack.CreateSpec() : null;
            HideAll();
        }

        private void OnEnable()
        {
            if (boss != null && !_subscribed)
            {
                boss.SpecialFired += OnSpecialFired;
                boss.BossReset += HideAll;
                _subscribed = true;
            }
        }

        private void OnDisable()
        {
            if (boss != null && _subscribed)
            {
                boss.SpecialFired -= OnSpecialFired;
                boss.BossReset -= HideAll;
                _subscribed = false;
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                Services.Locator.TryGet(out _combat);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.AI, exception, "BossCraneDrop could not resolve its services.");
            }
        }

        private void OnSpecialFired(string key)
        {
            if (key != SpecialKey || boss == null)
            {
                return;
            }

            Combatant target = boss.FocusTarget;
            Vector3 center = target != null ? target.transform.position : boss.transform.position + boss.transform.forward * 4f;
            Log.Info(LogCategory.AI, "Grimmbart: \"Lasst fallen!\" - the crane drops its stones.");
            Drop(center);
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            int count = Mathf.Min(stones.Count, shadows.Count);
            for (int i = 0; i < count; i++)
            {
                switch (_states[i])
                {
                    case StoneState.Warning:
                        _timers[i] += dt;
                        if (shadows[i] != null)
                        {
                            shadows[i].localScale = _shadowScales[i] * Mathf.Lerp(0.2f, 1f, Mathf.Clamp01(_timers[i] / warningSeconds));
                        }

                        if (_timers[i] >= warningSeconds * 0.65f && !stones[i].gameObject.activeSelf)
                        {
                            // The stone comes into view during the last third of the warning and lands when it ends.
                            stones[i].position = _targets[i] + Vector3.up * dropHeight;
                            SetStoneSolid(stones[i], false);
                            stones[i].gameObject.SetActive(true);
                            _states[i] = StoneState.Falling;
                        }

                        break;
                    case StoneState.Falling:
                        _timers[i] += dt;
                        float fall = Mathf.Clamp01((_timers[i] - warningSeconds * 0.65f) / (warningSeconds * 0.35f));
                        stones[i].position = _targets[i] + Vector3.up * (dropHeight * (1f - fall * fall));
                        if (fall >= 1f)
                        {
                            Land(i);
                        }

                        break;
                    case StoneState.Lying:
                        _timers[i] += dt;
                        if (_timers[i] >= lingerSeconds)
                        {
                            stones[i].gameObject.SetActive(false);
                            _states[i] = StoneState.Idle;
                        }

                        break;
                }
            }
        }

        private void Land(int index)
        {
            _states[index] = StoneState.Lying;
            _timers[index] = 0f;
            stones[index].position = _targets[index];
            SetStoneSolid(stones[index], true);
            if (shadows[index] != null)
            {
                shadows[index].gameObject.SetActive(false);
            }

            Landed++;
            if (_attack == null || _combat == null || boss == null)
            {
                return;
            }

            var profile = new AttackProfile(DamagePacket.Single(DamageType.Blunt, damage), AttributeScaling.None, damage);
            // The crane is Grimmbart's: he is the attacker, but his own stones never hit him.
            Hits += Explosions.Detonate(boss.Combatant, null, boss.Combatant, _targets[index] + Vector3.up * 0.5f, radius, _attack, profile, 0f,
                _combat.Combatants);
        }

        private Vector3 Ground(Vector3 point)
        {
            if (Physics.Raycast(point + Vector3.up * 30f, Vector3.down, out RaycastHit hit, 60f, groundLayers, QueryTriggerInteraction.Ignore))
            {
                return hit.point;
            }

            return point;
        }

        private void HideAll()
        {
            for (int i = 0; i < stones.Count; i++)
            {
                if (stones[i] != null)
                {
                    stones[i].gameObject.SetActive(false);
                }

                if (i < _states.Count)
                {
                    _states[i] = StoneState.Idle;
                }
            }

            for (int i = 0; i < shadows.Count; i++)
            {
                if (shadows[i] != null)
                {
                    shadows[i].gameObject.SetActive(false);
                }
            }
        }

        private static void SetStoneSolid(Transform stone, bool solid)
        {
            foreach (Collider collider in stone.GetComponentsInChildren<Collider>(true))
            {
                collider.enabled = solid;
            }
        }
    }
}
