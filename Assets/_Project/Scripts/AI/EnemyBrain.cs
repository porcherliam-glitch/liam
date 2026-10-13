using System;
using Aetherfall.Combat;
using Aetherfall.Utilities;

namespace Aetherfall.AI
{
    /// <summary>
    /// Hierarchical state machine of one enemy (architecture 11.10 "HFSM im Code", §20.2, GDD 03 9.1–9.5) as pure logic:
    /// patrol/guard → suspicious → combat (approach, circle without token, engage with token, attack with telegraph,
    /// retreat) → search → return (leash 40 m or 8 s unreachable, regeneration) → patrol, plus optional flight at low
    /// health, stun after a poise break or a parry, and death. Perception through <see cref="DetectionMeter"/> and
    /// <see cref="PerceptionMath"/>, attacks through an <see cref="AttackRunner"/> and the token service.
    /// </summary>
    /// <remarks>
    /// The scene adapter fills <see cref="EnemySenses"/> (positions, line of sight) and executes <see cref="Intent"/>
    /// (movement). No UnityEngine calls; all randomness through <see cref="IRandom"/>. Ticked centrally by the AI manager.
    /// Attack choice and cooldowns: <see cref="EnemyAttackSelector"/>. Size (about 660 lines, architecture P3): one
    /// hierarchical state machine whose transitions are read and tested together (EnemyBrainTests); splitting the states
    /// over several classes would hide the transition table that GDD 03 9.1 describes.
    /// </remarks>
    public sealed class EnemyBrain
    {
        private const float StandOffDistance = 8f;

        private readonly EnemyBrainSettings _settings;
        private readonly IAttackTokenService _tokens;
        private readonly IRandom _random;
        private readonly AttackRunner _runner;
        private readonly DetectionMeter _detection = new DetectionMeter();
        private readonly EnemyAttackSelector _attacks;
        private readonly FlatPoint[] _patrol;
        private FlatPoint _anchor;
        private FlatPoint _lastKnown;
        private FlatPoint _searchPoint;
        private int _patrolIndex;
        private int _option = -1;
        private int _circleDirection = 1;
        private float _phaseTime;
        private float _decisionTimer;
        private float _lostSight;
        private float _unreachable;
        private float _stimulusTimer;
        private float _stunRemaining;
        private float _circleFlipTimer;
        private bool _hasFled;
        private bool _stunAllowsFinisher;

        /// <summary>Creates the brain in its base state (patrol, or guard).</summary>
        /// <param name="settings">Behaviour values (validated).</param>
        /// <param name="tokens">Attack token service.</param>
        /// <param name="agentId">Unique id of the enemy (token holder).</param>
        /// <param name="random">Random source (attack choice, circling, search points).</param>
        /// <param name="anchor">Anchor (spawn point) for leash and return.</param>
        /// <param name="patrolPoints">Patrol route; empty = guard at the anchor.</param>
        /// <param name="hitWindow">Receiver of the hit windows (hitbox); null in tests.</param>
        /// <exception cref="ArgumentException">The settings are invalid.</exception>
        public EnemyBrain(EnemyBrainSettings settings, IAttackTokenService tokens, string agentId, IRandom random, FlatPoint anchor,
            FlatPoint[] patrolPoints = null, IHitWindowReceiver hitWindow = null)
        {
            _settings = settings ?? throw new ArgumentNullException(nameof(settings));
            _tokens = tokens ?? throw new ArgumentNullException(nameof(tokens));
            _random = random ?? throw new ArgumentNullException(nameof(random));
            string problem = settings.Validate();
            if (problem.Length > 0)
            {
                throw new ArgumentException("Invalid enemy settings: " + problem, nameof(settings));
            }

            AgentId = string.IsNullOrEmpty(agentId) ? "enemy" : agentId;
            _anchor = anchor;
            _patrol = patrolPoints ?? Array.Empty<FlatPoint>();
            _attacks = new EnemyAttackSelector(settings.Attacks, random);
            _runner = new AttackRunner(hitWindow);
            State = BaseState;
        }

        /// <summary>Unique id of the enemy.</summary>
        public string AgentId { get; }

        /// <summary>Id of the current target for the token service (set by the adapter, e.g. <c>player</c>).</summary>
        public string TargetId { get; set; } = "player";

        /// <summary>Current top state.</summary>
        public EnemyStateId State { get; private set; }

        /// <summary>Sub-phase while fighting.</summary>
        public EnemyCombatPhase CombatPhase { get; private set; }

        /// <summary>Seconds in the current state.</summary>
        public float StateTime { get; private set; }

        /// <summary>Detection value 0–100.</summary>
        public float Detection => _detection.Value;

