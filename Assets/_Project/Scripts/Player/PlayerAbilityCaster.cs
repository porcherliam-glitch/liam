using System;
using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Input;
using Aetherfall.Stats;
using Aetherfall.WorldState;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// The player's active abilities (GDD 03 6.3–6.5, 11.8): the ability bar with 2 × 4 slots (keys 1–4 use the active bar,
    /// X switches it), the abilities the player knows and their effects – the cone of the Aether-Stoß and the nine spells of the
    /// mage: projectiles (Feuerball explodes, Eislanze pierces), the chain lightning, burning ground, lightning strikes and the
    /// self-buffs Glutmantel, Eispanzer and Sturmschritt.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the player root next to <see cref="PlayerCombatController"/> (execution order −45, before it, so the
    /// cast pose is set in the same frame). The menus "Testgelände/Eichental/Gruft erstellen" add it with the abilities and
    /// their looks (<see cref="AbilityVisual"/>).</para>
    /// <para>A press starts the wind-up if the ability is learned, the character is free (no attack, dodge, block, stagger, on
    /// the ground), no other ability is cast, the cooldown is over and the mana suffices (cost × (1 + 0.02 × (level − 1)),
    /// GDD 03 6.3). At the end of the wind-up the mana is paid and the effect happens; cooldowns run on both bars.</para>
    /// <para>Learned: from the start (test ground), by a world flag (Aether-Stoß: the Aether power from the rift), granted by
    /// the class (<see cref="IAbilityGrants"/>: the mage knows Feuerball, Eislanze and Kettenblitz) or learned later
    /// (<see cref="Learn"/>, skill tree). A newly learned ability is placed on the bar once (bar 1 first, the Aether-Stoß on
    /// slot 4). Bar and learned abilities are saved (<see cref="PlayerAbilitiesSaveable"/>).</para>
    /// <para>Aim: the lock-on target, else the nearest enemy within range, else straight ahead. Aether abilities add
    /// corruption (+2 for the Aether-Stoß, GDD 01 A3).</para>
    /// </remarks>
    [DefaultExecutionOrder(-45)]
    [DisallowMultipleComponent]
    public sealed class PlayerAbilityCaster : MonoBehaviour
    {
        /// <summary>Id of the Aether-Stoß (GDD 03 6.5).</summary>
        public const string AetherPushId = "ability.aether.aether_stoss";

        private const float PushGestureShare = 0.35f;
        private const float LearnCheckInterval = 0.25f;
        private const float AuraRadius = 2.5f;
        private const float AuraTickSeconds = 0.5f;
        private const float MantleMeleeBurning = 10f;
        private const float StormPulseRadius = 2.5f;
        private const float StormPulseShock = 30f;
        private const float GroundProbeHeight = 6f;
        private const float AreaHeightTolerance = 2f;
        private const float BodyRadius = 0.5f;
        private const int MaxChain = 8;
        private const string BuffSource = "ability.buff";

        [Tooltip("Fähigkeiten der Figur: Aether-Stoß und Zauber, jeweils mit Lernweg, Wunsch-Platz und Aussehen.")]
        [SerializeField] private AbilityLoadoutEntry[] abilities = new AbilityLoadoutEntry[0];

        [Tooltip("Kampf-Wurzel der Figur. Leer = Combatant am selben GameObject.")]
        [SerializeField] private Combatant combatant = null;

        [Tooltip("Werte mit Mana, Zauberkraft und Stufe. Leer = CharacterStatsComponent am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Kampfsteuerung (frei für Fähigkeiten, Zielhilfe, Waffenschaden). Leer = PlayerCombatController am selben GameObject.")]
        [SerializeField] private PlayerCombatController combat = null;

        [Tooltip("Figur für die Zauber-Geste (optional).")]
        [SerializeField] private HumanoidPuppet puppet = null;

        [Tooltip("Boden: Flächen und Einschläge werden auf ihn gesetzt (Environment).")]
        [SerializeField] private LayerMask groundLayers = 1 << 11;

        private readonly AbilityBar _bar = new AbilityBar();
        private readonly AbilityBuffs _buffs = new AbilityBuffs();
        private readonly HashSet<string> _learned = new HashSet<string>(StringComparer.Ordinal);
        private readonly HashSet<string> _offered = new HashSet<string>(StringComparer.Ordinal);
        private readonly Dictionary<string, int> _hitTotals = new Dictionary<string, int>(StringComparer.Ordinal);
        private readonly List<Combatant> _hits = new List<Combatant>(8);
        private readonly List<GroundArea> _areas = new List<GroundArea>(2);
        private readonly List<PendingStrike> _strikes = new List<PendingStrike>(6);
        private readonly Vector3[] _chainPoints = new Vector3[MaxChain + 1];
        private readonly float[] _xs = new float[32];
        private readonly float[] _zs = new float[32];
        private readonly bool[] _used = new bool[32];
        private readonly Combatant[] _candidates = new Combatant[32];
        private Slot[] _slots = new Slot[0];
        private Slot _casting;
        private Combatant _castTarget;
        private IGameplayInput _gameplay;
        private IGameStateService _gameState;
        private ICombatService _service;
        private IEventBus _bus;
        private IWorldState _world;
        private IAbilityGrants _grants;
        private StatModifier _armorBuff;
        private StatModifier _speedBuff;
        private StatModifier _guardBuff;
        private bool _armorApplied;
        private bool _speedApplied;
        private bool _guardApplied;
        private AbilityModifiers _modifiers;
        private float _yaw;
        private float _learnTimer;
        private float _auraTimer;
        private bool _wasAlive = true;

        /// <summary>The ability bar (2 × 4 slots).</summary>
        public AbilityBar Bar => _bar;

        /// <summary>Running self-buffs.</summary>
        public AbilityBuffs Buffs => _buffs;

        /// <summary>Number of abilities of the character.</summary>
        public int AbilityCount => _slots.Length;

        /// <summary>Current mana of the player.</summary>
        public float Mana => stats != null && stats.Mana != null ? stats.Mana.Current : 0f;

        /// <summary>Why the last press did not cast (None if it did).</summary>
        public AbilityRefusal LastRefusal { get; private set; }

        /// <summary>Enemies hit by the last ability that took effect (projectiles and strikes count on when they land).</summary>
        public int LastHitCount { get; private set; }

        /// <summary>Id of the ability cast last, or empty.</summary>
        public string LastAbilityId { get; private set; } = string.Empty;

        /// <summary>The ability in its wind-up or recovery, or null.</summary>
        public AbilitySpec CastingSpec => _casting != null ? _casting.Spec : null;

        /// <summary>Raised when an ability takes effect (ability id, number of enemies hit at that moment).</summary>
        public event Action<string, int> Cast;

        /// <summary>Data of an ability by index.</summary>
        /// <param name="index">0 to <see cref="AbilityCount"/> − 1.</param>
        public AbilitySpec GetSpec(int index)
        {
            return index >= 0 && index < _slots.Length ? _slots[index].Spec : null;
        }

        /// <summary>Data of an ability by id, or null.</summary>
        /// <param name="abilityId">Ability id.</param>
        public AbilitySpec GetSpec(string abilityId)
        {
            Slot slot = Find(abilityId);
            return slot != null ? slot.Spec : null;
        }

        /// <summary>Time line and cooldown of an ability, or null.</summary>
        /// <param name="abilityId">Ability id.</param>
        public AbilityRunner GetRunner(string abilityId)
        {
            Slot slot = Find(abilityId);
            return slot != null ? slot.Runner : null;
        }

        /// <summary>True if the character has the ability and knows it.</summary>
        /// <param name="abilityId">Ability id.</param>
        public bool IsLearned(string abilityId)
        {
            Slot slot = Find(abilityId);
            return slot != null && IsLearned(slot);
        }

        /// <summary>Enemies the ability has hit since the start (tests and tours; every hit of every cast counts).</summary>
        /// <param name="abilityId">Ability id.</param>
        public int HitsOf(string abilityId)
        {
            return abilityId != null && _hitTotals.TryGetValue(abilityId, out int hits) ? hits : 0;
        }

        /// <summary>Learns an ability (skill tree, tools); it goes on the bar if there is a free slot.</summary>
        /// <param name="abilityId">Ability id.</param>
        /// <returns>False if the character has no such ability.</returns>
        public bool Learn(string abilityId)
        {
            Slot slot = Find(abilityId);
            if (slot == null)
            {
                return false;
            }

            _learned.Add(abilityId);
            RefreshLearned();
            return true;
        }

        /// <summary>Forgets an ability learned with <see cref="Learn"/> (respec); it leaves the bar.</summary>
        /// <param name="abilityId">Ability id.</param>
        public void Forget(string abilityId)
        {
            if (abilityId == null || !_learned.Remove(abilityId))
            {
                return;
            }

            _offered.Remove(abilityId);
            Slot slot = Find(abilityId);
            if (slot != null && !IsLearned(slot))
            {
                _bar.Remove(abilityId);
            }
        }

        /// <summary>Uses the ability in slot 0–3 of the active bar, like keys 1–4.</summary>
        /// <param name="slot">Slot of the active bar.</param>
        /// <returns>True if the wind-up started; otherwise <see cref="LastRefusal"/> says why not.</returns>
        public bool TryCastSlot(int slot)
        {
            string id = _bar.GetActive(slot);
            if (id.Length == 0)
            {
                LastRefusal = AbilityRefusal.Locked;
                return false;
            }

            return TryCast(id);
        }

        /// <summary>Starts an ability like a key press (tools and tests use it too).</summary>
        /// <param name="abilityId">Ability id.</param>
        /// <returns>True if the wind-up started; otherwise <see cref="LastRefusal"/> says why not.</returns>
        public bool TryCast(string abilityId)
        {
            Slot slot = Find(abilityId);
            if (slot == null || !IsLearned(slot))
            {
                LastRefusal = AbilityRefusal.Locked;
                return false;
            }

            bool free = (combat == null || combat.IsFreeForAbility) && _casting == null && combatant.IsAlive;
            AbilityRefusal refusal = slot.Runner.Check(true, free, Mana);
            if (refusal == AbilityRefusal.None && slot.Spec.RequiresShield && !HasShield())
            {
                refusal = AbilityRefusal.NeedsShield;
            }

            if (refusal == AbilityRefusal.None && slot.Spec.StaminaCost > 0f && Stamina < slot.Spec.StaminaCost)
            {
                refusal = AbilityRefusal.NotEnoughStamina;
            }
            Combatant target = null;
            if (refusal == AbilityRefusal.None)
            {
                target = FindTarget(slot.Spec.Range + 1f, slot.Spec.NeedsTarget);
                if (slot.Spec.NeedsTarget && target == null)
                {
                    refusal = AbilityRefusal.NoTarget;
                }
            }

            if (refusal != AbilityRefusal.None || !slot.Runner.TryStart(true, free, Mana, out refusal))
            {
                LastRefusal = refusal;
                return false;
            }

            LastRefusal = AbilityRefusal.None;
            _casting = slot;
            _castTarget = target;
            _yaw = target != null ? YawTo(target.transform.position) : FacingYaw();
            if (combat != null)
            {
                combat.SetCastPose(true, _yaw);
            }

            if (puppet != null)
            {
                // The thrust of the gesture comes at the end of the wind-up.
                puppet.Push(Mathf.Max(0.1f, slot.Spec.WindupSeconds) / PushGestureShare);
            }

            return true;
        }

        /// <summary>The state to save (bar, learned and placed abilities).</summary>
        public PlayerAbilitiesDto CaptureState()
        {
            var learned = new string[_learned.Count];
            _learned.CopyTo(learned);
            var offered = new string[_offered.Count];
            _offered.CopyTo(offered);
            return new PlayerAbilitiesDto { Bar = _bar.ToArray(), ActiveBar = _bar.ActiveBar, Learned = learned, Offered = offered };
        }

        /// <summary>Restores a saved state; null = new game (empty bar, nothing learned).</summary>
        /// <param name="data">Saved state or null.</param>
        public void RestoreState(PlayerAbilitiesDto data)
        {
            CancelEverything();
            _learned.Clear();
            _offered.Clear();
            for (int i = 0; i < _slots.Length; i++)
            {
                _slots[i].Runner.Reset();
            }

            if (data == null)
            {
                _bar.Clear();
            }
            else
            {
                AddAll(_learned, data.Learned);
                AddAll(_offered, data.Offered);
                _bar.Load(data.Bar, data.ActiveBar);
            }

            RefreshLearned();
        }

        private void Awake()
        {
            if (combatant == null)
            {
                TryGetComponent(out combatant);
            }

            if (stats == null)
            {
                TryGetComponent(out stats);
            }

            if (combat == null)
            {
                TryGetComponent(out combat);
            }

            if (combatant == null)
            {
                Log.Error(LogCategory.Player, "PlayerAbilityCaster on '" + name + "' needs a Combatant (Aetherfall > Testgelände erstellen sets it).");
                enabled = false;
                return;
            }

            var built = new List<Slot>(abilities.Length);
            for (int i = 0; i < abilities.Length; i++)
            {
                AbilityLoadoutEntry entry = abilities[i];
                if (entry == null || entry.Ability == null)
                {
                    continue;
                }

                AbilitySpec spec = entry.Ability.CreateSpec(out string problem);
                if (spec == null)
                {
                    Log.Error(LogCategory.Player, "PlayerAbilityCaster: " + problem);
                    continue;
                }

                if (FindIn(built, spec.Id) != null)
                {
                    Log.Warning(LogCategory.Player, "PlayerAbilityCaster: '" + spec.Id + "' is listed twice; the second entry is ignored.");
                    continue;
                }

                built.Add(new Slot(entry, spec));
            }

            _slots = built.ToArray();
            _buffs.Started += OnBuffStarted;
            _buffs.Ended += OnBuffEnded;
            for (int i = 0; i < _slots.Length; i++)
            {
                ProjectileLauncher launcher = _slots[i].Visual != null ? _slots[i].Visual.Launcher : null;
                if (launcher != null)
                {
                    launcher.Impacted += OnProjectileImpacted;
                }
                else if (_slots[i].Spec.Kind == AbilityKind.Projectile)
                {
                    Log.Warning(LogCategory.Player, "PlayerAbilityCaster: '" + _slots[i].Spec.Id + "' is a projectile but has no launcher in its look.");
                }
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
                _gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                locator.TryGet(out _service);
                locator.TryGet(out _bus);
                locator.TryGet(out _world);
                locator.TryGet(out _grants);
                if (locator.TryGet(out IInputService input))
                {
                    _gameplay = input.Gameplay;
                }

                if (_service != null)
                {
                    _service.HitLanded += OnHitLanded;
                }

                if (combat != null)
                {
                    combat.Dodged += OnDodged;
                }

                RefreshLearned();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerAbilityCaster could not resolve its services.");
            }
        }

        private void OnDisable()
        {
            CancelEverything();
            if (combat != null)
            {
                combat.SetCastPose(false, _yaw);
            }
        }

        private void OnDestroy()
        {
            if (_service != null)
            {
                _service.HitLanded -= OnHitLanded;
            }

            if (combat != null)
            {
                combat.Dodged -= OnDodged;
            }

            for (int i = 0; i < _slots.Length; i++)
            {
                ProjectileLauncher launcher = _slots[i].Visual != null ? _slots[i].Visual.Launcher : null;
                if (launcher != null)
                {
                    launcher.Impacted -= OnProjectileImpacted;
                }
            }
        }

        private void Update()
        {
            float deltaTime = Time.deltaTime;
            bool alive = combatant.IsAlive;
            if (_wasAlive && !alive)
            {
                // Death ends wind-ups, burning ground and buffs.
                CancelEverything();
            }

            _wasAlive = alive;
            _bar.Tick(deltaTime);
            if (_casting != null && _casting.Runner.Phase == AbilityPhase.Windup && (!alive || (combat != null && combat.StateMachine != null &&
                                                                                                 combat.StateMachine.State != CombatStateId.Idle)))
            {
                // Hit out of the wind-up (stagger) or dead: no effect, no cooldown.
                _casting.Runner.Cancel();
            }

            bool playing = _gameState != null && _gameState.Current == GameState.Playing;
            if (playing && _gameplay != null && _gameplay.IsActive)
            {
                ReadInput();
            }

            for (int i = 0; i < _slots.Length; i++)
            {
                if (_slots[i].Runner.Tick(deltaTime))
                {
                    Release(_slots[i]);
                }
            }

            if (_casting != null && !_casting.Runner.IsCasting)
            {
                _casting = null;
            }

            if (combat != null)
            {
                combat.SetCastPose(_casting != null, _yaw);
            }

            TickAreas(deltaTime);
            TickStrikes(deltaTime);
            _buffs.Tick(deltaTime);
            TickAura(deltaTime);
            _learnTimer -= deltaTime;
            if (_learnTimer <= 0f)
            {
                _learnTimer = LearnCheckInterval;
                RefreshLearned();
            }
        }

        private void ReadInput()
        {
            if (_gameplay.WasPressedThisFrame(GameplayButton.SwitchBar))
            {
                _bar.TrySwitch();
            }

            if (_gameplay.WasPressedThisFrame(GameplayButton.Ability1))
            {
                TryCastSlot(0);
            }
            else if (_gameplay.WasPressedThisFrame(GameplayButton.Ability2))
            {
                TryCastSlot(1);
            }
            else if (_gameplay.WasPressedThisFrame(GameplayButton.Ability3))
            {
                TryCastSlot(2);
            }
            else if (_gameplay.WasPressedThisFrame(GameplayButton.Ability4))
            {
                TryCastSlot(3);
            }
        }

        private void RefreshLearned()
        {
            // GDD 03 6.3: mana costs grow by 2 % per level above 1.
            int level = stats != null && stats.Stats != null ? Mathf.Max(1, Mathf.RoundToInt(stats.Stats.Get(StatId.Level))) : 1;
            float costFactor = 1f + AbilitySpec.ManaCostPerLevel * (level - 1);
            for (int i = 0; i < _slots.Length; i++)
            {
                Slot slot = _slots[i];
                slot.Runner.CostFactor = costFactor;
                string id = slot.Spec.Id;
                if (_offered.Contains(id) || !IsLearned(slot))
                {
                    continue;
                }

                _offered.Add(id);
                _bar.Place(id, slot.Entry.PreferredSlotIndex);
            }
        }

        private bool IsLearned(Slot slot)
        {
            string id = slot.Spec.Id;
            string flag = slot.Entry.UnlockFlag;
            return slot.Entry.LearnedAtStart || _learned.Contains(id) || (flag.Length > 0 && _world != null && _world.GetBool(flag)) ||
                   (_grants != null && _grants.Grants(id));
        }

        private void Release(Slot slot)
        {
            ResourcePool mana = stats != null ? stats.Mana : null;
            if (mana != null)
            {
                mana.Spend(slot.Runner.ManaCost);
            }

            ResourcePool stamina = stats != null ? stats.Stamina : null;
            if (stamina != null && slot.Spec.StaminaCost > 0f)
            {
                // Warrior techniques cost stamina (GDD 03 11.4).
                stamina.Spend(slot.Spec.StaminaCost);
            }

            AbilitySpec spec = slot.Spec;
            if (spec.Corruption > 0f)
            {
                // GDD 01 A3 / GDD 03 6.5: every use of an Aether ability adds corruption.
                combatant.Status.AddCorruption(spec.Corruption);
            }

            // The target may have moved (or died) during the wind-up.
            Combatant target = _castTarget != null && _castTarget.IsTargetable ? _castTarget : FindTarget(spec.Range + 1f, spec.NeedsTarget);
            _castTarget = null;
            if (target != null)
            {
                _yaw = YawTo(target.transform.position);
            }

            LastAbilityId = spec.Id;
            int hits;
            switch (spec.Kind)
            {
                case AbilityKind.Projectile:
                    hits = ReleaseProjectile(slot, target);
                    break;
                case AbilityKind.Chain:
                    hits = ReleaseChain(slot, target);
                    break;
                case AbilityKind.GroundArea:
                    hits = ReleaseArea(slot, target);
                    break;
                case AbilityKind.Strikes:
                    hits = ReleaseStrikes(slot, target);
                    break;
                case AbilityKind.SelfBuff:
                    hits = ReleaseBuff(slot);
                    break;
                case AbilityKind.Shout:
                    hits = ReleaseShout(slot);
                    break;
                default:
                    hits = ReleaseCone(slot);
                    break;
            }

            LastHitCount = hits;
            Cast?.Invoke(spec.Id, hits);
        }

        private int ReleaseCone(Slot slot)
        {
            AbilitySpec spec = slot.Spec;
            Vector3 position = transform.position;
            AttackProfile profile = Profile(slot, 1f);
            CombatantQueries.FindInCone(_service != null ? _service.Combatants : null, combatant, _yaw, spec.Range, spec.HalfAngle, _hits);
            for (int i = 0; i < _hits.Count; i++)
            {
                Combatant target = _hits[i];
                Pull(target, spec.PullDistance);
                Strike(slot.Attack, profile, target, position);
                Control(spec, target);
                Publish(spec.Id, target.CombatantId, target.transform.position);
            }

            // Further hits (Wirbelklinge: second rotation) around the caster where he stands then.
            for (int repeat = 1; repeat < spec.Repeats; repeat++)
            {
                _strikes.Add(new PendingStrike(slot, position, repeat * spec.RepeatInterval, true));
            }

            if (_hits.Count == 0)
            {
                Publish(spec.Id, string.Empty, position + Quaternion.Euler(0f, _yaw, 0f) * Vector3.forward * (spec.Range * 0.5f));
            }

            if (slot.Visual != null)
            {
                slot.Visual.PlayCast(_yaw);
            }

            int count = _hits.Count;
            _hits.Clear();
            CountHits(spec.Id, count);
            return count;
        }

        private int ReleaseProjectile(Slot slot, Combatant target)
        {
            ProjectileLauncher launcher = slot.Visual != null ? slot.Visual.Launcher : null;
            if (launcher == null)
            {
                return 0;
            }

            AttackProfile profile = Profile(slot, 1f);
            bool fired = target != null
                ? launcher.FireAt(combatant, slot.Attack, profile, target.TargetPosition)
                : launcher.FireAlong(combatant, slot.Attack, profile, Quaternion.Euler(0f, _yaw, 0f) * Vector3.forward);
            if (fired && slot.Visual != null)
            {
                slot.Visual.PlayCast(_yaw);
            }

            Vector3 aim = target != null ? target.transform.position : transform.position + Quaternion.Euler(0f, _yaw, 0f) * Vector3.forward * 8f;
            Publish(slot.Spec.Id, target != null ? target.CombatantId : string.Empty, aim);
            return 0;
        }

        private void OnProjectileImpacted(Projectile projectile)
        {
            Slot slot = null;
            for (int i = 0; i < _slots.Length; i++)
            {
                if (_slots[i].Attack == projectile.Attack)
                {
                    slot = _slots[i];
                    break;
                }
            }

            if (slot == null)
            {
                return;
            }

            int hits = projectile.StruckCount;
            Vector3 point = projectile.LastImpactPoint;
            if (slot.Explosion != null && _service != null)
            {
                // Feuerball (GDD 03 6.4): explosion of 2 m where it stops; the target hit directly is not hit twice.
                AttackProfile profile = Profile(slot, 1f);
                float trigger = slot.Spec.DamageMultiplier * Reference(slot.Spec);
                hits += Explosions.Detonate(combatant, null, projectile.LastHit, point, slot.Spec.ExplosionRadius, slot.Explosion, profile, trigger,
                    _service.Combatants);
            }

            if (slot.Visual != null)
            {
                slot.Visual.PlayImpact(point);
            }

            CountHits(slot.Spec.Id, hits);
            LastHitCount = hits;
        }

        private int ReleaseChain(Slot slot, Combatant first)
        {
            AbilitySpec spec = slot.Spec;
            Vector3 origin = transform.position + Vector3.up * 1.4f + Quaternion.Euler(0f, _yaw, 0f) * Vector3.forward * 0.6f;
            _chainPoints[0] = origin;
            if (first == null)
            {
                Vector3 end = origin + Quaternion.Euler(0f, _yaw, 0f) * Vector3.forward * Mathf.Min(spec.Range, 8f);
                _chainPoints[1] = end;
                if (slot.Visual != null)
                {
                    slot.Visual.ShowBeam(_chainPoints, 2);
                }

                Publish(spec.Id, string.Empty, end);
                return 0;
            }

            int count = CollectHostiles(first);
            int points = 1;
            Combatant current = first;
            int hits = 0;
            int links = Mathf.Min(spec.ChainTargets, MaxChain);
            for (int jump = 0; jump < links && current != null; jump++)
            {
                Strike(slot.Attack, Profile(slot, AbilityMath.ChainFactor(jump, spec.ChainFalloff)), current, _chainPoints[points - 1]);
                Publish(spec.Id, current.CombatantId, current.transform.position);
                _chainPoints[points++] = current.TargetPosition;
                if (slot.Visual != null)
                {
                    slot.Visual.PlayImpact(current.TargetPosition);
                }

                hits++;
                if (jump + 1 >= links)
                {
                    break;
                }

                Vector3 from = current.transform.position;
                int next = AbilityMath.NextChainTarget(from.x, from.z, _xs, _zs, _used, count, spec.ChainRange);
                if (next < 0)
                {
                    break;
                }

                _used[next] = true;
                current = _candidates[next];
            }

            if (slot.Visual != null)
            {
                slot.Visual.ShowBeam(_chainPoints, points);
            }

            ClearCandidates(count);
            CountHits(spec.Id, hits);
            return hits;
        }

        private int ReleaseArea(Slot slot, Combatant target)
        {
            Vector3 center = PlacePoint(slot.Spec, target);
            _areas.RemoveAll(area => area.Slot == slot);
            _areas.Add(new GroundArea(slot, center, slot.Spec.AreaSeconds));
            if (slot.Visual != null)
            {
                slot.Visual.PlayCast(_yaw);
                slot.Visual.ShowLasting(true, center);
            }

            Publish(slot.Spec.Id, target != null ? target.CombatantId : string.Empty, center);

            // The first tick right away; the area then ticks on by itself.
            return TickArea(slot, center);
        }

        private int ReleaseStrikes(Slot slot, Combatant target)
        {
            AbilitySpec spec = slot.Spec;
            Vector3 center = PlacePoint(spec, target);
            int count = CollectHostiles(null);
            for (int strike = 0; strike < spec.StrikeCount; strike++)
            {
                // Each strike aims at the nearest enemy in the area not struck yet; with more strikes than enemies it starts over,
                // and without enemies the strikes spread around the centre.
                int pick = NearestInArea(center, spec.AreaRadius, count);
                if (pick < 0 && strike > 0)
                {
                    ResetUsed(count);
                    pick = NearestInArea(center, spec.AreaRadius, count);
                }

                Vector3 point;
                if (pick >= 0)
                {
                    point = _candidates[pick].transform.position;
                    _used[pick] = true;
                }
                else
                {
                    AbilityMath.StrikeOffset(strike, spec.AreaRadius, out float dx, out float dz);
                    point = Ground(center + new Vector3(dx, 0f, dz));
                }

                _strikes.Add(new PendingStrike(slot, point, strike * spec.StrikeInterval));
            }

            ClearCandidates(count);
            if (slot.Visual != null)
            {
                slot.Visual.PlayCast(_yaw);
            }

            Publish(spec.Id, target != null ? target.CombatantId : string.Empty, center);

            // Strikes without delay land at once.
            TickStrikes(0f);
            return 0;
        }

        private void PulseCone(Slot slot)
        {
            AbilitySpec spec = slot.Spec;
            Vector3 position = transform.position;
            AttackProfile profile = Profile(slot, 1f);
            CombatantQueries.FindInCone(_service != null ? _service.Combatants : null, combatant, _yaw, spec.Range, spec.HalfAngle, _hits);
            for (int i = 0; i < _hits.Count; i++)
            {
                Strike(slot.Attack, profile, _hits[i], position);
                Control(spec, _hits[i]);
            }

            if (slot.Visual != null)
            {
                slot.Visual.PlayCast(_yaw);
            }

            CountHits(spec.Id, _hits.Count);
            LastHitCount += _hits.Count;
            _hits.Clear();
        }

        private int ReleaseShout(Slot slot)
        {
            // Spott and Kriegsschrei (GDD 03 11.4): everyone hostile in the radius is taunted, weakened or staggers.
            AbilitySpec spec = slot.Spec;
            Vector3 position = transform.position;
            int affected = 0;
            if (_service != null)
            {
                IReadOnlyList<Combatant> all = _service.Combatants;
                for (int i = 0; i < all.Count; i++)
                {
                    Combatant target = all[i];
                    if (!IsHostile(target) || !IsInside(target, position, spec.AreaRadius))
                    {
                        continue;
                    }

                    target.TryGetComponent(out ICrowdControlTarget control);
                    if (spec.TauntSeconds > 0f && control != null)
                    {
                        control.Taunt(combatant, spec.TauntSeconds);
                    }

                    if (spec.WeakenFraction > 0f)
                    {
                        target.Weaken(spec.WeakenFraction, spec.WeakenSeconds);
                    }

                    if (spec.StaggerSeconds > 0f && control != null && control.IsNormalRank && !control.IsLarge)
                    {
                        control.Stagger(spec.StaggerSeconds);
                    }

                    Publish(spec.Id, target.CombatantId, target.transform.position);
                    affected++;
                }
            }

            if (spec.BuffKind != AbilityBuffKind.None)
            {
                _buffs.Start(spec.BuffKind, spec.BuffSeconds, spec.BuffValue, spec.Buildup);
            }

            if (slot.Visual != null)
            {
                slot.Visual.PlayCast(_yaw);
                slot.Visual.PlayImpact(position);
            }

            if (affected == 0)
            {
                Publish(spec.Id, string.Empty, position);
            }

            CountHits(spec.Id, affected);
            return affected;
        }

        private void Control(AbilitySpec spec, Combatant target)
        {
            if ((spec.KnockdownSeconds <= 0f && spec.StaggerSeconds <= 0f) || target == null || !target.IsAlive ||
                !target.TryGetComponent(out ICrowdControlTarget control) || control.IsLarge)
            {
                return;
            }

            // Fußfeger knocks down (not bosses); Schildschlag interrupts normal enemies.
            if (spec.KnockdownSeconds > 0f)
            {
                control.KnockDown(spec.KnockdownSeconds);
            }
            else if (control.IsNormalRank)
            {
                control.Stagger(spec.StaggerSeconds);
            }
        }

        private void Pull(Combatant target, float distance)
        {
            // Wirbelklinge: Sog – the enemy slides towards the caster (a metre short of him); bosses are too heavy.
            if (distance > 0f && target != null && target.TryGetComponent(out ICrowdControlTarget control) && !control.IsLarge)
            {
                control.Pull(transform.position, distance);
            }
        }

        private float Stamina => stats != null && stats.Stamina != null ? stats.Stamina.Current : 0f;

        private bool HasShield()
        {
            return combat == null || combat.HasShield;
        }

        /// <summary>True if the ability could be used with the current equipment (Schildschlag needs a shield; HUD greys it out).</summary>
        /// <param name="abilityId">Ability id.</param>
        public bool IsUsableWithEquipment(string abilityId)
        {
            Slot slot = Find(abilityId);
            return slot != null && (!slot.Spec.RequiresShield || HasShield());
        }

        /// <summary>Applies what the skill tree changes on the abilities (damage per element, build-up, upgrades).</summary>
        /// <param name="modifiers">Bonuses; null removes all.</param>
        public void ApplyModifiers(AbilityModifiers modifiers)
        {
            _modifiers = modifiers;
            for (int i = 0; i < _slots.Length; i++)
            {
                Slot slot = _slots[i];
                slot.Use(modifiers != null ? modifiers.Apply(slot.BaseSpec) : slot.BaseSpec);
            }
        }

        private int ReleaseBuff(Slot slot)
        {
            AbilitySpec spec = slot.Spec;
            _buffs.Start(spec.BuffKind, spec.BuffSeconds, spec.BuffValue, spec.Buildup);
            if (slot.Visual != null)
            {
                slot.Visual.PlayCast(_yaw);
                slot.Visual.ShowLasting(false, transform.position);
            }

            Publish(spec.Id, string.Empty, transform.position);
            return 0;
        }

        private void TickAreas(float deltaTime)
        {
            for (int i = _areas.Count - 1; i >= 0; i--)
            {
                GroundArea area = _areas[i];
                area.Remaining -= deltaTime;
                area.NextTick -= deltaTime;
                if (area.Remaining <= 0f)
                {
                    if (area.Slot.Visual != null)
                    {
                        area.Slot.Visual.HideLasting();
                    }

                    _areas.RemoveAt(i);
                    continue;
                }

                if (area.NextTick <= 0f)
                {
                    area.NextTick += area.Slot.Spec.AreaTickSeconds;
                    TickArea(area.Slot, area.Center);
                }
            }
        }

        private int TickArea(Slot slot, Vector3 center)
        {
            if (_service == null)
            {
                return 0;
            }

            AbilitySpec spec = slot.Spec;
            AttackProfile profile = Profile(slot, 1f);
            IReadOnlyList<Combatant> all = _service.Combatants;
            int hits = 0;
            for (int i = 0; i < all.Count; i++)
            {
                Combatant target = all[i];
                if (!IsInside(target, center, spec.AreaRadius))
                {
                    continue;
                }

                // Burning ground sets oil puddles and barrels alight like any fire hit (GDD 03 6.6).
                Strike(slot.Attack, profile, target, center);
                hits++;
            }

            CountHits(spec.Id, hits);
            return hits;
        }

        private void TickStrikes(float deltaTime)
        {
            for (int i = _strikes.Count - 1; i >= 0; i--)
            {
                PendingStrike strike = _strikes[i];
                strike.Delay -= deltaTime;
                if (strike.Delay > 0f)
                {
                    continue;
                }

                _strikes.RemoveAt(i);
                if (strike.AroundCaster)
                {
                    PulseCone(strike.Slot);
                }
                else
                {
                    Land(strike.Slot, strike.Point);
                }
            }
        }

        private void Land(Slot slot, Vector3 point)
        {
            AbilitySpec spec = slot.Spec;
            int hits = 0;
            if (_service != null)
            {
                AttackProfile profile = Profile(slot, 1f);
                IReadOnlyList<Combatant> all = _service.Combatants;
                for (int i = 0; i < all.Count; i++)
                {
                    Combatant target = all[i];
                    if (IsInside(target, point, spec.StrikeRadius))
                    {
                        Strike(slot.Attack, profile, target, point + Vector3.up * 8f);
                        hits++;
                    }
                }
            }

            if (slot.Visual != null)
            {
                _chainPoints[0] = point + new Vector3(0.6f, 14f, 0.4f);
                _chainPoints[1] = point;
                slot.Visual.ShowBeam(_chainPoints, 2);
                slot.Visual.PlayImpact(point);
            }

            CountHits(spec.Id, hits);
            if (hits > 0)
            {
                LastHitCount += hits;
            }
        }

        private void TickAura(float deltaTime)
        {
            if (!_buffs.IsActive(AbilityBuffKind.FireMantle) || _service == null)
            {
                return;
            }

            _auraTimer -= deltaTime;
            if (_auraTimer > 0f)
            {
                return;
            }

            // Glutmantel: the fire aura builds up burning on enemies close by (buff build-up per second).
            _auraTimer = AuraTickSeconds;
            float amount = _buffs.Buildup(AbilityBuffKind.FireMantle) * AuraTickSeconds;
            if (amount <= 0f)
            {
                return;
            }

            IReadOnlyList<Combatant> all = _service.Combatants;
            Vector3 position = transform.position;
            for (int i = 0; i < all.Count; i++)
            {
                Combatant target = all[i];
                if (IsHostile(target) && IsInside(target, position, AuraRadius))
                {
                    target.Status.Add(StatusEffectId.Burning, amount);
                }
            }
        }

        private void OnBuffStarted(AbilityBuffKind kind)
        {
            float value = _buffs.Value(kind);
            switch (kind)
            {
                case AbilityBuffKind.FireMantle:
                    if (combat != null)
                    {
                        combat.MeleeFireShare = value;
                    }

                    _auraTimer = 0f;
                    break;
                case AbilityBuffKind.IceArmor:
                    if (stats != null && stats.Stats != null && !_armorApplied)
                    {
                        _armorBuff = StatModifier.PercentAdd(StatId.Armor, value, BuffSource + ".eispanzer");
                        stats.Stats.AddModifier(_armorBuff);
                        _armorApplied = true;
                    }

                    break;
                case AbilityBuffKind.StormStep:
                    if (stats != null && stats.Stats != null && !_speedApplied)
                    {
                        _speedBuff = StatModifier.PercentAdd(StatId.MoveSpeed, value, BuffSource + ".sturmschritt");
                        stats.Stats.AddModifier(_speedBuff);
                        _speedApplied = true;
                    }

                    break;
                case AbilityBuffKind.Guard:
                    if (stats != null && stats.Stats != null && !_guardApplied)
                    {
                        _guardBuff = StatModifier.PercentAdd(StatId.Armor, value, BuffSource + ".spott");
                        stats.Stats.AddModifier(_guardBuff);
                        _guardApplied = true;
                    }

                    break;
            }
        }

        private void OnBuffEnded(AbilityBuffKind kind)
        {
            switch (kind)
            {
                case AbilityBuffKind.FireMantle:
                    if (combat != null)
                    {
                        combat.MeleeFireShare = 0f;
                    }

                    break;
                case AbilityBuffKind.IceArmor:
                    if (_armorApplied && stats != null && stats.Stats != null)
                    {
                        stats.Stats.RemoveModifier(_armorBuff);
                    }

                    _armorApplied = false;
                    break;
                case AbilityBuffKind.StormStep:
                    if (_speedApplied && stats != null && stats.Stats != null)
                    {
                        stats.Stats.RemoveModifier(_speedBuff);
                    }

                    _speedApplied = false;
                    break;
                case AbilityBuffKind.Guard:
                    if (_guardApplied && stats != null && stats.Stats != null)
                    {
                        stats.Stats.RemoveModifier(_guardBuff);
                    }

                    _guardApplied = false;
                    break;
            }

            for (int i = 0; i < _slots.Length; i++)
            {
                if (_slots[i].Spec.Kind == AbilityKind.SelfBuff && _slots[i].Spec.BuffKind == kind && _slots[i].Visual != null)
                {
                    _slots[i].Visual.HideLasting();
                }
            }
        }

        private void OnHitLanded(HitReport report)
        {
            if (report.Attack == null || report.Attack.IsProjectile || report.Defense == DefenseOutcome.Parried)
            {
                return;
            }

            if (report.Attacker == combatant && report.Target != null && report.Target != combatant && report.Defense == DefenseOutcome.Hit &&
                _buffs.IsActive(AbilityBuffKind.FireMantle) && !IsAbilityAttack(report.Attack))
            {
                // Glutmantel: melee hits set the target alight.
                report.Target.Status.Add(StatusEffectId.Burning, MantleMeleeBurning);
            }
            else if (report.Target == combatant && report.Attacker != null && report.Attacker != combatant && _buffs.IsActive(AbilityBuffKind.IceArmor))
            {
                // Eispanzer (GDD 03 6.4): attackers build up freezing.
                report.Attacker.Status.Add(StatusEffectId.Freezing, _buffs.Buildup(AbilityBuffKind.IceArmor));
            }
        }

        private void OnDodged(bool roll)
        {
            if (!roll || !_buffs.IsActive(AbilityBuffKind.StormStep) || _service == null)
            {
                return;
            }

            // Sturmschritt (GDD 03 6.4): the roll leaves a shock pulse where it started.
            Vector3 position = transform.position;
            IReadOnlyList<Combatant> all = _service.Combatants;
            for (int i = 0; i < all.Count; i++)
            {
                Combatant target = all[i];
                if (IsHostile(target) && IsInside(target, position, StormPulseRadius))
                {
                    target.Status.Add(StatusEffectId.Shock, StormPulseShock);
                }
            }

            for (int i = 0; i < _slots.Length; i++)
            {
                if (_slots[i].Spec.BuffKind == AbilityBuffKind.StormStep && _slots[i].Visual != null)
                {
                    _slots[i].Visual.PlayImpact(position);
                }
            }
        }

        private bool IsAbilityAttack(AttackSpec attack)
        {
            for (int i = 0; i < _slots.Length; i++)
            {
                if (_slots[i].Attack == attack || _slots[i].Explosion == attack)
                {
                    return true;
                }
            }

            return false;
        }

        private void Strike(AttackSpec attack, in AttackProfile profile, Combatant target, Vector3 from)
        {
            target.ReceiveHit(new IncomingHit
            {
                Attacker = combatant,
                Attack = attack,
                Profile = profile,
                Zone = HitZone.Body,
                Point = target.TargetPosition,
                AttackerPosition = from
            });
        }

        private AttackProfile Profile(Slot slot, float factor)
        {
            // GDD 03 10.3: spells use the power of the staff × (1 + 0.025 × E(Int)) – the staff damage with the staff's
            // attribute scaling – and without a magic weapon the spell power of the stats (it holds the intelligence already).
            // The Aether-Stoß uses max(weapon damage, spell power) (GDD 03 6.5).
            AbilitySpec spec = slot.Spec;
            float weaponDamage = combat != null ? combat.WeaponDamage : 0f;
            AttributeScaling scaling = AttributeScaling.None;
            float reference;
            if (spec.ScalesWithWeapon)
            {
                float spellPower = SpellPower();
                reference = Mathf.Max(weaponDamage, spellPower);
                if (combat != null && weaponDamage >= spellPower)
                {
                    scaling = combat.WeaponScaling;
                }
            }
            else if (HasMagicWeapon())
            {
                reference = weaponDamage;
                scaling = combat.WeaponScaling;
            }
            else
            {
                reference = SpellPower();
            }

            float bonus = _modifiers != null ? _modifiers.DamageFactor(spec.Element) : 1f;
            return new AttackProfile(spec.Split(reference * factor * bonus), scaling, spec.PoiseDamage * factor);
        }

        private float Reference(AbilitySpec spec)
        {
            float weaponDamage = combat != null ? combat.WeaponDamage : 0f;
            if (spec.ScalesWithWeapon)
            {
                return Mathf.Max(weaponDamage, SpellPower());
            }

            return HasMagicWeapon() ? weaponDamage : SpellPower();
        }

        private float SpellPower()
        {
            return stats != null && stats.Stats != null ? stats.Stats.Get(StatId.SpellPower) : 0f;
        }

        private bool HasMagicWeapon()
        {
            return combat != null && combat.CurrentWeaponType == Aetherfall.Items.WeaponType.Staff && combat.WeaponDamage > 0f;
        }

        private Combatant FindTarget(float range, bool hostileOnly)
        {
            Combatant locked = combat != null ? combat.LockedTarget : null;
            Vector3 position = transform.position;
            if (locked != null && locked.IsTargetable && (!hostileOnly || CombatTeams.CanDamage(combatant.Team, locked.Team)))
            {
                Vector3 point = locked.transform.position;
                if (CombatMath.PlanarDistance(position.x, position.z, point.x, point.z) <= range)
                {
                    return locked;
                }
            }

            if (_service == null)
            {
                return combat != null ? combat.FindNearestEnemy(range) : null;
            }

            // The nearest real enemy (not a barrel or a puddle) within range.
            IReadOnlyList<Combatant> all = _service.Combatants;
            Combatant best = null;
            float bestDistance = range;
            for (int i = 0; i < all.Count; i++)
            {
                Combatant candidate = all[i];
                if (!IsHostile(candidate) || !candidate.IsTargetable)
                {
                    continue;
                }

                Vector3 point = candidate.transform.position;
                float distance = CombatMath.PlanarDistance(position.x, position.z, point.x, point.z);
                if (distance <= bestDistance)
                {
                    best = candidate;
                    bestDistance = distance;
                }
            }

            return best;
        }

        private int CollectHostiles(Combatant first)
        {
            int count = 0;
            if (_service == null)
            {
                return 0;
            }

            IReadOnlyList<Combatant> all = _service.Combatants;
            for (int i = 0; i < all.Count && count < _candidates.Length; i++)
            {
                Combatant candidate = all[i];
                if (!IsHostile(candidate) || !candidate.IsTargetable)
                {
                    continue;
                }

                Vector3 point = candidate.transform.position;
                _candidates[count] = candidate;
                _xs[count] = point.x;
                _zs[count] = point.z;
                _used[count] = candidate == first;
                count++;
            }

            return count;
        }

        private int NearestInArea(Vector3 center, float radius, int count)
        {
            int best = -1;
            float bestDistance = radius + BodyRadius;
            for (int i = 0; i < count; i++)
            {
                if (_used[i])
                {
                    continue;
                }

                float distance = CombatMath.PlanarDistance(center.x, center.z, _xs[i], _zs[i]);
                if (distance <= bestDistance)
                {
                    best = i;
                    bestDistance = distance;
                }
            }

            return best;
        }

        private void ResetUsed(int count)
        {
            for (int i = 0; i < count; i++)
            {
                _used[i] = false;
            }
        }

        private void ClearCandidates(int count)
        {
            for (int i = 0; i < count; i++)
            {
                _candidates[i] = null;
            }
        }

        private bool IsHostile(Combatant candidate)
        {
            return candidate != null && candidate != combatant && candidate.IsAlive && candidate.isActiveAndEnabled && candidate.Team != CombatTeam.Neutral &&
                   CombatTeams.CanDamage(combatant.Team, candidate.Team);
        }

        private bool IsInside(Combatant target, Vector3 center, float radius)
        {
            if (target == null || target == combatant || !target.IsAlive || !target.isActiveAndEnabled || !CombatTeams.CanDamage(combatant.Team, target.Team))
            {
                return false;
            }

            Vector3 point = target.transform.position;
            return CombatMath.PlanarDistance(center.x, center.z, point.x, point.z) <= radius + BodyRadius && Mathf.Abs(point.y - center.y) <= AreaHeightTolerance;
        }

        private Vector3 PlacePoint(AbilitySpec spec, Combatant target)
        {
            if (target != null)
            {
                return Ground(target.transform.position);
            }

            float distance = Mathf.Min(spec.Range, 6f);
            return Ground(transform.position + Quaternion.Euler(0f, _yaw, 0f) * Vector3.forward * distance);
        }

        private Vector3 Ground(Vector3 point)
        {
            if (Physics.Raycast(point + Vector3.up * GroundProbeHeight, Vector3.down, out RaycastHit hit, GroundProbeHeight * 2f, groundLayers,
                    QueryTriggerInteraction.Ignore))
            {
                return hit.point;
            }

            return point;
        }

        private void Publish(string abilityId, string targetId, Vector3 point)
        {
            if (_bus != null)
            {
                _bus.Publish(new AbilityUsedAt(abilityId, targetId, point));
            }
        }

        private void CountHits(string abilityId, int hits)
        {
            if (hits <= 0)
            {
                return;
            }

            _hitTotals.TryGetValue(abilityId, out int total);
            _hitTotals[abilityId] = total + hits;
        }

        private void CancelEverything()
        {
            if (_casting != null)
            {
                _casting.Runner.Cancel();
                _casting = null;
            }

            _castTarget = null;
            for (int i = 0; i < _areas.Count; i++)
            {
                if (_areas[i].Slot.Visual != null)
                {
                    _areas[i].Slot.Visual.HideLasting();
                }
            }

            _areas.Clear();
            _strikes.Clear();
            _buffs.Clear();
        }

        private float FacingYaw()
        {
            return combat != null ? combat.FacingYaw : transform.eulerAngles.y;
        }

        private float YawTo(Vector3 point)
        {
            Vector3 position = transform.position;
            return CombatMath.YawOf(point.x - position.x, point.z - position.z);
        }

        private Slot Find(string abilityId)
        {
            if (string.IsNullOrEmpty(abilityId))
            {
                return null;
            }

            for (int i = 0; i < _slots.Length; i++)
            {
                if (_slots[i].Spec.Id == abilityId)
                {
                    return _slots[i];
                }
            }

            return null;
        }

        private static Slot FindIn(List<Slot> slots, string abilityId)
        {
            for (int i = 0; i < slots.Count; i++)
            {
                if (slots[i].Spec.Id == abilityId)
                {
                    return slots[i];
                }
            }

            return null;
        }

        private static void AddAll(HashSet<string> set, string[] values)
        {
            if (values == null)
            {
                return;
            }

            for (int i = 0; i < values.Length; i++)
            {
                if (!string.IsNullOrEmpty(values[i]))
                {
                    set.Add(values[i]);
                }
            }
        }

        /// <summary>One ability at run time: its data, time line, attack and look.</summary>
        private sealed class Slot
        {
            public Slot(AbilityLoadoutEntry entry, AbilitySpec spec)
            {
                Entry = entry;
                BaseSpec = spec;
                Runner = new AbilityRunner(spec);
                Visual = entry.Visual;
                Use(spec);
            }

            public AbilityLoadoutEntry Entry { get; }

            /// <summary>Data of the asset.</summary>
            public AbilitySpec BaseSpec { get; }

            /// <summary>Data with the skill tree upgrades (times and mana stay those of the base data).</summary>
            public AbilitySpec Spec { get; private set; }

            public AbilityRunner Runner { get; }

            public AttackSpec Attack { get; private set; }

            public AttackSpec Explosion { get; private set; }

            public void Use(AbilitySpec spec)
            {
                Spec = spec;
                Attack = spec.CreateAttack();
                Explosion = spec.CreateExplosionAttack();
            }

            public AbilityVisual Visual { get; }
        }

        /// <summary>Burning ground that ticks until it runs out.</summary>
        private sealed class GroundArea
        {
            public GroundArea(Slot slot, Vector3 center, float seconds)
            {
                Slot = slot;
                Center = center;
                Remaining = seconds;
                NextTick = slot.Spec.AreaTickSeconds;
            }

            public Slot Slot { get; }

            public Vector3 Center { get; }

            public float Remaining { get; set; }

            public float NextTick { get; set; }
        }

        /// <summary>A lightning strike, or a further hit of a cone around the caster (Wirbelklinge), waiting for its moment.</summary>
        private sealed class PendingStrike
        {
            public PendingStrike(Slot slot, Vector3 point, float delay, bool aroundCaster = false)
            {
                Slot = slot;
                Point = point;
                Delay = delay;
                AroundCaster = aroundCaster;
            }

            public Slot Slot { get; }

            public Vector3 Point { get; }

            public bool AroundCaster { get; }

            public float Delay { get; set; }
        }
    }
}
