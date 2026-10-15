using System;
using Aetherfall.Core;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>Kinds of explosive world objects (GDD 03 6.7).</summary>
    public enum ExplosiveKind
    {
        /// <summary>Oil barrel: a physical hit breaks it into a puddle, fire or an explosion sets it off (#2: 3 m).</summary>
        OilBarrel = 0,

        /// <summary>Powder keg: fire or an explosion sets it off (#16: 5 m, poise 100); blades do nothing.</summary>
        PowderKeg = 1
    }

    /// <summary>
    /// An oil barrel or powder keg (GDD 03 6.6 #2 and #16, 6.7): a neutral <see cref="Combatant"/> with endless health whose
    /// hits decide what happens. Fire (a fire bolt, a burning hit, another explosion) sets it off: everyone within the radius
    /// takes the explosion (150 % of the trigger, at least the level floor; fire + blunt, burning, stun, knockback), other
    /// explosives in range follow after 0.15 s, and an oil barrel leaves a burning puddle for 8 s. A physical hit breaks an oil
    /// barrel instead: the oil spills into a puddle (<see cref="ElementArea"/>) that makes everyone in it "Ölig" and explodes
    /// when fire reaches it.
    /// </summary>
    /// <remarks>GameObject: the barrel root with <see cref="Combatant"/> (team Neutral), <see cref="DamageableComponent"/>, a
    /// hurtbox and the visuals; the generators build it. Not saved: after loading a barrel stands again (Vorschlag).</remarks>
    [RequireComponent(typeof(Combatant))]
    [DisallowMultipleComponent]
    public sealed class ExplosiveObject : MonoBehaviour, ICombatantController
    {
        [Tooltip("Ölfass (zerbricht bei Schlägen, explodiert bei Feuer) oder Pulverfass (explodiert nur bei Feuer, 5 m).")]
        [SerializeField] private ExplosiveKind kind = ExplosiveKind.OilBarrel;

        [Tooltip("Objekt-ID (optional, für Quests und Protokolle).")]
        [SerializeField] private string objectId = string.Empty;

        [Tooltip("Sichtbare Teile, die beim Zerbrechen oder Explodieren verschwinden.")]
        [SerializeField] private GameObject visuals = null;

        [Tooltip("Einmaliger Partikel-Ausbruch der Explosion (Kind-Objekt, aus).")]
        [SerializeField] private ParticleSystem burst = null;

        [Tooltip("Lichtblitz der Explosion (Kind-Objekt, aus).")]
        [SerializeField] private Light flash = null;

        [Tooltip("Fläche, die nach dem Zerbrechen (Öl) oder der Explosion (Feuer) bleibt (Kind-Objekt, aus).")]
        [SerializeField] private ElementArea area = null;

        private Combatant _combatant;
        private ICombatService _service;
        private AttackSpec _attack;
        private float _fuse = -1f;
        private Combatant _fuseAttacker;
        private float _fuseDamage;
        private float _flashRemaining;

        /// <summary>Kind.</summary>
        public ExplosiveKind Kind => kind;

        /// <summary>Object id (empty if none).</summary>
        public string ObjectId => objectId ?? string.Empty;

        /// <summary>True once it exploded.</summary>
        public bool HasDetonated { get; private set; }

        /// <summary>True once an oil barrel was broken into a puddle (it can still explode through the puddle).</summary>
        public bool IsBroken { get; private set; }

        /// <summary>The oil puddle of a barrel (null for a powder keg).</summary>
        public ElementArea Area => area;

        /// <summary>Raised when it explodes (who set it off, or null).</summary>
        public event Action<ExplosiveObject, Combatant> Detonated;

        /// <inheritdoc />
        public BlockSpec ActiveBlock => default;

        /// <inheritdoc />
        public DefenseOutcome EvaluateDefense(in IncomingHit hit, float bearing)
        {
            return HasDetonated || IsBroken ? DefenseOutcome.Ignored : DefenseOutcome.Hit;
        }

        /// <inheritdoc />
        public AttackProfile GetAttackProfile(AttackSpec attack)
        {
            return default;
        }

        /// <inheritdoc />
        public StaggerKind OnHitResolved(in HitReport report)
        {
            if (HasDetonated || IsBroken || report.Defense != DefenseOutcome.Hit)
            {
                return StaggerKind.None;
            }

            bool fire = report.DamageType == DamageType.Fire || (report.Attack != null && (report.Attack.IsExplosion ||
                                                                                             report.Attack.Buildup.Get(StatusEffectId.Burning) > 0f));
            if (fire)
            {
                Ignite(report.Attacker, report.Damage, 0f);
            }
            else if (kind == ExplosiveKind.OilBarrel && DamageTypes.IsPhysical(report.DamageType))
            {
                Break();
            }

            return StaggerKind.None;
        }

        /// <inheritdoc />
        public void OnParriedBy(Combatant defender)
        {
        }

        /// <summary>Sets the explosive off, now or after <paramref name="delay"/> seconds (chain).</summary>
        /// <param name="attacker">Who set it off (null: nobody; the object itself counts as attacker).</param>
        /// <param name="triggerDamage">Damage of the trigger (the explosion deals 150 % of it, at least the level floor).</param>
        /// <param name="delay">Seconds until it goes off.</param>
        public void Ignite(Combatant attacker, float triggerDamage, float delay)
        {
            // A broken barrel left its oil in the puddle: the puddle explodes, not the barrel.
            if (HasDetonated || IsBroken || (_fuse >= 0f && delay > 0f))
            {
                return;
            }

            if (delay <= 0f)
            {
                Detonate(attacker, triggerDamage);
                return;
            }

            _fuse = delay;
            _fuseAttacker = attacker;
            _fuseDamage = triggerDamage;
        }

        private void Awake()
        {
            _combatant = GetComponent<Combatant>();
            _combatant.SetController(this);
            _attack = kind == ExplosiveKind.PowderKeg ? ElementReactions.CreateKegExplosion() : ElementReactions.CreateOilExplosion();
            if (burst != null)
            {
                burst.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            }

            if (flash != null)
            {
                flash.enabled = false;
            }

            if (area != null)
            {
                area.gameObject.SetActive(false);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                Services.Locator.TryGet(out _service);
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Combat, exception, "ExplosiveObject could not resolve the combat service.");
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
            float deltaTime = Time.deltaTime;
            _combatant.Tick(deltaTime);
            if (_fuse >= 0f)
            {
                _fuse -= deltaTime;
                if (_fuse < 0f)
                {
                    Detonate(_fuseAttacker, _fuseDamage);
                }
            }

            if (_flashRemaining > 0f && flash != null)
            {
                _flashRemaining -= deltaTime;
                flash.intensity = Mathf.Max(0f, _flashRemaining / 0.25f) * 6f;
                if (_flashRemaining <= 0f)
                {
                    flash.enabled = false;
                }
            }
        }

        private void OnDamaged(DamageTaken damage)
        {
            // Endless health: the object decides by the kind of hit, not by damage.
            _combatant.Health.Heal(damage.Applied);
        }

        /// <summary>Breaks an oil barrel into its puddle (a physical hit, or a boss kicks it over, GDD 02 11.6).</summary>
        public void Break()
        {
            if (IsBroken || HasDetonated || kind != ExplosiveKind.OilBarrel)
            {
                return;
            }

            IsBroken = true;
            if (visuals != null)
            {
                visuals.SetActive(false);
            }

            if (area != null)
            {
                area.gameObject.SetActive(true);
                area.Spill(ElementAreaKind.Oil, ElementReactions.OilPuddleSeconds);
            }

            Log.Info(LogCategory.Combat, "Oil barrel '" + name + "' broke: the oil spilled.");
        }

        private void Detonate(Combatant attacker, float triggerDamage)
        {
            if (HasDetonated)
            {
                return;
            }

            HasDetonated = true;
            _fuse = -1f;
            int level = attacker != null ? attacker.Level : 1;
            float damage = ElementReactions.ExplosionDamage(triggerDamage, level);
            float radius = kind == ExplosiveKind.PowderKeg ? ElementReactions.KegRadius : ElementReactions.ExplosionRadius;
            float poise = kind == ExplosiveKind.PowderKeg ? ElementReactions.KegPoise : ElementReactions.ExplosionPoise;
            int hits = Explosions.Detonate(attacker, _combatant, transform.position, radius, _attack, damage, poise, _service != null ? _service.Combatants : null);

            if (visuals != null)
            {
                visuals.SetActive(false);
            }

            if (burst != null)
            {
                burst.Play(true);
            }

            if (flash != null)
            {
                flash.enabled = true;
                _flashRemaining = 0.25f;
            }

            if (area != null && kind == ExplosiveKind.OilBarrel)
            {
                // The oil burns on for 8 s (GDD 03 6.6 #2).
                area.gameObject.SetActive(true);
                area.Spill(ElementAreaKind.Fire, ElementReactions.OilBurnSeconds);
            }

            foreach (Hurtbox hurtbox in GetComponentsInChildren<Hurtbox>(true))
            {
                hurtbox.gameObject.SetActive(false);
            }

            Log.Info(LogCategory.Combat, (kind == ExplosiveKind.PowderKeg ? "Powder keg '" : "Oil barrel '") + name + "' exploded: " + damage.ToString("0") +
                                         " damage in " + radius + " m, " + hits + " hit" + (attacker != null ? ", set off by " + attacker.CombatantId : string.Empty) + ".");
            Action<ExplosiveObject, Combatant> detonated = Detonated;
            if (detonated != null)
            {
                detonated(this, attacker);
            }
        }
    }
}
