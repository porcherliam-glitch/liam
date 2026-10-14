using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Dialogue;
using Aetherfall.Events;
using Aetherfall.NPC;
using Aetherfall.SaveSystem;
using Aetherfall.Tests.Shared;
using Aetherfall.WorldState;

namespace Aetherfall.Tests.EditMode.Dialogue
{
    /// <summary>
    /// Everything a conversation needs at run time, built from pure C# objects like the installers do it in the game: event bus,
    /// service locator, game state (Playing), world state with flag definitions, NPC service (speaker directory), dialogue
    /// service with fake player values, gold and save locks, recorders for the dialogue events, and stand-in services for
    /// effects and switches. Logs go into a <see cref="LogCapture"/>.
    /// </summary>
    public sealed class DialogueTestEnvironment : IDisposable
    {
        /// <summary>Load context of a normal (not new) game.</summary>
        public static readonly LoadContext LoadedGame = new LoadContext("char_test/quick_0", SaveFormat.CurrentVersion, false, false, null);

        private bool _disposed;

        /// <summary>Creates the environment.</summary>
        /// <param name="rules">Dialogue rules (null = deterministic checks).</param>
        /// <param name="npcs">NPCs (null = none).</param>
        /// <param name="flags">Flag definitions (null = none).</param>
        /// <param name="dialogues">Dialogues of the catalog.</param>
        public DialogueTestEnvironment(DialogueRules rules, NpcCatalog npcs, FlagRegistry flags, params DialogueSpec[] dialogues)
        {
            LogCapture = new LogCapture();
            Bus = new EventBus();
            Services = new ServiceLocator();
            TimeScale = new FakeTimeScaleService();
            GameState = new GameStateService(Bus, TimeScale);
            GameState.SwitchBase(Core.GameState.MainMenu, "test");
            GameState.SwitchBase(Core.GameState.Loading, "test");
            GameState.SwitchBase(Core.GameState.Playing, "test");
            Clock = new FakePlaytime();
            World = new WorldStateService(Bus, flags ?? new FlagRegistry(), Clock);
            Npcs = new NpcService(Bus, npcs ?? new NpcCatalog());
            Stats = new FakeCheckStats();
            Wallet = new FakeWallet();
            Saves = new FakeSaveLocks();
            Calendar = new FixedCalendar();
            Effects = new EffectLog();
            Switches = new TestSwitches();
            Catalog = DialogueCatalog.FromSpecs(dialogues);
            Dialogues = new DialogueService(Bus, Catalog, Services, Stats, Wallet, GameState, Saves, rules);
            DialogueSaveable = new DialogueSaveable(Dialogues);
            NpcSaveable = new NpcSaveable(Npcs);
            WorldSaveable = new WorldStateSaveable(World);

            Services.Register<IEventBus>(Bus);
            Services.Register<IGameStateService>(GameState);
            Services.Register<IWorldState>(World);
            Services.Register<INpcService>(Npcs);
            Services.Register<IDialogueSpeakerDirectory>(Npcs);
            Services.Register<IDialogueService>(Dialogues);
            Services.Register<IDialogueMemory>(Dialogues);
            Services.Register<IDialogueCheckStats>(Stats);
            Services.Register<IDialogueWallet>(Wallet);
            Services.Register<IDialogueCalendar>(Calendar);
            Services.Register(Effects);
            Services.Register(Switches);
            Dialogues.PostInitialize();

            Talked = new EventRecorder<NPCTalkedTo>(Bus);
            Started = new EventRecorder<DialogueStarted>(Bus);
            Choices = new EventRecorder<ChoiceMade>(Bus);
            Checks = new EventRecorder<SkillCheckResolved>(Bus);
            Outcomes = new EventRecorder<DialogOutcome>(Bus);
            Topics = new EventRecorder<TopicUnlocked>(Bus);
            Deaths = new EventRecorder<NPCDied>(Bus);
            Relationships = new EventRecorder<RelationshipChanged>(Bus);
        }

        /// <summary>Captured log output.</summary>
        public LogCapture LogCapture { get; }

        /// <summary>Event bus.</summary>
        public EventBus Bus { get; }

        /// <summary>Service locator used by conditions and actions.</summary>
        public ServiceLocator Services { get; }

        /// <summary>Time scale stand-in of the game state.</summary>
        public FakeTimeScaleService TimeScale { get; }

        /// <summary>Game state (starts in Playing).</summary>
        public GameStateService GameState { get; }

        /// <summary>Playtime.</summary>
        public FakePlaytime Clock { get; }

        /// <summary>World state.</summary>
        public WorldStateService World { get; }

        /// <summary>NPC service.</summary>
        public NpcService Npcs { get; }

        /// <summary>Player values.</summary>
        public FakeCheckStats Stats { get; }

        /// <summary>Gold.</summary>
        public FakeWallet Wallet { get; }

        /// <summary>Save locks.</summary>
        public FakeSaveLocks Saves { get; }

        /// <summary>Game day.</summary>
        public FixedCalendar Calendar { get; }

        /// <summary>Effects of stand-in actions.</summary>
        public EffectLog Effects { get; }

