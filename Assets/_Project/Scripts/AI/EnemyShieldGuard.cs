using Aetherfall.Combat;
using UnityEngine;

namespace Aetherfall.AI
{
    /// <summary>
    /// Tower shield of an enemy (GDD 02 11.7: the elite skeleton in the great hall): wraps the <see cref="EnemyController"/> as
    /// combat controller and blocks hits from the front while the shield is raised (<see cref="ShieldGuardRules"/>). From
    /// behind, during its own attack or while stunned the enemy is open. Everything else goes to the enemy controller.
    /// </summary>
    /// <remarks>GameObject: the enemy (next to EnemyController and Combatant). Optional shield visual as child.</remarks>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(EnemyController))]
    public sealed class EnemyShieldGuard : MonoBehaviour, ICombatantController
    {
        [Tooltip("Schildwinkel in Grad (Turmschild 170).")]
        [Range(30f, 220f)] [SerializeField] private float shieldAngle = ShieldGuardRules.TowerShieldAngle;

        [Tooltip("Abwehr physischen Schadens beim Blocken (1 = 100 %).")]
        [Range(0f, 1f)] [SerializeField] private float physicalReduction = 0.9f;

        [Tooltip("Abwehr elementaren Schadens beim Blocken.")]
        [Range(0f, 1f)] [SerializeField] private float elementalReduction = 0.4f;

        [Tooltip("Stabilität des Schildes (0–1).")]
        [Range(0f, 1f)] [SerializeField] private float stability = 0.7f;

        [Tooltip("Sichtbarer Schild (optional): wird beim eigenen Angriff zur Seite genommen.")]
        [SerializeField] private Transform shieldVisual = null;

        private EnemyController _enemy;
        private Combatant _combatant;
        private Quaternion _shieldRest;
        private bool _hasShield;

        /// <summary>True while the shield is raised.</summary>
        public bool IsGuarding
        {
            get
            {
                EnemyBrain brain = _enemy != null ? _enemy.Brain : null;
                return brain != null && _combatant != null && ShieldGuardRules.IsGuarding(brain.State, brain.AttackPhase, _combatant.IsAlive);
            }
        }

        /// <inheritdoc />
        public BlockSpec ActiveBlock => IsGuarding ? new BlockSpec(shieldAngle, physicalReduction, elementalReduction, stability) : default;

        /// <inheritdoc />
        public DefenseOutcome EvaluateDefense(in IncomingHit hit, float bearing)
        {
            DefenseOutcome inner = _enemy.EvaluateDefense(hit, bearing);
            if (inner == DefenseOutcome.Hit && IsGuarding && ShieldGuardRules.Covers(bearing, shieldAngle))
            {
                return DefenseOutcome.Blocked;
            }

            return inner;
        }

        /// <inheritdoc />
        public AttackProfile GetAttackProfile(AttackSpec attack)
        {
            return _enemy.GetAttackProfile(attack);
        }

        /// <inheritdoc />
        public StaggerKind OnHitResolved(in HitReport report)
        {
            return _enemy.OnHitResolved(report);
        }

        /// <inheritdoc />
        public void OnParriedBy(Combatant defender)
        {
            _enemy.OnParriedBy(defender);
        }

        private void Awake()
        {
            _enemy = GetComponent<EnemyController>();
            _combatant = GetComponent<Combatant>();
            if (shieldVisual != null)
            {
                _shieldRest = shieldVisual.localRotation;
                _hasShield = true;
            }
        }

        private void Start()
        {
            // After EnemyController.Awake, which registered itself as controller.
            if (_combatant != null && _enemy != null && _enemy.enabled)
            {
                _combatant.SetController(this);
            }
        }

        private void LateUpdate()
        {
            if (!_hasShield)
            {
                return;
            }

            Quaternion wanted = IsGuarding ? _shieldRest : _shieldRest * Quaternion.Euler(0f, -60f, 0f);
            shieldVisual.localRotation = Quaternion.Slerp(shieldVisual.localRotation, wanted, 1f - Mathf.Exp(-12f * Time.deltaTime));
        }
    }
}