        /// <summary>Movement wish of this frame.</summary>
        public EnemyIntent Intent { get; private set; }

        /// <summary>The running attack, or null.</summary>
        public AttackSpec CurrentAttack => _runner.Current;

        /// <summary>Phase of the running attack.</summary>
        public AttackPhase AttackPhase => _runner.Phase;

        /// <summary>True during the wind-up of an attack (the telegraph, GDD 03 9.5).</summary>
        public bool IsTelegraphing => _runner.Phase == AttackPhase.Windup;

        /// <summary>True while the enemy holds an attack token.</summary>
        public bool HasToken => _tokens.Holds(TargetId, AgentId);

        /// <summary>True while it fights the player (combat state for the CombatStateChanged event).</summary>
        public bool IsEngaged => State == EnemyStateId.Combat || State == EnemyStateId.Stunned;

        /// <summary>Health regeneration per second as share of the maximum (only while returning).</summary>
        public float RegenPerSecond => State == EnemyStateId.Return ? _settings.ReturnRegenPerSecond : 0f;

        /// <summary>Seconds of stun left.</summary>
        public float StunRemaining => _stunRemaining;

        /// <summary>True if the stun allows a finisher (poise break, not a parry opening).</summary>
        public bool StunAllowsFinisher => State == EnemyStateId.Stunned && _stunAllowsFinisher;

        /// <summary>The anchor.</summary>
        public FlatPoint Anchor => _anchor;

        /// <summary>Last known position of the target.</summary>
        public FlatPoint LastKnownPosition => _lastKnown;

        /// <summary>The chosen attack while engaging or attacking, or null.</summary>
        public EnemyAttackOption ChosenAttack => _option >= 0 ? _settings.Attacks[_option] : null;

        /// <summary>The settings.</summary>
        public EnemyBrainSettings Settings => _settings;

        /// <summary>Raised on every state change (old, new).</summary>
        public event Action<EnemyStateId, EnemyStateId> StateChanged;

        private EnemyStateId BaseState => _settings.Guard || _patrol.Length == 0 ? EnemyStateId.Guard : EnemyStateId.Patrol;

        /// <summary>Advances the brain by one frame.</summary>
        /// <param name="deltaTime">Local combat time (0 during hitstop).</param>
        /// <param name="senses">What the enemy perceives.</param>
        public void Tick(float deltaTime, in EnemySenses senses)
        {
            float dt = deltaTime > 0f ? deltaTime : 0f;
            if (State == EnemyStateId.Dead)
            {
                Intent = default;
                return;
            }

            StateTime += dt;
            _phaseTime += dt;
            _attacks.Tick(dt);

            bool sensed = Perceive(dt, senses);
            switch (State)
            {
                case EnemyStateId.Patrol:
                case EnemyStateId.Guard:
                    TickIdle(senses);
                    break;
                case EnemyStateId.Suspicious:
                    TickSuspicious(dt, senses, sensed);
                    break;
                case EnemyStateId.Search:
                    TickSearch(senses);
                    break;
                case EnemyStateId.Combat:
                    TickCombat(dt, senses);
                    break;
                case EnemyStateId.Flee:
                    TickFlee(senses);
                    break;
                case EnemyStateId.Return:
                    TickReturn(senses);
                    break;
                case EnemyStateId.Stunned:
                    _stunRemaining -= dt;
                    Intent = default;
                    if (_stunRemaining <= 0f)
                    {
                        if (senses.HasTarget)
                        {
                            EnterCombat();
                        }
                        else
                        {
                            EnterReturn();
                        }
                    }

                    break;
            }
        }

        /// <summary>
        /// Stuns the enemy (poise break: finisher allowed; parry opening: not). A running attack is cancelled and the token
        /// given back.
        /// </summary>
        /// <param name="seconds">Duration.</param>
        /// <param name="allowsFinisher">True for a poise break.</param>
        public void NotifyStunned(float seconds, bool allowsFinisher)
        {
            if (State == EnemyStateId.Dead || !(seconds > 0f))
            {
                return;
            }

            if (State == EnemyStateId.Stunned && _stunAllowsFinisher && !allowsFinisher)
            {
                // A poise break is not shortened or downgraded by a later parry opening.
                return;
            }

            _runner.Cancel();
            ReleaseToken();
            _stunRemaining = seconds;
            _stunAllowsFinisher = allowsFinisher;
            _detection.Set(100f);
            ChangeState(EnemyStateId.Stunned);
        }

        /// <summary>The enemy died.</summary>
        public void Kill()
        {
            _runner.Cancel();
            ReleaseToken();
            ChangeState(EnemyStateId.Dead);
            Intent = default;
        }

