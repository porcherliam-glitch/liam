using System;
using Aetherfall.Stats;

namespace Aetherfall.Combat
{
    /// <summary>
    /// Combat state machine of the player (§9.8 "Combo-System ueber Zustandsmaschine mit Eingabepuffer", architecture 11.4)
    /// as pure logic: light combo with combo window and reset, chargeable heavy attack (levels I/II, hyperarmor), sprint and
    /// jump attack, block with stamina cost and guard break, perfect parry window with counter, dodge roll/back step with
    /// i-frames, stagger/knockdown from the stability, finisher and death. Stamina costs and rules from GDD 03 3.2, 4.3–4.10.
    /// </summary>
    /// <remarks>
    /// <para>Fed once per frame with <see cref="Tick"/> and the local combat time (0 during hitstop). Presses go into the
    /// <see cref="InputBuffer"/> and are executed as soon as the state allows it (cancel window, combo window, end of a
    /// dodge or stagger). Attacks run in an <see cref="AttackRunner"/> that opens the hit window through
    /// <see cref="IHitWindowReceiver"/>.</para>
    /// <para>The owner resolves incoming hits with <see cref="EvaluateIncoming"/> (evade, parry, block) and reports the
    /// consequences with <see cref="ApplyBlockedHit"/> and <see cref="ApplyPoiseDamage"/>. Movement limits are read from
    /// <see cref="Movement"/>. No UnityEngine calls, allocation-free per frame.</para>
    /// <para>Size (about 800 lines, architecture P3): the parts that stand alone are separate classes (buffer, attack runner,
    /// stability, dodge profiles, tuning); what remains is the transition logic of one state machine. Combo, charge,
    /// block/parry, dodge and stagger cancel into each other (GDD 03 1.3, 4.4–4.9), so they are kept in one place and
    /// tested together (CombatStateMachineTests).</para>
    /// </remarks>
    public sealed class CombatStateMachine
    {
        private readonly CombatTuning _tuning;
        private readonly WeaponSpec _weapon;
        private readonly ResourcePool _stamina;
        private readonly AttackRunner _runner;
        private readonly InputBuffer _buffer;
        private readonly StabilityMeter _stability;
        private readonly AttackSpec[] _heavyLevels = new AttackSpec[3];

        private float _stateTime;
        private int _nextComboStep;
        private int _lastComboStep = -1;
        private float _comboResetRemaining;
        private float _chargeSeconds;
        private bool _attackHasHyperArmor;
        private bool _attackHasHyperArmorPending;
        private bool _lastAttackWasCombo;
        private bool _isRoll;
        private DodgeProfile _dodge;
        private float _staggerRemaining;
        private float _parryWindowRemaining;
        private float _timeSinceBlockRelease = float.PositiveInfinity;
        private float _timeSinceParry = float.PositiveInfinity;
        private bool _blockHeldLastFrame;
        private bool _parryPressAllowed;

        /// <summary>Creates the state machine in <see cref="CombatStateId.Idle"/>.</summary>
        /// <param name="tuning">Rules (validated).</param>
        /// <param name="weapon">Weapon with moveset (validated).</param>
        /// <param name="stamina">Stamina pool; null = unlimited stamina.</param>
        /// <param name="hitWindow">Receiver of the hit windows (hitbox); null = no hit registration.</param>
        /// <param name="stability">Stability of the player (GDD 03 4.9); also settable later.</param>
        /// <exception cref="ArgumentException">Tuning or weapon are invalid.</exception>
        public CombatStateMachine(CombatTuning tuning, WeaponSpec weapon, ResourcePool stamina = null, IHitWindowReceiver hitWindow = null,
            float stability = 20f)
        {
            _tuning = tuning ?? throw new ArgumentNullException(nameof(tuning));
            _weapon = weapon ?? throw new ArgumentNullException(nameof(weapon));
            string problem = tuning.Validate();
            if (problem.Length == 0)
            {
                problem = weapon.Validate();
            }

            if (problem.Length > 0)
            {
                throw new ArgumentException("Invalid combat setup: " + problem);
            }

            _stamina = stamina;
            _runner = new AttackRunner(hitWindow);
            _buffer = new InputBuffer(tuning.InputBufferSeconds, tuning.DefensiveBufferSeconds);
            _stability = new StabilityMeter(stability, tuning.StabilityWindowSeconds);
            BuildHeavyLevels();
        }

