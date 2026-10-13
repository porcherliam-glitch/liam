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
    /// <para>Moveset: the combat controller keeps the moveset of its weapon asset (one-handed sword); other weapon types bring
    /// their damage but still swing like a sword until their movesets exist (GDD 03 5.3). Without a weapon the player fights
    /// unarmed with the field "Waffenschaden ohne Waffe" (Vorschlag 5, GDD has no value).</para>
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

        [Tooltip("Waffenschaden ohne Waffe (Vorschlag: 5; das GDD nennt keinen Wert).")]
        [Min(0f)] [SerializeField] private float unarmedDamage = 5f;

        private IInventoryService _inventory;
        private StatCollection _boundStats;
        private bool _subscribed;
        private WeaponType _warnedType = WeaponType.None;

        /// <summary>Weapon damage W of the equipped weapon (unarmed value without weapon).</summary>
        public float WeaponDamage { get; private set; }

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
            if (hasWeapon && mainSpec.WeaponType != WeaponType.OneHandedSword && _warnedType != mainSpec.WeaponType)
            {
                _warnedType = mainSpec.WeaponType;
                Log.Info(LogCategory.Player, "Weapon type " + mainSpec.WeaponType + " has no moveset yet; it swings like the one-handed sword (damage " +
                                             WeaponDamage.ToString("0") + ").");
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

            if (weaponVisual != null)
            {
                weaponVisual.SetActive(hasWeapon);
            }

            if (shieldVisual != null)
            {
                shieldVisual.SetActive(hasShield);
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
