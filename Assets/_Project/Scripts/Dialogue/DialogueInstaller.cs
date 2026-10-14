using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Data;
using Aetherfall.Inventory;
using Aetherfall.SaveSystem;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Registers the dialogue system (architecture 4.1 step 12, domain services in assembly order: after Inventory and before
    /// Crafting): <see cref="IDialogueService"/> and <see cref="IDialogueMemory"/> (<see cref="DialogueService"/>), the player
    /// values for checks (<see cref="IDialogueCheckStats"/>), the gold for bribes (<see cref="IDialogueWallet"/>) and the
    /// saveable of the section <c>dialogue</c>. Builds the dialogue catalog from the <see cref="DialogueDefinition"/>s of the
    /// content database. The service is post-initialized (speakers of the NPC system, game state events) and disposed by the
    /// bootstrapper.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/DialogueInstaller.asset</c> (menu Assets > Create > Aetherfall > Boot >
    /// Installer: Dialoge). Order in the BootConfig: after the Inventory installer, before the NPC installer.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Dialoge", fileName = "DialogueInstaller", order = 116)]
    public sealed class DialogueInstaller : ServiceInstaller
    {
        [Tooltip("Proben: deterministisch (Wert ≥ Schwelle, Empfehlung GDD 02 12.3) oder Würfel (W20 + Bonus).")]
        [SerializeField] private DialogueCheckMode checkMode = DialogueCheckMode.Deterministic;

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[]
        {
            typeof(IDialogueService), typeof(IDialogueMemory), typeof(IDialogueCheckStats), typeof(IDialogueWallet)
        };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[]
        {
            typeof(IEventBus), typeof(IContentDatabase), typeof(ISaveManager), typeof(IGameStateService), typeof(IInventoryService)
        };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            DialogueCatalog catalog = DialogueCatalog.FromDatabase(locator.Get<IContentDatabase>());
            IInventoryService inventory = locator.Get<IInventoryService>();
            ISaveManager saves = locator.Get<ISaveManager>();
            var stats = new PlayerStatsCheckSource(inventory);
            var wallet = new InventoryDialogueWallet(inventory);
            var service = new DialogueService(locator.Get<IEventBus>(), catalog, locator, stats, wallet, locator.Get<IGameStateService>(), saves,
                new DialogueRules(checkMode));
            saves.Register(new DialogueSaveable(service));
            Log.Info(LogCategory.Dialogue, "Dialogues: " + catalog.Count + " dialogue definitions, checks " + checkMode + ".");
            registry.Register<IDialogueService>(service);
            registry.Register<IDialogueMemory>(service);
            registry.Register<IDialogueCheckStats>(stats);
            registry.Register<IDialogueWallet>(wallet);
        }
    }
}