        /// <summary>Current state.</summary>
        public CombatStateId State { get; private set; } = CombatStateId.Idle;

        /// <summary>Seconds in the current state.</summary>
        public float StateTime => _stateTime;

        /// <summary>The rules in use.</summary>
        public CombatTuning Tuning => _tuning;

        /// <summary>The weapon in use.</summary>
        public WeaponSpec Weapon => _weapon;

        /// <summary>The input buffer (read-only use: debug overlay).</summary>
        public InputBuffer Buffer => _buffer;

        /// <summary>The running attack (also during the finisher), or null.</summary>
        public AttackSpec CurrentAttack => _runner.Current;

        /// <summary>Phase of the running attack.</summary>
        public AttackPhase AttackPhase => _runner.Phase;

        /// <summary>Seconds since the running attack started.</summary>
        public float AttackElapsed => _runner.Elapsed;

        /// <summary>Progress of the running attack 0–1.</summary>
        public float AttackProgress => _runner.Progress;

        /// <summary>Index of the current or last light combo step (0-based), −1 if none.</summary>
        public int ComboStep => _lastComboStep;

        /// <summary>Hold time of the heavy attack while charging.</summary>
        public float ChargeSeconds => _chargeSeconds;

        /// <summary>Charge level reached so far (0 = uncharged, 1, 2).</summary>
        public int ChargeLevel => _chargeSeconds >= _tuning.ChargeLevel2Seconds ? 2 : _chargeSeconds >= _tuning.ChargeLevel1Seconds ? 1 : 0;

        /// <summary>True while the guard is raised (state <see cref="CombatStateId.Blocking"/>).</summary>
        public bool IsGuardUp => State == CombatStateId.Blocking;

        /// <summary>True during the first 150 ms after raising the guard (perfect parry, GDD 03 4.8).</summary>
        public bool IsParryWindowOpen => State == CombatStateId.Blocking && _parryWindowRemaining > 0f;

        /// <summary>True within 1.0 s after a perfect parry: light or heavy attack = counter (GDD 03 4.8).</summary>
        public bool IsCounterWindowOpen => _timeSinceParry <= _tuning.CounterWindowSeconds;

        /// <summary>True in the i-frames of a dodge and during the finisher.</summary>
        public bool IsInvulnerable =>
            (State == CombatStateId.Dodging && _dodge.IsInvulnerableAt(_stateTime)) || State == CombatStateId.Finisher;

        /// <summary>True while hyperarmor is active (charging from 0.3 s and the released charged attack, GDD 03 4.5).</summary>
        public bool HasHyperArmor =>
            (State == CombatStateId.Charging && _chargeSeconds >= _tuning.HyperArmorAfterSeconds) ||
            (State == CombatStateId.Attacking && _attackHasHyperArmor);

        /// <summary>True for a roll, false for a back step (valid while dodging).</summary>
        public bool IsRoll => _isRoll;

        /// <summary>Profile of the running dodge.</summary>
        public DodgeProfile CurrentDodge => _dodge;

        /// <summary>Kind of the running stagger.</summary>
        public StaggerKind StaggerKind { get; private set; }

        /// <summary>Seconds of stagger left.</summary>
        public float StaggerRemaining => _staggerRemaining;

        /// <summary>Stability meter of the player.</summary>
        public StabilityMeter Stability => _stability;

