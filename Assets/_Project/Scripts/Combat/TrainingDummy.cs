using System.Globalization;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Training dummy of the test arena: a neutral <see cref="Combatant"/> with endless health (every hit is healed at once)
    /// and a poise bar, so combos, charged attacks, poise breaks and the finisher can be tried without enemies. A
    /// <see cref="TextMesh"/> above it shows the last hit, the damage of the last 5 s and the poise.
    /// </summary>
    /// <remarks>GameObject: the dummy root with <see cref="Combatant"/> (team Neutral), <see cref="DamageableComponent"/> and
    /// hurtboxes; the test ground menu builds it.</remarks>
    [RequireComponent(typeof(Combatant))]
    [DisallowMultipleComponent]
    public sealed class TrainingDummy : MonoBehaviour, ICombatantController, ICombatDebugSource
    {
        private const float SumWindowSeconds = 5f;
        private const float RefreshInterval = 0.1f;

        [Tooltip("Text über der Puppe (optional).")]
        [SerializeField] private TextMesh label = null;

        [Tooltip("Treffer-Blitz/Einfärbung (optional): orange, solange die Haltung gebrochen ist.")]
        [SerializeField] private HitFlash hitFlash = null;

        private readonly float[] _recentTimes = new float[32];
        private readonly int[] _recentDamage = new int[32];
        private Combatant _combatant;
        private int _recentNext;
        private float _clock;
        private float _nextRefresh;
        private string _lastHitText = "–";
        private string _stateText = "bereit";

        /// <inheritdoc />
        public BlockSpec ActiveBlock => default;

        /// <inheritdoc />
        public string DebugStateText => _stateText;

        /// <inheritdoc />
        public Combatant FocusTarget => null;

        /// <inheritdoc />
        public DefenseOutcome EvaluateDefense(in IncomingHit hit, float bearing)
        {
            return DefenseOutcome.Hit;
        }

        /// <inheritdoc />
        public AttackProfile GetAttackProfile(AttackSpec attack)
        {
            return default;
        }

        /// <inheritdoc />
        public StaggerKind OnHitResolved(in HitReport report)
        {
            _recentTimes[_recentNext] = _clock;
            _recentDamage[_recentNext] = report.Damage;
            _recentNext = (_recentNext + 1) % _recentDamage.Length;
            _lastHitText = report.Damage.ToString(CultureInfo.InvariantCulture) + (report.IsCritical ? " KRIT" : string.Empty) + " (" +
                           ZoneText(report) + ")";
            return StaggerKind.None;
        }

        /// <inheritdoc />
        public void OnParriedBy(Combatant defender)
        {
        }

        private void Awake()
        {
            _combatant = GetComponent<Combatant>();
            _combatant.SetController(this);
        }

        private void OnEnable()
        {
            Health health = _combatant != null ? _combatant.Health : null;
            if (health != null)
            {
                health.Damaged += OnDamaged;
            }
        }

        private void OnDisable()
        {
            Health health = _combatant != null ? _combatant.Health : null;
            if (health != null)
            {
                health.Damaged -= OnDamaged;
            }
        }

        private void Update()
        {
            float deltaTime = Time.deltaTime;
            _clock += deltaTime;
            _combatant.Tick(deltaTime);
            PoiseMeter poise = _combatant.Poise;
            bool stunned = poise != null && poise.IsStunned;
            if (hitFlash != null)
            {
                hitFlash.SetTint(new Color(1f, 0.55f, 0.1f), stunned ? 0.7f : 0f);
            }

            _stateText = stunned ? "Haltung gebrochen – Finisher möglich (leichter Angriff)" : "bereit";
            if (label == null || _clock < _nextRefresh)
            {
                return;
            }

            _nextRefresh = _clock + RefreshInterval;
            int sum = 0;
            for (int i = 0; i < _recentDamage.Length; i++)
            {
                if (_recentDamage[i] > 0 && _clock - _recentTimes[i] <= SumWindowSeconds)
                {
                    sum += _recentDamage[i];
                }
            }

            string poiseText = poise != null
                ? Mathf.FloorToInt(poise.Buildup).ToString(CultureInfo.InvariantCulture) + " / " + Mathf.FloorToInt(poise.Max).ToString(CultureInfo.InvariantCulture)
                : "–";
            label.text = "Trainingspuppe\nLetzter Treffer: " + _lastHitText + "\nSchaden (5 s): " + sum.ToString(CultureInfo.InvariantCulture) +
                         "\nHaltung: " + poiseText + (stunned ? "  GEBROCHEN" : string.Empty);
        }

        private void OnDamaged(DamageTaken damage)
        {
            // Endless health: the dummy heals every hit at once (the Damaged event comes before the death check).
            _combatant.Health.Heal(damage.Applied);
        }

        private static string ZoneText(in HitReport report)
        {
            switch (report.Zone)
            {
                case HitZone.Head: return "Kopf";
                case HitZone.WeakPoint: return "Schwachpunkt";
                case HitZone.Limb: return "Glied";
                default: return "Körper";
            }
        }
    }
}
