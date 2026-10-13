using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Input;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Connects the Gameplay actions (light/heavy attack, block/parry, dodge; lock-on in <see cref="PlayerLockOn"/>) with the
    /// <see cref="CombatStateMachine"/> and the <see cref="PlayerMotor"/>: movement is limited during attacks, the character
    /// turns towards the target (lock-on, soft-lock within 3 m, or stick direction up to 45°), dodges and lunges move it,
    /// lock-on strafes. It is the <see cref="ICombatantController"/> of the player's <see cref="Combatant"/> (block, parry,
    /// i-frames, stability, knockback) and forwards the hit windows to the <see cref="Hitbox"/>; the finisher hits its
    /// target directly.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the player root next to <see cref="PlayerMotor"/>, <see cref="Combatant"/>, <see cref="Hitbox"/> and
    /// <see cref="PlayerLockOn"/>. Runs after the input reader and before the motor (execution order -40).</para>
    /// <para>Armor: until the inventory exists, the field "Test-Ruestung" adds a flat armor modifier (GDD 03 8.3 example:
    /// 60). On the gamepad LB + Y is the weapon art: while Block is held, a heavy attack press is ignored (weapon art comes
    /// later, GDD 03 5.1), except in the counter window after a parry, where it is the counter (GDD 03 4.8).</para>
    /// <para>Outside of <c>Playing</c> (pause, menu, dialogue) no presses reach the state machine, but held buttons stay held,
    /// so a pause neither releases a charged attack nor drops the guard. The combat state of the combat service ("in
    /// combat") is passed on to health and stats: no health regeneration and less mana regeneration in combat (GDD 03 10.3).</para>
    /// <para>The rules live in pure classes: <see cref="CombatStateMachine"/> (states), <see cref="PlayerCombatMotion"/>
    /// (movement limits, dodge direction, knockback), <see cref="CombatantQueries"/> (finisher and soft-lock targets) and
    /// <see cref="CombatStateText"/> (overlay text). Size (about 620 lines, architecture P3): what remains is the binding of
    /// one character to input, motor, combatant, hitbox and lock-on, plus the attack aiming; it is kept together because
    /// every part reads the same per-frame state.</para>
    /// </remarks>
    [DefaultExecutionOrder(-40)]
    [DisallowMultipleComponent]
    public sealed class PlayerCombatController : MonoBehaviour, ICombatantController, IHitWindowReceiver, ICombatDebugSource
    {
        private const string ArmorSourceId = "test:ruestung";

        [Tooltip("Bewegung der Figur. Leer = PlayerMotor am selben GameObject.")]
        [SerializeField] private PlayerMotor motor = null;

        [Tooltip("Kampf-Wurzel der Figur (Team Spieler). Leer = Combatant am selben GameObject.")]
        [SerializeField] private Combatant combatant = null;

        [Tooltip("Werte der Figur (Ausdauer, Standfestigkeit). Leer = CharacterStatsComponent am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Hitbox der Waffe. Leer = Hitbox am selben GameObject.")]
        [SerializeField] private Hitbox hitbox = null;

        [Tooltip("Lock-On der Figur (optional).")]
        [SerializeField] private PlayerLockOn lockOn = null;

        [Tooltip("Transform der Main Camera (Richtung von Stick-Eingaben).")]
        [SerializeField] private Transform cameraTransform = null;

        [Header("Daten")]
        [Tooltip("Waffe mit Moveset (Assets/_Project/Data/Combat/Weapons/…). Pflichtfeld.")]
        [SerializeField] private WeaponDefinition weapon = null;

        [Tooltip("Schild in der Nebenhand (optional). Leer = die Waffe blockt.")]
        [SerializeField] private ShieldDefinition shield = null;

        [Tooltip("Kampf-Regeln (Assets/_Project/Settings/Combat/CombatSettings.asset). Leer = Werte aus GDD 03.")]
        [SerializeField] private CombatSettings settings = null;

        [Header("Platzhalter bis Inventar/Ausrüstung")]
        [Tooltip("Test-Rüstung: fester Rüstungswert bis zum Ausrüstungs-System (GDD 03, 8.3: Krieger mit Rüstung 60).")]
        [Min(0f)] [SerializeField] private float testArmor = 60f;

        [Header("Zielhilfe (GDD 03, 2.3)")]
        [Tooltip("Soft-Lock ohne Lock-On: Angriffe drehen die Figur zum nächsten Gegner in dieser Entfernung (3 m).")]
        [Range(0f, 10f)] [SerializeField] private float softLockRange = 3f;

        [Tooltip("Soft-Lock: höchstens so viele Grad Drehung beim Angriffsstart (Option 0/30/60; Standard 30).")]
        [Range(0f, 90f)] [SerializeField] private float softLockMaxTurn = 30f;

        [Tooltip("Dauer des Rückstoßes bei einem Treffer in Sekunden.")]
        [Range(0.05f, 0.5f)] [SerializeField] private float knockbackSeconds = 0.15f;

        private CombatStateMachine _machine;
        private CombatTuning _tuning;
        private WeaponSpec _weapon;
        private IGameplayInput _gameplay;
        private IGameStateService _gameState;
        private ICombatService _service;
        private readonly PlayerCombatMotion _motion = new PlayerCombatMotion();
        private float _sprintSeconds;
        private Combatant _finisherTarget;
        private bool _finisherActive;
        private bool _warnedWeaponArt;
        private bool _heavyHeld;
        private bool _blockHeld;

        /// <summary>The combat state machine (read-only use: weapon pose, overlays); null if the setup is invalid.</summary>
        public CombatStateMachine StateMachine => _machine;

        /// <summary>Type id of the last enemy that hit the player (for <c>PlayerDied</c>).</summary>
        public string LastAttackerTypeId { get; private set; } = string.Empty;

        /// <inheritdoc />
        public BlockSpec ActiveBlock => _weapon != null ? _weapon.Block : BlockSpec.WoodenShield;

        /// <inheritdoc />
        public Combatant FocusTarget => lockOn != null ? lockOn.Target : null;

        /// <inheritdoc />
        public string DebugStateText => CombatStateText.Describe(_machine, _weapon != null ? _weapon.LightCombo.Length : 0);

        /// <inheritdoc />
        public DefenseOutcome EvaluateDefense(in IncomingHit hit, float bearing)
        {
            if (_machine == null)
            {
                return DefenseOutcome.Hit;
            }

            return _machine.EvaluateIncoming(bearing, hit.Attack.Unblockable, hit.Attack.Unparryable);
        }

        /// <inheritdoc />
        public AttackProfile GetAttackProfile(AttackSpec attack)
        {
            if (_weapon == null)
            {
                return default;
            }

            DamageType type = attack != null && attack.OverrideDamageType ? attack.DamageType : _weapon.DamageType;
            return new AttackProfile(DamagePacket.Single(type, _weapon.BaseDamage), _weapon.Scaling, _weapon.WeaponPoise);
        }

        /// <inheritdoc />
        public StaggerKind OnHitResolved(in HitReport report)
        {
            if (_machine == null)
            {
                return StaggerKind.None;
            }

            if (report.Attacker != null)
            {
                LastAttackerTypeId = report.Attacker.TypeId;
            }

            StaggerKind kind = StaggerKind.None;
            if (report.Defense == DefenseOutcome.Blocked)
            {
                kind = _machine.ApplyBlockedHit(report.BlockStaminaCost);
            }
            else if (report.Defense == DefenseOutcome.Hit && !report.Killed)
            {
                kind = _machine.ApplyPoiseDamage(report.PoiseDamage);
            }

            float distance = report.Attack != null ? report.Attack.KnockbackDistance : 0f;
            if (report.Defense == DefenseOutcome.Blocked)
            {
                distance *= 0.5f;
            }

            if (distance > 0f && report.Attacker != null && report.Defense != DefenseOutcome.Parried)
            {
                Vector3 from = report.Attacker.transform.position;
                Vector3 position = transform.position;
                _motion.StartKnockback(from.x, from.z, position.x, position.z, distance);
            }

            return kind;
        }

        /// <inheritdoc />
        public void OnParriedBy(Combatant defender)
        {
            if (_machine != null)
            {
                _machine.ForceStagger(StaggerKind.Stagger);
            }
        }

        /// <inheritdoc />
        public void OpenHitWindow(AttackSpec attack)
        {
            if (attack != null && attack.Kind == AttackKind.Finisher)
            {
                HitFinisherTarget(attack);
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

        /// <summary>Back to ready after a respawn: state machine, knockback, combatant (health, poise) and lock-on reset.</summary>
        public void ResetAfterRespawn()
        {
            if (_machine != null)
            {
                _machine.Reset();
            }

            _motion.Clear();
            _finisherTarget = null;
            _finisherActive = false;
            _heavyHeld = false;
            _blockHeld = false;
            if (combatant != null)
            {
                combatant.ResetForRespawn();
            }

            if (lockOn != null)
            {
                lockOn.Release();
            }
        }

        private void Awake()
        {
            _motion.KnockbackSeconds = knockbackSeconds;
            if ((motor == null && !TryGetComponent(out motor)) || (combatant == null && !TryGetComponent(out combatant)))
            {
                Log.Error(LogCategory.Player, "PlayerCombatController on '" + name + "' needs a PlayerMotor and a Combatant.");
                enabled = false;
                return;
            }

            if (stats == null)
            {
                TryGetComponent(out stats);
            }

            if (hitbox == null)
            {
                TryGetComponent(out hitbox);
            }

            if (lockOn == null)
            {
                TryGetComponent(out lockOn);
            }

            if (weapon == null)
            {
                Log.Error(LogCategory.Player, "PlayerCombatController on '" + name + "': the field 'Weapon' is empty. Assign a WeaponDefinition " +
                                              "(Aetherfall > Testgelände erstellen creates one).");
                enabled = false;
                return;
            }

            _weapon = weapon.CreateSpec(shield, out string problem);
            _tuning = settings != null ? settings.CreateTuning() : CombatTuning.CreateDefault();
            if (_weapon == null)
            {
                Log.Error(LogCategory.Player, "PlayerCombatController: " + problem);
                enabled = false;
                return;
            }

            ResourcePool stamina = stats != null ? stats.Stamina : null;
            float stability = stats != null ? stats.Stats.Get(StatId.Poise) : 20f;
            try
            {
                _machine = new CombatStateMachine(_tuning, _weapon, stamina, this, stability);
            }
            catch (ArgumentException exception)
            {
                Log.Error(LogCategory.Player, "PlayerCombatController: " + exception.Message);
                enabled = false;
                return;
            }

            if (stats != null && testArmor > 0f)
            {
                stats.Stats.AddModifier(StatModifier.Flat(StatId.Armor, testArmor, ArmorSourceId));
            }

            combatant.SetController(this);
            _machine.AttackStarted += OnAttackStarted;
            _machine.DodgeStarted += OnDodgeStarted;
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
                _gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                locator.TryGet(out _service);
                if (locator.TryGet(out IInputService input))
                {
                    _gameplay = input.Gameplay;
                }
                else
                {
                    Log.Error(LogCategory.Player, "PlayerCombatController: no IInputService registered, the player cannot fight.");
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerCombatController could not resolve its services.");
            }
        }

        private void OnEnable()
        {
            Health health = combatant != null ? combatant.Health : null;
            if (health != null)
            {
                health.Died += OnDied;
            }
        }

        private void OnDisable()
        {
            Health health = combatant != null ? combatant.Health : null;
            if (health != null)
            {
                health.Died -= OnDied;
            }
        }

        private void OnDestroy()
        {
            if (_machine != null)
            {
                _machine.AttackStarted -= OnAttackStarted;
                _machine.DodgeStarted -= OnDodgeStarted;
            }
        }

        private void Update()
        {
            float deltaTime = Time.deltaTime;
            float local = combatant.Tick(deltaTime);
            bool playing = _gameState != null && _gameState.Current == GameState.Playing;
            CombatInput input;
            if (playing)
            {
                input = ReadInput();
                _heavyHeld = input.HeavyHeld;
                _blockHeld = input.BlockHeld;
            }
            else
            {
                // Pause, menu, dialogue: no new presses, but what was held stays held (no release of a charge, guard stays up).
                input = new CombatInput { HeavyHeld = _heavyHeld, BlockHeld = _blockHeld };
            }

            PlayerMovementModel model = motor.Model;
            if (model != null && model.IsSprinting && model.Gait == PlayerGait.Sprint)
            {
                _sprintSeconds += deltaTime;
            }
            else
            {
                _sprintSeconds = 0f;
            }

            input.SprintSeconds = _sprintSeconds;
            input.IsAirborne = motor.IsAirborne;
            if (_service != null)
            {
                if (_machine.NeedsFinisherCheck(input))
                {
                    // Also while the press waits in the buffer: the state machine reads it when the light attack runs.
                    input.FinisherAvailable = FindFinisherTarget() != null;
                }

                SyncCombatState(_service.InCombat);
            }

            if (stats != null)
            {
                _machine.Stability.Stability = stats.Stats.Get(StatId.Poise);
            }

            _machine.Tick(local, input);
            if (_finisherActive && _machine.State != CombatStateId.Finisher)
            {
                _finisherActive = false;
                _finisherTarget = null;
            }

            _motion.Tick(local);
            motor.SetMovementOverride(BuildLimits(), combatant.HitStop.IsFrozen);
            combatant.Stance = ResolveStance(model);
        }

        private CombatInput ReadInput()
        {
            var input = new CombatInput();
            if (_gameplay == null || !_gameplay.IsActive)
            {
                return input;
            }

            bool blockHeld = _gameplay.IsPressed(GameplayButton.Block);
            bool heavyPressed = _gameplay.WasPressedThisFrame(GameplayButton.HeavyAttack);
            if (heavyPressed && blockHeld && !_machine.IsCounterWindowOpen)
            {
                // LB + Y / Q + right mouse button = weapon art (GDD 03 1.5), not a heavy attack. Comes in a later step.
                // In the counter window after a parry (block usually still held) the press is the counter (GDD 03 4.8).
                heavyPressed = false;
                if (!_warnedWeaponArt)
                {
                    _warnedWeaponArt = true;
                    Log.Info(LogCategory.Player, "Weapon art (Block + heavy attack) is not implemented yet (GDD 03 5.1).");
                }
            }

            Vector2 move = _gameplay.Move;
            input.LightPressed = _gameplay.WasPressedThisFrame(GameplayButton.LightAttack);
            input.HeavyPressed = heavyPressed;
            input.HeavyHeld = _gameplay.IsPressed(GameplayButton.HeavyAttack) && !blockHeld;
            input.BlockPressed = _gameplay.WasPressedThisFrame(GameplayButton.Block);
            input.BlockHeld = blockHeld;
            input.DodgePressed = _gameplay.WasPressedThisFrame(GameplayButton.Dodge);
            input.HasMoveInput = move.sqrMagnitude > 0.01f;
            return input;
        }

        private void SyncCombatState(bool inCombat)
        {
            // GDD 03 10.3: no health regeneration in combat, mana 2.5 % instead of 6 % per second.
            Health health = combatant.Health;
            if (health != null && health.InCombat != inCombat)
            {
                health.InCombat = inCombat;
            }

            if (stats != null && stats.InCombat != inCombat)
            {
                stats.InCombat = inCombat;
            }
        }

        private PlayerMovementOverride BuildLimits()
        {
            Combatant target = lockOn != null ? lockOn.Target : null;
            float targetYaw = 0f;
            if (target != null)
            {
                Vector3 position = transform.position;
                Vector3 point = target.transform.position;
                targetYaw = CombatMath.YawOf(point.x - position.x, point.z - position.z);
            }

            return _motion.Build(_machine.Movement, _machine.State, _machine.IsRoll, target != null, targetYaw);
        }

        private void OnAttackStarted(AttackSpec attack)
        {
            float yaw = motor.Model != null ? motor.Model.Yaw : transform.eulerAngles.y;
            Vector3 position = transform.position;
            Combatant target = lockOn != null ? lockOn.Target : null;
            if (attack.Kind == AttackKind.Finisher)
            {
                _finisherTarget = FindFinisherTarget();
                _finisherActive = _finisherTarget != null;
                target = _finisherTarget;
                if (_service != null)
                {
                    // GDD 03 4.10: invulnerable, and other enemies give their tokens back for the duration.
                    _service.ProtectFromAttacks(combatant, attack.TotalSeconds);
                }
            }

            if (target != null)
            {
                // With lock-on (and for the finisher) the attack points straight at the target (GDD 03 4.4).
                Vector3 point = target.transform.position;
                _motion.AttackYaw = CombatMath.YawOf(point.x - position.x, point.z - position.z);
                return;
            }

            Combatant soft = FindSoftLockTarget();
            if (soft != null)
            {
                Vector3 point = soft.transform.position;
                _motion.AttackYaw = CombatMath.ClampTurn(yaw, CombatMath.YawOf(point.x - position.x, point.z - position.z), softLockMaxTurn);
                return;
            }

            if (_gameplay != null && _gameplay.IsActive)
            {
                Vector2 move = _gameplay.Move;
                if (move.sqrMagnitude > 0.01f)
                {
                    MotionVector direction = PlayerMovementMath.CameraRelativeDirection(move.x, move.y, CameraYaw());
                    _motion.AttackYaw = CombatMath.ClampTurn(yaw, CombatMath.YawOf(direction.X, direction.Z), attack.MaxTurnDegrees);
                    return;
                }
            }

            _motion.AttackYaw = yaw;
        }

        private void OnDodgeStarted(bool roll)
        {
            float yaw = motor.Model != null ? motor.Model.Yaw : transform.eulerAngles.y;
            MotionVector direction = MotionVector.Zero;
            if (roll && _gameplay != null)
            {
                Vector2 move = _gameplay.Move;
                direction = PlayerMovementMath.CameraRelativeDirection(move.x, move.y, CameraYaw());
            }

            // Roll: in the movement direction; back step (no direction): straight backwards.
            _motion.SetDodgeDirection(direction.X, direction.Z, yaw);
        }

        private void HitFinisherTarget(AttackSpec attack)
        {
            Combatant target = _finisherTarget;
            if (target == null || !target.IsAlive)
            {
                return;
            }

            Health health = target.Health;
            var hit = new IncomingHit
            {
                Attacker = combatant,
                Attack = attack,
                Profile = GetAttackProfile(attack),
                Zone = HitZone.Body,
                Point = target.TargetPosition,
                AttackerPosition = transform.position,
                // GDD 03 4.10: max(weapon damage x 5; share of max health); normal enemies die at 15 % or less.
                MinimumDamage = health != null ? health.Max * _tuning.FinisherHealthShare : 0f,
                ExecuteBelowFraction = _tuning.FinisherKillThreshold
            };
            target.ReceiveHit(hit);
            if (target.IsAlive && target.Poise != null)
            {
                target.Poise.EndStun();
            }
        }

        private Combatant FindFinisherTarget()
        {
            if (_service == null)
            {
                return null;
            }

            float yaw = motor.Model != null ? motor.Model.Yaw : transform.eulerAngles.y;
            return CombatantQueries.FindFinisherTarget(_service.Combatants, combatant, yaw, _tuning.FinisherRange, _tuning.FinisherHalfAngle);
        }

        private Combatant FindSoftLockTarget()
        {
            if (_service == null || softLockMaxTurn <= 0f)
            {
                return null;
            }

            return CombatantQueries.FindNearestHostile(_service.Combatants, combatant, softLockRange);
        }

        private PerceptionStance ResolveStance(PlayerMovementModel model)
        {
            CombatStateId state = _machine.State;
            if (state != CombatStateId.Idle && state != CombatStateId.Dead)
            {
                return PerceptionStance.Combat;
            }

            if (model == null)
            {
                return PerceptionStance.Still;
            }

            switch (model.Gait)
            {
                case PlayerGait.Sneak: return PerceptionStance.Sneak;
                case PlayerGait.Walk: return PerceptionStance.Walk;
                case PlayerGait.Run: return PerceptionStance.Run;
                case PlayerGait.Sprint: return PerceptionStance.Sprint;
                default: return model.IsSneaking ? PerceptionStance.Sneak : PerceptionStance.Still;
            }
        }

        private float CameraYaw()
        {
            return cameraTransform != null ? cameraTransform.eulerAngles.y : 0f;
        }

        private void OnDied(DamageInfo killingDamage)
        {
            if (_machine != null)
            {
                _machine.Kill();
            }

            _motion.Clear();
        }
    }
}