        /// <summary>Movement limits of the current state.</summary>
        public CombatMovement Movement
        {
            get
            {
                switch (State)
                {
                    case CombatStateId.Idle:
                        return CombatMovement.Free;
                    case CombatStateId.Blocking:
                        return new CombatMovement(CombatMovementMode.Slowed, _tuning.BlockMoveSpeed);
                    case CombatStateId.Dodging:
                        return new CombatMovement(CombatMovementMode.Forced, 0f, _dodge.Speed);
                    case CombatStateId.Attacking:
                        AttackSpec attack = _runner.Current;
                        if (attack != null && attack.LungeSpeed > 0f && _runner.Elapsed >= attack.LungeStartSeconds &&
                            _runner.Elapsed < attack.LungeEndSeconds)
                        {
                            return new CombatMovement(CombatMovementMode.Forced, 0f, attack.LungeSpeed);
                        }

                        return CombatMovement.Locked;
                    default:
                        return CombatMovement.Locked;
                }
            }
        }

        /// <summary>
        /// True if this frame may start a light attack (pressed now, or still waiting in the buffer). The owner then fills
        /// <see cref="CombatInput.FinisherAvailable"/>: it is read when the light attack is executed, not when it is pressed.
        /// </summary>
        /// <param name="input">Commands of this frame.</param>
        public bool NeedsFinisherCheck(in CombatInput input)
        {
            return input.LightPressed || _buffer.Pending == BufferedAction.LightAttack;
        }

        /// <summary>Raised on every state change (old, new).</summary>
        public event Action<CombatStateId, CombatStateId> StateChanged;

        /// <summary>Raised when an attack starts (combo step, heavy, sprint, jump, counter, finisher).</summary>
        public event Action<AttackSpec> AttackStarted;

        /// <summary>Raised when a dodge starts; the argument is true for a roll, false for a back step.</summary>
        public event Action<bool> DodgeStarted;

        /// <summary>Raised when the player parried perfectly.</summary>
        public event Action Parried;

        /// <summary>Advances the state machine by one frame.</summary>
        /// <param name="deltaTime">Local combat time in seconds (0 during hitstop).</param>
        /// <param name="input">Commands of this frame.</param>
        public void Tick(float deltaTime, in CombatInput input)
        {
            float dt = deltaTime > 0f ? deltaTime : 0f;
            if (State == CombatStateId.Dead)
            {
                _buffer.Clear();
                return;
            }

            _stateTime += dt;
            _stability.Tick(dt);
            _buffer.Tick(dt);
            if (!float.IsPositiveInfinity(_timeSinceParry))
            {
                _timeSinceParry += dt;
            }

            // GDD 03 4.8: the 400 ms relock counts from releasing the button (not from the end of the parry window). A
            // press while the button was held last frame means it was released and pressed again within this frame.
            if (!float.IsPositiveInfinity(_timeSinceBlockRelease))
            {
                _timeSinceBlockRelease += dt;
            }

            if (_blockHeldLastFrame && (!input.BlockHeld || input.BlockPressed))
            {
                _timeSinceBlockRelease = 0f;
            }

            if (_comboResetRemaining > 0f)
            {
                _comboResetRemaining = Math.Max(0f, _comboResetRemaining - dt);
            }

            BufferPresses(input);

            switch (State)
            {
                case CombatStateId.Staggered:
                    _staggerRemaining -= dt;
                    if (_staggerRemaining <= 0f)
                    {
                        EnterIdle();
                        TryExecuteBuffered(input);
                    }

                    break;
                case CombatStateId.Finisher:
                    if (!_runner.Tick(dt))
                    {
                        EnterIdle();
                    }

                    break;
                case CombatStateId.Dodging:
                    if (_stateTime >= _dodge.Duration)
                    {
                        EnterIdle();
                        TryExecuteBuffered(input);
                    }
                    else if (_stateTime >= _dodge.CancelFrom)
                    {
                        TryExecuteBuffered(input);
                    }

                    break;
                case CombatStateId.Attacking:
                    TickAttack(dt, input);
                    break;
                case CombatStateId.Charging:
                    TickCharge(dt, input);
                    break;
                case CombatStateId.Blocking:
                    TickBlock(dt, input);
                    break;
                default:
                    TryExecuteBuffered(input);
                    if (State == CombatStateId.Idle && input.BlockHeld)
                    {
                        // Holding block after a dodge, stagger or attack raises the guard again (no parry window).
                        EnterBlock(false);
                    }

                    break;
            }

            if (input.BlockPressed && !input.BlockHeld)
            {
                // Pressed and released within this frame: the release follows the press.
                _timeSinceBlockRelease = 0f;
            }

            _blockHeldLastFrame = input.BlockHeld;
            if (_stamina != null)
            {
                _stamina.RegenMultiplier = State == CombatStateId.Blocking ? _tuning.BlockStaminaRegenFactor : 1f;
            }
        }

