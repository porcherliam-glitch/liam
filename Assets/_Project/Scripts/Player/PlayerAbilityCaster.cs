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
    /// The player's ability on slot 4 of the first bar (key 4, RB + A; GDD 03 6.5, 1411): the Aether-Stoß. A press starts the
    /// wind-up if the ability is learned, the character is free (no attack, dodge, block, stagger, on the ground), the cooldown
    /// is over and the mana suffices; at the end of the wind-up the mana is paid, every enemy in the cone in front is hit
    /// (half Aether, half blunt damage, poise, knockback), <c>AbilityUsedAt</c> is sent for each target and the effect plays.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the player root next to <see cref="PlayerCombatController"/> (execution order −45, before it, so the
    /// cast pose is set in the same frame). The menus "Testgelände/Eichental/Gruft erstellen" add it.</para>
    /// <para>Learned: from the world flag <c>unlockFlag</c> (Eichental: the Aether power from the rift in "Asche über
    /// Eichental"); empty = from the start (test ground). The flag lives in the world state and is saved with it.</para>
    /// <para>Aim: the lock-on target, else the nearest enemy within the range plus one metre, else straight ahead. Every use
    /// adds +2 to the player's corruption bar (<see cref="Combatant.Status"/>, GDD 01 A3).</para>
    /// </remarks>
    [DefaultExecutionOrder(-45)]
    [DisallowMultipleComponent]
    public sealed class PlayerAbilityCaster : MonoBehaviour
    {
        private const float PushGestureShare = 0.35f;
        private const float FlashSeconds = 0.35f;

        [Tooltip("Fähigkeit auf Platz 4 (Assets/_Project/Data/Combat/Abilities/Aether_Stoss.asset).")]
        [SerializeField] private AbilityDefinition ability = null;

        [Tooltip("Welt-Flag, ab dem die Fähigkeit gelernt ist (Eichental: flag.eichental.aether_kraft). Leer = von Anfang an (Testgelände).")]
        [SerializeField] private string unlockFlag = "";

        [Tooltip("Kampf-Wurzel der Figur. Leer = Combatant am selben GameObject.")]
        [SerializeField] private Combatant combatant = null;

        [Tooltip("Werte mit Mana und Zauberkraft. Leer = CharacterStatsComponent am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Kampfsteuerung (frei für Fähigkeiten, Zielhilfe, Waffenschaden). Leer = PlayerCombatController am selben GameObject.")]
        [SerializeField] private PlayerCombatController combat = null;

        [Header("Darstellung (optional)")]
        [Tooltip("Figur für die Stoß-Bewegung.")]
        [SerializeField] private HumanoidPuppet puppet = null;

        [Tooltip("Partikel des Stoßes (zeigen entlang +Z des Objekts).")]
        [SerializeField] private ParticleSystem effect = null;

        [Tooltip("Lichtblitz beim Stoß.")]
        [SerializeField] private Light flash = null;

        private readonly List<Combatant> _hits = new List<Combatant>(8);
        private AbilitySpec _spec;
        private AbilityRunner _runner;
        private AttackSpec _attack;
        private IGameplayInput _gameplay;
        private IGameStateService _gameState;
        private ICombatService _service;
        private IEventBus _bus;
        private IWorldState _world;
        private float _yaw;
        private float _flashTimer;
        private float _flashIntensity;

        /// <summary>Ability data (null if the setup is invalid).</summary>
        public AbilitySpec Spec => _spec;

        /// <summary>Time line and cooldown (null if the setup is invalid).</summary>
        public AbilityRunner Runner => _runner;

        /// <summary>True if the ability is learned.</summary>
        public bool IsUnlocked => string.IsNullOrEmpty(unlockFlag) || (_world != null && _world.GetBool(unlockFlag));

        /// <summary>Current mana of the player.</summary>
        public float Mana => stats != null && stats.Mana != null ? stats.Mana.Current : 0f;

        /// <summary>Why the last press did not cast (None if it did).</summary>
        public AbilityRefusal LastRefusal { get; private set; }

        /// <summary>Enemies hit by the last cast.</summary>
        public int LastHitCount { get; private set; }

        /// <summary>Raised when the effect happens (ability id, number of hit enemies).</summary>
        public event Action<string, int> Cast;

        /// <summary>Starts the ability like a press of key 4 (tools and tests use it too).</summary>
        /// <returns>True if the wind-up started; otherwise <see cref="LastRefusal"/> says why not.</returns>
        public bool TryCast()
        {
            if (_runner == null)
            {
                LastRefusal = AbilityRefusal.Locked;
                return false;
            }

            bool free = combat == null || combat.IsFreeForAbility;
            if (!_runner.TryStart(IsUnlocked, free, Mana, out AbilityRefusal refusal))
            {
                LastRefusal = refusal;
                return false;
            }

            LastRefusal = AbilityRefusal.None;
            _yaw = AimYaw();
            if (combat != null)
            {
                combat.SetCastPose(true, _yaw);
            }

            if (puppet != null)
            {
                // The thrust of the gesture comes at the end of the wind-up.
                puppet.Push(_spec.WindupSeconds / PushGestureShare);
            }

            return true;
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

            if (ability == null || combatant == null)
            {
                Log.Error(LogCategory.Player, "PlayerAbilityCaster on '" + name + "' needs an AbilityDefinition and a Combatant " +
                                              "(Aetherfall > Testgelände erstellen sets both).");
                enabled = false;
                return;
            }

            _spec = ability.CreateSpec(out string problem);
            if (_spec == null)
            {
                Log.Error(LogCategory.Player, "PlayerAbilityCaster: " + problem);
                enabled = false;
                return;
            }

            _runner = new AbilityRunner(_spec);
            _attack = _spec.CreateAttack();
            _flashIntensity = flash != null ? flash.intensity : 0f;
            if (flash != null)
            {
                flash.enabled = false;
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
                if (locator.TryGet(out IInputService input))
                {
                    _gameplay = input.Gameplay;
                }

                if (!string.IsNullOrEmpty(unlockFlag) && _world == null)
                {
                    Log.Warning(LogCategory.Player, "PlayerAbilityCaster: no world state registered, '" + unlockFlag + "' cannot be read – " +
                                                    _spec.DisplayName + " stays locked.");
                }
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
            if (_runner != null)
            {
                _runner.Cancel();
            }

            if (combat != null)
            {
                combat.SetCastPose(false, _yaw);
            }
        }

        private void Update()
        {
            float deltaTime = Time.deltaTime;
            bool playing = _gameState != null && _gameState.Current == GameState.Playing;
            if (_runner.Phase == AbilityPhase.Windup && (!combatant.IsAlive || (combat != null && combat.StateMachine != null &&
                                                                                 combat.StateMachine.State != CombatStateId.Idle)))
            {
                // Hit out of the wind-up (stagger) or dead: no effect, no cooldown.
                _runner.Cancel();
            }

            if (playing && _gameplay != null && _gameplay.IsActive && _gameplay.WasPressedThisFrame(GameplayButton.Ability4))
            {
                TryCast();
            }

            if (_runner.Tick(deltaTime))
            {
                Release();
            }

            if (combat != null)
            {
                combat.SetCastPose(_runner.IsCasting, _yaw);
            }

            UpdateFlash(deltaTime);
        }

        private void Release()
        {
            ResourcePool mana = stats != null ? stats.Mana : null;
            if (mana != null)
            {
                mana.Spend(_spec.ManaCost);
            }

            // GDD 01 A3 / GDD 03 6.5: every use of an Aether ability adds +2 corruption.
            combatant.Status.AddCorruption(_spec.Corruption);

            // The lock-on target may have moved during the wind-up.
            Combatant locked = combat != null ? combat.LockedTarget : null;
            if (locked != null)
            {
                _yaw = YawTo(locked.transform.position);
            }

            Vector3 position = transform.position;
            float weaponDamage = combat != null ? combat.WeaponDamage : 0f;
            float spellPower = stats != null ? stats.Stats.Get(StatId.SpellPower) : 0f;
            var profile = new AttackProfile(_spec.BaseDamage(weaponDamage, spellPower), AttributeScaling.None, _spec.PoiseDamage);
            CombatantQueries.FindInCone(_service != null ? _service.Combatants : null, combatant, _yaw, _spec.Range, _spec.HalfAngle, _hits);
            for (int i = 0; i < _hits.Count; i++)
            {
                Combatant target = _hits[i];
                var hit = new IncomingHit
                {
                    Attacker = combatant,
                    Attack = _attack,
                    Profile = profile,
                    Zone = HitZone.Body,
                    Point = target.TargetPosition,
                    AttackerPosition = position
                };
                target.ReceiveHit(hit);
                Publish(target.CombatantId, target.transform.position);
            }

            if (_hits.Count == 0)
            {
                Publish(string.Empty, position + Quaternion.Euler(0f, _yaw, 0f) * Vector3.forward * (_spec.Range * 0.5f));
            }

            LastHitCount = _hits.Count;
            PlayEffect();
            Cast?.Invoke(_spec.Id, _hits.Count);
            _hits.Clear();
        }

        private void Publish(string targetId, Vector3 point)
        {
            if (_bus != null)
            {
                _bus.Publish(new AbilityUsedAt(_spec.Id, targetId, point));
            }
        }

        private float AimYaw()
        {
            if (combat == null)
            {
                return transform.eulerAngles.y;
            }

            Combatant target = combat.LockedTarget;
            if (target == null)
            {
                target = combat.FindNearestEnemy(_spec.Range + 1f);
            }

            return target != null ? YawTo(target.transform.position) : combat.FacingYaw;
        }

        private float YawTo(Vector3 point)
        {
            Vector3 position = transform.position;
            return CombatMath.YawOf(point.x - position.x, point.z - position.z);
        }

        private void PlayEffect()
        {
            if (effect != null)
            {
                effect.transform.rotation = Quaternion.Euler(0f, _yaw, 0f);
                effect.Play(true);
            }

            if (flash != null)
            {
                flash.enabled = true;
                flash.intensity = _flashIntensity;
                _flashTimer = FlashSeconds;
            }
        }

        private void UpdateFlash(float deltaTime)
        {
            if (flash == null || _flashTimer <= 0f)
            {
                return;
            }

            _flashTimer -= deltaTime;
            flash.intensity = _flashIntensity * Mathf.Clamp01(_flashTimer / FlashSeconds);
            if (_flashTimer <= 0f)
            {
                flash.enabled = false;
            }
        }
    }
}
