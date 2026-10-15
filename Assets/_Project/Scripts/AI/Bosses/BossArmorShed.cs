using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// "Eisenbart" (GDD 02 11.6 phase 3): Grimmbart tears off his iron armour - he attacks 25 % faster but takes 25 % more
    /// damage. Back on with a reset of the fight.
    /// </summary>
    /// <remarks>GameObject: the boss root next to <see cref="BossController"/>; the armour parts are children of the model.</remarks>
    [DisallowMultipleComponent]
    public sealed class BossArmorShed : MonoBehaviour
    {
        [Tooltip("Boss. Leer = BossController am selben GameObject.")]
        [SerializeField] private BossController boss = null;

        [Tooltip("Rüstungsteile, die fallen (Kind-Objekte des Modells).")]
        [SerializeField] private List<GameObject> armour = new List<GameObject>();

        [Tooltip("Ab dieser Phase ohne Rüstung.")]
        [Range(2, 5)] [SerializeField] private int fromPhase = 3;

        [Tooltip("Angriffstempo ohne Rüstung (GDD: +25 %).")]
        [Range(1f, 2f)] [SerializeField] private float attackSpeed = 1.25f;

        [Tooltip("Schadensfaktor ohne Rüstung (GDD: +25 %).")]
        [Range(1f, 2f)] [SerializeField] private float damageTaken = 1.25f;

        [Tooltip("Partikel, wenn die Rüstung fällt (optional).")]
        [SerializeField] private ParticleSystem clatter = null;

        private bool _subscribed;

        /// <summary>True once the armour is off.</summary>
        public bool IsShed { get; private set; }

        private void Awake()
        {
            if (boss == null)
            {
                TryGetComponent(out boss);
            }
        }

        private void OnEnable()
        {
            if (boss != null && !_subscribed)
            {
                boss.PhaseStarted += OnPhaseStarted;
                boss.BossReset += Restore;
                _subscribed = true;
            }
        }

        private void OnDisable()
        {
            if (boss != null && _subscribed)
            {
                boss.PhaseStarted -= OnPhaseStarted;
                boss.BossReset -= Restore;
                _subscribed = false;
            }
        }

        private void OnPhaseStarted(int phase)
        {
            if (phase < fromPhase || IsShed)
            {
                return;
            }

            IsShed = true;
            SetArmour(false);
            if (clatter != null)
            {
                clatter.Play(true);
            }

            if (boss.Combatant != null)
            {
                boss.Combatant.DamageTakenFactor = damageTaken;
            }

            if (boss.Brain != null)
            {
                boss.Brain.AttackSpeed = attackSpeed;
            }

            Log.Info(LogCategory.AI, "Grimmbart tears off his armour: faster, but more vulnerable.");
        }

        private void Restore()
        {
            IsShed = false;
            SetArmour(true);
            if (boss != null && boss.Combatant != null)
            {
                boss.Combatant.DamageTakenFactor = 1f;
            }
        }

        private void SetArmour(bool on)
        {
            for (int i = 0; i < armour.Count; i++)
            {
                if (armour[i] != null)
                {
                    armour[i].SetActive(on);
                }
            }
        }
    }
}
