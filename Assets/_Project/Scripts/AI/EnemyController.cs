using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Utilities;
using UnityEngine;

namespace Aetherfall.AI
{
    /// <summary>
    /// Scene adapter of one enemy (wolf, Aether wolf): builds the <see cref="EnemyBrain"/> from its
    /// <see cref="EnemyTypeDefinition"/>, senses the player (sight zones + line of sight, noise by stance), moves with a
    /// <see cref="CharacterController"/> on flat ground with obstacle raycasts (no NavMesh bake needed), shows the telegraph
    /// (red tint and rearing up), reacts to hits (poise break → stunned, parry → opened, knockback, crystal core) and plays
    /// a short death effect before it removes itself. It is the <see cref="ICombatantController"/> of its
    /// <see cref="Combatant"/>.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the enemy root with CharacterController, <see cref="Combatant"/> (team Enemy),
    /// <see cref="DamageableComponent"/>, <see cref="Hitbox"/>, <see cref="EnemyDeathReporter"/> and hurtbox children; built by
    /// the test ground menu. Ticked by the <see cref="IAIManager"/> (falls back to its own Update without the AIInstaller).</para>
    /// <para>Movement lives in <see cref="EnemyLocomotion"/>, the placeholder visuals in <see cref="EnemyVisuals"/>, the
    /// overlay text in <see cref="EnemyStateText"/>, the decisions in <see cref="EnemyBrain"/>. Size (about 570 lines,
    /// architecture P3): the rest is the glue of one enemy to four systems (combat callbacks, senses with line of sight,
    /// crystal core, respawn/death, AI manager registration); splitting it further would only spread one adapter over
    /// several files.</para>
    /// <para>TODO (navigation step): NavMeshAgent paths per cell (architecture 10.6, 11.10), animations with root motion,
    /// group positions (EncounterGroup), reinforcements when fleeing.</para>
    /// </remarks>
    [RequireComponent(typeof(CharacterController))]
    [RequireComponent(typeof(Combatant))]
    [DisallowMultipleComponent]
    public sealed class EnemyController : MonoBehaviour, IAIAgent, ICombatantController, IHitWindowReceiver, ICombatDebugSource, ICrowdControlTarget
    {
        private const float SenseInterval = 0.1f;
        private const float TargetSearchInterval = 0.5f;
        private const float ReachableHeight = 1.8f;

        [Tooltip("Gegnertyp mit allen Werten (Assets/_Project/Data/Enemies/…). Pflichtfeld.")]
        [SerializeField] private EnemyTypeDefinition definition = null;

        [Tooltip("Laufende Nummer dieses Gegners in der Szene; die eindeutige ID ist „Typ-ID#Nummer“.")]
        [SerializeField] private string instanceNumber = "1";

        [Tooltip("Nur für benannte Gegner: feste ID statt „Typ-ID#Nummer“, z. B. boss.eichental.glutfang. Quest-Ziele " +
                 "„Töte bestimmten Gegner“ zählen diese ID.")]
        [SerializeField] private string uniqueId = string.Empty;

        [Tooltip("Wachen (an der Stelle stehen) statt Patrouillieren.")]
        [SerializeField] private bool guard = true;

        [Tooltip("Wegpunkte der Patrouille (leer = Wachen).")]
        [SerializeField] private Transform[] patrolPoints = new Transform[0];

        [Header("Teile")]
        [Tooltip("Hitbox der Angriffe. Leer = Hitbox am selben GameObject.")]
        [SerializeField] private Hitbox hitbox = null;

        [Tooltip("Geschoss-Werfer für Fernangriffe (Armbrustschütze). Leer = keine Fernangriffe.")]
        [SerializeField] private ProjectileLauncher projectiles = null;

        [Tooltip("Treffer-Blitz und Einfärbung (Telegrafie rot, betäubt orange). Optional.")]
        [SerializeField] private HitFlash hitFlash = null;

        [Tooltip("Sichtbarer Körper (Kind-Objekt): bäumt sich bei der Telegrafie auf, kippt beim Tod um.")]
        [SerializeField] private Transform body = null;

        [Tooltip("Kristallkern (Aether-verderbt): Kind-Objekt mit Schwachpunkt-Trefferzone; wird beim Bruch ausgeblendet.")]
        [SerializeField] private GameObject crystalCore = null;

