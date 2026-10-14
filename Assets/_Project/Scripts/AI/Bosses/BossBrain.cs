using System;
using Aetherfall.Combat;
using Aetherfall.Utilities;

namespace Aetherfall.AI.Bosses
{
    /// <summary>
    /// Decisions of a mini-boss (GDD 03 9.6 "Bosse"; GDD 02 11.7 "Der Wachende Ritter"), without Unity calls: waits until the
    /// player enters the arena, rises (invulnerable), fights with telegraphed attacks from a frontal tower-shield guard, changes
    /// the phase at health thresholds (invulnerable transition, summons adds), can be opened by a parried shield bash, stunned
    /// by broken poise or – from phase 2 on – by the Aether beam, and dies exactly once. Movement wishes go out as
    /// <see cref="Intent"/>; attacks run through an <see cref="AttackRunner"/> (hit windows to the controller's hitbox).
    /// </summary>
    /// <remarks>Main thread only. The <see cref="BossController"/> turns senses into ticks and events into the world.</remarks>
    public sealed class BossBrain
    {
        private const float StandOffDistance = 2.2f;

        private readonly BossBrainSettings _settings;
        private readonly IRandom _random;
        private readonly AttackRunner _runner;
        private readonly BossPhaseTracker _phases;
        private readonly float[] _cooldowns;
        private int _option = -1;
        private float _recover;
        private float _stunRemaining;
        private float _beamCooldown;

        /// <summary>Creates the brain.</summary>
        /// <param name="settings">Values (validated).</param>
        /// <param name="random">Random source (attack choice).</param>
        /// <param name="hitWindow">Receives the hit windows of the attacks (may be null in tests).</param>
        /// <exception cref="ArgumentException">Invalid settings.</exception>
        public BossBrain(BossBrainSettings settings, IRandom random, IHitWindowReceiver hitWindow)
        {
            _settings = settings ?? throw new ArgumentNullException(nameof(settings));
            string problem = settings.Validate();
            if (problem.Length > 0)
            {
                throw new ArgumentException(problem, nameof(settings));
            }

            _random = random ?? throw new ArgumentNullException(nameof(random));
            _runner = new AttackRunner(hitWindow);
            _phases = new BossPhaseTracker(settings.PhaseThresholds);
            _cooldowns = new float[settings.Attacks.Length];
        }

        /// <summary>Current state.</summary>
        public BossStateId State { get; private set; } = BossStateId.Dormant;

        /// <summary>Seconds in the current state.</summary>
        public float StateTime { get; private set; }

        /// <summary>Current phase (1-based).</summary>
        public int Phase => _phases.Phase;

        /// <summary>Movement wish of this tick.</summary>
        public EnemyIntent Intent { get; private set; }

        /// <summary>Running attack (null if none).</summary>
        public AttackSpec CurrentAttack => _runner.Current;

        /// <summary>Phase of the running attack.</summary>
        public AttackPhase AttackPhase => _runner.Phase;

        /// <summary>True during the wind-up of an attack (telegraph, GDD 03 9.5).</summary>
        public bool IsTelegraphing => _runner.Phase == AttackPhase.Windup;

        /// <summary>The chosen or running attack option (null if none).</summary>
        public BossAttackOption ChosenAttack => _option >= 0 ? _settings.Attacks[_option] : null;

        /// <summary>True while the tower shield covers the front (GDD 02 11.7: frontal 100 % block).</summary>
        public bool IsGuardUp
        {
            get
            {
                if (State != BossStateId.Fighting)
                {
                    return false;
                }

                BossAttackOption chosen = ChosenAttack;
                return !(_runner.IsRunning && chosen != null && chosen.DropsGuard);
            }
        }

        /// <summary>True while hits are ignored (dormant, rising, phase change).</summary>
        public bool IsInvulnerable => State == BossStateId.Dormant || State == BossStateId.Awakening || State == BossStateId.Transition;

