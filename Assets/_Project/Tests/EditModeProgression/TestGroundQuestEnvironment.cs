using System;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Progression;
using Aetherfall.Quests;
using Aetherfall.SaveSystem;
using Aetherfall.Tests.Shared;
using Aetherfall.WorldState;

namespace Aetherfall.Tests.EditMode.Progression
{
    /// <summary>
    /// The game services the test quests of the test ground use, built like the installers do it (guide 08, 11.1): event bus,
    /// world state with the test flags, condition watcher, inventory with a small item catalog, progression and the quest
    /// service with both test quests of <see cref="TestGroundQuestLibrary"/>. Real conditions, actions and objectives, no
    /// stand-ins.
    /// </summary>
    public sealed class TestGroundQuestEnvironment : IDisposable
    {
        /// <summary>Load context of a normal (not new) game.</summary>
        public static readonly LoadContext LoadedGame = new LoadContext("char_test/quick_0", SaveFormat.CurrentVersion, false, false, null);

        private bool _disposed;

        /// <summary>Creates the services.</summary>
        public TestGroundQuestEnvironment()
        {
            LogCapture = new LogCapture();
            Bus = new EventBus();
            Services = new ServiceLocator();
            World = new WorldStateService(Bus, FlagRegistry.FromSpecs(TestGroundQuestLibrary.CreateFlags()), null);
            Watcher = new ConditionWatcher(Bus);
            Catalog = CreateCatalog();
            Inventory = new InventoryService(Bus, Catalog, 7UL, StartingKit.Empty);
            Progression = new ProgressionService(Bus);
            Quests = new QuestService(Bus, QuestCatalog.FromSpecs(TestGroundQuestLibrary.CreateQuests()), Services, Watcher,
                new InventoryQuestBridge(Inventory), World, null, null);
            Services.Register<IEventBus>(Bus);
            Services.Register<IWorldState>(World);
            Services.Register<IConditionWatcher>(Watcher);
            Services.Register<IInventoryService>(Inventory);
            Services.Register<IProgressionService>(Progression);
            Services.Register<IQuestService>(Quests);
            Progression.PostInitialize();
            Quests.PostInitialize();
            Settle();
        }

        /// <summary>Captured log.</summary>
        public LogCapture LogCapture { get; }

        /// <summary>Event bus.</summary>
        public EventBus Bus { get; }

        /// <summary>Service locator of conditions and actions.</summary>
        public ServiceLocator Services { get; }

        /// <summary>World state.</summary>
        public WorldStateService World { get; }

        /// <summary>Condition watcher.</summary>
        public ConditionWatcher Watcher { get; }

        /// <summary>Item catalog (wolf fur, potion, sword).</summary>
        public ItemCatalog Catalog { get; }

        /// <summary>Inventory.</summary>
        public InventoryService Inventory { get; }

        /// <summary>Progression.</summary>
        public ProgressionService Progression { get; }

        /// <summary>Quest service.</summary>
        public QuestService Quests { get; }

        /// <summary>Publishes an event and evaluates what became dirty (the next frame in the game).</summary>
        /// <typeparam name="T">Event type.</typeparam>
        /// <param name="evt">Event.</param>
        public void Publish<T>(T evt) where T : struct, IGameEvent
        {
            Bus.Publish(in evt);
            Settle();
        }

        /// <summary>Lets the condition watcher evaluate everything that is dirty.</summary>
        public void Settle()
        {
            Watcher.EvaluatePending();
        }

        /// <summary>Stage of a quest, empty if never started.</summary>
        /// <param name="questId">Quest id.</param>
        public string StageOf(string questId)
        {
            return Quests.TryGetInstance(questId, out QuestInstance instance) ? instance.StageId : string.Empty;
        }

        /// <summary>What the notice board does when the player reads it: start the offered quest.</summary>
        /// <returns>The started quest, or empty.</returns>
        public string ReadBoard()
        {
            string offer = QuestBoardRules.FindOffer(Quests, TestGroundQuestLibrary.BoardId, new System.Collections.Generic.List<string>());
            if (offer.Length > 0)
            {
                Quests.TryStart(offer, TestGroundQuestLibrary.BoardId);
            }

            Publish(new Aetherfall.Events.Interacted(TestGroundQuestLibrary.BoardId, InteractionVerbs.Read));
            return offer;
        }

        /// <summary>Releases the services.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            Quests.Dispose();
            Progression.Dispose();
            Watcher.Dispose();
            Bus.Dispose();
            LogCapture.Dispose();
        }

        private static ItemCatalog CreateCatalog()
        {
            var catalog = new ItemCatalog();
            catalog.AddItem(new ItemSpec
            {
                Id = TestGroundQuestLibrary.WolfFurId, DisplayName = "Wolfsfell", Category = ItemCategory.Material, StackSize = 99, Weight = 1f, Value = 4f
            });
            catalog.AddItem(new ItemSpec
            {
                Id = TestGroundQuestLibrary.PotionId, DisplayName = "Kleiner Heiltrank", Category = ItemCategory.Consumable, EquipKind = EquipKind.QuickUse,
                StackSize = 20, Weight = 0.3f, Value = 30f
            });
            return catalog;
        }
    }
}
