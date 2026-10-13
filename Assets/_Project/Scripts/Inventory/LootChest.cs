using System;
using Aetherfall.Core;
using Aetherfall.Data;
using Aetherfall.Items;
using UnityEngine;

namespace Aetherfall.Inventory
{
    /// <summary>
    /// A chest of a quality tier (§12.5, GDD 04 5.6) that can be opened once with the Interact action: rolls its loot table
    /// on the first opening (<see cref="ILootService.TryOpenChest"/>, seeded by save and chest id), puts the content into the
    /// bag ("Alles nehmen" until the loot window exists) and stays open. The opened state is saved under its stable id.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: a chest in the scene with a solid collider (Environment) and a trigger collider on the layer
    /// Interactable for the interactor; the lid (child) is rotated when opened. The test ground menu builds three chests.</para>
    /// <para>The chest id must be unique and stable (architecture 6.1/6.3: <c>obj.&lt;region&gt;.&lt;name&gt;</c>). TODO (world
    /// objects step): <c>UniqueId</c> component, <c>Interactable</c> with condition and the action <c>GiveLoot</c>, state in the
    /// <c>WorldObjectStateStore</c> (architecture 9.7, 11.3, 11.6).</para>
    /// </remarks>
    [DisallowMultipleComponent]
    public sealed class LootChest : MonoBehaviour, IInteractable
    {
        [Tooltip("Stabile ID der Truhe (z. B. obj.test.truhe_holz). Einmalig im Projekt, nie ändern – der Spielstand merkt sich darunter „geöffnet“.")]
        [SerializeField] private string chestId = "obj.test.truhe";

        [Tooltip("Loot-Tabelle der Truhe (z. B. loot.chest.holz).")]
        [SerializeField, IdRef("loot.")] private string lootTableId = "loot.chest.holz";

        [Tooltip("Truhen-Stufe (GDD 04, 5.6): bestimmt die Loot-Qualitätsstufe und das Item-Level.")]
        [SerializeField] private ChestTier tier = ChestTier.Wooden;

        [Tooltip("Gebietslevel (Item-Level des Inhalts, GDD 04, 4.1). Testgelände: 10.")]
        [Range(1, 80)] [SerializeField] private int areaLevel = 10;

        [Tooltip("Anzeigename im Hinweis. Leer = Name der Stufe (z. B. Holztruhe).")]
        [SerializeField] private string displayName = string.Empty;

        [Tooltip("Deckel, der sich beim Öffnen dreht (optional).")]
        [SerializeField] private Transform lid = null;

        [Tooltip("Drehung des Deckels um X beim Öffnen in Grad.")]
        [Range(-180f, 180f)] [SerializeField] private float openAngle = -105f;

        private ILootService _loot;
        private bool _subscribed;
        private Quaternion _closedRotation = Quaternion.identity;
        private string _prompt;

        /// <summary>Stable id of the chest.</summary>
        public string ChestId => chestId;

        /// <summary>Tier of the chest.</summary>
        public ChestTier Tier => tier;

        /// <summary>True once opened (in this save).</summary>
        public bool IsOpened => _loot != null && _loot.IsChestOpened(chestId);

        /// <summary>Text of the last opening, e.g. "Holztruhe: 23 Gold, Heiltrank" (debug overlay).</summary>
        public string LastResultText { get; private set; } = string.Empty;

        /// <inheritdoc />
        public string InteractionObjectId => chestId;

        /// <inheritdoc />
        public string InteractionVerb => InteractionVerbs.Open;

        /// <inheritdoc />
        /// <remarks>Built once and cached: the prompt overlay and the HUD read it every frame.</remarks>
        public string InteractionPrompt => _prompt ?? (_prompt = "Öffnen: " + DisplayName);

        /// <inheritdoc />
        public int InteractionPriority => 10;

        /// <inheritdoc />
        public Vector3 InteractionPosition => transform.position;

        private string DisplayName => string.IsNullOrEmpty(displayName) ? ChestTierRules.GermanName(tier) : displayName;

        /// <inheritdoc />
        public bool CanInteract(in InteractionContext context)
        {
            return _loot != null && !_loot.IsChestOpened(chestId);
        }

        /// <inheritdoc />
        public bool Interact(in InteractionContext context)
        {
            if (_loot == null || !_loot.TryOpenChest(chestId, lootTableId, tier, areaLevel, out LootResult result))
            {
                return false;
            }

            LastResultText = DisplayName + ": " + result.Drops.Count + " Fund(e), bestes Stück " + RarityRules.GermanName(result.BestRarity) +
                             ", " + result.CurrencyTotal(CurrencyIds.Gold) + " Gold";
            Log.Info(LogCategory.Data, "Chest '" + chestId + "' opened by '" + context.InteractorId + "'.");
            UpdateVisual();
            return true;
        }

        private void Awake()
        {
            if (lid != null)
            {
                _closedRotation = lid.localRotation;
            }
        }

        private void OnValidate()
        {
            // Name or tier changed in the inspector: build the prompt again on the next read.
            _prompt = null;
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                _loot = await Services.WaitForAsync<ILootService>(destroyCancellationToken);
                Subscribe();
                UpdateVisual();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Data, exception, "LootChest '" + chestId + "' could not resolve ILootService.");
            }
        }

        private void OnEnable()
        {
            Subscribe();
        }

        private void OnDisable()
        {
            if (_subscribed && _loot != null)
            {
                _loot.ChestsChanged -= OnChestsChanged;
            }

            _subscribed = false;
        }

        private void Subscribe()
        {
            if (_subscribed || _loot == null || !isActiveAndEnabled)
            {
                return;
            }

            _loot.ChestsChanged += OnChestsChanged;
            _subscribed = true;
        }

        private void OnChestsChanged()
        {
            UpdateVisual();
        }

        private void UpdateVisual()
        {
            if (lid == null)
            {
                return;
            }

            lid.localRotation = IsOpened ? _closedRotation * Quaternion.Euler(openAngle, 0f, 0f) : _closedRotation;
        }
    }
}