        /// <summary>True from the start of the encounter until death or reset.</summary>
        public bool IsEncounterRunning => State != BossStateId.Dormant && State != BossStateId.Dead;

        /// <summary>Why the boss is stunned (None otherwise).</summary>
        public BossStunKind StunKind { get; private set; }

        /// <summary>Remaining stun seconds.</summary>
        public float StunRemaining => _stunRemaining;

        /// <summary>Seconds until the beam can stun again.</summary>
        public float BeamCooldownRemaining => _beamCooldown;

        /// <summary>The values.</summary>
        public BossBrainSettings Settings => _settings;

        /// <summary>Raised when the encounter starts (the player entered the arena).</summary>
        public event Action EncounterStarted;

        /// <summary>Raised when a phase starts (also phase 1 at the start of the encounter).</summary>
        public event Action<int> PhaseChanged;

        /// <summary>Raised when adds should appear (count).</summary>
        public event Action<int> SummonRequested;

        /// <summary>Raised when the boss is stunned or opened (kind, seconds).</summary>
        public event Action<BossStunKind, float> Stunned;

        /// <summary>Raised once when the boss dies.</summary>
        public event Action Died;

        /// <summary>Starts the encounter (also done by <see cref="Tick"/> when the target enters the arena).</summary>
        /// <returns>True if it started now.</returns>
        public bool StartEncounter()
        {
            if (State != BossStateId.Dormant)
            {
                return false;
            }

            ChangeState(BossStateId.Awakening);
            Raise(EncounterStarted);
            RaisePhase(Phase);
            return true;
        }

        /// <summary>Advances the brain.</summary>
        /// <param name="deltaTime">Local combat time (0 during hitstop).</param>
        /// <param name="senses">What the boss knows.</param>
        public void Tick(float deltaTime, in BossSenses senses)
        {
            float dt = Math.Max(0f, deltaTime);
            StateTime += dt;
            TickCooldowns(dt);
            switch (State)
            {
                case BossStateId.Dormant:
                    Intent = default;
                    if (senses.HasTarget && senses.TargetInArena)
                    {
                        StartEncounter();
                    }

                    break;
                case BossStateId.Awakening:
                    Face(senses);
                    if (StateTime >= _settings.AwakenSeconds)
                    {
                        ChangeState(BossStateId.Fighting);
                    }

                    break;
                case BossStateId.Transition:
                    Face(senses);
                    if (StateTime >= _settings.TransitionSeconds)
                    {
                        ChangeState(BossStateId.Fighting);
                    }

                    break;
                case BossStateId.Stunned:
                    Intent = default;
                    _stunRemaining -= dt;
                    if (_stunRemaining <= 0f)
                    {
                        _stunRemaining = 0f;
                        StunKind = BossStunKind.None;
                        _recover = _settings.RecoverSeconds * 0.5f;
                        ChangeState(BossStateId.Fighting);
                    }

                    break;
                case BossStateId.Fighting:
                    TickFighting(dt, senses);
                    break;
                default:
                    Intent = default;
                    break;
            }
        }

        /// <summary>Broken poise (GDD 03 4.8): stunned for the poise meter's stun time.</summary>
        /// <param name="seconds">Stun seconds.</param>
        /// <returns>True if the boss is now stunned.</returns>
        public bool NotifyPoiseBroken(float seconds)
        {
            return Stun(BossStunKind.PoiseBreak, seconds);
        }

        /// <summary>The player parried an attack: the guard opens (GDD 02 11.7 "nach einem parierten Schildstoss").</summary>
        /// <returns>True if the boss is now open.</returns>
        public bool NotifyParried()
        {
            return Stun(BossStunKind.Parried, _settings.ParryOpenSeconds);
        }

