using System;
using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Fire pots of "Eisenbart" (GDD 02 11.6 phase 3): the special attack "brandtopf" throws a clay pot full of burning oil in
    /// an arc at the player. Where it shatters the ground burns for a few seconds; an oil puddle nearby goes up in an explosion
    /// (fire + oil, GDD 03 6.6) - also under Grimmbart himself. The water channel at the edge puts burning out.
    /// </summary>
    /// <remarks>
    /// GameObject: the boss root next to <see cref="BossController"/>. Pots and fire areas are switched-off children of the
    /// arena; the oil puddles are those of the arena's barrels.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class BossFirePots : MonoBehaviour
    {
        /// <summary>Key of the special attack.</summary>
        public const string SpecialKey = "brandtopf";

        [Tooltip("Boss. Leer = BossController am selben GameObject.")]
        [SerializeField] private BossController boss = null;

        [Tooltip("Hand, aus der der Topf fliegt.")]
        [SerializeField] private Transform throwPoint = null;

        [Tooltip("Töpfe im Flug (anfangs aus).")]
        [SerializeField] private List<Transform> pots = new List<Transform>();

        [Tooltip("Brennende Flächen am Aufschlag (anfangs aus), gleiche Anzahl wie die Töpfe.")]
        [SerializeField] private List<ElementArea> fires = new List<ElementArea>();

        [Tooltip("Ölpfützen der Arena (von den Fässern); ein Topf in der Nähe zündet sie.")]
        [SerializeField] private List<ElementArea> oil = new List<ElementArea>();

        [Tooltip("Flugzeit des Topfs (Sekunden).")]
        [Range(0.3f, 2f)] [SerializeField] private float flightSeconds = 0.9f;

        [Tooltip("Höhe des Bogens (Meter).")]
        [Range(0.5f, 8f)] [SerializeField] private float arcHeight = 3f;

        [Tooltip("So lange brennt der Boden (Sekunden).")]
        [Range(1f, 20f)] [SerializeField] private float fireSeconds = 6f;

        [Tooltip("Ölpfützen in diesem Abstand zum Aufschlag gehen hoch (Meter).")]
        [Range(0.5f, 8f)] [SerializeField] private float igniteDistance = 3.5f;

        [Tooltip("Auslöseschaden für die Öl-Explosion.")]
        [Range(1f, 200f)] [SerializeField] private float triggerDamage = 40f;

        private readonly List<float> _flight = new List<float>();
        private readonly List<Vector3> _from = new List<Vector3>();
        private readonly List<Vector3> _to = new List<Vector3>();
        private bool _subscribed;

        /// <summary>Number of pots that shattered so far.</summary>
        public int Shattered { get; private set; }

        /// <summary>Number of oil puddles the pots set off.</summary>
        public int Ignited { get; private set; }

        /// <summary>Throws a pot at a point (the special attack does this at the player).</summary>
        /// <param name="target">Ground point.</param>
        /// <returns>True if a pot was free.</returns>
        public bool Throw(Vector3 target)
        {
            for (int i = 0; i < pots.Count; i++)
            {
                if (pots[i] == null || _flight[i] >= 0f)
                {
                    continue;
                }

                _from[i] = throwPoint != null ? throwPoint.position : transform.position + Vector3.up * 1.8f;
                _to[i] = target;
                _flight[i] = 0f;
                pots[i].position = _from[i];
                pots[i].gameObject.SetActive(true);
                return true;
            }

            return false;
        }

        private void Awake()
        {
            if (boss == null)
            {
                TryGetComponent(out boss);
            }

            for (int i = 0; i < pots.Count; i++)
            {
                _flight.Add(-1f);
                _from.Add(Vector3.zero);
                _to.Add(Vector3.zero);
            }

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

        private void OnSpecialFired(string key)
        {
            if (key != SpecialKey || boss == null)
            {
                return;
            }

            Combatant target = boss.FocusTarget;
            Vector3 point = target != null ? target.transform.position : boss.transform.position + boss.transform.forward * 6f;
            if (Throw(point))
            {
                Log.Info(LogCategory.AI, "Grimmbart throws a fire pot.");
            }
        }

        private void Update()
        {
            for (int i = 0; i < pots.Count; i++)
            {
                if (_flight[i] < 0f)
                {
                    continue;
                }

                _flight[i] += Time.deltaTime;
                float t = Mathf.Clamp01(_flight[i] / flightSeconds);
                Vector3 position = Vector3.Lerp(_from[i], _to[i], t) + Vector3.up * (arcHeight * 4f * t * (1f - t));
                pots[i].position = position;
                pots[i].Rotate(Vector3.right, 540f * Time.deltaTime, Space.Self);
                if (t >= 1f)
                {
                    Shatter(i);
                }
            }
        }

        private void Shatter(int index)
        {
            _flight[index] = -1f;
            pots[index].gameObject.SetActive(false);
            Shattered++;
            Vector3 point = _to[index];
            Combatant attacker = boss != null ? boss.Combatant : null;
            for (int i = 0; i < oil.Count; i++)
            {
                ElementArea puddle = oil[i];
                if (puddle != null && puddle.isActiveAndEnabled && puddle.Kind == ElementAreaKind.Oil &&
                    Vector3.Distance(puddle.transform.position, point) <= igniteDistance + puddle.Radius)
                {
                    // GDD 02 11.6: fire + oil = explosion (also when Grimmbart stands in it).
                    puddle.Ignite(attacker, triggerDamage, 0f);
                    Ignited++;
                }
            }

            if (index < fires.Count && fires[index] != null)
            {
                ElementArea fire = fires[index];
                fire.transform.position = point;
                fire.gameObject.SetActive(true);
                fire.Spill(ElementAreaKind.Fire, fireSeconds);
            }
        }

        private void HideAll()
        {
            for (int i = 0; i < pots.Count; i++)
            {
                if (pots[i] != null)
                {
                    pots[i].gameObject.SetActive(false);
                }

                if (i < _flight.Count)
                {
                    _flight[i] = -1f;
                }
            }

            for (int i = 0; i < fires.Count; i++)
            {
                if (fires[i] != null)
                {
                    fires[i].gameObject.SetActive(false);
                }
            }
        }
    }
}
