using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>Kinds of element areas on the ground (GDD 03 6.7).</summary>
    public enum ElementAreaKind
    {
        /// <summary>Nothing (inactive).</summary>
        None = 0,

        /// <summary>Oil puddle: everyone in it is "Ölig" (burning build-up × 2); fire sets it off (#2).</summary>
        Oil = 1,

        /// <summary>Fire: burning build-up 20 per second to everyone in it.</summary>
        Fire = 2,

        /// <summary>Water: everyone in it is "Nass" (burning × 0.5, shock × 1.5, freezing × 2), burning ends (#7).</summary>
        Water = 3
    }

    /// <summary>
    /// A round area on the ground that changes the state of every combatant standing in it (GDD 03 6.7, 7.3): an oil puddle
    /// makes them oily, fire builds up burning, water makes them wet. An oil puddle is itself a neutral <see cref="Combatant"/>
    /// with a flat hurtbox, so a fire bolt or arrow into the oil sets it off: everyone in 3 m takes the explosion and the puddle
    /// burns for 8 s. A fire hit on someone standing in the oil does the same (the service's <see cref="ICombatService.HitLanded"/>).
    /// </summary>
    /// <remarks>GameObject: a child of the barrel (built inactive) or a standalone puddle; <see cref="Combatant"/> (team Neutral),
    /// <see cref="DamageableComponent"/> and a hurtbox 0.4 m high. The visuals per kind are children named by the generator.</remarks>
    [DisallowMultipleComponent]
    public sealed class ElementArea : MonoBehaviour, ICombatantController
    {
        private const float CheckInterval = 0.25f;
        private const float HeightTolerance = 2f;

        [Tooltip("Art der Fläche beim Start (Keine = wartet auf Spill).")]
        [SerializeField] private ElementAreaKind kind = ElementAreaKind.None;

        [Tooltip("Radius in Metern (Ölfass 3 m).")]
        [Min(0.5f)] [SerializeField] private float radius = 3f;

        [Tooltip("Dauer in Sekunden beim Start; 0 = bleibt.")]
        [Min(0f)] [SerializeField] private float seconds = 0f;

        [Tooltip("Aussehen der Ölpfütze (Kind-Objekt).")]
        [SerializeField] private GameObject oilVisual = null;

        [Tooltip("Aussehen des Feuers (Kind-Objekt mit Partikeln und Licht).")]
        [SerializeField] private GameObject fireVisual = null;

        [Tooltip("Aussehen des Wassers (Kind-Objekt).")]
        [SerializeField] private GameObject waterVisual = null;

        private Combatant _combatant;
        private ICombatService _service;
        private AttackSpec _attack;
        private float _remaining;
        private float _nextCheck;
        private float _fuse = -1f;
        private Combatant _fuseAttacker;
        private float _fuseDamage;
        private bool _subscribed;

        /// <summary>Current kind.</summary>
        public ElementAreaKind Kind => kind;

        /// <summary>Radius in metres.</summary>
        public float Radius => radius;

        /// <summary>Seconds left (0 = stays or inactive).</summary>
        public float Remaining => _remaining;

        /// <summary>Raised when the oil exploded (who set it off, or null).</summary>
        public event Action<ElementArea, Combatant> Exploded;

        /// <inheritdoc />
        public BlockSpec ActiveBlock => default;

        /// <inheritdoc />
        public DefenseOutcome EvaluateDefense(in IncomingHit hit, float bearing)
        {
            return kind == ElementAreaKind.Oil ? DefenseOutcome.Hit : DefenseOutcome.Ignored;
        }

        /// <inheritdoc />
        public AttackProfile GetAttackProfile(AttackSpec attack)
        {
            return default;
        }

        /// <inheritdoc />
        public StaggerKind OnHitResolved(in HitReport report)
        {
            if (kind == ElementAreaKind.Oil && report.Defense == DefenseOutcome.Hit && IsFire(report))
            {
                Ignite(report.Attacker, report.Damage, 0f);
            }

            return StaggerKind.None;
        }

        /// <inheritdoc />
        public void OnParriedBy(Combatant defender)
        {
        }

        /// <summary>Starts (or restarts) the area with a kind and duration.</summary>
        /// <param name="newKind">Kind.</param>
        /// <param name="duration">Seconds; 0 = stays.</param>
        public void Spill(ElementAreaKind newKind, float duration)
        {
            kind = newKind;
            _remaining = duration;
            _nextCheck = 0f;
            _fuse = -1f;
            RefreshVisuals();
        }

        /// <summary>Fire reached the oil: explosion (#2) now or after <paramref name="delay"/> seconds, then the puddle burns 8 s.</summary>
        /// <param name="attacker">Who set it off (null: nobody).</param>
        /// <param name="triggerDamage">Damage of the trigger.</param>
        /// <param name="delay">Seconds until it goes off.</param>
        public void Ignite(Combatant attacker, float triggerDamage, float delay)
        {
            if (kind != ElementAreaKind.Oil || (_fuse >= 0f && delay > 0f))
            {
                return;
            }

            if (delay <= 0f)
            {
                Explode(attacker, triggerDamage);
                return;
            }

            _fuse = delay;
            _fuseAttacker = attacker;
            _fuseDamage = triggerDamage;
        }

        private void Awake()
        {
            TryGetComponent(out _combatant);
            if (_combatant != null)
            {
                _combatant.SetController(this);
            }

            _attack = ElementReactions.CreateOilExplosion();
            _remaining = seconds;
            RefreshVisuals();
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                if (Services.Locator.TryGet(out _service))
                {
                    Subscribe();
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Combat, exception, "ElementArea could not resolve the combat service.");
            }
        }

        private void OnEnable()
        {
            Subscribe();
            Health health = _combatant != null ? _combatant.Health : null;
            if (health != null)
            {
                health.Damaged += OnDamaged;
            }
        }

        private void OnDisable()
        {
            if (_subscribed)
            {
                _service.HitLanded -= OnHitLanded;
                _subscribed = false;
            }

            Health health = _combatant != null ? _combatant.Health : null;
            if (health != null)
            {
                health.Damaged -= OnDamaged;
            }
        }

        private void Update()
        {
            float deltaTime = Time.deltaTime;
            if (_combatant != null)
            {
                _combatant.Tick(deltaTime);
            }

            if (kind == ElementAreaKind.None)
            {
                return;
            }

            if (_fuse >= 0f)
            {
                _fuse -= deltaTime;
                if (_fuse < 0f)
                {
                    Explode(_fuseAttacker, _fuseDamage);
                    return;
                }
            }

            if (_remaining > 0f)
            {
                _remaining -= deltaTime;
                if (_remaining <= 0f)
                {
                    _remaining = 0f;
                    kind = ElementAreaKind.None;
                    RefreshVisuals();
                    return;
                }
            }

            _nextCheck -= deltaTime;
            if (_nextCheck > 0f || _service == null)
            {
                return;
            }

            _nextCheck = CheckInterval;
            AffectCombatantsInside();
        }

        private void AffectCombatantsInside()
        {
            IReadOnlyList<Combatant> all = _service.Combatants;
            Vector3 origin = transform.position;
            for (int i = 0; i < all.Count; i++)
            {
                Combatant target = all[i];
                if (target == null || target == _combatant || !target.IsAlive || !IsInside(target.transform.position, origin) ||
                    target.GetComponent<ExplosiveObject>() != null || target.GetComponent<ElementArea>() != null)
                {
                    continue;
                }

                StatusEffectController status = target.Status;
                switch (kind)
                {
                    case ElementAreaKind.Oil:
                        status.MakeOily(ElementReactions.OilySeconds);
                        break;
                    case ElementAreaKind.Fire:
                        status.Add(StatusEffectId.Burning, ElementReactions.FireAreaBuildupPerSecond * CheckInterval);
                        break;
                    case ElementAreaKind.Water:
                        status.MakeWet(StatusEffectController.WetSeconds);
                        break;
                }
            }
        }

        private bool IsInside(Vector3 point, Vector3 origin)
        {
            return CombatMath.PlanarDistance(origin.x, origin.z, point.x, point.z) <= radius && Mathf.Abs(point.y - origin.y) <= HeightTolerance;
        }

        private void OnHitLanded(HitReport report)
        {
            // Fire on someone standing in the oil sets the puddle off (GDD 03 6.6 #2).
            if (kind != ElementAreaKind.Oil || report.Target == null || report.Target == _combatant || report.Defense != DefenseOutcome.Hit || !IsFire(report) ||
                !IsInside(report.Target.transform.position, transform.position))
            {
                return;
            }

            Ignite(report.Attacker, report.Damage, 0f);
        }

        private static bool IsFire(in HitReport report)
        {
            return report.DamageType == DamageType.Fire || (report.Attack != null && (report.Attack.IsExplosion || report.Attack.Buildup.Get(StatusEffectId.Burning) > 0f));
        }

        private void Explode(Combatant attacker, float triggerDamage)
        {
            if (kind != ElementAreaKind.Oil)
            {
                return;
            }

            _fuse = -1f;
            int level = attacker != null ? attacker.Level : 1;
            float damage = ElementReactions.ExplosionDamage(triggerDamage, level);
            int hits = Explosions.Detonate(attacker, _combatant, transform.position, ElementReactions.ExplosionRadius, _attack, damage,
                ElementReactions.ExplosionPoise, _service != null ? _service.Combatants : null);
            Spill(ElementAreaKind.Fire, ElementReactions.OilBurnSeconds);
            Log.Info(LogCategory.Combat, "Oil puddle '" + name + "' exploded: " + damage.ToString("0") + " damage, " + hits + " hit.");
            Action<ElementArea, Combatant> exploded = Exploded;
            if (exploded != null)
            {
                exploded(this, attacker);
            }
        }

        private void Subscribe()
        {
            if (_service == null || _subscribed || !isActiveAndEnabled)
            {
                return;
            }

            _service.HitLanded += OnHitLanded;
            _subscribed = true;
        }

        private void OnDamaged(DamageTaken damage)
        {
            _combatant.Health.Heal(damage.Applied);
        }

        private void RefreshVisuals()
        {
            if (oilVisual != null)
            {
                oilVisual.SetActive(kind == ElementAreaKind.Oil);
            }

            if (fireVisual != null)
            {
                fireVisual.SetActive(kind == ElementAreaKind.Fire);
            }

            if (waterVisual != null)
            {
                waterVisual.SetActive(kind == ElementAreaKind.Water);
            }

            foreach (Hurtbox hurtbox in GetComponentsInChildren<Hurtbox>(true))
            {
                hurtbox.gameObject.SetActive(kind == ElementAreaKind.Oil);
            }
        }
    }
}
