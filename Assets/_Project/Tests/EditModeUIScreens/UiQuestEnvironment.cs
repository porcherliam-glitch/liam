using System;
using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.EditorTools.Narrative;
using Aetherfall.Events;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Progression;
using Aetherfall.Quests;
using Aetherfall.Tests.Shared;
using Aetherfall.WorldState;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary>
    /// Real game services for the tests of the quest UI models (quest log, details, tracker, messages): event bus, world
    /// state, condition watcher, inventory, progression and the quest service with both test quests of the test ground
    /// (<see cref="TestGroundQuestLibrary"/>) plus optional extra quests. Built like the installers do it.
    /// </summary>
    public sealed class UiQuestEnvironment : IDisposable
    {
        private bool _disposed;

        /// <summary>Creates the services.</summary>
        /// <param name="extraQuests">Additional quests in the catalog.</param>
        public UiQuestEnvironment(params QuestSpec[] extraQuests)
        {
            LogCapture = new LogCapture();
            Bus = new EventBus();
            Services = new ServiceLocator();
            World = new WorldStateService(Bus, FlagRegistry.FromSpecs(TestGroundQuestLibrary.CreateFlags()), null);
            Watcher = new ConditionWatcher(Bus);
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
            Inventory = new InventoryService(Bus, catalog, 7UL, StartingKit.Empty);
            Progression = new ProgressionService(Bus);
            var specs = new List<QuestSpec>(TestGroundQuestLibrary.CreateQuests());
            if (extraQuests != null)
            {
                specs.AddRange(extraQuests);
            }

            Quests = new QuestService(Bus, QuestCatalog.FromSpecs(specs.ToArray()), Services, Watcher, new InventoryQuestBridge(Inventory), World, null, null);
            Services.Register<IEventBus>(Bus);
            Services.Register<IWorldState>(World);
            Services.Register<IConditionWatcher>(Watcher);
            Services.Register<IInventoryService>(Inventory);
            Services.Register<IProgressionService>(Progression);
            Services.Register<IQuestService>(Quests);
            Progression.PostInitialize();
            Quests.PostInitialize();
            Watcher.EvaluatePending();
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

        /// <summary>Inventory.</summary>
        public InventoryService Inventory { get; }

        /// <summary>Progression.</summary>
        public ProgressionService Progression { get; }

        /// <summary>Quest service.</summary>
        public QuestService Quests { get; }

        /// <summary>A small extra quest: kill two rats, then done.</summary>
        /// <param name="id">Quest id.</param>
        /// <param name="title">Title.</param>
        /// <param name="category">Category.</param>
        public static QuestSpec SimpleQuest(string id, string title, QuestCategory category)
        {
            return new QuestSpecBuilder(id)
                .Title(title, "Eine kleine Test-Quest.")
                .Category(category)
                .Level(1)
                .Stage(new StageBuilder("s10")
                    .Text("Besiege zwei Ratten.")
                    .Objective(new KillObjective("o1", "enemy.test.ratte", 2).WithJournalText("Ratten besiegen"))
                    .Next("s20"))
                .Stage(new StageBuilder("s20").Text("Erledigt.").ActionOnly().EndSuccess())
                .Build();
        }

        /// <summary>Publishes an event and lets the condition watcher evaluate (the next frame in the game).</summary>
        /// <typeparam name="T">Event type.</typeparam>
        /// <param name="evt">Event.</param>
        public void Publish<T>(T evt) where T : struct, IGameEvent
        {
            Bus.Publish(in evt);
            Watcher.EvaluatePending();
        }

        /// <summary>Reads the notice board: starts the offered test quest and reports the interaction.</summary>
        public void ReadBoard()
        {
            string offer = QuestBoardRules.FindOffer(Quests, TestGroundQuestLibrary.BoardId, new List<string>());
            if (offer.Length > 0)
            {
                Quests.TryStart(offer, TestGroundQuestLibrary.BoardId);
            }

            Publish(new Interacted(TestGroundQuestLibrary.BoardId, InteractionVerbs.Read));
        }

        /// <summary>The player kills a wolf.</summary>
        /// <param name="uniqueId">Unique id of the wolf.</param>
        public void KillWolf(string uniqueId)
        {
            Publish(new EnemyKilled(TestGroundQuestLibrary.WolfTypeId, "normal", uniqueId, "player", string.Empty, string.Empty, 8, default(Vector3)));
        }

        /// <summary>The player kills a rat (extra quests).</summary>
        /// <param name="uniqueId">Unique id.</param>
        public void KillRat(string uniqueId)
        {
            Publish(new EnemyKilled("enemy.test.ratte", "normal", uniqueId, "player", string.Empty, string.Empty, 1, default(Vector3)));
        }

        /// <summary>The player picks up a wolf fur.</summary>
        public void PickUpFur()
        {
            Inventory.TryAddNew(InventoryOwners.Player, TestGroundQuestLibrary.WolfFurId, 1, "test");
            Watcher.EvaluatePending();
        }

        /// <summary>Plays the whole wolf hunt: board, 3 wolves, fur, board.</summary>
        public void FinishWolfHunt()
        {
            ReadBoard();
            KillWolf("wolf_1");
            KillWolf("wolf_2");
            KillWolf("wolf_3");
            PickUpFur();
            ReadBoard();
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
    }
}