        [Header("Umgebung")]
        [Tooltip("Layer der Hindernisse für das Ausweichen (Environment).")]
        [SerializeField] private LayerMask obstacleLayers = 1 << 11;

        [Tooltip("Layer, die die Sicht verdecken (Environment).")]
        [SerializeField] private LayerMask sightBlockers = 1 << 11;

        [Header("Darstellung")]
        [Tooltip("Farbe der Telegrafie (Ausholen vor dem Angriff, GDD 03, 9.5).")]
        [SerializeField] private Color telegraphColor = new Color(1f, 0.15f, 0.05f);

        [Tooltip("Farbe, solange der Gegner betäubt ist (Finisher möglich).")]
        [SerializeField] private Color stunnedColor = new Color(1f, 0.6f, 0.1f);

        [Tooltip("Sekunden vom Tod bis zum Entfernen (kurzer Effekt).")]
        [Range(0.2f, 5f)] [SerializeField] private float deathRemoveSeconds = 1.2f;

        private CharacterController _controller;
        private Combatant _combatant;
        private EnemyBrain _brain;
        private IAIManager _manager;
        private ICombatService _combat;
        private Combatant _target;
        private Combatant _tauntSource;
        private bool _warnedNoLauncher;
        private float _tauntUntil;
        private Vector3 _anchorPosition;
        private Quaternion _anchorRotation;
        private EnemyLocomotion _locomotion;
        private EnemyVisuals _visuals;
        private float _senseTimer;
        private float _targetSearchTimer;
        private float _deathTimer = -1f;
        private float _coreDamage;
        private bool _targetVisible;
        private bool _wasHit;
        private bool _coreBroken;
        private bool _registered;
        private bool _reportedEngaged;
        private bool _selfTick;

        /// <summary>The brain (read-only use: debug overlay); null until the services are resolved.</summary>
        public EnemyBrain Brain => _brain;

        /// <summary>The enemy type.</summary>
        public EnemyTypeDefinition Definition => definition;

        /// <summary>The combatant of this enemy.</summary>
        public Combatant Combatant => _combatant;

        /// <inheritdoc />
        public bool IsLarge => false;

        /// <inheritdoc />
        public bool IsNormalRank => definition == null || definition.IsNormalRank;

        /// <inheritdoc />
        public BlockSpec ActiveBlock => default;

        /// <inheritdoc />
        public Combatant FocusTarget => _target;

        /// <inheritdoc />
        public string DebugStateText => EnemyStateText.Describe(_brain);

        /// <inheritdoc />
        public DefenseOutcome EvaluateDefense(in IncomingHit hit, float bearing)
        {
            return _combatant.IsAlive ? DefenseOutcome.Hit : DefenseOutcome.Ignored;
        }

        /// <inheritdoc />
        public AttackProfile GetAttackProfile(AttackSpec attack)
        {
            float damage = definition != null ? definition.Damage : 10f;
            DamageType type = attack != null && attack.OverrideDamageType ? attack.DamageType : definition != null ? definition.DamageType : DamageType.Stab;
            DamagePacket packet = DamagePacket.Single(type, damage);
            StatusBuildup buildup = StatusBuildup.None;
            if (definition != null && definition.AetherDamageShare > 0f && !_coreBroken)
            {
                // Aether-corrupted (GDD 01 11.2): +25 % damage as Aether damage; every hit +5 corruption (GDD 01 A3).
                packet = packet.With(DamageType.Aether, damage * definition.AetherDamageShare);
                buildup = buildup.With(StatusEffectId.AetherCorruption, 5f);
            }

            return new AttackProfile(packet, AttributeScaling.None, definition != null ? definition.AttackPoise : 10f, buildup);
        }

        /// <summary>
        /// Status rules of the type (GDD 03 7.1–7.2): resistance from the data, immunities of the family, no corruption bar
        /// for Aether-corrupted variants.
        /// </summary>
        private void ConfigureStatus()
        {
            StatusEffectController status = _combatant.Status;
            _combatant.ConfigureStatus(StatusSettings.Enemy.WithResistance(definition.StatusResistance), definition.IsAetherCorrupted);
            bool noBlood = definition.Kind == EnemyKind.Undead || definition.Kind == EnemyKind.Construct || definition.Kind == EnemyKind.Spirit;
            status.SetImmune(StatusEffectId.Bleeding, noBlood);
            status.SetImmune(StatusEffectId.Poison, definition.Kind == EnemyKind.Undead || definition.Kind == EnemyKind.Construct);
        }

