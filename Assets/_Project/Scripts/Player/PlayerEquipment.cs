using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Connects the player with the inventory (architecture 11.6): binds the player's stats to <see cref="IInventoryService"/>
    /// (equipment modifiers <c>item:&lt;instanceId&gt;</c>, armor class poise, overload penalties) and passes on what the
    /// equipment means for the other player components: weapon damage W of the main hand weapon and the shield's block values
    /// to <see cref="PlayerCombatController"/>, load limits to <see cref="PlayerMotor"/>, the roll profile of the armor class
    /// (overloaded: dodge step only) and the visibility of the sword and shield placeholders.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: the player root (the test ground menu adds it and sets the references). Refreshes after every
    /// inventory change (local event <see cref="IInventoryService.Changed"/>, also after loading a save).</para>
    /// <para>Moveset: the type of the main hand weapon picks the moveset of the combat controller (sword, staff …); types
    /// without a moveset bring their damage but swing like a sword until their movesets exist (GDD 03 5.3). A type with an entry
    /// in "typeVisuals" (staff, mace, bow) shows its own model instead of the sword. Without a weapon the player fights unarmed with the field "Waffenschaden ohne Waffe"
    /// (Vorschlag 5, GDD has no value).</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerEquipment : MonoBehaviour
    {
        [Tooltip("Werte der Figur. Leer = CharacterStatsComponent am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Kampfsteuerung (bekommt Waffenschaden und Schild-Blockwerte). Leer = am selben GameObject.")]
        [SerializeField] private PlayerCombatController combat = null;

        [Tooltip("Bewegung (bekommt die Grenzen der Traglast). Leer = am selben GameObject.")]
        [SerializeField] private PlayerMotor motor = null;

        [Tooltip("Platzhalter-Modell der Waffe (wird ohne Waffe ausgeblendet).")]
        [SerializeField] private GameObject weaponVisual = null;

        [Tooltip("Platzhalter-Modell des Schilds (wird ohne Schild ausgeblendet).")]
        [SerializeField] private GameObject shieldVisual = null;

        [Tooltip("Modelle weiterer Waffentypen (Zauberstab, Streitkolben …): sichtbar statt des Schwerts, wenn dieser Typ angelegt ist.")]
        [SerializeField] private WeaponTypeVisual[] typeVisuals = new WeaponTypeVisual[0];

        [Tooltip("Bogen in der linken Hand (sichtbar in der Fernkampf-Haltung).")]
        [SerializeField] private GameObject bowVisual = null;

        [Tooltip("Bogen auf dem Rücken (sichtbar, solange ein Bogen angelegt ist und nicht gezogen wird).")]
        [SerializeField] private GameObject bowBackVisual = null;

        [Tooltip("Waffenschaden ohne Waffe (Vorschlag: 5; das GDD nennt keinen Wert).")]
        [Min(0f)] [SerializeField] private float unarmedDamage = 5f;

        private IInventoryService _inventory;
        private StatCollection _boundStats;
        private bool _subscribed;
        private WeaponType _warnedType = WeaponType.None;
        private bool _hasWeapon;
        private bool _hasShield;
        private bool _bowDrawn;
        private WeaponType _type = WeaponType.None;

        /// <summary>Weapon damage W of the equipped weapon (unarmed value without weapon).</summary>
        public float WeaponDamage { get; private set; }

        /// <summary>True if a bow is equipped in the ranged slot (GDD 03 6.1).</summary>
        public bool HasBow { get; private set; }

        /// <summary>Weapon damage W of the equipped bow (0 without one).</summary>
        public float BowDamage { get; private set; }

        /// <summary>The inventory once connected (arrows of <see cref="PlayerBow"/>), or null.</summary>
        public IInventoryService Inventory => _inventory;

        /// <summary>Displayed attack: W × (1 + 0.025 × Σ wᵢ × E(attributeᵢ)) (GDD 03 10.3).</summary>
        public float AttackDisplay
        {
            get
            {
                if (stats == null || combat == null)
                {
                    return WeaponDamage;
                }

                AttributeSet attributes = stats.Stats.GetAttributes();
                return StatFormulas.AttackDisplay(WeaponDamage, combat.WeaponScaling.WeightedEffectivePoints(attributes));
            }
        }

        /// <summary>Armor class of the worn armor.</summary>
        public ArmorClass ArmorClass { get; private set; } = ArmorClass.Light;

        /// <summary>Current load stage.</summary>
        public EncumbranceLevel LoadLevel { get; private set; }

        /// <summary>True once the stats are bound to the inventory.</summary>
        public bool IsBound => _boundStats != null;

        private void Awake()
        {
            if (stats == null)
            {
                TryGetComponent(out stats);
            }

            if (combat == null)
            {
                TryGetComponent(out combat);
            }

            if (motor == null)
            {
                TryGetComponent(out motor);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                if (!Services.Locator.TryGet(out _inventory))
                {
                    Log.Warning(LogCategory.Player, "PlayerEquipment: no IInventoryService registered, the player has no equipment. " +
                                                    "Add the InventoryInstaller to the BootConfig (menu Aetherfall > Testgelaende erstellen does that).");
                    return;
                }

                if (stats != null)
                {
                    _boundStats = stats.Stats;
                    _inventory.AttachPlayerStats(_boundStats);
                }

                Subscribe();
                Refresh();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerEquipment could not connect to the inventory.");
            }
        }

        private void OnEnable()
        {
            Subscribe();
        }

        private void OnDisable()
        {
            if (_subscribed && _inventory != null)
            {
                _inventory.Changed -= Refresh;
            }

            _subscribed = false;
        }

        private void OnDestroy()
        {
            if (_inventory != null && _boundStats != null)
            {
                _inventory.DetachPlayerStats(_boundStats);
                _boundStats = null;
            }
        }

        private void Subscribe()
        {
            if (_subscribed || _inventory == null || !isActiveAndEnabled)
            {
                return;
            }

            _inventory.Changed += Refresh;
            _subscribed = true;
        }

        private void Refresh()
        {
            if (_inventory == null)
            {
                return;
            }

            Equipment equipment = _inventory.PlayerEquipment;
            IItemCatalog catalog = _inventory.Catalog;
            ItemInstance main = equipment.Get(EquipmentSlot.MainHand);
            ItemSpec mainSpec = null;
            if (main != null)
            {
                catalog.TryGetItem(main.ItemId, out mainSpec);
            }

            bool hasWeapon = mainSpec != null && mainSpec.IsWeapon;
            WeaponDamage = hasWeapon ? ItemStats.WeaponDamage(mainSpec, main) : unarmedDamage;
            WeaponType type = hasWeapon ? mainSpec.WeaponType : WeaponType.None;
            if (combat != null)
            {
                combat.SetWeaponType(type);
                if (hasWeapon && combat.WeaponType != type && _warnedType != type)
                {
                    _warnedType = type;
                    Log.Info(LogCategory.Player, "Weapon type " + type + " has no moveset yet; it swings like the one-handed sword (damage " +
                                                 WeaponDamage.ToString("0") + ").");
                }
            }

            ItemInstance off = equipment.Get(EquipmentSlot.OffHand);
            ItemSpec offSpec = null;
            if (off != null)
            {
                catalog.TryGetItem(off.ItemId, out offSpec);
            }

            bool hasShield = offSpec != null && offSpec.IsShield;
            BlockSpec block = hasShield
                ? new BlockSpec(offSpec.BlockAngle, offSpec.BlockPhysical, offSpec.BlockElemental, offSpec.BlockStability)
                : BlockSpec.OneHandedWeapon;
            if (combat != null)
            {
                combat.ApplyEquipment(WeaponDamage, hasShield, block);
            }

            ArmorClass = equipment.ArmorClass;
            LoadLevel = _inventory.PlayerEncumbrance.Level;
            if (motor != null)
            {
                motor.SetLoadLimits(EncumbranceRules.MaxSpeed(LoadLevel), !EncumbranceRules.AllowsSprint(LoadLevel), !EncumbranceRules.AllowsJump(LoadLevel));
            }

            if (combat != null)
            {
                combat.SetRollProfile(RollProfile(ArmorClass, LoadLevel));
            }

            // GDD 03 6.1: the bow sits in the ranged slot, independent of the main hand.
            ItemInstance ranged = equipment.Get(EquipmentSlot.Ranged);
            ItemSpec rangedSpec = null;
            if (ranged != null)
            {
                catalog.TryGetItem(ranged.ItemId, out rangedSpec);
            }

            HasBow = rangedSpec != null && rangedSpec.IsWeapon && rangedSpec.WeaponType == WeaponType.Bow;
            BowDamage = HasBow ? ItemStats.WeaponDamage(rangedSpec, ranged) : 0f;
            _hasWeapon = hasWeapon;
            _hasShield = hasShield;
            _type = type;
            ApplyVisuals();
        }

        /// <summary>
        /// Bow in the hand (ranged stance of <see cref="PlayerBow"/>) or on the back: while drawn the main hand weapon and the
        /// shield are hidden.
        /// </summary>
        /// <param name="drawn">True while the ranged stance is active.</param>
        public void SetBowDrawn(bool drawn)
        {
            if (_bowDrawn == drawn)
            {
                return;
            }

            _bowDrawn = drawn;
            ApplyVisuals();
        }

        private void ApplyVisuals()
        {
            bool bowInHand = _bowDrawn && HasBow;
            bool typeShown = false;
            foreach (WeaponTypeVisual entry in typeVisuals)
            {
                if (entry == null || entry.Visual == null)
                {
                    continue;
                }

                bool show = _hasWeapon && entry.Type == _type && !bowInHand;
                entry.Visual.SetActive(show);
                typeShown |= _hasWeapon && entry.Type == _type;
            }

            if (weaponVisual != null)
            {
                weaponVisual.SetActive(_hasWeapon && !typeShown && !bowInHand);
            }

            if (shieldVisual != null)
            {
                shieldVisual.SetActive(_hasShield && !bowInHand);
            }

            if (bowVisual != null)
            {
                bowVisual.SetActive(bowInHand);
            }

            if (bowBackVisual != null)
            {
                bowBackVisual.SetActive(HasBow && !bowInHand);
            }
        }

        private static DodgeProfile RollProfile(ArmorClass armorClass, EncumbranceLevel load)
        {
            if (!EncumbranceRules.AllowsRoll(load))
            {
                return DodgeProfile.Overloaded;
            }

            switch (armorClass)
            {
                case ArmorClass.Heavy: return DodgeProfile.Heavy;
                case ArmorClass.Medium: return DodgeProfile.Medium;
                default: return DodgeProfile.Light;
            }
        }
    }
}
