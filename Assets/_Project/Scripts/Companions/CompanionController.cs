using System;
using System.Collections.Generic;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Player;
using Aetherfall.WorldState;
using UnityEngine;

namespace Aetherfall.Companions
{
    /// <summary>
    /// A companion in the world (GDD 03 13, GDD 01 10.6; first one: Ser Maren Falkenried): stands at her post until she is
    /// recruited (world flag), then follows the player as <see cref="CompanionBrain"/> says, fights in the defensive mode
    /// (enemies that attack the player or her, plus the player's lock-on target nearby), blocks often from the front, and goes
    /// down instead of dying: after <c>downedSeconds</c> she gets up with half her health. She has the player's level, and her
    /// kills count for the player's experience (combat id <c>companion.…</c>, GDD 03 12.7).
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the companion root with <see cref="CharacterController"/>, <see cref="Combatant"/> (team Player),
    /// <see cref="DamageableComponent"/>, hurtboxes, <see cref="Hitbox"/> and the figure; the NPC talk component sits on the same
    /// object. The scene generators build her in every scene she can be in; in each scene she appears next to the player
    /// once she is recruited.</para>
    /// <para>"Warte hier" / "Komm mit" come from her dialogue (world flag <c>waitFlag</c>); the command wheel (G) follows later.</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class CompanionController : MonoBehaviour, ICombatantController, IHitWindowReceiver, ICombatDebugSource
    {
        private const float TargetSearchInterval = 0.25f;
        private const float EngageRange = 15f;
        private const float TurnRate = 540f;
        private const float GroundProbe = 6f;

        [Tooltip("Kampf-ID (Ereignisse, Erfahrung): companion.<name>.")]
        [SerializeField] private string companionId = "companion.maren_falkenried";

        [Tooltip("Welt-Flag: größer als 0 = in der Gruppe (Maren: flag.main.a1_pruefung_angenommen, 1 angenommen, 2 abgelehnt).")]
        [SerializeField] private string joinedFlag = "";

        [Tooltip("Welt-Flag: 1 = „Warte hier“ (bleibt stehen, kämpft nur in der Nähe).")]
        [SerializeField] private string waitFlag = "";

        [Tooltip("Kampf-Wurzel. Leer = Combatant am selben GameObject.")]
        [SerializeField] private Combatant combatant = null;

        [Tooltip("Hitbox des Schwerts. Leer = Hitbox am selben GameObject.")]
        [SerializeField] private Hitbox hitbox = null;

        [Tooltip("Schwerthiebe, der Reihe nach (Einhandschwert leicht 1–3).")]
        [SerializeField] private AttackDefinition[] attacks = new AttackDefinition[0];

        [Tooltip("Drehpunkt des Schwerts in der Schulter: schwingt bei jedem Hieb.")]
        [SerializeField] private Transform swordPivot = null;

        [Tooltip("Namensschild am Posten; verschwindet, sobald sie mitkommt.")]
        [SerializeField] private GameObject postSign = null;

        [Tooltip("Layer, um die sie herumläuft (Environment).")]
        [SerializeField] private LayerMask obstacleLayers = 1 << 11;

        [Tooltip("Layer des Bodens für das Erscheinen neben dem Spieler.")]
        [SerializeField] private LayerMask groundLayers = 1 << 11;

        [Header("Werte (GDD 03 13.3: 20–30 % des Gruppenschadens)")]
        [Tooltip("Waffenschaden als Anteil am Waffenschaden des Spielers.")]
        [Range(0.2f, 1.5f)] [SerializeField] private float damageShare = 0.6f;

        [Tooltip("Pause zwischen zwei Hieben in Sekunden.")]
        [Range(0.3f, 4f)] [SerializeField] private float attackPause = 1.2f;

        [Tooltip("Sekunden am Boden, bevor sie wieder aufsteht.")]
        [Range(2f, 60f)] [SerializeField] private float downedSeconds = 12f;

        [Tooltip("Chance, einen Treffer von vorn mit dem Schild abzufangen (defensiv: „blockt viel“).")]
        [Range(0f, 1f)] [SerializeField] private float blockChance = 0.5f;

        private readonly CompanionBrain _brain = new CompanionBrain();
        private readonly List<AttackSpec> _attacks = new List<AttackSpec>();
        private CharacterController _controller;
        private EnemyLocomotion _locomotion;
        private AttackRunner _runner;
        private ICombatService _combat;
        private Aetherfall.Skills.ISkillService _skills;
        private IWorldState _world;
        private IEventBus _bus;
        private Combatant _player;
        private PlayerCombatController _playerCombat;
        private Combatant _target;
        private Quaternion _swordRest;
        private float _targetTimer;
        private float _attackTimer;
        private float _downTimer;
        private int _nextAttack;
        private int _configuredLevel;
        private bool _downed;
        private bool _joined;
        private bool _wasJoined;
        private bool _placeNextToPlayer = true;
        private System.Random _random;

        /// <summary>True if she is with the player.</summary>
        public bool IsJoined => _joined;

        /// <summary>True while she is knocked down.</summary>
        public bool IsDowned => _downed;

        /// <summary>The enemy she fights, or null.</summary>
        public Combatant Target => _target;

        /// <inheritdoc />
        public Combatant FocusTarget => _target;

        /// <summary>The combatant of the companion.</summary>
        public Combatant Combatant => combatant;

        /// <inheritdoc />
        public BlockSpec ActiveBlock => BlockSpec.WoodenShield;

        /// <inheritdoc />
        public string DebugStateText => !_joined ? "am Posten" : _downed ? "am Boden" : _target != null ? "kämpft" : "folgt";

        /// <inheritdoc />
        public DefenseOutcome EvaluateDefense(in IncomingHit hit, float bearing)
        {
            if (_downed || !combatant.IsAlive)
            {
                return DefenseOutcome.Ignored;
            }

            bool canBlock = !_runner.IsRunning && Math.Abs(bearing) <= 60f && hit.Attack != null && !hit.Attack.Unblockable;
            return canBlock && _random.NextDouble() < blockChance ? DefenseOutcome.Blocked : DefenseOutcome.Hit;
        }

        /// <inheritdoc />
        public AttackProfile GetAttackProfile(AttackSpec attack)
        {
            float weapon = _playerCombat != null ? _playerCombat.WeaponDamage : 20f;
            // Kommandostimme (GDD 03 11.4 KH01): the player's skill tree raises the companion's damage.
            float bonus = _skills != null ? 1f + _skills.Bonuses.CompanionDamage : 1f;
            return new AttackProfile(DamagePacket.Single(DamageType.Slash, Mathf.Max(5f, weapon * damageShare) * bonus), AttributeScaling.None, 12f);
        }

        /// <inheritdoc />
        public StaggerKind OnHitResolved(in HitReport report)
        {
            if (report.Defense == DefenseOutcome.Hit && report.Attack != null && report.Attacker != null && !report.Killed)
            {
                _locomotion.StartKnockback(report.Attacker.transform.position, report.Attack.KnockbackDistance * 0.5f);
            }

            if (_target == null && report.Attacker != null && report.Attacker.IsAlive && CombatTeams.CanDamage(combatant.Team, report.Attacker.Team))
            {
                // Defensive: whoever hits her becomes her target.
                _target = report.Attacker;
            }

            return StaggerKind.None;
        }

        /// <inheritdoc />
        public void OnParriedBy(Combatant defender)
        {
            _runner.Cancel();
            _attackTimer = attackPause * 1.5f;
        }

        /// <inheritdoc />
        public void OpenHitWindow(AttackSpec attack)
        {
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

        private void Awake()
        {
            _random = new System.Random();
            if (combatant == null)
            {
                TryGetComponent(out combatant);
            }

            if (hitbox == null)
            {
                TryGetComponent(out hitbox);
            }

            if (!TryGetComponent(out _controller) || combatant == null)
            {
                Log.Error(LogCategory.AI, "CompanionController on '" + name + "' needs a CharacterController and a Combatant.");
                enabled = false;
                return;
            }

            _locomotion = new EnemyLocomotion(_controller, obstacleLayers);
            _runner = new AttackRunner(this);
            for (int i = 0; i < attacks.Length; i++)
            {
                if (attacks[i] != null)
                {
                    _attacks.Add(attacks[i].CreateSpec());
                }
            }

            _swordRest = swordPivot != null ? swordPivot.localRotation : Quaternion.identity;
            combatant.SetController(this);
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
                locator.TryGet(out _world);
                locator.TryGet(out _skills);
                if (locator.TryGet(out _bus))
                {
                    _bus.Subscribe<PlayerSpawned>(OnPlayerSpawned);
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.AI, exception, "CompanionController could not resolve its services.");
            }
        }

        private void OnEnable()
        {
            // Shown again (recruited, scene loaded): appear next to the player instead of walking from the old spot.
            _placeNextToPlayer = true;
        }

        private void OnDestroy()
        {
            if (_bus != null)
            {
                _bus.Unsubscribe<PlayerSpawned>(OnPlayerSpawned);
            }
        }

        private void OnPlayerSpawned(PlayerSpawned evt)
        {
            _placeNextToPlayer = true;
        }

        private void Update()
        {
            float deltaTime = combatant.Tick(Time.deltaTime);
            UpdateJoined();
            if (!FindPlayer())
            {
                _locomotion.Move(default, deltaTime, TurnRate);
                return;
            }

            UpdateLevel();
            UpdateDowned(deltaTime);
            _attackTimer = Mathf.Max(0f, _attackTimer - deltaTime);
            _targetTimer -= deltaTime;
            if (_targetTimer <= 0f)
            {
                _targetTimer = TargetSearchInterval;
                _target = _joined && !_downed ? ChooseTarget() : null;
            }
            else if (_target != null && !_target.IsAlive)
            {
                _target = null;
            }

            Vector3 position = transform.position;
            Vector3 playerPosition = _player.transform.position;
            var senses = new CompanionSenses
            {
                Self = new FlatPoint(position.x, position.z),
                Player = new FlatPoint(playerPosition.x, playerPosition.z),
                PlayerYaw = _playerCombat != null ? _playerCombat.FacingYaw : _player.transform.eulerAngles.y,
                Joined = _joined,
                Waiting = IsWaiting(),
                Downed = _downed,
                HasTarget = _target != null,
                Target = _target != null ? new FlatPoint(_target.transform.position.x, _target.transform.position.z) : default,
                Attacking = _runner.IsRunning,
                AttackReady = _attackTimer <= 0f && _attacks.Count > 0
            };

            if (_joined && _placeNextToPlayer)
            {
                _placeNextToPlayer = false;
                if (senses.Self.DistanceTo(senses.Player) > CompanionBrain.ArriveDistance * 4f)
                {
                    PlaceAt(CompanionBrain.FollowSpot(senses.Player, senses.PlayerYaw, _brain.Side), playerPosition.y);
                    return;
                }
            }

            CompanionDecision decision = _brain.Decide(senses);
            if (decision.Move == CompanionMove.Teleport)
            {
                PlaceAt(decision.Destination, playerPosition.y);
                return;
            }

            if (decision.StartAttack)
            {
                StartAttack();
            }

            var intent = new EnemyIntent
            {
                Mode = decision.Move == CompanionMove.Move ? (decision.Speed > 3f ? EnemyMoveMode.Run : EnemyMoveMode.Walk) : EnemyMoveMode.Stop,
                Destination = decision.Destination,
                Speed = decision.Speed,
                FaceTarget = decision.FaceTarget && !_downed
            };
            _locomotion.Move(intent, deltaTime, TurnRate);
            _runner.Tick(deltaTime);
            PoseSword();
        }

        private void UpdateJoined()
        {
            _joined = !string.IsNullOrEmpty(joinedFlag) && _world != null && _world.GetInt(joinedFlag) > 0;
            if (_joined == _wasJoined)
            {
                return;
            }

            _wasJoined = _joined;
            _placeNextToPlayer = _joined;
            if (postSign != null)
            {
                postSign.SetActive(!_joined);
            }
        }

        private bool IsWaiting()
        {
            return !string.IsNullOrEmpty(waitFlag) && _world != null && _world.GetInt(waitFlag) > 0;
        }

        private bool FindPlayer()
        {
            if (_player != null && _player.isActiveAndEnabled)
            {
                return true;
            }

            _player = null;
            _playerCombat = null;
            if (_combat == null)
            {
                return false;
            }

            IReadOnlyList<Combatant> combatants = _combat.Combatants;
            for (int i = 0; i < combatants.Count; i++)
            {
                Combatant candidate = combatants[i];
                if (candidate != null && candidate != combatant && candidate.Team == CombatTeam.Player && candidate.TryGetComponent(out PlayerCombatController combat))
                {
                    _player = candidate;
                    _playerCombat = combat;
                    return true;
                }
            }

            return false;
        }

        private void UpdateLevel()
        {
            // GDD 03 13.3: companions always have the player's level.
            int level = Mathf.Max(1, _player.Level);
            if (level == _configuredLevel)
            {
                return;
            }

            _configuredLevel = level;
            combatant.Configure(level, 20f + 4f * level, default, 60f, PoiseSettings.Elite, companionId, companionId, 0.25f);
        }

        private void UpdateDowned(float deltaTime)
        {
            if (combatant.IsAlive)
            {
                _downed = false;
                return;
            }

            if (!_downed)
            {
                _downed = true;
                _downTimer = downedSeconds;
                _runner.Cancel();
                CloseHitWindow();
                Log.Info(LogCategory.AI, "Companion '" + companionId + "' is down for " + downedSeconds.ToString("0") + " s.");
            }

            _downTimer -= deltaTime;
            if (_downTimer <= 0f && combatant.Health != null && combatant.Health.Revive(0.5f))
            {
                _downed = false;
                Log.Info(LogCategory.AI, "Companion '" + companionId + "' is back on her feet.");
            }
        }

        private Combatant ChooseTarget()
        {
            if (_combat == null)
            {
                return null;
            }

            // Defensive (GDD 03 13.1): enemies that attack the player or her, and the player's lock-on target nearby.
            Combatant locked = _playerCombat != null ? _playerCombat.LockedTarget : null;
            Vector3 position = transform.position;
            Vector3 playerPosition = _player.transform.position;
            Combatant best = null;
            float bestDistance = float.MaxValue;
            IReadOnlyList<Combatant> combatants = _combat.Combatants;
            for (int i = 0; i < combatants.Count; i++)
            {
                Combatant candidate = combatants[i];
                if (candidate == null || !candidate.IsTargetable || !CombatTeams.CanDamage(combatant.Team, candidate.Team) ||
                    candidate.Team == CombatTeam.Neutral)
                {
                    continue;
                }

                if ((candidate.transform.position - playerPosition).sqrMagnitude > EngageRange * EngageRange)
                {
                    continue;
                }

                Combatant focus = FocusOf(candidate);
                bool threat = candidate == locked || candidate == _target || focus == _player || focus == combatant;
                if (!threat)
                {
                    continue;
                }

                float distance = (candidate.transform.position - position).sqrMagnitude;
                if (distance < bestDistance)
                {
                    best = candidate;
                    bestDistance = distance;
                }
            }

            return best;
        }

        private static Combatant FocusOf(Combatant candidate)
        {
            return candidate.TryGetComponent(out EnemyController enemy) ? enemy.FocusTarget : null;
        }

        private void StartAttack()
        {
            AttackSpec attack = _attacks[_nextAttack % _attacks.Count];
            _nextAttack++;
            _runner.Start(attack);
            _attackTimer = attack.TotalSeconds + attackPause;
        }

        private void PoseSword()
        {
            if (swordPivot == null)
            {
                return;
            }

            // Without animations the sword arm swings: raised in the wind-up, down through the hit window, back in the recovery.
            float angle = 0f;
            if (_runner.IsRunning)
            {
                AttackSpec attack = _runner.Current;
                float t = _runner.Elapsed;
                if (t < attack.WindupSeconds)
                {
                    angle = -70f * (t / Mathf.Max(0.01f, attack.WindupSeconds));
                }
                else if (t < attack.ActiveEndSeconds)
                {
                    angle = Mathf.Lerp(-70f, 60f, (t - attack.WindupSeconds) / Mathf.Max(0.01f, attack.ActiveSeconds));
                }
                else
                {
                    angle = Mathf.Lerp(60f, 0f, (t - attack.ActiveEndSeconds) / Mathf.Max(0.01f, attack.RecoverySeconds));
                }
            }

            swordPivot.localRotation = _swordRest * Quaternion.Euler(angle, 0f, 0f);
        }

        private void PlaceAt(FlatPoint point, float referenceHeight)
        {
            var position = new Vector3(point.X, referenceHeight + GroundProbe * 0.5f, point.Z);
            if (Physics.Raycast(position, Vector3.down, out RaycastHit hit, GroundProbe * 2f, groundLayers, QueryTriggerInteraction.Ignore))
            {
                position = hit.point;
            }
            else
            {
                position.y = referenceHeight;
            }

            _controller.enabled = false;
            transform.position = position + Vector3.up * 0.05f;
            _controller.enabled = true;
            _locomotion.Reset();
            _runner.Cancel();
            CloseHitWindow();
        }
    }
}
