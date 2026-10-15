using System;
using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Utilities;
using UnityEngine;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Unity adapter of a mini-boss (GDD 03 9.6; GDD 02 11.7 "Der Wachende Ritter"): feeds the <see cref="BossBrain"/> with
    /// senses (player in the encounter area, distance, health), moves the body (<see cref="EnemyLocomotion"/>), blocks frontal
    /// hits with the tower shield, opens the hitbox in the attack windows, summons the adds in phase 2, checks the Aether beam
    /// of the arena mirror and publishes <c>BossEncounterStarted</c>, <c>BossPhaseChanged</c>, <c>BossEncounterEnded</c> and –
    /// exactly once – <c>BossDefeated</c>. Shows the boss health bar through <see cref="IBossBarService"/>. If the player dies
    /// or stays outside the closed arena, the fight resets (boss back at full health, adds gone, gate open). Damage stops at the
    /// next phase threshold until that phase has begun; the poise is full after a phase change.
    /// </summary>
    /// <remarks>
    /// GameObject: "Der Wachende Ritter" with CharacterController, Combatant (team Enemy, combatant id = boss id),
    /// DamageableComponent, Hitbox, HitFlash, EnemyDeathReporter (quest kill, XP, loot table of the base type) and this
    /// component; children: body, shield, hurtbox. "Besiegt bleibt besiegt" is done by the world (DefeatedObjectGate hides
    /// the boss after loading); when the boss object is switched on again it resets itself.
    /// </remarks>
    [RequireComponent(typeof(CharacterController))]
    [RequireComponent(typeof(Combatant))]
    [DisallowMultipleComponent]
    public sealed class BossController : MonoBehaviour, ICombatantController, IHitWindowReceiver, ICombatDebugSource, ICrowdControlTarget
    {
        private const string InvulnerableSource = "boss.phase";
        private const float TargetSearchInterval = 0.5f;
        private const float KneelDepth = 0.45f;

        [Tooltip("Boss-Daten (Assets/_Project/Data/Enemies/…). Pflichtfeld.")]
        [SerializeField] private BossDefinition definition = null;

        [Tooltip("Kampfbereich (min x, min z, max x, max z): betritt der Spieler ihn, beginnt der Kampf. Mit Abstand zum Fallgitter, " +
                 "damit der Spieler sicher drin ist, wenn es zufällt.")]
        [SerializeField] private Vector4 encounterArea = new Vector4(-27f, 66f, -1f, 88f);

        [Tooltip("Grenzen der geschlossenen Arena (Raum hinter dem Fallgitter; min x, min z, max x, max z). Steht der Spieler im " +
                 "Kampf länger als 2 s außerhalb, beginnt der Kampf von vorn (das Gitter geht auf). Leer = Kampfbereich.")]
        [SerializeField] private Vector4 arenaBounds = new Vector4(-27f, 62f, -1f, 88f);

        [Header("Teile")]
        [Tooltip("Hitbox der Angriffe. Leer = Hitbox am selben GameObject.")]
        [SerializeField] private Hitbox hitbox = null;

        [Tooltip("Treffer-Blitz und Einfärbung (Telegrafie, betäubt).")]
        [SerializeField] private HitFlash hitFlash = null;

        [Tooltip("Sichtbarer Körper (Kind-Objekt): kniet vor dem Kampf, bäumt sich bei der Telegrafie auf, fällt beim Tod.")]
        [SerializeField] private Transform body = null;

        [Tooltip("Turmschild (Kind-Objekt): vorn bei erhobener Deckung, zur Seite, wenn sie offen ist.")]
        [SerializeField] private Transform shield = null;

        [Tooltip("Helfer, die in Phase 2 gerufen werden (Skelett-Krieger der Szene, anfangs aus).")]
        [SerializeField] private List<EnemyController> adds = new List<EnemyController>();

        [Header("Aether-Strahl")]
        [Tooltip("Drehgelenk des Arena-Spiegels (Vorwärts = Strahlrichtung). Leer = kein Strahl.")]
        [SerializeField] private Transform beamMirror = null;

        [Tooltip("Lichtquelle des Strahls (Spalt). Zeigt der Spiegel dorthin zurück, gibt es keinen Strahl.")]
        [SerializeField] private Transform beamSource = null;

        [Tooltip("Layer, die den Strahl aufhalten (Umgebung: Säulen, Wände).")]
        [SerializeField] private LayerMask beamBlockers = 1 << 11;

        [Tooltip("Halbe Strahlbreite inklusive Körper (Meter).")]
        [Range(0.2f, 3f)] [SerializeField] private float beamRadius = BossBeamMath.DefaultRadius;

        [Tooltip("Länge des Strahls hinter dem Spiegel (Meter).")]
        [Range(5f, 80f)] [SerializeField] private float beamLength = 40f;

        [Header("Umgebung und Darstellung")]
        [Tooltip("Layer der Hindernisse für das Ausweichen (Environment).")]
        [SerializeField] private LayerMask obstacleLayers = 1 << 11;

        [Tooltip("Farbe der Telegrafie (Ausholen).")]
        [SerializeField] private Color telegraphColor = new Color(1f, 0.75f, 0.2f);

        [Tooltip("Farbe der Telegrafie unblockbarer Angriffe (GDD 03, 9.5: rot).")]
        [SerializeField] private Color unblockableColor = new Color(1f, 0.1f, 0.05f);

        [Tooltip("Farbe, solange der Boss betäubt oder offen ist.")]
        [SerializeField] private Color stunnedColor = new Color(0.2f, 0.95f, 0.9f);

        [Header("Sturmangriff")]
        [Tooltip("Ebenen der Hindernisse, an denen ein Sturmangriff endet (Steinblöcke mit BossChargeStopper).")]
        [SerializeField] private LayerMask chargeStopLayers = 1 << 11;

        [Tooltip("So lange ist der Boss betäubt, wenn er in einen Steinblock rennt (GDD 02, 11.6: 4 s, Finisher möglich).")]
        [Range(0.5f, 8f)] [SerializeField] private float chargeStunSeconds = 4f;

        private CharacterController _controller;
        private Combatant _combatant;
        private EnemyTypeDefinition _type;
        private BossBrain _brain;
        private EnemyLocomotion _locomotion;
        private EnemyVisuals _visuals;
        private ICombatService _combat;
        private IDifficultyService _difficulty;
        private IEventBus _eventBus;
        private IBossBarService _bar;
        private Combatant _target;
        private Vector3 _anchorPosition;
        private Quaternion _anchorRotation;
        private Vector3 _bodyRest;
        private Quaternion _shieldRest;
        private float _targetSearchTimer;
        private float _kneel = 1f;
        private bool _invulnerable;
        private bool _defeatReported;
        private bool _busSubscribed;
        private bool _wasDisabled;
        private bool _healthSubscribed;
        private readonly Collider[] _chargeHits = new Collider[8];

        /// <summary>Raised when the wind-up of a special attack starts (key, e.g. horn, kran, brandtopf).</summary>
        public event Action<string> SpecialStarted;

        /// <summary>Raised when a special attack fires (key); the boss mechanics do the work.</summary>
        public event Action<string> SpecialFired;

        /// <summary>Raised when a phase begins (also phase 1).</summary>
        public event Action<int> PhaseStarted;

        /// <summary>Raised after every resolved hit on the boss.</summary>
        public event Action<HitReport> HitTaken;

        /// <summary>Raised when the boss kneels and can be bound.</summary>
        public event Action Yielded;

        /// <summary>Raised when the kneeling boss gets up again.</summary>
        public event Action YieldEnded;

        /// <summary>Raised once when the boss was bound alive.</summary>
        public event Action Subdued;

        /// <summary>Raised when a charge ended at an obstacle (the boss is stunned).</summary>
        public event Action ChargeStopped;

        /// <summary>Raised when the boss was put back to the start (player died, fight abandoned, switched on again).</summary>
        public event Action BossReset;

        /// <summary>True while the boss kneels and can be bound.</summary>
        public bool IsYielding => _brain != null && _brain.IsYielding;

        /// <summary>True once the boss was bound alive.</summary>
        public bool IsSubdued => _brain != null && _brain.State == BossStateId.Subdued;

        /// <summary>Binds the kneeling boss (GDD 02 11.6 "Fesseln").</summary>
        /// <returns>True if he is bound now.</returns>
        public bool Bind()
        {
            return _brain != null && _brain.Bind();
        }

        /// <summary>Interrupts the running attack (horn call) and staggers the boss.</summary>
        /// <param name="seconds">Stagger seconds.</param>
        /// <returns>True if interrupted.</returns>
        public bool Interrupt(float seconds)
        {
            if (_brain == null || !_brain.Interrupt(seconds))
            {
                return false;
            }

            if (hitFlash != null)
            {
                hitFlash.Flash(stunnedColor);
            }

            return true;
        }

        /// <summary>Switches a special attack off for good (the horn was stolen or shot off).</summary>
        /// <param name="special">Key.</param>
        public void DisableSpecial(string special)
        {
            _brain?.DisableSpecial(special);
        }

        /// <summary>True if the boss has a guard at all (Grimmbart fights without a shield).</summary>
        private bool HasGuard => definition != null && definition.GuardReduction > 0f;

        /// <summary>The brain (null until started).</summary>
        public BossBrain Brain => _brain;

        /// <summary>The data.</summary>
        public BossDefinition Definition => definition;

        /// <summary>The combatant.</summary>
        public Combatant Combatant => _combatant;

        /// <summary>Boss id.</summary>
        public string BossId => definition != null ? definition.BossId : string.Empty;

        /// <inheritdoc />
        public bool IsLarge => true;

        /// <inheritdoc />
        public bool IsNormalRank => false;

        /// <inheritdoc />
        public void Stagger(float seconds)
        {
            // Bosses do not stagger from warrior techniques (GDD 03 11.4: "unterbricht Normalgegner").
        }

        /// <inheritdoc />
        public void KnockDown(float seconds)
        {
            // Fußfeger: "nicht Bosse und große Gegner".
        }

        /// <inheritdoc />
        public void Pull(Vector3 towards, float distance)
        {
            // Too heavy to be pulled.
        }

        /// <inheritdoc />
        public void Taunt(Combatant source, float seconds)
        {
            // A boss always fights the player.
        }

        /// <inheritdoc />
        public BlockSpec ActiveBlock => _brain != null && _brain.IsGuardUp && HasGuard
            ? new BlockSpec(definition.GuardAngle, definition.GuardReduction, definition.GuardReduction * 0.5f, 0.9f)
            : default;

        /// <inheritdoc />
        public Combatant FocusTarget => _target;

        /// <inheritdoc />
        public string DebugStateText => _brain == null
            ? "Boss: nicht gestartet"
            : "Boss " + _brain.State + " P" + _brain.Phase + (_brain.IsGuardUp ? " Deckung" : " offen") +
              (_brain.StunKind != BossStunKind.None ? " (" + _brain.StunKind + " " + _brain.StunRemaining.ToString("0.0") + " s)" : string.Empty);

        /// <inheritdoc />
        public DefenseOutcome EvaluateDefense(in IncomingHit hit, float bearing)
        {
            if (!_combatant.IsAlive || _brain == null || _brain.IsInvulnerable)
            {
                return DefenseOutcome.Ignored;
            }

            if (_brain.IsGuardUp && HasGuard && ShieldGuardRules.Covers(bearing, definition.GuardAngle))
            {
                return DefenseOutcome.Blocked;
            }

            return DefenseOutcome.Hit;
        }

        /// <inheritdoc />
        public AttackProfile GetAttackProfile(AttackSpec attack)
        {
            float damage = _type != null ? _type.Damage : 20f;
            DamageType type = attack != null && attack.OverrideDamageType ? attack.DamageType : _type != null ? _type.DamageType : DamageType.Slash;
            return new AttackProfile(DamagePacket.Single(type, damage), AttributeScaling.None, _type != null ? _type.AttackPoise : 20f);
        }

        /// <inheritdoc />
        public StaggerKind OnHitResolved(in HitReport report)
        {
            HitTaken?.Invoke(report);
            if (report.Killed || _brain == null)
            {
                return StaggerKind.None;
            }

            if (report.Poise == PoiseOutcome.Broken && _brain.NotifyPoiseBroken(_combatant.Poise.StunRemaining))
            {
                Log.Info(LogCategory.AI, "Boss '" + BossId + "': poise broken.");
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
            bool opened = poise != null && poise.IsStunned && poise.StunAllowsFinisher
                ? _brain.NotifyPoiseBroken(poise.StunRemaining)
                : _brain.NotifyParried();
            if (opened)
            {
                Log.Info(LogCategory.AI, "Boss '" + BossId + "': parried, the guard is open.");
            }
        }

        /// <inheritdoc />
        public void OpenHitWindow(AttackSpec attack)
        {
            BossAttackOption chosen = _brain != null ? _brain.ChosenAttack : null;
            if (chosen != null && chosen.IsSpecial)
            {
                // A special attack (war horn, crane, fire pot): the boss mechanics act instead of the hitbox.
                Log.Info(LogCategory.AI, "Boss '" + BossId + "': special '" + chosen.Special + "'.");
                SpecialFired?.Invoke(chosen.Special);
                return;
            }

            if (hitbox != null)
            {
                hitbox.OpenHitWindow(attack);
            }
        }

        /// <inheritdoc />
        public void CloseHitWindow()
        {
            if (hitbox != null)
            {
                hitbox.CloseHitWindow();
            }
        }

        /// <summary>
        /// Puts the boss back to the start: anchor pose, full health and poise, dormant, adds gone, bar hidden; a running
        /// encounter ends as not beaten (the arena gate opens). Used after the player's death and when the boss is re-enabled.
        /// </summary>
        public void ResetBoss()
        {
            if (_brain == null)
            {
                return;
            }

            bool running = _brain.IsEncounterRunning;
            _brain.Reset();
            PutBack(running);
            ApplyDifficulty();
        }

        private void PutBack(bool endEncounter)
        {
            CloseHitWindow();
            bool enabledController = _controller.enabled;
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
            SetInvulnerable(true);
            _locomotion.Reset();
            _visuals.Reset();
            _kneel = 1f;
            _defeatReported = false;
            SetAddsActive(false);
            if (_bar != null)
            {
                _bar.Hide(BossId);
            }

            if (endEncounter)
            {
                PublishEncounterEnded(false);
            }

            Log.Info(LogCategory.AI, "Boss '" + BossId + "' reset.");
            BossReset?.Invoke();
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
            if (body != null)
            {
                _bodyRest = body.localPosition;
            }

            if (shield != null)
            {
                _shieldRest = shield.localRotation;
            }

            _type = definition != null ? definition.BaseType : null;
            if (definition == null || _type == null)
            {
                Log.Error(LogCategory.AI, "BossController on '" + name + "': the field 'Definition' (with 'Base Type') is empty.");
                enabled = false;
                return;
            }

            _combatant.SetController(this);
            ConfigureFromType(1f, 1f);
        }

        private void ConfigureFromType(float healthFactor, float poiseFactor)
        {
            _combatant.Configure(_type.Level, _type.Armor, _type.CreateResistances(), _type.MaxPoise * poiseFactor, PoiseSettings.Boss, definition.BossId,
                _type.EnemyTypeId, _type.ParryPoiseLoss);
            // GDD 03 7.1–7.2: bosses resist 200+, never freeze or get stunned by effects, burn for smaller shares.
            _combatant.ConfigureStatus(StatusSettings.Boss.WithResistance(Mathf.Max(StatusSettings.Boss.BaseResistance, _type.StatusResistance)),
                _type.IsAetherCorrupted);
            bool noBlood = _type.Kind == EnemyKind.Undead || _type.Kind == EnemyKind.Construct || _type.Kind == EnemyKind.Spirit;
            _combatant.Status.SetImmune(StatusEffectId.Bleeding, noBlood);
            _combatant.Status.SetImmune(StatusEffectId.Poison, _type.Kind == EnemyKind.Undead || _type.Kind == EnemyKind.Construct);
            Health health = _combatant.Health;
            if (health != null)
            {
                health.Pool.SetFixedMax(_type.MaxHealth * healthFactor);
                health.RestoreState(_type.MaxHealth * healthFactor);
            }
        }

        private void ApplyDifficulty()
        {
            // GDD 03 9.7: health and poise follow the difficulty; in a boss fight a change counts from the next attempt.
            DifficultySettings settings = _difficulty != null ? _difficulty.Settings : null;
            if (settings != null)
            {
                ConfigureFromType(settings.EnemyHealth, settings.EnemyPoise);
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
                locator.TryGet(out _eventBus);
                locator.TryGet(out _difficulty);
                ApplyDifficulty();
                if (!locator.TryGet(out _bar))
                {
                    Log.Warning(LogCategory.AI, "BossController '" + name + "': no IBossBarService (BossInstaller missing in the BootConfig), no health bar.");
                }

                BossBrainSettings settings = definition.CreateBrainSettings(out string problem);
                if (settings == null)
                {
                    Log.Error(LogCategory.AI, "BossController '" + name + "': " + problem);
                    enabled = false;
                    return;
                }

                ulong seed = (ulong)(Environment.TickCount + BossId.Length * 7919);
                _brain = new BossBrain(settings, new Pcg32Random(seed), this);
                _brain.EncounterStarted += OnEncounterStarted;
                _brain.PhaseChanged += OnPhaseChanged;
                _brain.SummonRequested += OnSummonRequested;
                _brain.Stunned += OnStunned;
                _brain.Died += OnBrainDied;
                _brain.EncounterAbandoned += OnEncounterAbandoned;
                _brain.SpecialStarted += key => SpecialStarted?.Invoke(key);
                _brain.Yielded += OnYielded;
                _brain.YieldEnded += () => YieldEnded?.Invoke();
                _brain.Subdued += OnSubdued;
                SetAddsActive(false);
                SetInvulnerable(true);
                SubscribeBus();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.AI, exception, "BossController '" + name + "' could not start.");
            }
        }

        private void OnEnable()
        {
            Health health = _combatant != null ? _combatant.Health : null;
            if (health != null && !_healthSubscribed)
            {
                health.Died += OnDied;
                health.Damaged += OnDamaged;
                _healthSubscribed = true;
            }

            SubscribeBus();
            if (_wasDisabled && _brain != null)
            {
                // Switched on again (load restored "not beaten"): start over.
                ResetBoss();
            }

            _wasDisabled = false;
        }

        private void OnDisable()
        {
            Health health = _combatant != null ? _combatant.Health : null;
            if (health != null && _healthSubscribed)
            {
                health.Died -= OnDied;
                health.Damaged -= OnDamaged;
                _healthSubscribed = false;
            }

            UnsubscribeBus();
            if (_brain != null && _brain.IsEncounterRunning)
            {
                CloseHitWindow();
                if (_bar != null)
                {
                    _bar.Hide(BossId);
                }

                PublishEncounterEnded(false);
            }

            _wasDisabled = true;
        }

        private void Update()
        {
            if (_brain == null)
            {
                return;
            }

            float deltaTime = Time.deltaTime;
            float local = _combatant.Tick(deltaTime);
            if (_brain.State == BossStateId.Dead)
            {
                _visuals.UpdateDeath(deltaTime);
                return;
            }

            _targetSearchTimer -= deltaTime;
            if (_targetSearchTimer <= 0f || _target == null || !_target.IsAlive)
            {
                _targetSearchTimer = TargetSearchInterval;
                FindTarget();
            }

            BossSenses senses = BuildSenses();
            _brain.Tick(local, senses);
            SetInvulnerable(_brain.IsInvulnerable);
            float turnRate = _type.TurnRate * (_brain.IsTelegraphing ? 0.5f : 1f);
            _locomotion.Move(_brain.Intent, local, _brain.State == BossStateId.Dormant ? 0.01f : turnRate);
            CheckCharge();
            CheckBeam();
            UpdateVisuals(deltaTime);
            if (_bar != null && _brain.IsEncounterRunning)
            {
                _bar.UpdateHealth(BossId, _combatant.Health != null ? _combatant.Health.Normalized : 0f, _brain.Phase);
            }
        }

        private BossSenses BuildSenses()
        {
            Vector3 position = transform.position;
            var senses = new BossSenses
            {
                Self = new FlatPoint(position.x, position.z),
                SelfYaw = transform.eulerAngles.y,
                HealthFraction = _combatant.Health != null ? _combatant.Health.Normalized : 1f
            };
            if (_target == null || !_target.IsAlive)
            {
                return senses;
            }

            Vector3 target = _target.transform.position;
            senses.HasTarget = true;
            senses.Target = new FlatPoint(target.x, target.z);
            senses.TargetInArena = Contains(encounterArea, target);
            bool hasBounds = arenaBounds.z > arenaBounds.x && arenaBounds.w > arenaBounds.y;
            senses.TargetLeftArena = !Contains(hasBounds ? arenaBounds : encounterArea, target);
            return senses;
        }

        private static bool Contains(Vector4 area, Vector3 point)
        {
            return point.x >= area.x && point.x <= area.z && point.z >= area.y && point.z <= area.w;
        }

        private void FindTarget()
        {
            _target = null;
            if (_combat == null)
            {
                return;
            }

            Vector3 position = transform.position;
            float best = float.MaxValue;
            IReadOnlyList<Combatant> combatants = _combat.Combatants;
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
        }

        private void CheckBeam()
        {
            if (beamMirror == null || _brain.State != BossStateId.Fighting || _brain.Phase < _brain.Settings.BeamFromPhase ||
                _brain.BeamCooldownRemaining > 0f)
            {
                return;
            }

            Vector3 mirror = beamMirror.position;
            Vector3 forward = beamMirror.forward;
            if (beamSource != null && BossBeamMath.FacesSource(mirror.x, mirror.z, forward.x, forward.z, beamSource.position.x, beamSource.position.z))
            {
                return;
            }

            Vector3 self = transform.position;
            if (!BossBeamMath.IsInBeam(mirror.x, mirror.z, forward.x, forward.z, self.x, self.z, beamRadius, beamLength))
            {
                return;
            }

            Vector3 chest = new Vector3(self.x, mirror.y, self.z);
            if (Physics.Linecast(mirror + forward * 0.4f, chest, beamBlockers, QueryTriggerInteraction.Ignore))
            {
                return;
            }

            if (_brain.TryBeamStun())
            {
                CloseHitWindow();
                if (hitFlash != null)
                {
                    hitFlash.Flash(stunnedColor);
                }
            }
        }

        private void UpdateVisuals(float deltaTime)
        {
            bool stunned = _brain.State == BossStateId.Stunned;
            bool telegraph = _brain.IsTelegraphing;
            _visuals.Refresh(telegraph, stunned, Time.time, deltaTime);
            AttackSpec attack = _brain.CurrentAttack;
            if (telegraph && attack != null && attack.Unblockable && hitFlash != null)
            {
                hitFlash.SetTint(unblockableColor, 0.7f + 0.3f * Mathf.Sin(Time.time * 30f));
            }

            float kneelTarget = _brain.State == BossStateId.Dormant || _brain.State == BossStateId.Yielding || _brain.State == BossStateId.Subdued ? 1f : 0f;
            _kneel = Mathf.MoveTowards(_kneel, kneelTarget, deltaTime / Mathf.Max(0.1f, _brain.Settings.AwakenSeconds));
            if (body != null)
            {
                body.localPosition = _bodyRest + Vector3.down * (KneelDepth * _kneel);
            }

            if (shield != null)
            {
                // GDD 02 11.7: the shield pulls back during the wind-up of the bash; it hangs aside while the guard is open.
                Quaternion wanted = _shieldRest;
                if (!_brain.IsGuardUp)
                {
                    wanted = _shieldRest * Quaternion.Euler(0f, -70f, 0f);
                }
                else if (telegraph)
                {
                    wanted = _shieldRest * Quaternion.Euler(-25f, 0f, 0f);
                }

                shield.localRotation = Quaternion.Slerp(shield.localRotation, wanted, 1f - Mathf.Exp(-10f * deltaTime));
            }
        }

        private void OnEncounterStarted()
        {
            SetInvulnerable(true);
            Log.Info(LogCategory.AI, "Boss '" + BossId + "' awakens (music " + definition.MusicId + ").");
            if (_eventBus != null)
            {
                var started = new BossEncounterStarted(BossId);
                _eventBus.Publish(in started);
            }

            if (_bar != null)
            {
                Health health = _combatant.Health;
                _bar.Show(new BossBarState(BossId, definition.DisplayName, definition.Title, health != null ? health.Normalized : 1f, 1,
                    definition.PhaseCount, true));
            }
        }

        private void OnPhaseChanged(int phase)
        {
            if (phase > 1)
            {
                // GDD 03 9.6: "Boss waehrenddessen unverwundbar, Haltung danach voll".
                BossPoise.Refill(_combatant.Poise);
            }

            Log.Info(LogCategory.AI, "Boss '" + BossId + "': phase " + phase + ".");
            PhaseStarted?.Invoke(phase);
            if (_eventBus != null)
            {
                var changed = new BossPhaseChanged(BossId, phase);
                _eventBus.Publish(in changed);
            }
        }

        private void OnSummonRequested(int count)
        {
            int summoned = 0;
            for (int i = 0; i < adds.Count && summoned < count; i++)
            {
                if (adds[i] != null)
                {
                    adds[i].ResetToAnchor();
                    summoned++;
                }
            }

            Log.Info(LogCategory.AI, "Boss '" + BossId + "' calls " + summoned + " skeleton warriors.");
        }

        private void OnStunned(BossStunKind kind, float seconds)
        {
            CloseHitWindow();
            Log.Info(LogCategory.AI, "Boss '" + BossId + "': " + kind + " for " + seconds.ToString("0.0") + " s.");
        }

        private void OnDamaged(DamageTaken taken)
        {
            // Until the next phase has begun, damage stops just below its threshold (raised before the death check, so a
            // lethal hit in phase 1 leaves the boss alive and the phase change with its adds follows, GDD 03 9.6).
            Health health = _combatant != null ? _combatant.Health : null;
            if (_brain == null || health == null)
            {
                return;
            }

            float floor = _brain.HealthFloor(health.Max);
            if (floor > 0f && health.Current < floor)
            {
                health.Heal(floor - health.Current);
            }
        }

        private void OnEncounterAbandoned()
        {
            Log.Info(LogCategory.AI, "Boss '" + BossId + "': the player stayed outside the arena, the fight starts over.");
            PutBack(true);
        }

        private void OnDied(DamageInfo killingDamage)
        {
            if (_brain == null)
            {
                return;
            }

            SetInvulnerable(false);
            CloseHitWindow();
            _brain.Kill();
            _visuals.ShowDead();
        }

        private void OnBrainDied()
        {
            if (_defeatReported)
            {
                return;
            }

            _defeatReported = true;
            Log.Info(LogCategory.AI, "Boss '" + BossId + "' defeated.");
            if (_bar != null)
            {
                _bar.Hide(BossId);
            }

            // The bound skeletons fall with their knight.
            for (int i = 0; i < adds.Count; i++)
            {
                EnemyController add = adds[i];
                if (add != null && add.isActiveAndEnabled && add.Combatant != null && add.Combatant.IsAlive && add.Combatant.Health != null)
                {
                    add.Combatant.Health.Kill(BossId);
                }
            }

            if (_eventBus != null)
            {
                var defeated = new BossDefeated(BossId);
                _eventBus.Publish(in defeated);
            }

            PublishEncounterEnded(true);
        }

        private void CheckCharge()
        {
            // GDD 02 11.6: a charge that runs into a stone block breaks the poise - 4 s stunned, finisher possible.
            if (_brain.Intent.Mode != EnemyMoveMode.Lunge || chargeStopLayers.value == 0)
            {
                return;
            }

            Vector3 chest = transform.position + Vector3.up * 1.1f + transform.forward * 0.9f;
            int count = Physics.OverlapSphereNonAlloc(chest, 0.7f, _chargeHits, chargeStopLayers, QueryTriggerInteraction.Ignore);
            for (int i = 0; i < count; i++)
            {
                if (_chargeHits[i] == null || _chargeHits[i].GetComponentInParent<BossChargeStopper>() == null)
                {
                    continue;
                }

                if (_combatant.Poise != null)
                {
                    _combatant.Poise.Stun(chargeStunSeconds, true);
                }

                if (_brain.NotifyPoiseBroken(chargeStunSeconds))
                {
                    CloseHitWindow();
                    if (hitFlash != null)
                    {
                        hitFlash.Flash(stunnedColor);
                    }

                    Log.Info(LogCategory.AI, "Boss '" + BossId + "' ran into '" + _chargeHits[i].name + "': stunned " + chargeStunSeconds.ToString("0") + " s.");
                    ChargeStopped?.Invoke();
                }

                return;
            }
        }

        private void OnYielded()
        {
            CloseHitWindow();
            Log.Info(LogCategory.AI, "Boss '" + BossId + "' kneels: he can be bound now.");
            Yielded?.Invoke();
        }

        private void OnSubdued()
        {
            if (_defeatReported)
            {
                return;
            }

            _defeatReported = true;
            SetInvulnerable(true);
            CloseHitWindow();
            Log.Info(LogCategory.AI, "Boss '" + BossId + "' bound alive.");
            if (_bar != null)
            {
                _bar.Hide(BossId);
            }

            SetAddsActive(false);
            if (_eventBus != null)
            {
                var subdued = new BossSubdued(BossId);
                _eventBus.Publish(in subdued);
                var defeated = new BossDefeated(BossId);
                _eventBus.Publish(in defeated);
            }

            PublishEncounterEnded(true);
            Subdued?.Invoke();
        }

        private void OnPlayerDied(PlayerDied evt)
        {
            if (_brain != null && _brain.IsEncounterRunning)
            {
                ResetBoss();
            }
        }

        private void PublishEncounterEnded(bool defeated)
        {
            if (_eventBus != null)
            {
                var ended = new BossEncounterEnded(BossId, defeated);
                _eventBus.Publish(in ended);
            }
        }

        private void SetInvulnerable(bool invulnerable)
        {
            Health health = _combatant != null ? _combatant.Health : null;
            if (health == null || invulnerable == _invulnerable)
            {
                return;
            }

            _invulnerable = invulnerable;
            if (invulnerable)
            {
                health.AddInvulnerability(InvulnerableSource);
            }
            else
            {
                health.RemoveInvulnerability(InvulnerableSource);
            }
        }

        private void SetAddsActive(bool active)
        {
            for (int i = 0; i < adds.Count; i++)
            {
                if (adds[i] != null && adds[i].gameObject.activeSelf != active)
                {
                    adds[i].gameObject.SetActive(active);
                }
            }
        }

        private void SubscribeBus()
        {
            if (_eventBus == null || _busSubscribed || !isActiveAndEnabled)
            {
                return;
            }

            _eventBus.Subscribe<PlayerDied>(OnPlayerDied);
            _busSubscribed = true;
        }

        private void UnsubscribeBus()
        {
            if (_busSubscribed)
            {
                _eventBus.Unsubscribe<PlayerDied>(OnPlayerDied);
                _busSubscribed = false;
            }
        }

        private void OnDrawGizmosSelected()
        {
            Gizmos.color = new Color(1f, 0.3f, 0.2f, 0.8f);
            var center = new Vector3((encounterArea.x + encounterArea.z) * 0.5f, transform.position.y + 0.1f, (encounterArea.y + encounterArea.w) * 0.5f);
            var size = new Vector3(Mathf.Abs(encounterArea.z - encounterArea.x), 0.2f, Mathf.Abs(encounterArea.w - encounterArea.y));
            Gizmos.DrawWireCube(center, size);
            Gizmos.color = new Color(1f, 0.75f, 0.2f, 0.6f);
            center = new Vector3((arenaBounds.x + arenaBounds.z) * 0.5f, transform.position.y + 0.15f, (arenaBounds.y + arenaBounds.w) * 0.5f);
            size = new Vector3(Mathf.Abs(arenaBounds.z - arenaBounds.x), 0.2f, Mathf.Abs(arenaBounds.w - arenaBounds.y));
            Gizmos.DrawWireCube(center, size);
        }
    }
}