        private void OnStatusTriggered(StatusEffectId effect)
        {
            if (_brain == null || !_combatant.IsAlive)
            {
                return;
            }

            switch (effect)
            {
                case StatusEffectId.Stun:
                    // GDD 03 7.2: helpless, no finisher (that stays with the poise break).
                    _combatant.Poise?.Stun(_combatant.Status.Settings.StunSeconds, false);
                    _brain.NotifyStunned(_combatant.Status.Settings.StunSeconds, false);
                    break;
                case StatusEffectId.Shock:
                    // Interrupts the running attack, 0.8 s stagger.
                    _brain.NotifyStunned(StatusEffectController.ShockStaggerSeconds, false);
                    break;
                case StatusEffectId.Burning:
                    if (definition.Kind == EnemyKind.Beast || definition.Kind == EnemyKind.Swarm)
                    {
                        _brain.NotifyFlee(2f);
                    }

                    break;
                case StatusEffectId.Freezing:
                    if (!_combatant.Status.Settings.IsBoss)
                    {
                        _brain.NotifyStunned(_combatant.Status.Settings.FreezeSeconds, false);
                    }

                    break;
            }
        }

        /// <inheritdoc />
        public StaggerKind OnHitResolved(in HitReport report)
        {
            if (report.Attacker != null && report.Attacker.Team == CombatTeam.Player)
            {
                _wasHit = true;
            }

            if (report.Killed || _brain == null)
            {
                return StaggerKind.None;
            }

            if (report.Poise == PoiseOutcome.Broken)
            {
                _brain.NotifyStunned(_combatant.Poise.StunRemaining, true);
            }

            if (definition.HasCrystalCore && !_coreBroken && report.Zone == HitZone.WeakPoint && report.DealtDamage)
            {
                _coreDamage += report.Damage;
                if (_coreDamage >= _combatant.Health.Max * definition.CrystalCoreBreakFraction)
                {
                    BreakCrystalCore();
                }
            }

            if (report.Defense == DefenseOutcome.Hit && report.Attack != null && report.Attacker != null)
            {
                float distance = report.Attack.KnockbackDistance * (report.Poise == PoiseOutcome.None ? 1f : 1.5f);
                _locomotion.StartKnockback(report.Attacker.transform.position, distance);
            }

            return StaggerKind.None;
        }

        /// <inheritdoc />
        public void OnParriedBy(Combatant defender)
        {
            if (_brain == null)
            {
                return;
            }

            PoiseMeter poise = _combatant.Poise;
            if (poise != null && poise.IsStunned && poise.StunAllowsFinisher)
            {
                // The parry broke the poise: directly open for the finisher (GDD 03 4.8).
                _brain.NotifyStunned(poise.StunRemaining, true);
            }
            else
            {
                _brain.NotifyStunned(definition.ParryOpenSeconds, false);
            }
        }

        /// <inheritdoc />
        public void OpenHitWindow(AttackSpec attack)
        {
            if (attack != null && attack.IsProjectile)
            {
                // Ranged attack (crossbow bolt, GDD 01 11.4 Armbrustschütze): fires at the target instead of opening the hitbox.
                FireProjectile(attack);
                return;
            }

            if (hitbox != null)
            {
                hitbox.OpenHitWindow(attack);
            }
        }

        /// <summary>True while the enemy waits hidden in an ambush (<see cref="EnemyAmbush"/>): the AI does not run.</summary>
        public bool Dormant { get; set; }

        /// <summary>
        /// Puts the enemy into combat at once, as if it had been hit (an ambush: the Rissling leaps out of its crevice).
        /// </summary>
        public void Alert()
        {
            _wasHit = true;
            _targetSearchTimer = 0f;
        }

        private void FireProjectile(AttackSpec attack)
        {
            if (projectiles == null)
            {
                if (!_warnedNoLauncher)
                {
                    _warnedNoLauncher = true;
                    Log.Warning(LogCategory.AI, "EnemyController '" + name + "': ranged attack '" + attack.Id + "' without ProjectileLauncher.");
                }

                return;
            }

            Combatant target = _target != null && _target.IsAlive ? _target : null;
            Vector3 aim = target != null ? target.TargetPosition : transform.position + transform.forward * 15f + Vector3.up * 1.2f;
            projectiles.FireAt(_combatant, attack, GetAttackProfile(attack), aim);
        }