        /// <summary>
        /// Decides how an incoming hit meets the player (GDD 03 3.2, 4.7, 4.8): i-frames evade, the parry window parries,
        /// a raised guard blocks hits from the front. A parry starts the counter window and raises <see cref="Parried"/>.
        /// </summary>
        /// <param name="bearing">Signed angle between the player's facing and the attacker (0 = from the front).</param>
        /// <param name="unblockable">The attack cannot be blocked.</param>
        /// <param name="unparryable">The attack cannot be parried.</param>
        public DefenseOutcome EvaluateIncoming(float bearing, bool unblockable, bool unparryable)
        {
            if (State == CombatStateId.Dead)
            {
                return DefenseOutcome.Ignored;
            }

            if (IsInvulnerable)
            {
                return DefenseOutcome.Evaded;
            }

            if (State != CombatStateId.Blocking || !_weapon.Block.Covers(bearing))
            {
                return DefenseOutcome.Hit;
            }

            if (_parryWindowRemaining > 0f && !unparryable)
            {
                _timeSinceParry = 0f;
                Action parried = Parried;
                if (parried != null)
                {
                    parried();
                }

                return DefenseOutcome.Parried;
            }

            return unblockable ? DefenseOutcome.Hit : DefenseOutcome.Blocked;
        }

        /// <summary>
        /// Pays the stamina of a blocked hit (damage result <c>BlockStaminaCost</c>). If the stamina reaches 0 the guard
        /// breaks: staggered for 1.0 s (GDD 03 4.3).
        /// </summary>
        /// <param name="staminaCost">Stamina cost of the blocked hit.</param>
        /// <returns><see cref="StaggerKind.GuardBreak"/> if the guard broke, otherwise <see cref="StaggerKind.None"/>.</returns>
        public StaggerKind ApplyBlockedHit(float staminaCost)
        {
            if (_stamina == null || State == CombatStateId.Dead)
            {
                return StaggerKind.None;
            }

            _stamina.Spend(staminaCost);
            if (_stamina.IsEmpty)
            {
                EnterStagger(StaggerKind.GuardBreak);
                return StaggerKind.GuardBreak;
            }

            return StaggerKind.None;
        }

        /// <summary>
        /// Adds the poise damage of a landed hit to the stability (GDD 03 4.9): stagger 0.5 s or knockdown 1.2 s. Hyperarmor
        /// doubles the stability; during the finisher and after death nothing happens.
        /// </summary>
        /// <param name="poiseDamage">Poise damage of the hit.</param>
        public StaggerKind ApplyPoiseDamage(float poiseDamage)
        {
            if (State == CombatStateId.Dead || State == CombatStateId.Finisher)
            {
                return StaggerKind.None;
            }

            StaggerKind kind = _stability.Apply(poiseDamage, HasHyperArmor ? _tuning.HyperArmorFactor : 1f);
            if (kind != StaggerKind.None)
            {
                EnterStagger(kind);
            }

            return kind;
        }

        /// <summary>Forces a stagger (e.g. a grab, debug).</summary>
        /// <param name="kind">Kind (stagger, knockdown, guard break).</param>
        public void ForceStagger(StaggerKind kind)
        {
            if (State != CombatStateId.Dead && kind != StaggerKind.None)
            {
                EnterStagger(kind);
            }
        }