        /// <summary>Switches of stand-in conditions.</summary>
        public TestSwitches Switches { get; }

        /// <summary>Dialogue catalog.</summary>
        public DialogueCatalog Catalog { get; }

        /// <summary>Dialogue service under test.</summary>
        public DialogueService Dialogues { get; }

        /// <summary>Saveable of the section <c>dialogue</c>.</summary>
        public DialogueSaveable DialogueSaveable { get; }

        /// <summary>Saveable of the section <c>npcs</c>.</summary>
        public NpcSaveable NpcSaveable { get; }

        /// <summary>Saveable of the section <c>worldstate</c>.</summary>
        public WorldStateSaveable WorldSaveable { get; }

        /// <summary>Recorded <c>NPCTalkedTo</c>.</summary>
        public EventRecorder<NPCTalkedTo> Talked { get; }

        /// <summary>Recorded <c>DialogueStarted</c>.</summary>
        public EventRecorder<DialogueStarted> Started { get; }

        /// <summary>Recorded <c>ChoiceMade</c>.</summary>
        public EventRecorder<ChoiceMade> Choices { get; }

        /// <summary>Recorded <c>SkillCheckResolved</c>.</summary>
        public EventRecorder<SkillCheckResolved> Checks { get; }

        /// <summary>Recorded <c>DialogOutcome</c>.</summary>
        public EventRecorder<DialogOutcome> Outcomes { get; }

        /// <summary>Recorded <c>TopicUnlocked</c>.</summary>
        public EventRecorder<TopicUnlocked> Topics { get; }

        /// <summary>Recorded <c>NPCDied</c>.</summary>
        public EventRecorder<NPCDied> Deaths { get; }

        /// <summary>Recorded <c>RelationshipChanged</c>.</summary>
        public EventRecorder<RelationshipChanged> Relationships { get; }

        /// <summary>What the dialogue screen shows.</summary>
        public DialogueView View => Dialogues.View;

        /// <summary>Starts a dialogue.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="npcId">Partner.</param>
        public bool Start(string dialogueId, string npcId)
        {
            return Dialogues.TryStart(new DialogueStartRequest(dialogueId, npcId, string.Empty, "test"));
        }

        /// <summary>Index of the visible option with this id; -1 if not visible.</summary>
        /// <param name="optionId">Option id.</param>
        public int IndexOf(string optionId)
        {
            IReadOnlyList<DialogueOptionView> options = View.Options;
            for (int i = 0; i < options.Count; i++)
            {
                if (options[i].OptionId == optionId)
                {
                    return i;
                }
            }

            return -1;
        }

        /// <summary>The visible option with this id; fails if it is not visible.</summary>
        /// <param name="optionId">Option id.</param>
        public DialogueOptionView Option(string optionId)
        {
            int index = IndexOf(optionId);
            if (index < 0)
            {
                throw new InvalidOperationException("Option '" + optionId + "' is not visible at " + View.NodeId + ".");
            }

            return View.Options[index];
        }

        /// <summary>Chooses the visible option with this id.</summary>
        /// <param name="optionId">Option id.</param>
        /// <returns>False if the option is not visible or greyed.</returns>
        public bool Choose(string optionId)
        {
            int index = IndexOf(optionId);
            return index >= 0 && Dialogues.Choose(index);
        }

        /// <summary>Continues after the shown line; fails if no line is shown.</summary>
        public void Continue()
        {
            if (!Dialogues.Continue())
            {
                throw new InvalidOperationException("No line is shown (state " + View.State + " at " + View.NodeId + ").");
            }
        }

        /// <summary>Value of a flag.</summary>
        /// <param name="flagId">Flag id.</param>
        public int Flag(string flagId)
        {
            return World.GetInt(flagId);
        }

        /// <summary>
        /// Saves world state, NPCs and dialogue memory through the JSON serializer of the save system (like a real save file) and
        /// loads them into <paramref name="target"/> in load order.
        /// </summary>
        /// <param name="target">Environment that receives the save.</param>
        public void SaveAndLoadInto(DialogueTestEnvironment target)
        {
            var serializer = new NewtonsoftJsonSerializer();
            string world = serializer.Serialize(WorldSaveable.Save(), false);
            string dialogue = serializer.Serialize(DialogueSaveable.Save(), false);
            string npcs = serializer.Serialize(NpcSaveable.Save(), false);
            target.WorldSaveable.Load(serializer.Deserialize(world, target.WorldSaveable.DataType), LoadedGame);
            target.DialogueSaveable.Load(serializer.Deserialize(dialogue, target.DialogueSaveable.DataType), LoadedGame);
            target.NpcSaveable.Load(serializer.Deserialize(npcs, target.NpcSaveable.DataType), LoadedGame);
        }

        /// <summary>Releases the services and restores the log sink.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            Talked.Dispose();
            Started.Dispose();
            Choices.Dispose();
            Checks.Dispose();
            Outcomes.Dispose();
            Topics.Dispose();
            Deaths.Dispose();
            Relationships.Dispose();
            Dialogues.Dispose();
            Bus.Dispose();
            LogCapture.Dispose();
        }
    }
}