        /// <inheritdoc />
        public void CloseHitWindow()
        {
            if (hitbox != null)
            {
                hitbox.CloseHitWindow();
            }
        }

        /// <summary>Back to the anchor with full health and poise, brain in its base state (respawn button).</summary>
        public void ResetToAnchor()
        {
            if (!gameObject.activeSelf)
            {
                gameObject.SetActive(true);
            }

            bool enabledController = _controller != null && _controller.enabled;
            if (enabledController)
            {
                _controller.enabled = false;
            }

            transform.SetPositionAndRotation(_anchorPosition, _anchorRotation);
            if (enabledController)
            {
                _controller.enabled = true;
            }

            _combatant.ResetForRespawn();
            _coreBroken = false;
            _coreDamage = 0f;
            if (crystalCore != null)
            {
                crystalCore.SetActive(true);
            }

            _visuals.Reset();
            _locomotion.Reset();
            _deathTimer = -1f;
            if (_brain != null)
            {
                _brain.Reset();
            }
        }

        /// <inheritdoc />
        public void TickAI(float deltaTime)
        {
            if (_brain == null)
            {
                return;
            }

            if (Dormant)
            {
                // Hidden in an ambush: no perception, no movement until it wakes.
                _combatant.Tick(deltaTime);
                return;
            }

            float local = _combatant.Tick(deltaTime);
            if (_deathTimer >= 0f)
            {
                UpdateDeath(deltaTime);
                return;
            }

            _targetSearchTimer -= deltaTime;
            if (_targetSearchTimer <= 0f || _target == null || !_target.IsAlive)
            {
                _targetSearchTimer = TargetSearchInterval;
                FindTarget();
            }

            EnemySenses senses = BuildSenses(deltaTime);
            _wasHit = false;
            _brain.Tick(local, senses);
            // The telegraph tracks slower than normal turning, so a dodge to the side is rewarded (GDD 03 9.5).
            float turnRate = definition.TurnRate * (_brain.IsTelegraphing ? 0.5f : 1f);
            _locomotion.Move(_brain.Intent, local, turnRate);
            _visuals.Refresh(_brain.IsTelegraphing, _brain.State == EnemyStateId.Stunned, Time.time, Time.deltaTime);

            float regen = _brain.RegenPerSecond;
            Health health = _combatant.Health;
            if (regen > 0f && health != null && health.IsAlive)
            {
                health.Heal(health.Max * regen * local);
            }

            ReportEngagement(_brain.IsEngaged);
        }

        private void Awake()
        {
            _controller = GetComponent<CharacterController>();
            _combatant = GetComponent<Combatant>();
            if (hitbox == null)
            {
                TryGetComponent(out hitbox);
            }

            _anchorPosition = transform.position;
            _anchorRotation = transform.rotation;
            _locomotion = new EnemyLocomotion(_controller, obstacleLayers);
            _visuals = new EnemyVisuals(body, hitFlash, telegraphColor, stunnedColor);

            if (definition == null)
            {
                Log.Error(LogCategory.AI, "EnemyController on '" + name + "': the field 'Definition' is empty. Assign an EnemyTypeDefinition.");
                enabled = false;
                return;
            }

            _combatant.SetController(this);
            ConfigureFromDefinition(1f, 1f);
        }

