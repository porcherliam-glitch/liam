using System;
using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Input;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// The bow of the ranged slot (GDD 03 6.1, 1.3 K6): F switches the ranged stance on and off (on the gamepad LT enters it by
    /// itself). In the stance the right mouse button aims over the shoulder (crosshair, the body follows the camera), holding
    /// the left mouse button draws the string (0–0.8 s: 40–100 % damage, 35–70 m/s) and releasing it shoots towards the
    /// crosshair; without aiming the left button is a hip shot (0.45 s, 50 %, at the lock-on target or the nearest one in a 15°
    /// cone up to 20 m). Every shot takes one arrow of the selected type from the bag and 4 stamina; a dodge or a stagger takes
    /// the arrow off the string. The mouse wheel (D-pad left/right) switches between the arrow types the bag holds (GDD 03 6.2:
    /// wooden arrow, fire arrow with 40 % fire and burning 35). The draw rules live in <see cref="BowDraw"/>.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the player root. Runs before <see cref="PlayerCombatController"/> (order -45), which ignores the
    /// attack and block buttons while the stance is on (<see cref="PlayerCombatController.SetRangedStance"/>).
    /// <see cref="PlayerEquipment"/> shows the bow in the hand or on the back; the camera zooms in while aiming (AimCamera).</para>
    /// <para>The arrow flies from its own <see cref="ProjectileLauncher"/> (a child at the bow hand) with the values of the
    /// "Pfeil" attack, copied per shot with the draw's damage and speed; damage W comes from the equipped bow, type stab,
    /// dexterity 1.0 (GDD 03 5.3). GDD 03 6.1 "50 % aufsammelbar": half of the wooden arrows fall to the ground where they hit a
    /// wall, or from the body once the enemy they stuck in dies (<see cref="ILootService.DropNew"/>); special arrows never.</para>
    /// </remarks>
    [DefaultExecutionOrder(-45)]
    [DisallowMultipleComponent]
    public sealed class PlayerBow : MonoBehaviour
    {
        private const float BowPoise = 5f;
        private const float HipShotRange = 20f;
        private const float HipShotHalfAngle = 15f;
        private const float AimHeight = 1.25f;

        [Tooltip("Kampfsteuerung (ignoriert in der Haltung Angriff und Block). Leer = am selben GameObject.")]
        [SerializeField] private PlayerCombatController combat = null;

        [Tooltip("Ausrüstung (angelegter Bogen, Inventar, Bogen-Modelle). Leer = am selben GameObject.")]
        [SerializeField] private PlayerEquipment equipment = null;

        [Tooltip("Kampf-Wurzel der Figur. Leer = am selben GameObject.")]
        [SerializeField] private Combatant combatant = null;

        [Tooltip("Werte der Figur (Ausdauer). Leer = am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Lock-On (Ziel des Hüftschusses). Leer = am selben GameObject.")]
        [SerializeField] private PlayerLockOn lockOn = null;

        [Tooltip("Transform der Main Camera: das Fadenkreuz liegt in der Bildmitte.")]
        [SerializeField] private Transform cameraTransform = null;

        [Tooltip("Abschuss der Pfeile (eigener ProjectileLauncher an der Bogenhand).")]
        [SerializeField] private ProjectileLauncher launcher = null;

        [Tooltip("Werte des Pfeils (Geschoss: Fall 4,9 m/s², Reichweite, Radius; Schaden und Tempo setzt das Spannen).")]
        [SerializeField] private AttackDefinition arrow = null;

        [Tooltip("Pfeilarten (GDD 03 6.2): Holzpfeil, Feuerpfeil … Das Mausrad bzw. das Steuerkreuz wechselt in der Haltung.")]
        [SerializeField] private ArrowAmmo[] ammoTypes = { new ArrowAmmo("item.ammo.pfeil_holz", "Holzpfeil", 0f, 0f, true) };

        [Tooltip("Anteil der Holzpfeile, die nach dem Schuss wieder aufgesammelt werden können (GDD 03 6.1: 50 %).")]
        [Range(0f, 1f)] [SerializeField] private float recoverChance = 0.5f;

        [Tooltip("Woran das Fadenkreuz hängen bleibt: Boden, Wände und Trefferzonen.")]
        [SerializeField] private LayerMask aimLayers = (1 << 11) | (1 << 9);

        [Tooltip("Größte Zielentfernung in Metern (effektive Reichweite des Bogens 60 m).")]
        [Range(10f, 120f)] [SerializeField] private float maxAimDistance = 60f;

        private readonly BowDraw _draw = new BowDraw();
        private readonly RaycastHit[] _hits = new RaycastHit[16];
        private readonly List<Combatant> _cone = new List<Combatant>(8);
        private readonly System.Random _random = new System.Random();
        private IGameplayInput _gameplay;
        private IGameStateService _gameState;
        private ICombatService _service;
        private AttackSpec _arrowSpec;
        private bool _stance;
        private bool _autoStance;
        private bool _aimHeld;
        private bool _firePressed;
        private bool _fireHeld;
        private bool _aiming;
        private bool _scripted;
        private float _scriptedDraw;
        private Vector3 _scriptedPoint;
        private Vector3 _hipPoint;
        private float _hipYaw;
        private bool _warnedNoArrows;
        private int _ammoIndex;
        private bool _wheelLatched;
        private ILootService _loot;
        private readonly Dictionary<Projectile, int> _arrowAmmo = new Dictionary<Projectile, int>();
        private readonly List<Combatant> _stuckIn = new List<Combatant>(8);
        private readonly List<int> _stuckCounts = new List<int>(8);

        /// <summary>True while the ranged stance is on.</summary>
        public bool InStance => _stance;

        /// <summary>True while aiming over the shoulder (camera zoom, crosshair).</summary>
        public bool IsAiming => _stance && _aiming;

        /// <summary>Draw 0–1 (hip shot: progress to the shot).</summary>
        public float Draw01 => _draw.Draw01;

        /// <summary>True while an arrow is on the string.</summary>
        public bool IsDrawing => _draw.IsBusy;

        /// <summary>True if a bow is equipped.</summary>
        public bool HasBow => equipment != null && equipment.HasBow;

        /// <summary>Arrows of the selected type in the bag.</summary>
        public int Arrows => CountOf(CurrentAmmo);

        /// <summary>Selected arrow type (null if none is configured).</summary>
        public ArrowAmmo CurrentAmmo => ammoTypes != null && ammoTypes.Length > 0 ? ammoTypes[Mathf.Clamp(_ammoIndex, 0, ammoTypes.Length - 1)] : null;

        /// <summary>Item id of the selected arrows.</summary>
        public string AmmoItemId => CurrentAmmo != null ? CurrentAmmo.ItemId : string.Empty;

        /// <summary>Name of the selected arrows.</summary>
        public string AmmoName => CurrentAmmo != null ? CurrentAmmo.DisplayName : string.Empty;

        /// <summary>Arrows that will drop where they stuck once the enemy dies (tests, tools).</summary>
        public int PendingRecoveredArrows
        {
            get
            {
                int sum = 0;
                for (int i = 0; i < _stuckCounts.Count; i++)
                {
                    sum += _stuckCounts[i];
                }

                return sum;
            }
        }

        /// <summary>Arrows dropped into the world to be gathered again so far (tests, tools).</summary>
        public int RecoveredArrowsDropped { get; private set; }

        /// <summary>Share of recoverable arrows that can be gathered again (0.5; tools set 1 for a sure check).</summary>
        public float RecoverChance
        {
            get => recoverChance;
            set => recoverChance = Mathf.Clamp01(value);
        }

        /// <summary>Selects the next arrow type the bag has (mouse wheel, D-pad; also tools).</summary>
        /// <param name="direction">+1 next, −1 previous.</param>
        /// <returns>True if the selection changed.</returns>
        public bool CycleAmmo(int direction)
        {
            if (ammoTypes == null || ammoTypes.Length < 2)
            {
                return false;
            }

            int count = ammoTypes.Length;
            for (int step = 1; step < count; step++)
            {
                int index = ((_ammoIndex + direction * step) % count + count) % count;
                if (CountOf(ammoTypes[index]) > 0)
                {
                    _ammoIndex = index;
                    Log.Info(LogCategory.Player, "PlayerBow: " + ammoTypes[index].DisplayName + " selected (" + CountOf(ammoTypes[index]) + ").");
                    return true;
                }
            }

            return false;
        }

        /// <summary>Selects an arrow type by item id (tools).</summary>
        /// <param name="itemId">Item id.</param>
        /// <returns>False if the bow has no such type.</returns>
        public bool SelectAmmo(string itemId)
        {
            for (int i = 0; ammoTypes != null && i < ammoTypes.Length; i++)
            {
                if (ammoTypes[i] != null && ammoTypes[i].ItemId == itemId)
                {
                    _ammoIndex = i;
                    return true;
                }
            }

            return false;
        }

        private int CountOf(ArrowAmmo ammo)
        {
            IInventoryService inventory = equipment != null ? equipment.Inventory : null;
            return ammo != null && inventory != null ? inventory.CountInBag(InventoryOwners.Player, ammo.ItemId) : 0;
        }

        /// <summary>Arrows shot so far (tests, tools).</summary>
        public int ShotsFired { get; private set; }

        /// <summary>Values of the last shot.</summary>
        public BowShot LastShot { get; private set; }

        /// <summary>The arrow shot last, or null.</summary>
        public Projectile LastArrow => launcher != null ? launcher.LastFired : null;

        /// <summary>Pitch of the aim in degrees (positive = down), for the arm pose.</summary>
        public float AimPitch
        {
            get
            {
                if (cameraTransform == null)
                {
                    return 0f;
                }

                return Mathf.DeltaAngle(0f, cameraTransform.eulerAngles.x);
            }
        }

        /// <summary>Switches the ranged stance on (also from tools).</summary>
        /// <param name="reason">Why not, if it fails.</param>
        /// <returns>False without a bow.</returns>
        public bool TryEnterStance(out string reason)
        {
            EnterStance(false);
            reason = _stance ? string.Empty : "Kein Bogen angelegt und keiner in der Tasche.";
            return _stance;
        }

        /// <summary>Switches the ranged stance off; an arrow on the string is taken off.</summary>
        public void LeaveStance()
        {
            _draw.Cancel();
            _stance = false;
            _autoStance = false;
            _aiming = false;
            _scripted = false;
            Sync();
        }

        /// <summary>
        /// Shoots one aimed arrow at <paramref name="point"/> after drawing <paramref name="drawSeconds"/> (tools and the
        /// play-through; the player aims with the camera instead). Enters the stance if needed.
        /// </summary>
        /// <param name="point">Aimed point.</param>
        /// <param name="drawSeconds">Draw time (0.8 s = full).</param>
        /// <param name="reason">Why not, if it fails.</param>
        /// <returns>False without a bow or arrows, or while an arrow is on the string.</returns>
        public bool ShootAt(Vector3 point, float drawSeconds, out string reason)
        {
            if (!TryEnterStance(out reason))
            {
                return false;
            }

            if (Arrows <= 0 && !CycleAmmo(1))
            {
                reason = "Keine Pfeile in der Tasche (" + AmmoItemId + ").";
                return false;
            }

            if (_draw.IsBusy || _scripted)
            {
                reason = "Es liegt schon ein Pfeil auf der Sehne.";
                return false;
            }

            _scripted = true;
            _scriptedPoint = point;
            _scriptedDraw = Mathf.Max(0.01f, drawSeconds);
            return true;
        }

        private void Awake()
        {
            if (combat == null)
            {
                TryGetComponent(out combat);
            }

            if (equipment == null)
            {
                TryGetComponent(out equipment);
            }

            if (combatant == null)
            {
                TryGetComponent(out combatant);
            }

            if (stats == null)
            {
                TryGetComponent(out stats);
            }

            if (lockOn == null)
            {
                TryGetComponent(out lockOn);
            }

            if (arrow == null || launcher == null)
            {
                Log.Warning(LogCategory.Player, "PlayerBow on '" + name + "': arrow attack or launcher missing; the bow cannot shoot.");
                enabled = false;
                return;
            }

            _arrowSpec = arrow.CreateSpec();
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                locator.TryGet(out _service);
                locator.TryGet(out _loot);
                if (locator.TryGet(out IInputService input))
                {
                    _gameplay = input.Gameplay;
                }
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerBow could not resolve its services.");
            }
        }

        private void OnEnable()
        {
            if (launcher != null)
            {
                launcher.Impacted += OnArrowImpacted;
            }
        }

        private void OnDisable()
        {
            if (launcher != null)
            {
                launcher.Impacted -= OnArrowImpacted;
            }

            if (_stance)
            {
                LeaveStance();
            }
        }

        /// <summary>
        /// GDD 03 6.1: wooden arrows can be gathered again (50 %): from the ground where they hit a wall, from the body once the
        /// enemy it stuck in dies; special arrows never.
        /// </summary>
        private void OnArrowImpacted(Projectile projectile)
        {
            if (!_arrowAmmo.TryGetValue(projectile, out int index))
            {
                return;
            }

            _arrowAmmo.Remove(projectile);
            ArrowAmmo ammo = ammoTypes != null && index >= 0 && index < ammoTypes.Length ? ammoTypes[index] : null;
            if (ammo == null || !ammo.Recoverable || _random.NextDouble() >= recoverChance)
            {
                return;
            }

            Combatant hit = projectile.LastHit;
            if (hit != null && hit.Team != CombatTeam.Neutral && hit.IsAlive)
            {
                int at = _stuckIn.IndexOf(hit);
                if (at < 0)
                {
                    _stuckIn.Add(hit);
                    _stuckCounts.Add(1);
                }
                else
                {
                    _stuckCounts[at]++;
                }

                return;
            }

            DropArrows(ammo.ItemId, 1, GroundBelow(hit != null && hit.IsAlive ? projectile.LastImpactPoint : hit != null ? hit.transform.position + Vector3.up : projectile.LastImpactPoint));
        }

        private void DropStuckArrows()
        {
            for (int i = _stuckIn.Count - 1; i >= 0; i--)
            {
                Combatant target = _stuckIn[i];
                if (target != null && target.IsAlive)
                {
                    continue;
                }

                if (target != null)
                {
                    DropArrows(ammoTypes[0].ItemId, _stuckCounts[i], GroundBelow(target.transform.position + Vector3.up));
                }

                _stuckIn.RemoveAt(i);
                _stuckCounts.RemoveAt(i);
            }
        }

        private void DropArrows(string itemId, int count, Vector3 position)
        {
            if (_loot != null && count > 0 && _loot.DropNew(itemId, count, position, "bow"))
            {
                RecoveredArrowsDropped += count;
            }
        }

        private Vector3 GroundBelow(Vector3 point)
        {
            int count = Physics.RaycastNonAlloc(point + Vector3.up * 0.5f, Vector3.down, _hits, 30f, aimLayers, QueryTriggerInteraction.Ignore);
            float best = float.MaxValue;
            Vector3 ground = point;
            for (int i = 0; i < count; i++)
            {
                if (_hits[i].collider != null && !_hits[i].collider.transform.IsChildOf(transform) && _hits[i].distance < best)
                {
                    best = _hits[i].distance;
                    ground = _hits[i].point;
                }
            }

            return ground + Vector3.up * 0.1f;
        }

        private void Update()
        {
            bool alive = combatant == null || combatant.IsAlive;
            bool climbing = combat != null && combat.IsClimbing;
            if (_stance && (!alive || !HasBow || climbing))
            {
                LeaveStance();
            }

            if (_stuckIn.Count > 0)
            {
                DropStuckArrows();
            }

            if (!alive)
            {
                return;
            }

            bool playing = _gameState != null && _gameState.Current == GameState.Playing;
            _firePressed = false;
            if (playing && !climbing && _gameplay != null && _gameplay.IsActive)
            {
                ReadButtons();
            }

            if (_stance)
            {
                TickStance(Time.deltaTime, playing);
            }

            Sync();
        }

        private void ReadButtons()
        {
            if (_gameplay.WasPressedThisFrame(GameplayButton.RangedStance))
            {
                if (_stance)
                {
                    LeaveStance();
                }
                else
                {
                    EnterStance(false);
                }
            }

            bool aimHeld = _gameplay.IsPressed(GameplayButton.Aim);
            // The gamepad has no F: LT enters the stance by itself and leaves it when released (GDD 03 1.3).
            if (!_stance && _gameplay.WasPressedThisFrame(GameplayButton.Aim) && _gameplay.SourceDeviceOf(GameplayButton.Aim) == DeviceKind.Gamepad)
            {
                EnterStance(true);
            }

            if (_stance && _autoStance && !aimHeld && !_draw.IsBusy)
            {
                LeaveStance();
            }

            _aimHeld = _stance && aimHeld;
            _firePressed = _stance && _gameplay.WasPressedThisFrame(GameplayButton.Fire);
            _fireHeld = _stance && _gameplay.IsPressed(GameplayButton.Fire);

            // Mouse wheel or D-pad left/right: next arrow type (GDD 03 1.5 "CycleAmmo"). One step per scroll or press.
            float wheel = _stance ? _gameplay.CycleAmmo : 0f;
            if (Mathf.Abs(wheel) > 0.01f)
            {
                if (!_wheelLatched && !_draw.IsBusy)
                {
                    CycleAmmo(wheel > 0f ? 1 : -1);
                }

                _wheelLatched = true;
            }
            else
            {
                _wheelLatched = false;
            }
        }

        private void TickStance(float deltaTime, bool playing)
        {
            CombatStateMachine machine = combat != null ? combat.StateMachine : null;
            bool free = machine != null && machine.State == CombatStateId.Idle;
            if (!free && _draw.IsBusy)
            {
                // Dodge, stagger, attack: the arrow comes off the string.
                _draw.Cancel();
                _scripted = false;
            }

            if (_scripted)
            {
                _aiming = true;
                if (free && !_draw.IsBusy)
                {
                    _draw.BeginDraw();
                }
            }
            else if (playing)
            {
                _aiming = _aimHeld;
                if (_firePressed && free && !_draw.IsBusy)
                {
                    BeginShot();
                }
            }

            float holdCost = _draw.Tick(deltaTime);
            ResourcePool stamina = stats != null ? stats.Stamina : null;
            if (holdCost > 0f && stamina != null)
            {
                stamina.Spend(holdCost);
            }

            if (_scripted)
            {
                if (_draw.Phase == BowPhase.Drawing && _draw.HeldSeconds >= _scriptedDraw)
                {
                    _scripted = false;
                    Shoot(_scriptedPoint);
                }

                return;
            }

            if (_draw.HipShotReady)
            {
                Shoot(_hipPoint);
            }
            else if (_draw.Phase == BowPhase.Drawing && (!_fireHeld || (stamina != null && stamina.IsExhausted)))
            {
                // Releasing the button shoots; with no stamina left the arms give out and the arrow leaves as well.
                Shoot(AimPoint());
            }
        }

        private void BeginShot()
        {
            if (Arrows <= 0 && !CycleAmmo(1))
            {
                if (!_warnedNoArrows)
                {
                    _warnedNoArrows = true;
                    Log.Info(LogCategory.Player, "PlayerBow: no arrows (" + AmmoItemId + ") in the bag.");
                }

                return;
            }

            _warnedNoArrows = false;
            ResourcePool stamina = stats != null ? stats.Stamina : null;
            if (stamina != null && stamina.IsExhausted)
            {
                return;
            }

            if (_aiming)
            {
                _draw.BeginDraw();
                return;
            }

            _hipPoint = HipShotPoint(out _hipYaw);
            _draw.BeginHipShot();
        }

        private void Shoot(Vector3 point)
        {
            BowShot shot = _draw.Release();
            ArrowAmmo ammo = CurrentAmmo;
            IInventoryService inventory = equipment != null ? equipment.Inventory : null;
            if (ammo == null || inventory == null || !inventory.TryRemove(InventoryOwners.Player, ammo.ItemId, 1, "bow"))
            {
                return;
            }

            if (stats != null && stats.Stamina != null)
            {
                stats.Stamina.Spend(BowDraw.StaminaPerShot);
            }

            AttackSpec spec = _arrowSpec.Clone();
            spec.DamageMultiplier *= shot.DamageMultiplier;
            spec.ProjectileSpeed = shot.Speed;
            if (ammo.BurningBuildup > 0f)
            {
                // GDD 03 6.2: the fire arrow builds up burning 35 and sets oil alight.
                spec.Buildup = spec.Buildup.Plus(StatusBuildup.None.With(StatusEffectId.Burning, ammo.BurningBuildup));
            }

            float damage = equipment.BowDamage;
            DamagePacket packet = ammo.FireShare > 0f
                ? DamagePacket.Single(DamageType.Stab, damage * (1f - ammo.FireShare)).With(DamageType.Fire, damage * ammo.FireShare)
                : DamagePacket.Single(DamageType.Stab, damage);
            var profile = new AttackProfile(packet, AttributeScaling.Bow, BowPoise);
            Vector3 direction = ProjectileFlight.AimDirection(launcher.MuzzlePosition, point, spec.ProjectileSpeed, spec.ProjectileGravity);
            if (shot.SpreadDegrees > 0f)
            {
                // Trembling arms after a long full draw: a random tilt up to the spread.
                Vector3 axis = Vector3.Cross(direction, Vector3.up);
                axis = Quaternion.AngleAxis((float)_random.NextDouble() * 360f, direction) * (axis.sqrMagnitude > 0.0001f ? axis.normalized : Vector3.right);
                direction = Quaternion.AngleAxis((float)_random.NextDouble() * shot.SpreadDegrees, axis) * direction;
            }

            if (launcher.FireAlong(combatant, spec, profile, direction))
            {
                ShotsFired++;
                LastShot = shot;
                if (launcher.LastFired != null)
                {
                    _arrowAmmo[launcher.LastFired] = _ammoIndex;
                }
            }

            if (CountOf(ammo) <= 0)
            {
                // The quiver of this type is empty: take the next type the bag still has.
                CycleAmmo(1);
            }
        }

        private Vector3 AimPoint()
        {
            Vector3 fallback = transform.position + Vector3.up * AimHeight + Quaternion.Euler(0f, AimYaw(), 0f) * Vector3.forward * maxAimDistance;
            if (cameraTransform == null)
            {
                return fallback;
            }

            // The ray of the crosshair starts level with the character (the camera is about 1.4 m behind the shoulder).
            Vector3 origin = cameraTransform.position;
            Vector3 forward = cameraTransform.forward;
            float skip = Mathf.Max(0f, Vector3.Dot(transform.position + Vector3.up * AimHeight - origin, forward));
            Vector3 start = origin + forward * skip;
            int count = Physics.RaycastNonAlloc(start, forward, _hits, maxAimDistance, aimLayers, QueryTriggerInteraction.Collide);
            float best = float.MaxValue;
            Vector3 point = start + forward * maxAimDistance;
            for (int i = 0; i < count; i++)
            {
                RaycastHit hit = _hits[i];
                if (hit.collider == null || hit.collider.transform.IsChildOf(transform) || hit.distance >= best)
                {
                    continue;
                }

                best = hit.distance;
                point = hit.point;
            }

            return point;
        }

        private Vector3 HipShotPoint(out float yaw)
        {
            Combatant target = lockOn != null ? lockOn.Target : null;
            float facing = combat != null ? combat.FacingYaw : transform.eulerAngles.y;
            if (target == null && _service != null)
            {
                CombatantQueries.FindInCone(_service.Combatants, combatant, AimYaw(), HipShotRange, HipShotHalfAngle, _cone);
                if (_cone.Count == 0)
                {
                    CombatantQueries.FindInCone(_service.Combatants, combatant, facing, HipShotRange, HipShotHalfAngle, _cone);
                }

                for (int i = 0; i < _cone.Count && target == null; i++)
                {
                    if (_cone[i].Team != CombatTeam.Neutral)
                    {
                        target = _cone[i];
                    }
                }

                if (target == null && _cone.Count > 0)
                {
                    target = _cone[0];
                }

                _cone.Clear();
            }

            Vector3 position = transform.position;
            if (target != null)
            {
                Vector3 point = target.TargetPosition;
                yaw = CombatMath.YawOf(point.x - position.x, point.z - position.z);
                return point;
            }

            yaw = facing;
            return position + Vector3.up * AimHeight + Quaternion.Euler(0f, facing, 0f) * Vector3.forward * HipShotRange;
        }

        private float AimYaw()
        {
            return cameraTransform != null ? cameraTransform.eulerAngles.y : transform.eulerAngles.y;
        }

        private void EnterStance(bool automatic)
        {
            if (!HasBow && !TryEquipBowFromBag())
            {
                Log.Info(LogCategory.Player, "PlayerBow: no bow equipped or in the bag, the ranged stance stays off.");
                return;
            }

            _stance = true;
            _autoStance = automatic;
            Sync();
        }

        private bool TryEquipBowFromBag()
        {
            // Convenience (Vorschlag): F with a bow in the bag but an empty ranged slot puts the bow on.
            IInventoryService inventory = equipment != null ? equipment.Inventory : null;
            if (inventory == null || inventory.PlayerEquipment.Get(EquipmentSlot.Ranged) != null)
            {
                return false;
            }

            IReadOnlyList<ItemInstance> entries = inventory.PlayerContainer.Entries;
            for (int i = 0; i < entries.Count; i++)
            {
                ItemInstance entry = entries[i];
                if (inventory.Catalog.TryGetItem(entry.ItemId, out ItemSpec spec) && spec.IsWeapon && spec.WeaponType == WeaponType.Bow &&
                    inventory.TryEquip(entry.InstanceId, EquipmentSlot.Ranged, out _))
                {
                    Log.Info(LogCategory.Player, "PlayerBow: " + spec.DisplayName + " taken from the bag into the ranged slot.");
                    return HasBow;
                }
            }

            return false;
        }

        private void Sync()
        {
            float yaw;
            if (_scripted)
            {
                Vector3 position = transform.position;
                yaw = CombatMath.YawOf(_scriptedPoint.x - position.x, _scriptedPoint.z - position.z);
            }
            else
            {
                yaw = _draw.Phase == BowPhase.HipShot ? _hipYaw : AimYaw();
            }

            if (combat != null)
            {
                combat.SetRangedStance(_stance, _aiming || _draw.IsBusy, yaw);
            }

            if (equipment != null)
            {
                equipment.SetBowDrawn(_stance);
            }
        }
    }
}