        /// <summary>The player died: cancels everything.</summary>
        public void Kill()
        {
            _runner.Cancel();
            _buffer.Clear();
            ChangeState(CombatStateId.Dead);
        }

        /// <summary>Back to <see cref="CombatStateId.Idle"/> with empty buffer, stability and windows (respawn, load).</summary>
        public void Reset()
        {
            _runner.Cancel();
            _buffer.Clear();
            _stability.Clear();
            _comboResetRemaining = 0f;
            _nextComboStep = 0;
            _lastComboStep = -1;
            _chargeSeconds = 0f;
            _parryWindowRemaining = 0f;
            _timeSinceParry = float.PositiveInfinity;
            _timeSinceBlockRelease = float.PositiveInfinity;
            _blockHeldLastFrame = false;
            _parryPressAllowed = false;
            StaggerKind = StaggerKind.None;
            ChangeState(CombatStateId.Idle);
        }

        private void BufferPresses(in CombatInput input)
        {
            // Attacks first: a dodge or parry pressed in the same frame overrides them (GDD 03 4.4).
            if (input.LightPressed)
            {
                _buffer.Push(BufferedAction.LightAttack);
            }

            if (input.HeavyPressed)
            {
                _buffer.Push(BufferedAction.HeavyAttack);
            }

            if (input.BlockPressed)
            {
                // GDD 03 4.8: judged at the press, so a buffered press keeps its window even if released before it runs.
                _parryPressAllowed = _timeSinceBlockRelease >= _tuning.ParryRelockSeconds;
                _buffer.Push(BufferedAction.Parry);
            }

            if (input.DodgePressed)
            {
                _buffer.Push(BufferedAction.Dodge);
            }
        }

        private void TickAttack(float dt, in CombatInput input)
        {
            if (!_runner.Tick(dt))
            {
                EnterIdle();
                if (_lastAttackWasCombo)
                {
                    _comboResetRemaining = _tuning.ComboResetSeconds;
                }

                TryExecuteBuffered(input);
                return;
            }

            AttackSpec attack = _runner.Current;
            BufferedAction pending = _buffer.Pending;
            if (pending == BufferedAction.None)
            {
                return;
            }

            if (InputBuffer.IsDefensive(pending))
            {
                if (attack.CanCancelAt(_runner.Elapsed))
                {
                    TryExecuteBuffered(input);
                }

                return;
            }

            // Next combo step or the switch to the heavy attack inside the combo window (GDD 03 4.4).
            if (_lastAttackWasCombo && _runner.Elapsed >= attack.ComboWindowStartSeconds)
            {
                TryExecuteBuffered(input);
            }
        }

        private void TickCharge(float dt, in CombatInput input)
        {
            _chargeSeconds += dt;
            BufferedAction pending = _buffer.Pending;
            if (InputBuffer.IsDefensive(pending))
            {
                // Dodge or parry cancels the charge.
                _chargeSeconds = 0f;
                EnterIdle();
                TryExecuteBuffered(input);
                return;
            }

            if (!input.HeavyHeld || _chargeSeconds >= _tuning.ChargeMaxSeconds)
            {
                ReleaseHeavy();
            }
        }

        private void TickBlock(float dt, in CombatInput input)
        {
            if (_parryWindowRemaining > 0f)
            {
                _parryWindowRemaining = Math.Max(0f, _parryWindowRemaining - dt);
            }

            BufferedAction pending = _buffer.Pending;
            if (pending == BufferedAction.Parry)
            {
                // A new press while holding (e.g. released and pressed within one frame) re-opens the window if allowed.
                _buffer.Consume();
            }
            else if (pending == BufferedAction.Dodge && !CanAffordDodge())
            {
                // No roll without stamina (GDD 03 4.3): the press is dropped and the guard stays up.
                _buffer.Consume();
            }
            else if (pending != BufferedAction.None)
            {
                // Attacks and dodges are allowed from the guard.
                LeaveBlock();
                TryExecuteBuffered(input);
                return;
            }

            if (!input.BlockHeld && _parryWindowRemaining <= 0f)
            {
                LeaveBlock();
            }
        }