        private void ConfigureFromDefinition(float healthFactor, float poiseFactor)
        {
            string id = !string.IsNullOrEmpty(uniqueId) ? uniqueId : definition.EnemyTypeId + "#" + instanceNumber;
            _combatant.Configure(definition.Level, definition.Armor, definition.CreateResistances(), definition.MaxPoise * poiseFactor, PoiseSettings.Normal, id,
                definition.EnemyTypeId, definition.ParryPoiseLoss);
            ConfigureStatus();
            Health health = _combatant.Health;
            if (health != null)
            {
                health.Pool.SetFixedMax(definition.MaxHealth * healthFactor);
                health.RestoreState(definition.MaxHealth * healthFactor);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            if (!enabled)
            {
                return;
            }

            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                locator.TryGet(out _combat);
                locator.TryGet(out _manager);
                if (!locator.TryGet(out IAttackTokenService tokens))
                {
                    tokens = new AttackTokenService();
                    Log.Warning(LogCategory.AI, "EnemyController '" + name + "': no IAttackTokenService (AIInstaller missing in the BootConfig). " +
                                                "Using a local token service: enemies do not coordinate their attacks.");
                }

                // GDD 03 9.7: health, poise, telegraph and cooldowns follow the difficulty (enemies that spawn later get the new level).
                DifficultySettings difficulty = locator.TryGet(out IDifficultyService difficultyService) ? difficultyService.Settings : null;
                if (difficulty != null && (difficulty.EnemyHealth != 1f || difficulty.EnemyPoise != 1f) && _combatant.Health != null &&
                    _combatant.Health.Current >= _combatant.Health.Max)
                {
                    ConfigureFromDefinition(difficulty.EnemyHealth, difficulty.EnemyPoise);
                }

                EnemyBrainSettings settings = definition.CreateBrainSettings(guard || patrolPoints.Length == 0, out string problem, difficulty);
                if (settings == null)
                {
                    Log.Error(LogCategory.AI, "EnemyController '" + name + "': " + problem);
                    enabled = false;
                    return;
                }

                ulong seed = (ulong)(Environment.TickCount + _combatant.CombatantId.Length * 7919);
                _brain = new EnemyBrain(settings, tokens, _combatant.CombatantId, new Pcg32Random(seed), ToFlat(_anchorPosition), PatrolPoints(), this);
                _selfTick = _manager == null;
                if (_selfTick)
                {
                    Log.Warning(LogCategory.AI, "EnemyController '" + name + "': no IAIManager (AIInstaller missing), ticking itself.");
                }

                RegisterAgent();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.AI, exception, "EnemyController '" + name + "' could not start.");
            }
        }

        private void OnEnable()
        {
            RegisterAgent();
            Health health = _combatant != null ? _combatant.Health : null;
            if (health != null)
            {
                health.Died += OnDied;
            }

            if (_combatant != null)
            {
                _combatant.Status.Triggered += OnStatusTriggered;
            }
        }

        private void OnDisable()
        {
            if (_registered)
            {
                _manager.Unregister(this);
                _registered = false;
            }

            Health health = _combatant != null ? _combatant.Health : null;
            if (health != null)
            {
                health.Died -= OnDied;
            }

            if (_combatant != null)
            {
                _combatant.Status.Triggered -= OnStatusTriggered;
            }

            ReportEngagement(false);
        }

        private void Update()
        {
            if (_selfTick)
            {
                TickAI(Time.deltaTime);
            }
        }

        private void RegisterAgent()
        {
            if (_manager == null || _registered || !isActiveAndEnabled || _brain == null)
            {
                return;
            }

            _manager.Register(this);
            _registered = true;
        }

        /// <inheritdoc />
        public void Stagger(float seconds)
        {
            // Warrior techniques (GDD 03 11.4): Schildschlag interrupts, Kriegsschrei makes normal enemies stagger.
            if (_brain != null && _combatant != null && _combatant.IsAlive && seconds > 0f)
            {
                _brain.NotifyStunned(seconds, false);
            }
        }

        /// <inheritdoc />
        public void KnockDown(float seconds)
        {
            // Fußfeger: down on the ground, helpless like a stagger (no finisher window).
            Stagger(seconds);
        }

        /// <inheritdoc />
        public void Pull(Vector3 towards, float distance)
        {
            if (_locomotion != null && _combatant != null && _combatant.IsAlive && distance > 0f)
            {
                _locomotion.StartPull(towards, distance);
            }
        }

        /// <inheritdoc />
        public void Taunt(Combatant source, float seconds)
        {
            if (source == null || !source.IsAlive || !(seconds > 0f) || _brain == null)
            {
                return;
            }

            // Spott: attacks the one who taunted for a while, even if someone else stands closer.
            _tauntSource = source;
            _tauntUntil = Time.time + seconds;
            _target = source;
            _brain.TargetId = source.CombatantId;
            _wasHit = true;
        }