        /// <summary>Back to the base state at the anchor (respawn).</summary>
        public void Reset()
        {
            _runner.Cancel();
            ReleaseToken();
            _detection.Reset();
            _attacks.Reset();
            _patrolIndex = 0;
            _hasFled = false;
            _stunRemaining = 0f;
            Intent = default;
            ChangeState(BaseState);
        }

        private bool Perceive(float dt, in EnemySenses senses)
        {
            bool ignore = State == EnemyStateId.Return && StateTime < _settings.ReturnIgnoreSeconds;
            float sight = 0f;
            bool instant = false;
            float noise = 0f;
            if (senses.HasTarget && !ignore)
            {
                PerceptionSettings perception = _settings.Perception;
                float distance = senses.Self.DistanceTo(senses.Target);
                float bearing = CombatMath.BearingTo(senses.Self.X, senses.Self.Z, senses.SelfYaw, senses.Target.X, senses.Target.Z);
                sight = senses.TargetVisible ? PerceptionMath.SightRate(distance, bearing, perception, senses.TargetStance) : 0f;
                instant = PerceptionMath.IsInstantDetection(distance, perception, senses.TargetStance);
                noise = PerceptionMath.NoiseDetection(distance, PerceptionMath.NoiseRadius(senses.TargetStance) * perception.HearingFactor);
            }

            float decay = State == EnemyStateId.Suspicious ? 0.5f : 1f;
            _detection.Update(dt, sight, instant, noise, decay);
            bool sensed = sight > 0f || instant || noise > 0f;
            if (senses.HasTarget && sensed)
            {
                // Seen or heard: the search point is the source (here the target itself).
                _lastKnown = senses.Target;
            }

            if (senses.WasHitByTarget && senses.HasTarget)
            {
                _detection.Set(100f);
                _lastKnown = senses.Target;
                sensed = true;
            }

            return sensed;
        }

        private void TickIdle(in EnemySenses senses)
        {
            if (_detection.Value >= PerceptionMath.CombatThreshold)
            {
                EnterCombat();
                return;
            }

            if (_detection.Value >= PerceptionMath.SuspiciousThreshold)
            {
                _stimulusTimer = 0f;
                ChangeState(EnemyStateId.Suspicious);
                Intent = new EnemyIntent { Mode = EnemyMoveMode.Stop, Destination = _lastKnown, FaceTarget = true };
                return;
            }

            if (State == EnemyStateId.Patrol && _patrol.Length > 0)
            {
                FlatPoint waypoint = _patrol[_patrolIndex % _patrol.Length];
                if (senses.Self.DistanceTo(waypoint) <= _settings.ArrivalDistance)
                {
                    _patrolIndex = (_patrolIndex + 1) % _patrol.Length;
                    waypoint = _patrol[_patrolIndex];
                }

                Intent = new EnemyIntent { Mode = EnemyMoveMode.Walk, Destination = waypoint, Speed = _settings.WalkSpeed };
                return;
            }

            bool away = senses.Self.DistanceTo(_anchor) > _settings.ArrivalDistance * 2f;
            Intent = away
                ? new EnemyIntent { Mode = EnemyMoveMode.Walk, Destination = _anchor, Speed = _settings.WalkSpeed }
                : default;
        }

        private void TickSuspicious(float dt, in EnemySenses senses, bool sensed)
        {
            if (_detection.Value >= PerceptionMath.CombatThreshold)
            {
                EnterCombat();
                return;
            }

            _stimulusTimer = sensed ? 0f : _stimulusTimer + dt;
            if (_stimulusTimer >= _settings.SuspiciousSeconds)
            {
                EnterSearch(_lastKnown);
                return;
            }

            Intent = new EnemyIntent { Mode = EnemyMoveMode.Stop, Destination = _lastKnown, FaceTarget = true };
        }

        private void TickSearch(in EnemySenses senses)
        {
            if (_detection.Value >= PerceptionMath.CombatThreshold)
            {
                EnterCombat();
                return;
            }

            if (StateTime >= _settings.SearchSeconds)
            {
                EnterReturn();
                return;
            }

            if (senses.Self.DistanceTo(_searchPoint) <= _settings.ArrivalDistance)
            {
                // Search around the last known position (GDD 03 9.1: radius 12 m).
                float angle = _random.NextFloat() * 6.2831853f;
                float radius = _random.NextFloat() * _settings.SearchRadius;
                _searchPoint = new FlatPoint(_lastKnown.X + (float)Math.Sin(angle) * radius, _lastKnown.Z + (float)Math.Cos(angle) * radius);
            }

            Intent = new EnemyIntent { Mode = EnemyMoveMode.Walk, Destination = _searchPoint, Speed = _settings.WalkSpeed };
        }