        private void TryExecuteBuffered(in CombatInput input)
        {
            BufferedAction pending = _buffer.Pending;
            switch (pending)
            {
                case BufferedAction.Dodge:
                    // Not affordable: dropped at once, so it neither waits in the buffer nor blocks attack presses.
                    _buffer.Consume();
                    if (CanAffordDodge())
                    {
                        StartDodge(input.HasMoveInput);
                    }

                    break;
                case BufferedAction.Parry:
                    _buffer.Consume();
                    _runner.Cancel();
                    EnterBlock(true);
                    break;
                case BufferedAction.LightAttack:
                    _buffer.Consume();
                    StartLightAttack(input);
                    break;
                case BufferedAction.HeavyAttack:
                    _buffer.Consume();
                    StartHeavy(input);
                    break;
            }
        }

        private void StartLightAttack(in CombatInput input)
        {
            if (input.FinisherAvailable && !input.IsAirborne)
            {
                StartAttack(_weapon.Finisher, CombatStateId.Finisher, false, false);
                return;
            }

            if (IsCounterWindowOpen)
            {
                StartCounter();
                return;
            }

            if (!HasStamina())
            {
                // GDD 03 4.3: an action needs stamina above 0 – the combo stops here.
                _comboResetRemaining = 0f;
                _nextComboStep = 0;
                return;
            }

            if (input.IsAirborne)
            {
                StartAttack(_weapon.Jump, CombatStateId.Attacking, false, true);
                return;
            }

            if (input.SprintSeconds >= _tuning.SprintAttackMinSprintSeconds)
            {
                StartAttack(_weapon.Sprint, CombatStateId.Attacking, false, true);
                return;
            }

            bool continues = (State == CombatStateId.Attacking && _lastAttackWasCombo) || _comboResetRemaining > 0f;
            int step = continues ? _nextComboStep : 0;
            if (step >= _weapon.LightCombo.Length)
            {
                step = 0;
            }

            _lastComboStep = step;
            _nextComboStep = step + 1 < _weapon.LightCombo.Length ? step + 1 : 0;
            StartAttack(_weapon.LightCombo[step], CombatStateId.Attacking, true, true);
        }

        private void StartHeavy(in CombatInput input)
        {
            if (IsCounterWindowOpen)
            {
                StartCounter();
                return;
            }

            if (!HasStamina())
            {
                return;
            }

            _runner.Cancel();
            _chargeSeconds = 0f;
            _comboResetRemaining = 0f;
            _nextComboStep = 0;
            ChangeState(CombatStateId.Charging);
            if (!input.HeavyHeld)
            {
                // Released before the state machine could start charging (buffered tap): uncharged heavy attack.
                ReleaseHeavy();
            }
        }

        private void ReleaseHeavy()
        {
            int level = ChargeLevel;
            _attackHasHyperArmorPending = _chargeSeconds >= _tuning.HyperArmorAfterSeconds;
            _chargeSeconds = 0f;
            StartAttack(_heavyLevels[level], CombatStateId.Attacking, false, true);
        }

        private void StartCounter()
        {
            _timeSinceParry = float.PositiveInfinity;
            StartAttack(_weapon.Counter, CombatStateId.Attacking, false, false);
        }

        private void StartAttack(AttackSpec attack, CombatStateId state, bool isCombo, bool payStamina)
        {
            if (payStamina && _stamina != null && attack.StaminaCost > 0f)
            {
                _stamina.Spend(attack.StaminaCost);
            }

            _attackHasHyperArmor = _attackHasHyperArmorPending;
            _attackHasHyperArmorPending = false;
            _lastAttackWasCombo = isCombo;
            if (!isCombo)
            {
                _comboResetRemaining = 0f;
                _nextComboStep = 0;
            }

            _runner.Start(attack);
            ChangeState(state);
            Action<AttackSpec> started = AttackStarted;
            if (started != null)
            {
                started(attack);
            }
        }

