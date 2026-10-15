using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Stats;
using Aetherfall.Utilities;
using UnityEngine;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Root component of everything that fights (player, enemies, training dummy): id, team, health, poise, local hitstop,
    /// lock-on point and the hit pipeline <see cref="ReceiveHit"/> (defense → <see cref="DamageCalculator"/> → health →
    /// poise → reactions → feedback → events). Hurtboxes point to it; hitboxes call it.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the root of the fighter, next to <see cref="DamageableComponent"/> (and for the player
    /// <see cref="CharacterStatsComponent"/>). The owner's brain (<see cref="ICombatantController"/>) registers itself with
    /// <see cref="SetController"/> in Awake and calls <see cref="Tick"/> once per frame to get its local combat time (0
    /// during hitstop – hitstop is local, never <c>Time.timeScale</c>, architecture 4.4).</para>
    /// <para>Resolves <see cref="ICombatService"/> once in Start (registers itself for lock-on and AI target lists). Without
    /// the service (CombatInstaller missing) it works with an own damage calculator and logs a warning.</para>
    /// <para>Size (about 520 lines, architecture P3): the hit pipeline (defense, damage calculation, health, poise, hit
    /// feel, events) must run in one fixed order for every fighter; it is one method plus the snapshots it needs.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class Combatant : MonoBehaviour
    {
        private const float DefaultTargetHeight = 1.0f;

        [Tooltip("Eindeutige ID für Ereignisse, z. B. „player“ oder „enemy.wolf.grauwolf#1“. Leer = Name des GameObjects.")]
        [SerializeField] private string combatantId = "";

        [Tooltip("Typ-ID, z. B. „enemy.wolf.grauwolf“ (für Ereignisse wie PlayerDied). Leer = wie die ID.")]
        [SerializeField] private string typeId = "";

        [Tooltip("Seite: Spieler, Gegner oder Neutral (Trainingspuppe). Gleiche Seite trifft sich nicht.")]
        [SerializeField] private CombatTeam team = CombatTeam.Enemy;

        [Tooltip("Lebenspunkte dieser Figur. Leer = DamageableComponent am selben GameObject.")]
        [SerializeField] private DamageableComponent damageable = null;

        [Tooltip("Werte (Stufe, Rüstung, Resistenzen, Krit). Leer = Werte unten (Gegner, Puppe).")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Punkt für Lock-On und Kamera (z. B. Brust). Leer = 1 m über dem Ursprung.")]
        [SerializeField] private Transform targetPoint = null;

        [Tooltip("Kann per Lock-On anvisiert werden.")]
        [SerializeField] private bool targetable = true;

        [Tooltip("Haltungsbalken benutzen (Gegner, Puppe). Aus beim Spieler: er hat Standfestigkeit statt Balken (GDD 03, 4.9).")]
        [SerializeField] private bool usePoiseMeter = true;

        [Header("Werte ohne Werte-Komponente")]
        [Tooltip("Stufe (Stufenunterschied und Rüstungsformel, GDD 03, 8.2).")]
        [Range(1, 80)] [SerializeField] private int level = 1;

        [Tooltip("Rüstung.")]
        [Min(0f)] [SerializeField] private float armor = 0f;

        [Tooltip("Maximale Haltung (Grauwolf Stufe 8: 35).")]
        [Min(1f)] [SerializeField] private float maxPoise = 35f;

        [Tooltip("Haltungsverlust, wenn ein Angriff dieser Figur perfekt pariert wird, als Anteil der max. Haltung (GDD 03, 4.8: Normal 0,35, Elite 0,25, Champion 0,2, Boss 0,12).")]
        [Range(0f, 1f)] [SerializeField] private float parryPoiseLoss = 0.35f;

        [Header("Darstellung")]
        [Tooltip("Treffer-Blitz (Farbe) an den Körper-Renderern. Optional.")]
        [SerializeField] private HitFlash hitFlash = null;

        private const string BurnSourceId = "effect.brennen";
        private const string PoisonSourceId = "effect.gift";
        private const string CorruptionSourceId = "effect.aether_verderbnis";

        private ICombatService _service;
        private ICombatantController _controller;
        private PoiseMeter _poise;
        private StatusEffectController _status;
        private AttackSpec _burstAttack;
        private float _burnCarry;
        private float _poisonCarry;
        private float _corruptionCarry;
        private float _weakenFraction;
        private IDifficultyService _difficulty;
        private float _weakenUntil;
        private readonly HitStopTimer _hitStop = new HitStopTimer();
        private ResistanceProfile _resistances;
        private DamageCalculator _fallbackCalculator;
        private IRandom _fallbackRandom;
        private bool _registered;
        private bool _warnedNoService;

        /// <summary>Unique id (events, logs).</summary>
        public string CombatantId => string.IsNullOrEmpty(combatantId) ? name : combatantId;

        /// <summary>Type id (e.g. <c>enemy.wolf.grauwolf</c>).</summary>
        public string TypeId => string.IsNullOrEmpty(typeId) ? CombatantId : typeId;

        /// <summary>Team.</summary>
        public CombatTeam Team => team;

        /// <summary>Health logic (null without DamageableComponent).</summary>
        public Health Health => damageable != null ? damageable.Health : null;

        /// <summary>The damageable adapter.</summary>
        public DamageableComponent Damageable => damageable;

        /// <summary>Stats (null for enemies and the dummy).</summary>
        public CharacterStatsComponent Stats => stats;

        /// <summary>True while alive.</summary>
        public bool IsAlive => damageable != null && damageable.IsAlive;

        /// <summary>Poise meter (null if <c>usePoiseMeter</c> is off).</summary>
        public PoiseMeter Poise => _poise;

        /// <summary>Status effects of this combatant (burning, stun, corruption …; GDD 03 7). Created on first use.</summary>
        public StatusEffectController Status
        {
            get
            {
                if (_status == null)
                {
                    _status = new StatusEffectController(team == CombatTeam.Player ? StatusSettings.Player : StatusSettings.Enemy);
                }

                return _status;
            }
        }

        /// <summary>Local hitstop of this combatant.</summary>
        public HitStopTimer HitStop => _hitStop;

        /// <summary>The brain, or null.</summary>
        public ICombatantController Controller => _controller;

        /// <summary>Level (from the stats or the inspector value).</summary>
        public int Level => stats != null ? (int)stats.Stats.Get(StatId.Level) : level;

        /// <summary>How noticeable the combatant is right now (set by its brain; read by enemy perception).</summary>
        public PerceptionStance Stance { get; set; } = PerceptionStance.Still;

        /// <summary>Switches whether lock-on and AI may pick it (an enemy hidden in an ambush is not targetable).</summary>
        /// <param name="value">True: targetable.</param>
        public void SetTargetable(bool value)
        {
            targetable = value;
        }

        /// <summary>True if lock-on and AI may pick it now (targetable, alive, active).</summary>
        public bool IsTargetable => targetable && IsAlive && isActiveAndEnabled;

        /// <summary>Transform of the lock-on point (camera target group); the root if none is set.</summary>
        public Transform TargetTransform => targetPoint != null ? targetPoint : transform;

        /// <summary>World position of the lock-on point.</summary>
        public Vector3 TargetPosition => targetPoint != null ? targetPoint.position : transform.position + Vector3.up * DefaultTargetHeight;

        /// <summary>True if the poise is broken and a finisher is allowed (GDD 03 4.10).</summary>
        public bool IsOpenForFinisher => _poise != null && _poise.IsStunned && _poise.StunAllowsFinisher && IsAlive;

        /// <summary>Raised after this combatant received a hit (also evaded and blocked ones).</summary>
        public event Action<HitReport> HitReceived;

        /// <summary>Raised after a hit of this combatant was resolved on a target.</summary>
        public event Action<HitReport> HitDealt;

        /// <summary>Raised when the poise broke (stunned, open for a finisher).</summary>
        public event Action<Combatant> PoiseBroken;

        /// <summary>Registers the brain (call in Awake).</summary>
        /// <param name="controller">The brain.</param>
        public void SetController(ICombatantController controller)
        {
            _controller = controller;
        }

        /// <summary>
        /// Sets the values of an enemy type at run time (level, armor, resistances, poise; from the enemy type definition).
        /// </summary>
        /// <param name="enemyLevel">Level.</param>
        /// <param name="enemyArmor">Armor.</param>
        /// <param name="resistances">Resistances.</param>
        /// <param name="poiseMax">Maximum poise.</param>
        /// <param name="poiseSettings">Poise rules.</param>
        /// <param name="id">Unique id; empty keeps the inspector value.</param>
        /// <param name="type">Type id; empty keeps the inspector value.</param>
        /// <param name="parryPoiseLossFraction">Poise lost when parried, share of the maximum (GDD 03 4.8).</param>
        public void Configure(int enemyLevel, float enemyArmor, in ResistanceProfile resistances, float poiseMax, in PoiseSettings poiseSettings,
            string id, string type, float parryPoiseLossFraction)
        {
            parryPoiseLoss = Math.Max(0f, parryPoiseLossFraction);
            level = Math.Max(1, enemyLevel);
            armor = Math.Max(0f, enemyArmor);
            _resistances = resistances;
            maxPoise = Math.Max(1f, poiseMax);
            if (usePoiseMeter)
            {
                _poise = new PoiseMeter(maxPoise, poiseSettings);
            }

            if (!string.IsNullOrEmpty(id))
            {
                combatantId = id;
            }

            if (!string.IsNullOrEmpty(type))
            {
                typeId = type;
            }
        }

        /// <summary>Sets the status rules of an enemy type or boss (resistance, boss immunities; GDD 03 7.1).</summary>
        /// <param name="settings">Rules.</param>
        /// <param name="corruptionImmune">True for Aether-corrupted variants (no corruption bar).</param>
        public void ConfigureStatus(in StatusSettings settings, bool corruptionImmune)
        {
            Status.Configure(settings);
            Status.CorruptionImmune = corruptionImmune;
        }

        /// <summary>
        /// Advances hitstop, poise and status effects (burning and poison damage, corruption) and returns the local combat
        /// time of this frame (0 while frozen). Call once per frame from the owner's update.
        /// </summary>
        /// <param name="deltaTime">Frame time.</param>
        public float Tick(float deltaTime)
        {
            float local = _hitStop.Tick(deltaTime);
            if (_poise != null)
            {
                _poise.Tick(local);
            }

            if (_status != null && local > 0f)
            {
                TickStatus(local);
            }

            return local;
        }

        private void TickStatus(float local)
        {
            Health health = Health;
            if (stats != null)
            {
                _status.ExternalResistance = stats.Stats.Get(StatId.StatusResistance);
            }

            StatusTick tick = _status.Tick(local, health != null ? health.Max : 0f);
            if (health == null || !health.IsAlive)
            {
                return;
            }

            // Whole points only, so the damage numbers do not show fractions every frame.
            ApplyStatusDamage(ref _burnCarry, tick.BurnDamage, BurnSourceId, DamageType.Fire);
            ApplyStatusDamage(ref _poisonCarry, tick.PoisonDamage, PoisonSourceId, DamageType.Poison);
            ApplyStatusDamage(ref _corruptionCarry, tick.CorruptionDamage, CorruptionSourceId, DamageType.Aether);
            if (tick.CorruptionBurst)
            {
                BurstCorruption();
            }
        }

        private void ApplyStatusDamage(ref float carry, float amount, string sourceId, DamageType type)
        {
            carry += amount;
            if (carry < 1f)
            {
                return;
            }

            int whole = (int)carry;
            carry -= whole;
            damageable.ApplyDamage(new DamageInfo(whole, sourceId, type));
        }

        /// <summary>
        /// Aether-Ausbruch of an enemy whose corruption bar reached 100 (GDD 03 7.2): 10 % of its max health as Aether damage to
        /// itself and to everyone within 3 m, 2 s stunned.
        /// </summary>
        private void BurstCorruption()
        {
            Health health = Health;
            if (health == null)
            {
                return;
            }

            float amount = health.Max * StatusEffectController.BurstFraction;
            damageable.ApplyDamage(new DamageInfo(amount, CorruptionSourceId, DamageType.Aether));
            if (_poise != null)
            {
                _poise.Stun(StatusEffectController.BurstStunSeconds, false);
            }

            if (_service == null)
            {
                return;
            }

            if (_burstAttack == null)
            {
                _burstAttack = AttackSpec.Create("attack.status.aether_ausbruch", 0.01f, 0.05f, 0.1f);
                _burstAttack.Kind = AttackKind.Enemy;
                _burstAttack.IsExplosion = true;
                _burstAttack.StaminaCost = 0f;
                _burstAttack.KnockbackDistance = 1f;
                _burstAttack.Buildup = StatusBuildup.None.With(StatusEffectId.Stun, 30f);
            }

            var profile = new AttackProfile(DamagePacket.Single(DamageType.Aether, amount), AttributeScaling.None, 30f);
            Vector3 origin = transform.position;
            IReadOnlyList<Combatant> all = _service.Combatants;
            for (int i = 0; i < all.Count; i++)
            {
                Combatant other = all[i];
                if (other == null || other == this || !other.IsAlive || !CombatTeams.CanDamage(team, other.Team))
                {
                    continue;
                }

                Vector3 point = other.transform.position;
                if (CombatMath.PlanarDistance(origin.x, origin.z, point.x, point.z) > StatusEffectController.BurstRadius + 0.5f)
                {
                    continue;
                }

                other.ReceiveHit(new IncomingHit
                {
                    Attacker = this,
                    Attack = _burstAttack,
                    Profile = profile,
                    Zone = HitZone.Body,
                    Point = other.TargetPosition,
                    AttackerPosition = origin
                });
            }
        }

        /// <summary>
        /// Factor on all damage this fighter takes (1 = normal). Boss mechanics use it, e.g. the Aether shell of the Rissbrut
        /// (0.25 while the shell holds).
        /// </summary>
        public float DamageTakenFactor { get; set; } = 1f;

        /// <summary>Share of damage this fighter loses right now (Kriegsschrei, GDD 03 11.4); 0 when not weakened.</summary>
        public float Weakness => Time.time < _weakenUntil ? _weakenFraction : 0f;

        /// <summary>Lowers the damage of this fighter for a while (the stronger weakening counts while both run).</summary>
        /// <param name="fraction">Share of damage lost (0.2 = −20 %).</param>
        /// <param name="seconds">Duration.</param>
        public void Weaken(float fraction, float seconds)
        {
            if (!(fraction > 0f) || !(seconds > 0f))
            {
                return;
            }

            _weakenFraction = Weakness > fraction ? _weakenFraction : Mathf.Clamp01(fraction);
            _weakenUntil = Mathf.Max(_weakenUntil, Time.time + seconds);
        }

        /// <summary>Attacker values at this moment (stats, or level only), less a weakening.</summary>
        public AttackerSnapshot CreateAttackerSnapshot()
        {
            AttackerSnapshot snapshot = stats != null ? AttackerSnapshot.FromStats(stats.Stats) : AttackerSnapshot.ForEnemy(level);
            float weakness = Weakness;
            if (weakness > 0f)
            {
                snapshot.DamageBonus -= weakness;
            }

            if (team == CombatTeam.Enemy && _difficulty != null)
            {
                // GDD 03 9.7: enemy damage × G of the difficulty (0.5 / 1 / 1.35 / 1.8).
                snapshot.DamageBonus = (1f + snapshot.DamageBonus) * _difficulty.Settings.EnemyDamage - 1f;
            }

            return snapshot;
        }

        /// <summary>Defender values at this moment, with the block values if the hit is blocked.</summary>
        /// <param name="block">Block state for the calculation.</param>
        /// <param name="blockSpec">Block values.</param>
        public DefenderSnapshot CreateDefenderSnapshot(BlockState block, in BlockSpec blockSpec)
        {
            bool playerSide = team == CombatTeam.Player;
            DefenderSnapshot snapshot = stats != null ? DefenderSnapshot.FromStats(stats.Stats, playerSide) : DefenderSnapshot.Create(level, armor, playerSide);
            if (stats == null)
            {
                snapshot.Resistances = _resistances;
            }

            if (_status != null)
            {
                // GDD 03 7.2: a stunned target takes +20 % damage.
                snapshot.IncomingDamageMultiplier *= _status.IncomingDamageMultiplier;
            }

            snapshot.IncomingDamageMultiplier *= Mathf.Max(0f, DamageTakenFactor);

            snapshot.Block = block;
            if (block == BlockState.Blocking)
            {
                snapshot.BlockPhysicalReduction = blockSpec.PhysicalReduction;
                snapshot.BlockElementalReduction = blockSpec.ElementalReduction;
                snapshot.BlockStability = blockSpec.Stability;
            }

            return snapshot;
        }

        /// <summary>
        /// Resolves a hit on this combatant: defense (evade, parry, block), damage calculation, health, poise, reactions of
        /// the brain, hit feel (hitstop, flash), <c>DamageDealt</c> and the local events.
        /// </summary>
        /// <param name="hit">The hit.</param>
        /// <returns>What happened.</returns>
        public HitReport ReceiveHit(in IncomingHit hit)
        {
            var report = new HitReport { Attacker = hit.Attacker, Target = this, Attack = hit.Attack, Zone = hit.Zone, Point = hit.Point };
            if (!IsAlive || hit.Attacker == null || hit.Attack == null)
            {
                report.Defense = DefenseOutcome.Ignored;
                return report;
            }

            Vector3 position = transform.position;
            float bearing = CombatMath.BearingTo(position.x, position.z, transform.eulerAngles.y, hit.AttackerPosition.x, hit.AttackerPosition.z);
            DefenseOutcome defense = _controller != null ? _controller.EvaluateDefense(hit, bearing) : DefenseOutcome.Hit;
            report.Defense = defense;
            if (defense == DefenseOutcome.Evaded || defense == DefenseOutcome.Ignored)
            {
                Finish(ref report);
                return report;
            }

            BlockState blockState = defense == DefenseOutcome.Parried ? BlockState.PerfectParry
                : defense == DefenseOutcome.Blocked ? BlockState.Blocking : BlockState.None;
            BlockSpec blockSpec = _controller != null ? _controller.ActiveBlock : default;
            DamageRequest request = DamageRequest.Create(hit.Attacker.CreateAttackerSnapshot(), CreateDefenderSnapshot(blockState, blockSpec),
                hit.Profile.Base);
            request.AttackMultiplier = hit.Attack.DamageMultiplier;
            request.Scaling = hit.Profile.Scaling;
            request.Zone = hit.Zone;
            // GDD 03 8.2: head hits of projectiles count ×1.75 instead of ×1.5.
            request.IsRanged = hit.Attack.IsProjectile;
            request.IsExplosion = hit.Attack.IsExplosion;
            request.Buildup = hit.Attack.Buildup.Plus(hit.Profile.Buildup);
            request.WeaponPoise = hit.Profile.WeaponPoise;
            request.PoiseMultiplier = hit.Attack.PoiseMultiplier;
            request.StaminaDamage = hit.Attack.StaminaDamage;
            // GDD 03 4.8: the counter gets no additional critical roll; the finisher neither.
            request.SuppressCritical = hit.Attack.Kind == AttackKind.Counter || hit.Attack.Kind == AttackKind.Finisher;

            DamageResult result = Calculate(request);
            int damage = result.Damage;
            if (hit.MinimumDamage > damage && defense != DefenseOutcome.Parried)
            {
                damage = (int)Math.Round(hit.MinimumDamage, MidpointRounding.AwayFromZero);
            }

            report.Damage = damage;
            report.Flags = result.Flags;
            report.DamageType = hit.Profile.Base.PrimaryType;
            report.PoiseDamage = result.PoiseDamage;
            report.BlockStaminaCost = result.BlockStaminaCost;

            if (damage > 0)
            {
                DamageOutcome outcome = damageable.ApplyDamage(new DamageInfo(damage, hit.Attacker.CombatantId, report.DamageType, result.Flags,
                    result.PoiseDamage));
                report.Applied = outcome.Applied;
                report.Killed = outcome.Killed;
                Health health = damageable.Health;
                if (!outcome.Killed && hit.ExecuteBelowFraction > 0f && health.IsAlive && health.Normalized <= hit.ExecuteBelowFraction)
                {
                    report.Killed = health.Kill(hit.Attacker.CombatantId);
                }
            }

            if (defense == DefenseOutcome.Parried)
            {
                hit.Attacker.NotifyParriedBy(this);
            }

            if (_poise != null && defense == DefenseOutcome.Hit && !report.Killed)
            {
                report.Poise = _poise.ApplyDamage(result.PoiseDamage);
            }

            if (!result.Buildup.IsEmpty && !report.Killed && defense != DefenseOutcome.Parried && !damageable.IsInvulnerable)
            {
                ApplyStatus(result.Buildup, defense == DefenseOutcome.Blocked);
            }

            report.Stagger = _controller != null ? _controller.OnHitResolved(report) : StaggerKind.None;
            if (report.Poise == PoiseOutcome.Broken)
            {
                Action<Combatant> broken = PoiseBroken;
                if (broken != null)
                {
                    broken(this);
                }
            }

            Finish(ref report);
            return report;
        }

        /// <summary>Status build-up of a hit (GDD 03 7.1): half through a block; a boss turns stun build-up into poise damage.</summary>
        private void ApplyStatus(in StatusBuildup buildup, bool blocked)
        {
            StatusEffectController status = Status;
            StatusBuildup applied = blocked ? buildup.Scaled(0.5f) : buildup;
            if (team == CombatTeam.Player && _difficulty != null && _difficulty.Settings.StatusOnPlayer != 1f)
            {
                // GDD 03 9.7: status build-up on the player × 0.5 / 1 / 1.25 / 1.5.
                applied = applied.Scaled(_difficulty.Settings.StatusOnPlayer);
            }
            if (status.Settings.IsBoss && _poise != null)
            {
                float stun = applied.Get(StatusEffectId.Stun);
                if (stun > 0f)
                {
                    _poise.ApplyDamage(stun);
                }
            }

            status.Apply(applied);
        }

        /// <summary>Applies poise damage from a parry (GDD 03 4.8) and opens this combatant for a counter.</summary>
        /// <param name="defender">The parrying combatant.</param>
        public void NotifyParriedBy(Combatant defender)
        {
            if (_poise != null && IsAlive)
            {
                PoiseOutcome outcome = _poise.ApplyParry(parryPoiseLoss);
                if (outcome == PoiseOutcome.Broken)
                {
                    Action<Combatant> broken = PoiseBroken;
                    if (broken != null)
                    {
                        broken(this);
                    }
                }
            }

            if (_controller != null)
            {
                _controller.OnParriedBy(defender);
            }
        }

        /// <summary>Full poise and no hitstop; health stays as it is (after loading a save, which restored the health).</summary>
        public void ResetTransientState()
        {
            _hitStop.Clear();
            if (_poise != null)
            {
                _poise.Reset();
            }

            if (_status != null)
            {
                _status.ClearEffects();
            }

            _burnCarry = 0f;
            _poisonCarry = 0f;
            _corruptionCarry = 0f;
            _weakenUntil = 0f;
        }

        /// <summary>Full health, full poise, no hitstop (respawn).</summary>
        public void ResetForRespawn()
        {
            ResetTransientState();
            Health health = Health;
            if (health != null)
            {
                if (health.IsDead)
                {
                    health.Revive(1f);
                }
                else
                {
                    health.Heal(health.Max);
                }
            }
        }

        internal void RaiseHitDealt(in HitReport report)
        {
            Action<HitReport> dealt = HitDealt;
            if (dealt != null)
            {
                dealt(report);
            }
        }

        private void Awake()
        {
            if (damageable == null && !TryGetComponent(out damageable))
            {
                Log.Error(LogCategory.Combat, "Combatant '" + name + "' needs a DamageableComponent.");
            }

            if (usePoiseMeter && _poise == null)
            {
                _poise = new PoiseMeter(maxPoise, PoiseSettings.Normal);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                Services.Locator.TryGet(out _difficulty);
                if (Services.Locator.TryGet(out ICombatService service))
                {
                    _service = service;
                    RegisterWithService();
                }
                else if (!_warnedNoService)
                {
                    _warnedNoService = true;
                    Log.Warning(LogCategory.Combat, "Combatant '" + name + "': no ICombatService registered (CombatInstaller missing in the " +
                                                    "BootConfig). Hits work, but no DamageDealt events, no lock-on and no AI targets.");
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Combat, exception, "Combatant '" + name + "' could not resolve ICombatService.");
            }
        }

        private void OnEnable()
        {
            RegisterWithService();
        }

        private void OnDisable()
        {
            if (_registered)
            {
                _service.Unregister(this);
                _registered = false;
            }
        }

        private void RegisterWithService()
        {
            if (_service == null || _registered || !isActiveAndEnabled)
            {
                return;
            }

            _service.Register(this);
            _registered = true;
        }

        private DamageResult Calculate(in DamageRequest request)
        {
            if (_service != null)
            {
                return _service.Calculator.Calculate(request, _service.Random);
            }

            if (_fallbackCalculator == null)
            {
                _fallbackCalculator = new DamageCalculator();
                _fallbackRandom = new Pcg32Random((ulong)DateTime.UtcNow.Ticks);
            }

            return _fallbackCalculator.Calculate(request, _fallbackRandom);
        }

        private void Finish(ref HitReport report)
        {
            Combatant attacker = report.Attacker;
            bool targetIsPlayer = team == CombatTeam.Player;
            bool heavyOnPlayer = report.Stagger == StaggerKind.Stagger || report.Stagger == StaggerKind.Knockdown;
            report.Feedback = HitFeedbackTable.Classify(report.Attack, report.Defense, report.IsCritical, report.Poise == PoiseOutcome.Broken,
                report.Stagger == StaggerKind.GuardBreak, targetIsPlayer, heavyOnPlayer);
            HitFeedbackTable table = _service != null ? _service.Feedback : null;
            AttackSpec attack = report.Attack;
            float hitStop = table != null ? table.HitStopOf(report.Feedback) : 0f;
            float amplitude = table != null ? table.ShakeAmplitudeOf(report.Feedback) : 0f;
            float duration = table != null ? table.ShakeDurationOf(report.Feedback) : 0f;
            if (attack != null && report.Feedback != HitFeedbackKind.None && !targetIsPlayer)
            {
                // Attack assets may override the table (GDD 03 4.11 values are start values).
                hitStop = attack.HitStopSeconds > 0f ? attack.HitStopSeconds : hitStop;
                amplitude = attack.ShakeAmplitude > 0f ? attack.ShakeAmplitude : amplitude;
                duration = attack.ShakeDuration > 0f ? attack.ShakeDuration : duration;
            }

            report.HitStopSeconds = hitStop;
            report.ShakeAmplitude = amplitude;
            report.ShakeDuration = duration;
            if (hitStop > 0f && report.Feedback != HitFeedbackKind.None)
            {
                _hitStop.Request(hitStop);
            }

            if (hitFlash != null && report.Feedback != HitFeedbackKind.None)
            {
                hitFlash.Flash(FlashColorOf(report));
            }

            if (_service != null)
            {
                _service.ReportHit(report);
            }

            Action<HitReport> received = HitReceived;
            if (received != null)
            {
                received(report);
            }

            if (attacker != null)
            {
                attacker.RaiseHitDealt(report);
            }
        }

        private static Color FlashColorOf(in HitReport report)
        {
            switch (report.Defense)
            {
                case DefenseOutcome.Parried:
                    // GDD 05: white-gold star #FFE8A3.
                    return new Color(1f, 0.91f, 0.64f);
                case DefenseOutcome.Blocked:
                    return new Color(0.55f, 0.75f, 1f);
            }

            if (report.Poise == PoiseOutcome.Broken)
            {
                return new Color(1f, 0.6f, 0.1f);
            }

            return report.IsCritical ? new Color(1f, 0.95f, 0.2f) : Color.white;
        }
    }
}