        private void TickCombat(float dt, in EnemySenses senses)
        {
            if (!senses.HasTarget)
            {
                EnterReturn();
                return;
            }

            if (senses.Self.DistanceTo(_anchor) > _settings.LeashDistance)
            {
                EnterReturn();
                return;
            }

            _unreachable = senses.TargetReachable ? 0f : _unreachable + dt;
            if (_unreachable >= _settings.UnreachableSeconds)
            {
                EnterReturn();
                return;
            }

            _lostSight = senses.TargetVisible ? 0f : _lostSight + dt;
            if (_lostSight >= _settings.LoseSightSeconds && CombatPhase != EnemyCombatPhase.Attack)
            {
                EnterSearch(_lastKnown);
                return;
            }

            if (_settings.FleeHealthFraction > 0f && !_hasFled && senses.HealthFraction < _settings.FleeHealthFraction &&
                CombatPhase != EnemyCombatPhase.Attack)
            {
                _hasFled = true;
                ReleaseToken();
                ChangeState(EnemyStateId.Flee);
                TickFlee(senses);
                return;
            }

            float distance = senses.Self.DistanceTo(senses.Target);
            switch (CombatPhase)
            {
                case EnemyCombatPhase.Approach:
                    if (distance <= _settings.RingMax)
                    {
                        EnterCircle();
                        goto case EnemyCombatPhase.Circle;
                    }

                    Intent = new EnemyIntent { Mode = EnemyMoveMode.Run, Destination = senses.Target, Speed = _settings.RunSpeed };
                    break;
                case EnemyCombatPhase.Circle:
                    TickCircle(dt, senses, distance);
                    break;
                case EnemyCombatPhase.Engage:
                    TickEngage(senses, distance);
                    break;
                case EnemyCombatPhase.Attack:
                    TickAttack(dt, senses);
                    break;
                case EnemyCombatPhase.Retreat:
                    Intent = new EnemyIntent
                    {
                        Mode = EnemyMoveMode.Retreat, Destination = senses.Target, Speed = _settings.CircleSpeed, FaceTarget = true
                    };
                    if (_phaseTime >= _settings.RetreatSeconds)
                    {
                        EnterCircle();
                    }

                    break;
            }
        }

        private void TickCircle(float dt, in EnemySenses senses, float distance)
        {
            if (distance > _settings.RingMax + 3f)
            {
                SetPhase(EnemyCombatPhase.Approach);
                Intent = new EnemyIntent { Mode = EnemyMoveMode.Run, Destination = senses.Target, Speed = _settings.RunSpeed };
                return;
            }

            _circleFlipTimer -= dt;
            if (_circleFlipTimer <= 0f)
            {
                _circleFlipTimer = 2.5f + _random.NextFloat() * 2.5f;
                _circleDirection = _random.NextFloat() < 0.5f ? -1 : 1;
            }

            Intent = new EnemyIntent
            {
                Mode = EnemyMoveMode.Circle,
                Destination = senses.Target,
                Speed = _settings.CircleSpeed,
                FaceTarget = true,
                CircleDirection = _circleDirection,
                RingDistance = (_settings.RingMin + _settings.RingMax) * 0.5f
            };

            _decisionTimer -= dt;
            if (_decisionTimer > 0f || senses.TargetProtected)
            {
                return;
            }

            _decisionTimer = _settings.DecisionInterval;
            int option = _attacks.Choose(distance);
            if (option >= 0 && _tokens.TryAcquire(TargetId, AgentId, _settings.TokenCost, _settings.TokenKind))
            {
                _option = option;
                SetPhase(EnemyCombatPhase.Engage);
            }
        }

        private void TickEngage(in EnemySenses senses, float distance)
        {
            EnemyAttackOption option = _settings.Attacks[_option];
            if (_phaseTime >= _settings.EngageTimeout || senses.TargetProtected || !HasToken)
            {
                ReleaseToken();
                EnterCircle();
                return;
            }

            if (distance > option.MaxRange)
            {
                Intent = new EnemyIntent { Mode = EnemyMoveMode.Run, Destination = senses.Target, Speed = _settings.RunSpeed, FaceTarget = true };
                return;
            }

            if (distance < option.MinRange)
            {
                Intent = new EnemyIntent
                {
                    Mode = EnemyMoveMode.Retreat, Destination = senses.Target, Speed = _settings.CircleSpeed, FaceTarget = true
                };
                return;
            }

            float bearing = CombatMath.BearingTo(senses.Self.X, senses.Self.Z, senses.SelfYaw, senses.Target.X, senses.Target.Z);
            Intent = new EnemyIntent { Mode = EnemyMoveMode.Stop, Destination = senses.Target, FaceTarget = true };

            // GDD 03 9.3 "Takt": the start itself is spaced (not only the token grant), otherwise a wolf that had to run in
            // could start together with one that got its token later but stood in range. Until then it waits facing the target.
            if (Math.Abs(bearing) <= option.MaxAngle && _tokens.TryBeginAttack(TargetId, AgentId))
            {
                _runner.Start(option.Attack);
                SetPhase(EnemyCombatPhase.Attack);
            }
        }

