using System;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Quests;
using Aetherfall.SaveSystem;
using Aetherfall.Tests.Shared;
using Aetherfall.WorldState;

namespace Aetherfall.Tests.EditMode.Quests
{
    /// <summary>
    /// Everything a quest needs at run time, built from pure C# objects like the installers do it in the game: event bus,
    /// service locator, world state with flag definitions, condition watcher, quest service with its saveable, fake playtime,
    /// stand-in inventory, action log and day clock. Logs go into a <see cref="LogCapture"/>.
    /// </summary>
    /// <remarks>
    /// Events are published through <see cref="Publish{T}"/>, which also lets the condition watcher evaluate everything that
    /// became dirty (in the game this happens in the next frame).
    /// </remarks>
    public sealed class QuestTestEnvironment : IDisposable
    {
        /// <summary>Load context of a normal (not new) game.</summary>
        public static readonly LoadContext LoadedGame = new LoadContext("char_test/quick_0", SaveFormat.CurrentVersion, false, false, null);

        private bool _disposed;

        /// <summary>Creates the environment.</summary>
        /// <param name="flags">Flag definitions (null = none).</param>
        /// <param name="quests">Quests of the catalog.</param>
        public QuestTestEnvironment(FlagRegistry flags, params QuestSpec[] quests)
        {
            LogCapture = new LogCapture();
            Bus = new EventBus();
            Clock = new FakePlaytimeClock();
            Services = new ServiceLocator();
            Flags = flags ?? new FlagRegistry();
            World = new WorldStateService(Bus, Flags, Clock);
            Watcher = new ConditionWatcher(Bus);
            Inventory = new TestQuestInventory(Bus);
            Actions = new ActionLog();
            DayClock = new TestDayClock();
            SaveLocks = new FakeSaveLocks();
            Catalog = QuestCatalog.FromSpecs(quests);
            Quests = new QuestService(Bus, Catalog, Services, Watcher, Inventory, World, Clock, SaveLocks);
            WorldSaveable = new WorldStateSaveable(World);
            QuestSaveable = new QuestSaveable(Quests);

            Services.Register<IEventBus>(Bus);
            Services.Register<IWorldState>(World);
            Services.Register<IWorldStateDebug>(World);
            Services.Register<IConditionWatcher>(Watcher);
            Services.Register<IQuestService>(Quests);
            Services.Register(Inventory);
            Services.Register(Actions);
            Services.Register(DayClock);

            Quests.PostInitialize();
        }

        /// <summary>Captured log output.</summary>
        public LogCapture LogCapture { get; }

        /// <summary>Event bus.</summary>
        public EventBus Bus { get; }

        /// <summary>Playtime.</summary>
        public FakePlaytimeClock Clock { get; }

        /// <summary>Service locator used by conditions and actions.</summary>
        public ServiceLocator Services { get; }

        /// <summary>Flag definitions.</summary>
        public FlagRegistry Flags { get; }

        /// <summary>World state.</summary>
        public WorldStateService World { get; }

        /// <summary>Condition watcher.</summary>
        public ConditionWatcher Watcher { get; }

        /// <summary>Stand-in inventory.</summary>
        public TestQuestInventory Inventory { get; }

        /// <summary>Effects of stand-in actions.</summary>
        public ActionLog Actions { get; }

        /// <summary>Hour of the day for <see cref="TestHourBetween"/>.</summary>
        public TestDayClock DayClock { get; }

        /// <summary>Save blockers.</summary>
        public FakeSaveLocks SaveLocks { get; }

        /// <summary>Quest catalog.</summary>
        public QuestCatalog Catalog { get; }

        /// <summary>Quest service under test.</summary>
        public QuestService Quests { get; }

        /// <summary>Saveable of the section <c>worldstate</c>.</summary>
        public WorldStateSaveable WorldSaveable { get; }

        /// <summary>Saveable of the section <c>quests</c>.</summary>
        public QuestSaveable QuestSaveable { get; }

        /// <summary>Publishes an event and lets the watcher evaluate everything that became dirty.</summary>
        /// <typeparam name="T">Event type.</typeparam>
        /// <param name="evt">Event.</param>
        public void Publish<T>(T evt) where T : struct, IGameEvent
        {
            Bus.Publish(evt);
            Settle();
        }

        /// <summary>Lets the watcher evaluate everything that is dirty (the next frame in the game).</summary>
        public void Settle()
        {
            Watcher.EvaluatePending();
        }

        /// <summary>Sets the hour of the day and publishes <c>TimeOfDayChanged</c>.</summary>
        /// <param name="hour">Hour 0-23.</param>
        public void SetHour(int hour)
        {
            DayClock.Hour = hour;
            Publish(new TimeOfDayChanged(0, hour, 0, hour >= 6 && hour < 20 ? DayPhase.Day : DayPhase.Night));
        }

        /// <summary>Status of a quest.</summary>
        /// <param name="questId">Quest id.</param>
        public QuestStatus StatusOf(string questId)
        {
            return Quests.GetStatus(questId);
        }

        /// <summary>Active (or last) stage of a quest, empty if never started.</summary>
        /// <param name="questId">Quest id.</param>
        public string StageOf(string questId)
        {
            return Quests.TryGetInstance(questId, out QuestInstance instance) ? instance.StageId : string.Empty;
        }

        /// <summary>
        /// Saves world state and quests, sends both sections through the JSON serializer of the save system (like a real save
        /// file) and loads them into <paramref name="target"/> in load order, followed by <c>OnAfterLoad</c>.
        /// </summary>
        /// <param name="target">Environment that receives the save (usually a fresh one: "game restarted").</param>
        public void SaveAndLoadInto(QuestTestEnvironment target)
        {
            var serializer = new NewtonsoftJsonSerializer();
            string worldJson = serializer.Serialize(WorldSaveable.Save(), false);
            string questJson = serializer.Serialize(QuestSaveable.Save(), false);

            target.Clock.PlaytimeSeconds = Clock.PlaytimeSeconds;
            target.WorldSaveable.Load(serializer.Deserialize(worldJson, target.WorldSaveable.DataType), LoadedGame);
            target.QuestSaveable.Load(serializer.Deserialize(questJson, target.QuestSaveable.DataType), LoadedGame);
            target.QuestSaveable.OnAfterLoad(LoadedGame);
            target.Settle();
        }

        /// <summary>Releases the services and restores the log sink.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            Quests.Dispose();
            Watcher.Dispose();
            Bus.Dispose();
            LogCapture.Dispose();
        }
    }
}