        private void FindTarget()
        {
            _target = null;
            if (_combat == null)
            {
                return;
            }

            if (_tauntSource != null && _tauntSource.IsAlive && Time.time < _tauntUntil)
            {
                _target = _tauntSource;
                _brain.TargetId = _target.CombatantId;
                return;
            }

            _tauntSource = null;

            Vector3 position = transform.position;
            float best = float.MaxValue;
            var combatants = _combat.Combatants;
            for (int i = 0; i < combatants.Count; i++)
            {
                Combatant candidate = combatants[i];
                if (candidate == null || candidate.Team != CombatTeam.Player || !candidate.IsAlive)
                {
                    continue;
                }

                float distance = (candidate.transform.position - position).sqrMagnitude;
                if (distance < best)
                {
                    best = distance;
                    _target = candidate;
                }
            }

            if (_target != null)
            {
                _brain.TargetId = _target.CombatantId;
            }
        }

        private EnemySenses BuildSenses(float deltaTime)
        {
            Vector3 position = transform.position;
            var senses = new EnemySenses
            {
                Self = ToFlat(position),
                SelfYaw = transform.eulerAngles.y,
                HealthFraction = _combatant.Health != null ? _combatant.Health.Normalized : 1f,
                WasHitByTarget = _wasHit,
                TargetReachable = true
            };

            if (_target == null || !_target.IsAlive)
            {
                _targetVisible = false;
                return senses;
            }

            Vector3 targetPosition = _target.transform.position;
            senses.HasTarget = true;
            senses.Target = ToFlat(targetPosition);
            senses.TargetStance = _target.Stance;
            senses.TargetProtected = _combat != null && _combat.IsProtectedFromAttacks(_target);
            senses.TargetReachable = Mathf.Abs(targetPosition.y - position.y) < ReachableHeight && !_locomotion.Blocked;

            _senseTimer -= deltaTime;
            if (_senseTimer <= 0f)
            {
                // Perception at 10 Hz (architecture 11.10: 5–10 Hz).
                _senseTimer = SenseInterval;
                float distance = senses.Self.DistanceTo(senses.Target);
                float bearing = CombatMath.BearingTo(position.x, position.z, senses.SelfYaw, targetPosition.x, targetPosition.z);
                PerceptionSettings perception = _brain.Settings.Perception;
                _targetVisible = PerceptionMath.IsInSight(distance, bearing, perception) &&
                                 !Physics.Linecast(position + Vector3.up * 0.6f, _target.TargetPosition, sightBlockers, QueryTriggerInteraction.Ignore);
            }

            senses.TargetVisible = _targetVisible;
            return senses;
        }

        private void UpdateDeath(float deltaTime)
        {
            _deathTimer -= deltaTime;
            _visuals.UpdateDeath(deltaTime);
            if (_deathTimer < 0f)
            {
                gameObject.SetActive(false);
            }
        }

        private void OnDied(DamageInfo killingDamage)
        {
            if (_brain != null)
            {
                _brain.Kill();
            }

            CloseHitWindow();
            ReportEngagement(false);
            _visuals.ShowDead();
            _deathTimer = deathRemoveSeconds;
        }

        private void BreakCrystalCore()
        {
            // GDD 01 11.2: the core breaks – stunned 3 s (no finisher stun), the Aether bonus is gone.
            _coreBroken = true;
            if (crystalCore != null)
            {
                crystalCore.SetActive(false);
            }

            _combatant.Poise.Stun(3f, false);
            _brain.NotifyStunned(3f, false);
            Log.Info(LogCategory.AI, "'" + _combatant.CombatantId + "': crystal core broken.");
        }

        private void ReportEngagement(bool engaged)
        {
            if (engaged == _reportedEngaged)
            {
                return;
            }

            _reportedEngaged = engaged;
            if (_combat != null)
            {
                _combat.ReportEngagement(this, engaged);
            }
        }

        private FlatPoint[] PatrolPoints()
        {
            int count = 0;
            for (int i = 0; i < patrolPoints.Length; i++)
            {
                if (patrolPoints[i] != null)
                {
                    count++;
                }
            }

            var points = new FlatPoint[count];
            int index = 0;
            for (int i = 0; i < patrolPoints.Length; i++)
            {
                if (patrolPoints[i] != null)
                {
                    points[index++] = ToFlat(patrolPoints[i].position);
                }
            }

            return points;
        }

        private static FlatPoint ToFlat(Vector3 position)
        {
            return new FlatPoint(position.x, position.z);
        }
    }
}
