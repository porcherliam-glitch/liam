using System;
using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Grimmbart's militia war horn (GDD 02 11.6 phase 1): the special attack "horn" calls two Bandit-Schläger (one on the
    /// difficulty "Geschichte" or after the guards were killed). A head hit or a stun during the 1.2 s wind-up breaks the call
    /// off; three ranged hits on the horn shoot it off the belt, and a stolen horn never sounds. When Grimmbart falls or the
    /// fight starts over, the called bandits leave.
    /// </summary>
    /// <remarks>
    /// GameObject: the boss root next to <see cref="BossController"/>. The horn is a child of the model with a weak-point
    /// hurtbox; the bandits are switched-off children of the arena (not counted by any spawn group).
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class BossHornCall : MonoBehaviour
    {
        /// <summary>Key of the special attack.</summary>
        public const string SpecialKey = "horn";

        [Tooltip("Boss. Leer = BossController am selben GameObject.")]
        [SerializeField] private BossController boss = null;

        [Tooltip("Kriegshorn am Gürtel (mit Schwachpunkt-Trefferzone).")]
        [SerializeField] private Transform horn = null;

        [Tooltip("Banditen, die das Horn ruft (anfangs aus).")]
        [SerializeField] private List<EnemyController> helpers = new List<EnemyController>();

        [Tooltip("So viele Banditen ruft ein Hornstoß (GDD 02, 11.6: 2).")]
        [Range(1, 4)] [SerializeField] private int helpersPerCall = 2;

        [Tooltip("So viele Fernkampftreffer schießen das Horn vom Gürtel.")]
        [Range(1, 10)] [SerializeField] private int hitsToShootOff = 3;

        [Tooltip("So lange taumelt Grimmbart, wenn der Hornruf unterbrochen wird (Sekunden).")]
        [Range(0.2f, 4f)] [SerializeField] private float interruptSeconds = 1.5f;

        [Tooltip("Partikel beim Hornstoß (optional).")]
        [SerializeField] private ParticleSystem blast = null;

        private IDifficultyService _difficulty;
        private int _hornHits;
        private bool _hornLost;
        private bool _disablePending;
        private bool _fewerHelpers;
        private bool _subscribed;

        /// <summary>True while Grimmbart still carries the horn.</summary>
        public bool HasHorn => !_hornLost;

        /// <summary>Ranged hits on the horn so far.</summary>
        public int HornHits => _hornHits;

        /// <summary>Number of horn calls that sounded.</summary>
        public int Calls { get; private set; }

        /// <summary>Number of called bandits still fighting.</summary>
        public int ActiveHelpers
        {
            get
            {
                int count = 0;
                for (int i = 0; i < helpers.Count; i++)
                {
                    EnemyController helper = helpers[i];
                    if (helper != null && helper.isActiveAndEnabled && helper.Combatant != null && helper.Combatant.IsAlive)
                    {
                        count++;
                    }
                }

                return count;
            }
        }

        /// <summary>The bandits the horn can call.</summary>
        public IReadOnlyList<EnemyController> Helpers => helpers;

        /// <summary>Raised when the horn is lost (stolen or shot off).</summary>
        public event Action HornLost;

        /// <summary>Raised when the horn sounded (number of bandits called).</summary>
        public event Action<int> Called;

        /// <summary>The horn was stolen before the fight (GDD 02 11.6 s20 o2): no calls at all.</summary>
        public void TakeHorn()
        {
            LoseHorn("gestohlen");
        }

        /// <summary>The guards of the quarry were killed (s20 o3): a call brings only one bandit.</summary>
        public void UseFewerHelpers()
        {
            _fewerHelpers = true;
        }

        private void Awake()
        {
            if (boss == null)
            {
                TryGetComponent(out boss);
            }

            SetHelpersActive(false);
        }

        private void OnEnable()
        {
            if (boss == null || _subscribed)
            {
                return;
            }

            boss.SpecialStarted += OnSpecialStarted;
            boss.SpecialFired += OnSpecialFired;
            boss.HitTaken += OnHitTaken;
            boss.BossReset += OnBossReset;
            boss.Subdued += OnBossGone;
            _subscribed = true;
        }

        private void OnDisable()
        {
            if (boss == null || !_subscribed)
            {
                return;
            }

            boss.SpecialStarted -= OnSpecialStarted;
            boss.SpecialFired -= OnSpecialFired;
            boss.HitTaken -= OnHitTaken;
            boss.BossReset -= OnBossReset;
            boss.Subdued -= OnBossGone;
            _subscribed = false;
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                Services.Locator.TryGet(out _difficulty);
                Health health = boss != null && boss.Combatant != null ? boss.Combatant.Health : null;
                if (health != null)
                {
                    health.Died += _ => OnBossGone();
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.AI, exception, "BossHornCall could not resolve its services.");
            }
        }

        private void Update()
        {
            if (_disablePending && boss != null && boss.Brain != null)
            {
                boss.DisableSpecial(SpecialKey);
                _disablePending = false;
            }
        }

        private void OnSpecialStarted(string key)
        {
            if (key == SpecialKey)
            {
                Log.Info(LogCategory.AI, "Grimmbart greift zum Kriegshorn.");
            }
        }

        private void OnSpecialFired(string key)
        {
            if (key != SpecialKey || _hornLost)
            {
                return;
            }

            bool story = _difficulty != null && _difficulty.Settings != null && _difficulty.Settings.Level == DifficultyLevel.Story;
            int wanted = story || _fewerHelpers ? 1 : helpersPerCall;
            int called = 0;
            for (int i = 0; i < helpers.Count && called < wanted; i++)
            {
                EnemyController helper = helpers[i];
                if (helper == null || (helper.isActiveAndEnabled && helper.Combatant != null && helper.Combatant.IsAlive))
                {
                    continue;
                }

                helper.gameObject.SetActive(true);
                helper.ResetToAnchor();
                helper.Alert();
                called++;
            }

            if (blast != null)
            {
                blast.Play(true);
            }

            Calls++;
            Called?.Invoke(called);
            Log.Info(LogCategory.AI, "Grimmbart blows the war horn: " + called + " bandit(s) come.");
        }

        private void OnHitTaken(HitReport report)
        {
            if (boss == null || boss.Brain == null)
            {
                return;
            }

            bool ranged = report.Attack != null && report.Attack.IsProjectile;
            if (!_hornLost && ranged && report.Zone == HitZone.WeakPoint && report.DealtDamage)
            {
                _hornHits++;
                if (_hornHits >= hitsToShootOff)
                {
                    LoseHorn("vom Gürtel geschossen");
                    return;
                }
            }

            BossAttackOption chosen = boss.Brain.ChosenAttack;
            bool calling = chosen != null && chosen.Special == SpecialKey && boss.Brain.IsTelegraphing;
            if (calling && (report.Zone == HitZone.Head || report.Poise == PoiseOutcome.Broken))
            {
                boss.Interrupt(interruptSeconds);
                Log.Info(LogCategory.AI, "Grimmbart's horn call was interrupted.");
            }
        }

        private void LoseHorn(string how)
        {
            if (_hornLost)
            {
                return;
            }

            _hornLost = true;
            if (horn != null)
            {
                horn.gameObject.SetActive(false);
            }

            if (boss != null && boss.Brain != null)
            {
                boss.DisableSpecial(SpecialKey);
            }
            else
            {
                _disablePending = true;
            }

            HornLost?.Invoke();
            Log.Info(LogCategory.AI, "Grimmbart's war horn is gone (" + how + ").");
        }

        private void OnBossReset()
        {
            SetHelpersActive(false);
        }

        private void OnBossGone()
        {
            // Without their king the bandits run off.
            SetHelpersActive(false);
        }

        private void SetHelpersActive(bool active)
        {
            for (int i = 0; i < helpers.Count; i++)
            {
                if (helpers[i] != null && helpers[i].gameObject.activeSelf != active)
                {
                    helpers[i].gameObject.SetActive(active);
                }
            }
        }
    }
}
