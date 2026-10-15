using System;
using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.AI
{
    /// <summary>
    /// An enemy in ambush (GDD 01 11.4, role "Hinterhalt": the Rissling leaps out of crevices): it waits sunk into the ground,
    /// invisible to lock-on and with its AI asleep, until someone of the player's side comes within <c>triggerRadius</c> or it
    /// takes a hit. Then it rises within a short moment (dust and sparks) and attacks at once.
    /// </summary>
    /// <remarks>
    /// GameObject: the enemy root next to <see cref="EnemyController"/>. The enemy stays active (quests and tools see it); only
    /// its body is hidden. After a respawn it lies in wait again.
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class EnemyAmbush : MonoBehaviour
    {
        private const float CheckInterval = 0.2f;

        [Tooltip("Gegner. Leer = EnemyController am selben GameObject.")]
        [SerializeField] private EnemyController enemy = null;

        [Tooltip("Körper (wird versenkt und wächst beim Auftauchen).")]
        [SerializeField] private Transform body = null;

        [Tooltip("So nah muss der Spieler (oder ein Begleiter) kommen, damit der Gegner hervorbricht (Meter).")]
        [Min(1f)] [SerializeField] private float triggerRadius = 8f;

        [Tooltip("Dauer des Auftauchens in Sekunden.")]
        [Range(0.1f, 2f)] [SerializeField] private float emergeSeconds = 0.45f;

        [Tooltip("So tief liegt der Körper versteckt (Meter).")]
        [Range(0.1f, 2f)] [SerializeField] private float sinkDepth = 0.9f;

        [Tooltip("Partikel beim Hervorbrechen (Staub, Funken; optional).")]
        [SerializeField] private ParticleSystem burst = null;

        private Combatant _combatant;
        private ICombatService _combat;
        private Vector3 _bodyRest;
        private Vector3 _bodyScale;
        private float _timer;
        private float _emerge = -1f;
        private bool _hidden;
        private Health _health;

        /// <summary>True while it waits hidden.</summary>
        public bool IsHidden => _hidden;

        /// <summary>Lets it break out now (tools; a hit does the same).</summary>
        public void Spring()
        {
            if (!_hidden)
            {
                return;
            }

            _hidden = false;
            _emerge = 0f;
            if (burst != null)
            {
                burst.Play(true);
            }

            if (_combatant != null)
            {
                _combatant.SetTargetable(true);
            }

            if (enemy != null)
            {
                enemy.Dormant = false;
                enemy.Alert();
            }
        }

        /// <summary>Back into hiding (respawn).</summary>
        public void Hide()
        {
            _hidden = true;
            _emerge = -1f;
            if (body != null)
            {
                body.localPosition = _bodyRest + Vector3.down * sinkDepth;
                body.localScale = _bodyScale * 0.3f;
            }

            if (_combatant != null)
            {
                _combatant.SetTargetable(false);
            }

            if (enemy != null)
            {
                enemy.Dormant = true;
            }
        }

        private void Awake()
        {
            if (enemy == null)
            {
                TryGetComponent(out enemy);
            }

            TryGetComponent(out _combatant);
            if (body != null)
            {
                _bodyRest = body.localPosition;
                _bodyScale = body.localScale;
            }
        }

        private void OnEnable()
        {
            Hide();
            _health = _combatant != null ? _combatant.Health : null;
            if (_health != null)
            {
                _health.Damaged += OnDamaged;
            }
        }

        private void OnDisable()
        {
            if (_health != null)
            {
                _health.Damaged -= OnDamaged;
                _health = null;
            }
        }

        private void OnDamaged(DamageTaken damage)
        {
            // A hit wakes it at once.
            Spring();
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
                Log.Exception(LogCategory.AI, exception, "EnemyAmbush could not resolve its services.");
            }
        }

        private void Update()
        {
            if (_emerge >= 0f)
            {
                Rise(Time.deltaTime);
                return;
            }

            if (!_hidden)
            {
                return;
            }

            _timer -= Time.deltaTime;
            if (_timer > 0f)
            {
                return;
            }

            _timer = CheckInterval;
            if (SomeoneClose())
            {
                Spring();
            }
        }

        private void Rise(float deltaTime)
        {
            _emerge += deltaTime;
            float t = Mathf.Clamp01(_emerge / emergeSeconds);
            if (body != null)
            {
                // Out of the ground with a little overshoot.
                float lift = 1f - (1f - t) * (1f - t);
                body.localPosition = _bodyRest + Vector3.down * (sinkDepth * (1f - lift)) + Vector3.up * (Mathf.Sin(t * Mathf.PI) * 0.25f);
                body.localScale = _bodyScale * Mathf.Lerp(0.3f, 1f, lift);
            }

            if (t >= 1f)
            {
                _emerge = -1f;
            }
        }

        private bool SomeoneClose()
        {
            if (_combat == null)
            {
                return false;
            }

            IReadOnlyList<Combatant> all = _combat.Combatants;
            Vector3 position = transform.position;
            float limit = triggerRadius * triggerRadius;
            for (int i = 0; i < all.Count; i++)
            {
                Combatant candidate = all[i];
                if (candidate != null && candidate.Team == CombatTeam.Player && candidate.IsAlive &&
                    (candidate.transform.position - position).sqrMagnitude <= limit)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