        private void StartDodge(bool withDirection)
        {
            _runner.Cancel();
            _isRoll = withDirection;
            _dodge = withDirection ? _tuning.Roll : _tuning.BackStep;
            if (_stamina != null)
            {
                _stamina.Spend(_dodge.StaminaCost);
            }

            _comboResetRemaining = 0f;
            _nextComboStep = 0;
            ChangeState(CombatStateId.Dodging);
            Action<bool> started = DodgeStarted;
            if (started != null)
            {
                started(withDirection);
            }
        }

        private void EnterBlock(bool withParryWindow)
        {
            // GDD 03 4.8: pressing again sooner than 400 ms after releasing opens no new window (no mashing).
            bool window = withParryWindow && _parryPressAllowed;
            _parryWindowRemaining = window ? _tuning.ParryWindowSeconds : 0f;
            _comboResetRemaining = 0f;
            _nextComboStep = 0;
            ChangeState(CombatStateId.Blocking);
        }

        private void LeaveBlock()
        {
            // The relock starts when the button is released (Tick), not when the guard drops after the parry window.
            _parryWindowRemaining = 0f;
            ChangeState(CombatStateId.Idle);
        }

        private void EnterStagger(StaggerKind kind)
        {
            _runner.Cancel();
            _buffer.Clear();
            _chargeSeconds = 0f;
            _parryWindowRemaining = 0f;
            _comboResetRemaining = 0f;
            _nextComboStep = 0;
            if (State == CombatStateId.Blocking)
            {
                _timeSinceBlockRelease = 0f;
            }

            StaggerKind = kind;
            switch (kind)
            {
                case StaggerKind.Knockdown:
                    _staggerRemaining = _tuning.KnockdownSeconds;
                    break;
                case StaggerKind.GuardBreak:
                    _staggerRemaining = _tuning.GuardBreakSeconds;
                    break;
                default:
                    _staggerRemaining = _tuning.StaggerSeconds;
                    break;
            }

            ChangeState(CombatStateId.Staggered);
        }

        private void EnterIdle()
        {
            _runner.Cancel();
            StaggerKind = StaggerKind.None;
            ChangeState(CombatStateId.Idle);
        }

        private bool HasStamina()
        {
            return _stamina == null || !_stamina.IsEmpty;
        }

        private bool CanAffordDodge()
        {
            // GDD 03 4.3: needs stamina above 0; exhausted (stamina hit 0) locks the roll for 1.2 s.
            return _stamina == null || (!_stamina.IsEmpty && !_stamina.IsExhausted);
        }

        private void ChangeState(CombatStateId next)
        {
            CombatStateId previous = State;
            State = next;
            _stateTime = 0f;
            if (previous == next)
            {
                return;
            }

            Action<CombatStateId, CombatStateId> changed = StateChanged;
            if (changed != null)
            {
                changed(previous, next);
            }
        }

        private void BuildHeavyLevels()
        {
            AttackSpec heavy = _weapon.Heavy;
            _heavyLevels[0] = heavy;
            _heavyLevels[1] = heavy.Clone();
            _heavyLevels[1].Id = heavy.Id + ".stufe_1";
            _heavyLevels[1].ChargeLevel = 1;
            _heavyLevels[1].DamageMultiplier = _tuning.ChargeLevel1Damage;
            _heavyLevels[1].PoiseMultiplier = _tuning.ChargeLevel1Poise;
            _heavyLevels[1].StaminaCost = heavy.StaminaCost + _tuning.ChargeLevel1Stamina;
            _heavyLevels[2] = heavy.Clone();
            _heavyLevels[2].Id = heavy.Id + ".stufe_2";
            _heavyLevels[2].ChargeLevel = 2;
            _heavyLevels[2].DamageMultiplier = _tuning.ChargeLevel2Damage;
            _heavyLevels[2].PoiseMultiplier = _tuning.ChargeLevel2Poise;
            _heavyLevels[2].StaminaCost = heavy.StaminaCost + _tuning.ChargeLevel2Stamina;
        }
    }
}
