using System;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Input;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Player
{
    /// <summary>
    /// Uses the quick slots (keys 5–8, D-pad; GDD 04 2.3, GDD 03 4.3): a press on a slot with a usable item (healing or mana
    /// potion) starts drinking. Drinking takes 0.8 s at half speed and is not possible while blocking, attacking or rolling;
    /// at the end one piece is taken from the bag and its effect applies. A stagger or a dodge breaks it off – the potion is not
    /// used up then.
    /// </summary>
    /// <remarks>GameObject: the player root next to <see cref="PlayerCombatController"/> (execution order −44).</remarks>
    [DefaultExecutionOrder(-44)]
    [DisallowMultipleComponent]
    public sealed class PlayerQuickSlots : MonoBehaviour
    {
        /// <summary>Drinking time in seconds (GDD 03 4.3).</summary>
        public const float DrinkSeconds = 0.8f;

        private static readonly EquipmentSlot[] Slots = { EquipmentSlot.QuickSlot1, EquipmentSlot.QuickSlot2, EquipmentSlot.QuickSlot3, EquipmentSlot.QuickSlot4 };
        private static readonly GameplayButton[] Buttons = { GameplayButton.QuickSlot1, GameplayButton.QuickSlot2, GameplayButton.QuickSlot3, GameplayButton.QuickSlot4 };

        [Tooltip("Kampfsteuerung (frei zum Trinken?, Bewegung beim Trinken). Leer = am selben GameObject.")]
        [SerializeField] private PlayerCombatController combat = null;

        [Tooltip("Lebenspunkte. Leer = DamageableComponent am selben GameObject.")]
        [SerializeField] private DamageableComponent health = null;

        [Tooltip("Werte mit Mana. Leer = CharacterStatsComponent am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        private IInventoryService _inventory;
        private IGameplayInput _gameplay;
        private IGameStateService _gameState;
        private string _drinking = string.Empty;
        private float _timer;

        /// <summary>Item being drunk, or empty.</summary>
        public string Drinking => _drinking;

        /// <summary>True while drinking.</summary>
        public bool IsDrinking => _drinking.Length > 0;

        /// <summary>Raised when a potion was drunk (item id).</summary>
        public event Action<string> Used;

        /// <summary>Starts using the item of a quick slot, like a key press (tools and tests use it too).</summary>
        /// <param name="slot">Slot index 0–3 (keys 5–8).</param>
        /// <param name="reason">German reason if nothing happens.</param>
        /// <returns>True if drinking started.</returns>
        public bool TryUse(int slot, out string reason)
        {
            reason = string.Empty;
            if (_inventory == null || slot < 0 || slot >= Slots.Length)
            {
                reason = "Kein Schnellslot.";
                return false;
            }

            if (IsDrinking || (combat != null && !combat.IsFreeForAbility))
            {
                reason = "Gerade nicht möglich.";
                return false;
            }

            string itemId = _inventory.PlayerEquipment.GetQuickSlot(Slots[slot]);
            if (string.IsNullOrEmpty(itemId) || !_inventory.Catalog.TryGetItem(itemId, out ItemSpec spec) || !spec.IsUsable)
            {
                reason = "Auf diesem Schnellslot liegt nichts zum Benutzen.";
                return false;
            }

            if (_inventory.CountInBag(InventoryOwners.Player, itemId) <= 0)
            {
                reason = "Kein " + spec.DisplayName + " mehr.";
                return false;
            }

            _drinking = itemId;
            _timer = DrinkSeconds;
            if (combat != null)
            {
                combat.SetDrinking(true);
            }

            return true;
        }

        private void Awake()
        {
            if (combat == null)
            {
                TryGetComponent(out combat);
            }

            if (health == null)
            {
                TryGetComponent(out health);
            }

            if (stats == null)
            {
                TryGetComponent(out stats);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                locator.TryGet(out _inventory);
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
                Log.Exception(LogCategory.Player, exception, "PlayerQuickSlots could not resolve its services.");
            }
        }

        private void OnDisable()
        {
            Cancel();
        }

        private void Update()
        {
            if (IsDrinking)
            {
                TickDrinking(Time.deltaTime);
                return;
            }

            bool playing = _gameState != null && _gameState.Current == GameState.Playing;
            if (!playing || _gameplay == null || !_gameplay.IsActive)
            {
                return;
            }

            for (int i = 0; i < Buttons.Length; i++)
            {
                if (_gameplay.WasPressedThisFrame(Buttons[i]))
                {
                    TryUse(i, out _);
                    return;
                }
            }
        }

        private void TickDrinking(float deltaTime)
        {
            // Hit hard (stagger), dodged, dead: no drink, the potion stays in the bag.
            CombatStateMachine machine = combat != null ? combat.StateMachine : null;
            bool interrupted = (machine != null && machine.State != CombatStateId.Idle) || (health != null && !health.IsAlive);
            if (interrupted)
            {
                Cancel();
                return;
            }

            _timer -= deltaTime;
            if (_timer > 0f)
            {
                return;
            }

            string itemId = _drinking;
            Cancel();
            if (_inventory == null || !_inventory.Catalog.TryGetItem(itemId, out ItemSpec spec) ||
                !_inventory.TryRemove(InventoryOwners.Player, itemId, 1, "quickslot"))
            {
                return;
            }

            if (spec.RestoreHealth > 0f && health != null && health.Health != null)
            {
                // GDD 03 9.7: healing ×1.5 on Geschichte, ×0.8 on Albtraum.
                float factor = Services.Locator != null && Services.Locator.TryGet(out IDifficultyService difficulty) ? difficulty.Settings.HealingFactor : 1f;
                health.Heal(health.Health.Max * spec.RestoreHealth * factor);
            }

            ResourcePool mana = stats != null ? stats.Mana : null;
            if (spec.RestoreMana > 0f && mana != null)
            {
                mana.Restore(mana.Max * spec.RestoreMana);
            }

            Used?.Invoke(itemId);
        }

        private void Cancel()
        {
            _drinking = string.Empty;
            _timer = 0f;
            if (combat != null)
            {
                combat.SetDrinking(false);
            }
        }
    }
}