        /// <summary>The Aether beam hits the boss (GDD 02 11.7): stunned 5 s, from the beam phase on, with cooldown.</summary>
        /// <returns>True if the beam stunned the boss now.</returns>
        public bool TryBeamStun()
        {
            if (State != BossStateId.Fighting || Phase < _settings.BeamFromPhase || _beamCooldown > 0f)
            {
                return false;
            }

            _beamCooldown = _settings.BeamStunSeconds + _settings.BeamCooldownSeconds;
            return Stun(BossStunKind.Beam, _settings.BeamStunSeconds);
        }

        /// <summary>The boss died (raises <see cref="Died"/> once).</summary>
        public void Kill()
        {
            if (State == BossStateId.Dead)
            {
                return;
            }

            _runner.Cancel();
            _option = -1;
            StunKind = BossStunKind.None;
            Intent = default;
            ChangeState(BossStateId.Dead);
            Raise(Died);
        }

        /// <summary>Back to the start (the player died, a save was loaded): dormant, phase 1, no cooldowns.</summary>
        public void Reset()
        {
            _runner.Cancel();
            _phases.Reset();
            Array.Clear(_cooldowns, 0, _cooldowns.Length);
            _option = -1;
            _recover = 0f;
            _stunRemaining = 0f;
            _beamCooldown = 0f;
            StunKind = BossStunKind.None;
            Intent = default;
            ChangeState(BossStateId.Dormant);
        }

        private void TickFighting(float dt, in BossSenses senses)
        {
            if (_phases.TryAdvance(senses.HealthFraction, out int phase))
            {
                EnterTransition(phase);
                return;
            }

            if (_runner.IsRunning)
            {
                TickAttack(dt, senses);
                return;
            }

            if (!senses.HasTarget)
            {
                Intent = default;
                return;
            }

            if (_recover > 0f)
            {
                _recover -= dt;
                Face(senses);
                return;
            }

            float distance = senses.Self.DistanceTo(senses.Target);
            if (_option < 0)
            {
                _option = Choose(distance);
            }

            if (_option < 0)
            {
                // Everything on cooldown: keep close behind the shield.
                Intent = distance > StandOffDistance
                    ? new EnemyIntent { Mode = EnemyMoveMode.Walk, Destination = senses.Target, Speed = _settings.WalkSpeed, FaceTarget = true }
                    : new EnemyIntent { Mode = EnemyMoveMode.Stop, Destination = senses.Target, FaceTarget = true };
                return;
            }

            EnemyAttackOption option = _settings.Attacks[_option].Option;
            if (distance > option.MaxRange)
            {
                bool run = distance > _settings.RunDistance;
                Intent = new EnemyIntent
                {
                    Mode = run ? EnemyMoveMode.Run : EnemyMoveMode.Walk, Destination = senses.Target,
                    Speed = run ? _settings.RunSpeed : _settings.WalkSpeed, FaceTarget = true
                };
                return;
            }

            if (distance < option.MinRange)
            {
                Intent = new EnemyIntent { Mode = EnemyMoveMode.Retreat, Destination = senses.Target, Speed = _settings.WalkSpeed, FaceTarget = true };
                return;
            }

            Intent = new EnemyIntent { Mode = EnemyMoveMode.Stop, Destination = senses.Target, FaceTarget = true };
            float bearing = CombatMath.BearingTo(senses.Self.X, senses.Self.Z, senses.SelfYaw, senses.Target.X, senses.Target.Z);
            if (Math.Abs(bearing) <= option.MaxAngle)
            {
                _runner.Start(option.Attack);
            }
        }

        private void TickAttack(float dt, in BossSenses senses)
        {
            AttackSpec attack = _runner.Current;
            if (!_runner.Tick(dt))
            {
                FinishAttack();
                return;
            }

            bool windup = _runner.Phase == AttackPhase.Windup;
            bool lunging = attack != null && attack.LungeSpeed > 0f && _runner.Elapsed >= attack.LungeStartSeconds &&
                           _runner.Elapsed < attack.LungeEndSeconds;
            if (lunging)
            {
                Intent = new EnemyIntent { Mode = EnemyMoveMode.Lunge, Destination = senses.Target, Speed = attack.LungeSpeed, FaceTarget = windup };
            }
            else if (windup)
            {
                Intent = new EnemyIntent { Mode = EnemyMoveMode.Stop, Destination = senses.Target, FaceTarget = true };
            }
            else
            {
                Intent = default;
            }
        }

