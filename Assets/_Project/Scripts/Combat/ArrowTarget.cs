using System;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// A target to shoot at (straw target of "Die Wölfe vom Nordhang", GDD 02 11.2 s10 o2): a neutral <see cref="Combatant"/>
    /// with endless health. Every arrow or bolt that hits it publishes <c>Interacted(objectId, hit)</c>, so the quest objective
    /// "Triff die Strohziele" counts it like an interaction (each target once). Melee hits do not count.
    /// </summary>
    /// <remarks>GameObject: the target root with <see cref="Combatant"/> (team Neutral), <see cref="DamageableComponent"/> and a
    /// hurtbox in front of the straw disc; built by "Aetherfall > Eichental erstellen".</remarks>
    [RequireComponent(typeof(Combatant))]
    [DisallowMultipleComponent]
    public sealed class ArrowTarget : MonoBehaviour, ICombatantController
    {
        [Tooltip("Objekt-ID, die die Quest zählt, z. B. obj.eichental.strohziel_1.")]
        [SerializeField] private string objectId = "obj.region.ziel";

        private Combatant _combatant;
        private IEventBus _bus;

        /// <summary>Object id.</summary>
        public string ObjectId => objectId ?? string.Empty;

        /// <summary>Ranged hits so far (tests, tools).</summary>
        public int HitCount { get; private set; }

        /// <inheritdoc />
        public BlockSpec ActiveBlock => default;

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
            if (report.Attack == null || !report.Attack.IsProjectile)
            {
                return StaggerKind.None;
            }

            HitCount++;
            if (_bus != null)
            {
                var evt = new Interacted(ObjectId, InteractionVerbs.Hit);
                _bus.Publish(in evt);
            }

            Log.Info(LogCategory.Combat, "Target '" + ObjectId + "' hit by " + report.Attack.Id + ".");
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

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                Services.Locator.TryGet(out _bus);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Combat, exception, "ArrowTarget could not resolve the event bus.");
            }
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
            _combatant.Tick(Time.deltaTime);
        }

        private void OnDamaged(DamageTaken damage)
        {
            // Endless health like the training dummy: every hit is healed at once.
            _combatant.Health.Heal(damage.Applied);
        }
    }
}