        private void TickAttack(float dt, in EnemySenses senses)
        {
            if (senses.TargetProtected && _runner.Phase == AttackPhase.Windup)
            {
                // Finisher on the target: give the token back for the duration (GDD 03 4.10).
                _runner.Cancel();
                ReleaseToken();
                EnterCircle();
                return;
            }

            AttackSpec attack = _runner.Current;
            if (!_runner.Tick(dt))
            {
                FinishAttack();
                return;
            }

            // Forward movement over the window that AttackSpec defines (second half of the wind-up to the end of the hit
            // window), independent of the phase and exactly like the player's lunge, so the lunge distance of the data is
            // covered (e.g. the pounce: 4 m).
            bool windup = _runner.Phase == AttackPhase.Windup;
            bool lunging = attack != null && attack.LungeSpeed > 0f && _runner.Elapsed >= attack.LungeStartSeconds &&
                           _runner.Elapsed < attack.LungeEndSeconds;
            if (lunging)
            {
                // During the wind-up the telegraph keeps tracking the target until the hit (GDD 03 9.5).
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
            _attacks.StartCooldown(_option);

            ReleaseToken();
            _option = -1;
            SetPhase(EnemyCombatPhase.Retreat);
        }

        private void TickFlee(in EnemySenses senses)
        {
            if (StateTime >= _settings.FleeSeconds)
            {
                bool cornered = senses.HasTarget && senses.Self.DistanceTo(senses.Target) <= StandOffDistance;
                if (cornered)
                {
                    EnterCombat();
                }
                else
                {
                    EnterReturn();
                }

                return;
            }

            Intent = senses.HasTarget
                ? new EnemyIntent { Mode = EnemyMoveMode.Flee, Destination = senses.Target, Speed = _settings.RunSpeed }
                : new EnemyIntent { Mode = EnemyMoveMode.Run, Destination = _anchor, Speed = _settings.RunSpeed };
        }

        private void TickReturn(in EnemySenses senses)
        {
            if (senses.WasHitByTarget)
            {
                // "Wer erneut angegriffen wird, kaempft wieder" (GDD 03 9.4).
                EnterCombat();
                return;
            }

            if (senses.Self.DistanceTo(_anchor) <= _settings.ArrivalDistance)
            {
                _detection.Reset();
                _hasFled = false;
                ChangeState(BaseState);
                Intent = default;
                return;
            }

            Intent = new EnemyIntent { Mode = EnemyMoveMode.Run, Destination = _anchor, Speed = _settings.RunSpeed };
        }

        private void EnterCombat()
        {
            _lostSight = 0f;
            _unreachable = 0f;
            _detection.Set(100f);
            ChangeState(EnemyStateId.Combat);
            SetPhase(EnemyCombatPhase.Approach);
        }

        private void EnterCircle()
        {
            _decisionTimer = _settings.DecisionInterval * _random.NextFloat();
            _option = -1;
            SetPhase(EnemyCombatPhase.Circle);
        }

        private void EnterSearch(FlatPoint point)
        {
            _searchPoint = point;
            ChangeState(EnemyStateId.Search);
        }

        private void EnterReturn()
        {
            ChangeState(EnemyStateId.Return);
        }

        private void SetPhase(EnemyCombatPhase phase)
        {
            CombatPhase = phase;
            _phaseTime = 0f;
        }

        private void ReleaseToken()
        {
            _tokens.Release(TargetId, AgentId);
        }

        private void ChangeState(EnemyStateId next)
        {
            EnemyStateId previous = State;
            if (previous == EnemyStateId.Combat && next != EnemyStateId.Combat)
            {
                _runner.Cancel();
                ReleaseToken();
                _option = -1;
            }

            State = next;
            StateTime = 0f;
            _phaseTime = 0f;
            if (previous == next)
            {
                return;
            }

            Action<EnemyStateId, EnemyStateId> changed = StateChanged;
            if (changed != null)
            {
                changed(previous, next);
            }
        }
    }
}
