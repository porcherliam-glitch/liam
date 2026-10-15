using System;
using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Boss fight of a named enemy that runs on the normal enemy AI (GDD 01 11.4: Prolog-Rissbrut, Glutfang): shows the boss
    /// health bar while the enemy fights, counts the phases from the health thresholds of its <see cref="BossDefinition"/>,
    /// calls the helpers of a phase (they break out of hiding or charge) and publishes <c>BossEncounterStarted</c>,
    /// <c>BossPhaseChanged</c> and <c>BossEncounterEnded</c> (no saving during the fight). When the boss falls, its helpers
    /// leave the fight (the Rissbrut's spawn crumbles, the pack flees).
    /// </summary>
    /// <remarks>
    /// GameObject: the enemy root next to <see cref="EnemyController"/>. Helpers are children of the spawn group, switched off
    /// until their phase and not part of the group's spawner list (no respawn, they do not count for "group cleared").
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class NamedBossEncounter : MonoBehaviour
    {
        private const float DisengageSeconds = 6f;
        private const float HideAfterDeathSeconds = 2f;
        private const float PlayerHitMemorySeconds = 8f;

        [Tooltip("Boss-Daten (Name, Titel, Phasen-Schwellen). Pflichtfeld.")]
        [SerializeField] private BossDefinition definition = null;

        [Tooltip("Gegner. Leer = EnemyController am selben GameObject.")]
        [SerializeField] private EnemyController enemy = null;

        [Tooltip("Helfer je Phase: Eintrag 0 kommt in Phase 2, Eintrag 1 in Phase 3 (Gruppen-Objekte, anfangs aus).")]
        [SerializeField] private List<GameObject> phaseHelpers = new List<GameObject>();

        [Tooltip("Partikel beim Phasenwechsel (Heulen, Rissruf; optional).")]
        [SerializeField] private ParticleSystem phaseBurst = null;

        private Combatant _combatant;
        private Health _health;
        private IBossBarService _bar;
        private IEventBus _bus;
        private BossPhaseTracker _phases;
        private bool _shown;
        private bool _encounterRunning;
        private float _idle;
        private float _lastPlayerHit = -100f;
        private float _deathTimer = -1f;

        /// <summary>Raised when a new phase begins (phase number from 2).</summary>
        public event Action<int> PhaseStarted;

        /// <summary>Boss id (quests, events).</summary>
        public string BossId => definition != null ? definition.BossId : string.Empty;

        /// <summary>Current phase (1 = start).</summary>
        public int Phase => _phases != null ? _phases.Phase : 1;

        /// <summary>True while the boss bar is shown.</summary>
        public bool IsBarShown => _shown;

        /// <summary>Helper groups per phase (index 0 = phase 2).</summary>
        public IReadOnlyList<GameObject> PhaseHelpers => phaseHelpers;

        private void Awake()
        {
            if (enemy == null)
            {
                TryGetComponent(out enemy);
            }

            TryGetComponent(out _combatant);
            SetHelpersActive(false);
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                Services.Locator.TryGet(out _bar);
                Services.Locator.TryGet(out _bus);
                _health = _combatant != null ? _combatant.Health : null;
                if (_health != null)
                {
                    _health.Died += OnDied;
                }

                if (enemy != null)
                {
                    enemy.HitTaken += OnHitTaken;
                }

                if (definition == null)
                {
                    Log.Warning(LogCategory.AI, "NamedBossEncounter on '" + name + "' has no BossDefinition: no boss bar.");
                }
                else
                {
                    _phases = new BossPhaseTracker(definition.PhaseThresholds);
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.AI, exception, "NamedBossEncounter could not resolve its services.");
            }
        }

        private void OnDisable()
        {
            EndEncounter(false);
            Hide();
        }

        private void OnDestroy()
        {
            if (_health != null)
            {
                _health.Died -= OnDied;
            }

            if (enemy != null)
            {
                enemy.HitTaken -= OnHitTaken;
            }
        }

        private void Update()
        {
            if (_bar == null || _health == null || _phases == null)
            {
                return;
            }

            if (_deathTimer >= 0f)
            {
                _deathTimer -= Time.deltaTime;
                if (_deathTimer < 0f)
                {
                    Hide();
                }

                return;
            }

            if (!_health.IsAlive)
            {
                return;
            }

            bool fighting = (enemy != null && enemy.IsEngaged) || Time.time - _lastPlayerHit < PlayerHitMemorySeconds;
            if (fighting)
            {
                _idle = 0f;
                if (!_shown)
                {
                    Show();
                }
            }
            else if (_shown)
            {
                _idle += Time.deltaTime;
                if (_idle >= DisengageSeconds)
                {
                    // The player left: the fight ends without a winner (saving allowed again).
                    EndEncounter(false);
                    Hide();
                    return;
                }
            }
            else if (_phases.Phase > 1 && _health.Normalized >= 0.999f)
            {
                // Healed back at home: the next fight starts again in phase 1, the helpers went back into hiding.
                _phases.Reset();
                SetHelpersActive(false);
            }

            if (_shown)
            {
                float fraction = _health.Normalized;
                int before = _phases.Phase;
                if (_phases.TryAdvance(fraction, out int phase))
                {
                    // A big hit may skip a phase: every skipped phase still calls its helpers.
                    for (int p = before + 1; p <= phase; p++)
                    {
                        StartPhase(p);
                    }
                }

                _bar.UpdateHealth(BossId, fraction, _phases.Phase);
            }
        }

        private void Show()
        {
            _shown = true;
            _bar.Show(new BossBarState(BossId, definition.DisplayName, definition.Title, _health.Normalized, _phases.Phase, Mathf.Max(1, _phases.PhaseCount),
                true));
            if (!_encounterRunning)
            {
                _encounterRunning = true;
                _bus?.Publish(new BossEncounterStarted(BossId));
            }
        }

        private void Hide()
        {
            if (_shown && _bar != null)
            {
                _bar.Hide(BossId);
            }

            _shown = false;
        }

        private void EndEncounter(bool defeated)
        {
            if (!_encounterRunning)
            {
                return;
            }

            _encounterRunning = false;
            _bus?.Publish(new BossEncounterEnded(BossId, defeated));
        }

        private void StartPhase(int phase)
        {
            _bus?.Publish(new BossPhaseChanged(BossId, phase));
            if (phaseBurst != null)
            {
                phaseBurst.Play(true);
            }

            CallHelpers(phase - 2);
            PhaseStarted?.Invoke(phase);
            Log.Info(LogCategory.AI, "Boss '" + BossId + "' enters phase " + phase + ".");
        }

        private void CallHelpers(int index)
        {
            if (index < 0 || index >= phaseHelpers.Count || phaseHelpers[index] == null)
            {
                return;
            }

            GameObject group = phaseHelpers[index];
            group.SetActive(true);
            foreach (EnemyAmbush ambush in group.GetComponentsInChildren<EnemyAmbush>())
            {
                ambush.Spring();
            }

            foreach (EnemyController helper in group.GetComponentsInChildren<EnemyController>())
            {
                helper.Alert();
            }
        }

        private void SetHelpersActive(bool active)
        {
            for (int i = 0; i < phaseHelpers.Count; i++)
            {
                if (phaseHelpers[i] != null)
                {
                    phaseHelpers[i].SetActive(active);
                }
            }
        }

        private void OnHitTaken(HitReport report)
        {
            if (report.Attacker != null && report.Attacker.Team == CombatTeam.Player)
            {
                _lastPlayerHit = Time.time;
            }
        }

        private void OnDied(DamageInfo killingDamage)
        {
            if (_bar != null && _shown)
            {
                _bar.UpdateHealth(BossId, 0f, Phase);
            }

            _deathTimer = HideAfterDeathSeconds;
            EndEncounter(true);

            // Without their master the helpers leave the fight.
            SetHelpersActive(false);
        }
    }
}