        private void FinishAttack()
        {
            if (_option >= 0)
            {
                _cooldowns[_option] = _settings.Attacks[_option].Option.Cooldown;
            }

            _option = -1;
            _recover = _settings.RecoverSeconds;
        }

        private int Choose(float distance)
        {
            float inRange = 0f;
            float ready = 0f;
            for (int i = 0; i < _settings.Attacks.Length; i++)
            {
                if (!IsReady(i))
                {
                    continue;
                }

                float weight = Math.Max(0f, _settings.Attacks[i].Option.Weight);
                ready += weight;
                if (_settings.Attacks[i].Option.InRange(distance))
                {
                    inRange += weight;
                }
            }

            bool preferInRange = inRange > 0f;
            float total = preferInRange ? inRange : ready;
            if (!(total > 0f))
            {
                return -1;
            }

            float roll = _random.NextFloat() * total;
            int last = -1;
            for (int i = 0; i < _settings.Attacks.Length; i++)
            {
                if (!IsReady(i) || (preferInRange && !_settings.Attacks[i].Option.InRange(distance)))
                {
                    continue;
                }

                last = i;
                roll -= Math.Max(0f, _settings.Attacks[i].Option.Weight);
                if (roll < 0f)
                {
                    return i;
                }
            }

            return last;
        }

        private bool IsReady(int index)
        {
            return _cooldowns[index] <= 0f && _settings.Attacks[index].AvailableIn(Phase);
        }

        private void TickCooldowns(float dt)
        {
            for (int i = 0; i < _cooldowns.Length; i++)
            {
                if (_cooldowns[i] > 0f)
                {
                    _cooldowns[i] = Math.Max(0f, _cooldowns[i] - dt);
                }
            }

            if (_beamCooldown > 0f)
            {
                _beamCooldown = Math.Max(0f, _beamCooldown - dt);
            }
        }

        private bool Stun(BossStunKind kind, float seconds)
        {
            if (!(seconds > 0f) || (State != BossStateId.Fighting && State != BossStateId.Stunned))
            {
                return false;
            }

            if (State == BossStateId.Stunned && seconds <= _stunRemaining)
            {
                return false;
            }

            _runner.Cancel();
            _option = -1;
            _stunRemaining = seconds;
            StunKind = kind;
            Intent = default;
            ChangeState(BossStateId.Stunned);
            Action<BossStunKind, float> stunned = Stunned;
            if (stunned != null)
            {
                stunned(kind, seconds);
            }

            return true;
        }

        private void EnterTransition(int phase)
        {
            _runner.Cancel();
            _option = -1;
            _recover = 0f;
            Intent = default;
            ChangeState(BossStateId.Transition);
            RaisePhase(phase);
            int adds = _settings.AddsFor(phase);
            Action<int> summon = SummonRequested;
            if (adds > 0 && summon != null)
            {
                summon(adds);
            }
        }

        private void Face(in BossSenses senses)
        {
            Intent = senses.HasTarget
                ? new EnemyIntent { Mode = EnemyMoveMode.Stop, Destination = senses.Target, FaceTarget = true }
                : default;
        }

        private void ChangeState(BossStateId state)
        {
            State = state;
            StateTime = 0f;
        }

        private void RaisePhase(int phase)
        {
            Action<int> changed = PhaseChanged;
            if (changed != null)
            {
                changed(phase);
            }
        }

        private static void Raise(Action handler)
        {
            if (handler != null)
            {
                handler();
            }
        }
    }
}
