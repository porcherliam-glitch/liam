using System;
using System.Threading;
using Aetherfall.AI.Bosses;
using Aetherfall.Core;
using Aetherfall.Dialogue;
using Aetherfall.Economy;
using Aetherfall.Events;
using Aetherfall.Input;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.Minigames;
using Aetherfall.Progression;
using Aetherfall.Quests;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens.Dialogue;
using UnityEngine;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The UI of the boot scene (architecture 4.9, 12): owns one UIDocument per layer (HUD 0, Screens 10, Toasts 30,
    /// Loading 40) with shared panel settings, builds the screens from their UXML layouts, attaches them to the UI services of
    /// <see cref="UIInstaller"/> and forwards the global events to the HUD, the messages and the screens. Lives in the boot
    /// scene, so the UI stays across scene changes.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: "UI" in <c>Boot.unity</c> with the child objects HUD, Screens, Toasts and Loading (each a UIDocument)
    /// and MenuCamera. The menu "Aetherfall > Oberflaeche einrichten" creates it and sets all references.</para>
    /// <para>The menu camera renders only in the boot, the main menu and while loading (<see cref="UiFlowRules.UsesMenuCamera"/>):
    /// it clears the screen to the menu colour when no gameplay scene with its own camera is loaded.</para>
    /// <para>The panel settings asset is copied at start: the UI size option changes the copy, never the asset.</para>
    /// <para>Events are subscribed in OnEnable once the services are resolved and unsubscribed in OnDisable. While this
    /// component exists, the pause button belongs to the UI (the stand-in routing of the input service is switched off).</para>
    /// <para>Quests and progression (optional services): the journal (quest log and character page, key J or the pause menu),
    /// the quest tracker and the experience bar of the HUD, and the quest messages (<see cref="QuestNotifier"/>). Without the
    /// journal layouts or the quest service these parts are left out with a warning.</para>
    /// </remarks>
    [DefaultExecutionOrder(-200)]
    [DisallowMultipleComponent]
    public sealed class UIRoot : MonoBehaviour, IUiLayerHost
    {
        [Header("Panel und Ebenen")]
        [Tooltip("Gemeinsame Panel Settings aller Ebenen (Assets/_Project/Settings/UI/AetherfallPanelSettings.asset).")]
        [SerializeField] private PanelSettings panelSettings = null;

        [Tooltip("Ebene HUD (Sortierung 0) mit Hud.uxml.")]
        [SerializeField] private UIDocument hudDocument = null;

        [Tooltip("Ebene Bildschirme (Sortierung 10): Hauptmenü, Pausemenü, Todesbildschirm werden hier eingesetzt.")]
        [SerializeField] private UIDocument screensDocument = null;

        [Tooltip("Ebene Meldungen (Sortierung 30) mit Toasts.uxml.")]
        [SerializeField] private UIDocument toastsDocument = null;

        [Tooltip("Ebene Ladebildschirm (Sortierung 40) mit Loading.uxml.")]
        [SerializeField] private UIDocument loadingDocument = null;

        [Header("Layouts (UXML)")]
        [Tooltip("MainMenu.uxml")]
        [SerializeField] private VisualTreeAsset mainMenuLayout = null;

        [Tooltip("PauseMenu.uxml")]
        [SerializeField] private VisualTreeAsset pauseMenuLayout = null;

        [Tooltip("DeathScreen.uxml")]
        [SerializeField] private VisualTreeAsset deathScreenLayout = null;

        [Tooltip("LoadPage.uxml (Spielstand-Liste in Haupt- und Pausemenü)")]
        [SerializeField] private VisualTreeAsset loadPageLayout = null;

        [Tooltip("SaveSlotRow.uxml (eine Zeile der Spielstand-Liste)")]
        [SerializeField] private VisualTreeAsset saveSlotRowLayout = null;

        [Tooltip("OptionsPage.uxml (Platzhalter-Optionen)")]
        [SerializeField] private VisualTreeAsset optionsPageLayout = null;

        [Tooltip("ToastEntry.uxml (eine Meldung)")]
        [SerializeField] private VisualTreeAsset toastEntryLayout = null;

        [Tooltip("Dialogue.uxml (Dialog-Bildschirm: Untertitel und Antworten)")]
        [SerializeField] private VisualTreeAsset dialogueLayout = null;

        [Header("Layouts Questlog und Charakter (UXML)")]
        [Tooltip("Journal.uxml (Questlog und Charakter-Seite, Taste J oder Pausemenü)")]
        [SerializeField] private VisualTreeAsset journalLayout = null;

        [Tooltip("Trade.uxml (Handel mit einem Händler nach einem Gespräch mit Ende „Handeln“; Zeilen aus QuestRow.uxml)")]
        [SerializeField] private VisualTreeAsset tradeLayout = null;

        [Tooltip("Dice.uxml (Würfelspiel „Krähenwurf“ nach einem Gespräch mit Ende „Würfeln“)")]
        [SerializeField] private VisualTreeAsset diceLayout = null;

        [Tooltip("QuestRow.uxml (eine Quest in der Liste des Questlogs)")]
        [SerializeField] private VisualTreeAsset questRowLayout = null;

        [Tooltip("ObjectiveRow.uxml (ein Ziel mit Kästchen und Zähler; Questlog und HUD)")]
        [SerializeField] private VisualTreeAsset objectiveRowLayout = null;

        [Tooltip("TrackedQuest.uxml (eine verfolgte Quest im HUD, rechts oben)")]
        [SerializeField] private VisualTreeAsset trackedQuestLayout = null;

        [Tooltip("JournalLine.uxml (eine Zeile „Bisher“ oder „Entscheidungen“ im Questlog)")]
        [SerializeField] private VisualTreeAsset journalLineLayout = null;

        [Tooltip("AttributeRow.uxml (ein Attribut auf der Charakter-Seite)")]
        [SerializeField] private VisualTreeAsset attributeRowLayout = null;

        [Tooltip("ValueRow.uxml (ein abgeleiteter Wert auf der Charakter-Seite)")]
        [SerializeField] private VisualTreeAsset valueRowLayout = null;

        [Tooltip("Kamera der Boot-Szene (Objekt MenuCamera): füllt im Hauptmenü und beim Laden das Bild mit der Menüfarbe, " +
                 "solange keine Spielszene mit eigener Kamera geladen ist. Zeigt sonst nichts.")]
        [SerializeField] private Camera menuCamera = null;

        [Header("Verhalten")]
        [Tooltip("Sekunden zwischen dem Tod und dem Todesbildschirm.")]
        [Range(0f, 5f)]
        [SerializeField] private float deathScreenDelay = 1.5f;

        private readonly UiPreferences _preferences = new UiPreferences();
        private PanelSettings _runtimePanelSettings;
        private IUIManager _ui;
        private IEventBus _eventBus;
        private IGameStateService _gameState;
        private IInputService _input;
        private ISaveManager _saves;
        private IGameFlow _flow;
        private IGlyphService _glyphs;
        private IPlayerHudRegistry _players;
        private IInventoryService _inventory;
        private IQuestService _quests;
        private IProgressionService _progression;
        private IBossBarService _bosses;
        private BossBarView _bossBar;
        private QuestNotifier _notifier;
        private JournalScreen _journal;
        private TradeScreen _trade;
        private DiceScreen _dice;
        private IMerchantService _merchants;
        private IDialogueService _dialogues;
        private IDialogueSpeakerDirectory _speakers;
        private Aetherfall.Classes.IClassService _classes;
        private Aetherfall.Skills.ISkillService _skills;
        private UIScreen _pendingMenu;
        private object _pendingMenuArgs;
        private string _pendingMenuReason = string.Empty;
        private LoadingScreenProxy _loadingProxy;
        private UiStateDirector _director;
        private HudView _hud;
        private ToastView _toasts;
        private MainMenuScreen _mainMenu;
        private PauseMenuScreen _pauseMenu;
        private DeathScreen _deathScreen;
        private IPlayerHudSource _deathScreenPlayer;
        private DialogueScreen _dialogueScreen;
        private DialogueScreenDirector _dialogueDirector;
        private readonly DialogueScreenPreferences _dialoguePreferences = new DialogueScreenPreferences();
        private int _screenWidth;
        private int _screenHeight;
        private bool _ready;
        private bool _subscribed;

        /// <inheritdoc />
        public void SetLayerVisible(UILayer layer, bool visible)
        {
            UIDocument document = DocumentOf(layer);
            if (document != null && document.rootVisualElement != null)
            {
                document.rootVisualElement.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
            }
        }

        private void Awake()
        {
            if (panelSettings == null)
            {
                Log.Error(LogCategory.UI, "UIRoot: the field 'Panel Settings' is empty. Run Aetherfall > Oberflaeche einrichten.");
                return;
            }

            // A copy: the UI size option must not change the asset in the project.
            _runtimePanelSettings = Instantiate(panelSettings);
            _runtimePanelSettings.name = panelSettings.name + " (runtime)";
            AssignPanel(hudDocument, (int)UILayer.Hud);
            AssignPanel(screensDocument, (int)UILayer.Screens);
            AssignPanel(toastsDocument, (int)UILayer.Toasts);
            AssignPanel(loadingDocument, (int)UILayer.Loading);
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                // Wait until the boot has registered and initialised all services (state leaves Boot). Waiting for IUIManager
                // itself would never end if the UIInstaller is missing in the BootConfig, without any message.
                IGameStateService gameState = await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                while (gameState.Current == GameState.Boot && Services.Locator != null)
                {
                    await Awaitable.NextFrameAsync(destroyCancellationToken);
                }

                IServiceLocator locator = Services.Locator;
                if (locator == null)
                {
                    // The boot failed and shut the services down; the boot failure screen explains why.
                    return;
                }

                if (!locator.TryGet(out _ui))
                {
                    Log.Error(LogCategory.UI, "UIRoot: no IUIManager is registered - the UIInstaller is missing in the BootConfig. " +
                                              "Run Aetherfall > Oberflaeche einrichten.");
                    return;
                }

                _eventBus = locator.Get<IEventBus>();
                _gameState = locator.Get<IGameStateService>();
                _input = locator.Get<IInputService>();
                _saves = locator.Get<ISaveManager>();
                _flow = locator.Get<IGameFlow>();
                _glyphs = locator.Get<IGlyphService>();
                _players = locator.Get<IPlayerHudRegistry>();
                _loadingProxy = locator.Get<ILoadingScreen>() as LoadingScreenProxy;
                locator.TryGet(out _inventory);
                locator.TryGet(out _quests);
                locator.TryGet(out _progression);
                locator.TryGet(out _bosses);
                locator.TryGet(out _merchants);
                locator.TryGet(out _speakers);
                locator.TryGet(out _classes);
                locator.TryGet(out _skills);
                Build();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.UI, exception, "UIRoot could not build the user interface. Is the UIInstaller in the BootConfig " +
                                                         "(Aetherfall > Oberflaeche einrichten)?");
            }
        }

        private void Build()
        {
            if (!CheckReferences())
            {
                return;
            }

            VisualElement screensRoot = screensDocument.rootVisualElement;
            _mainMenu = new MainMenuScreen(CloneScreen(mainMenuLayout, screensRoot), loadPageLayout, saveSlotRowLayout, optionsPageLayout, _glyphs,
                _flow, _preferences, UiTexts.Format(UiTextKeys.Version, Application.version), _classes);
            _pauseMenu = new PauseMenuScreen(CloneScreen(pauseMenuLayout, screensRoot), loadPageLayout, saveSlotRowLayout, optionsPageLayout, _glyphs,
                _flow, _gameState, _saves, _preferences, HasJournalLayouts() ? OpenJournalFromPause : (Func<bool>)null);
            _deathScreen = new DeathScreen(CloneScreen(deathScreenLayout, screensRoot), _glyphs, _flow, OnDeathLoadLast, OnDeathRespawn);
            _ui.RegisterScreen(_mainMenu);
            _ui.RegisterScreen(_pauseMenu);
            _ui.RegisterScreen(_deathScreen);
            BuildDialogueScreen(screensRoot);
            if (HasJournalLayouts())
            {
                _journal = new JournalScreen(CloneScreen(journalLayout, screensRoot), questRowLayout, objectiveRowLayout, journalLineLayout,
                    attributeRowLayout, valueRowLayout, _glyphs, _quests, _progression, OnJournalCloseRequested, _skills);
                _ui.RegisterScreen(_journal);
            }
            else
            {
                Log.Warning(LogCategory.UI, "UIRoot: the journal layouts (Journal.uxml, QuestRow.uxml, ObjectiveRow.uxml, JournalLine.uxml, " +
                                            "AttributeRow.uxml, ValueRow.uxml) are not set - no quest log. Run Aetherfall > Oberflaeche einrichten.");
            }

            if (tradeLayout != null && questRowLayout != null && _merchants != null && _inventory != null)
            {
                _trade = new TradeScreen(CloneScreen(tradeLayout, screensRoot), questRowLayout, _glyphs, _merchants, _inventory, OnTradeCloseRequested);
                _ui.RegisterScreen(_trade);
            }

            if (diceLayout != null && _inventory != null)
            {
                _dice = new DiceScreen(CloneScreen(diceLayout, screensRoot), _glyphs, _inventory, null, OnDiceCloseRequested);
                _ui.RegisterScreen(_dice);
            }

            _hud = new HudView(hudDocument.rootVisualElement, _players, _inventory, _glyphs, _preferences);
            VisualElement hudRoot = hudDocument.rootVisualElement;
            QuestTrackerView tracker = _quests != null && trackedQuestLayout != null && objectiveRowLayout != null && hudRoot.Q<VisualElement>("hud-quests") != null
                ? new QuestTrackerView(hudRoot.Q<VisualElement>("hud-quests"), trackedQuestLayout, objectiveRowLayout, _quests)
                : null;
            XpBarView xpBar = _progression != null && hudRoot.Q<VisualElement>("hud-xp") != null ? new XpBarView(hudRoot.Q<VisualElement>("hud-xp"), _progression) : null;
            _hud.AttachProgressViews(tracker, xpBar);
            _bossBar = new BossBarView(hudRoot);
            if (_quests != null)
            {
                _notifier = new QuestNotifier(_quests, ShowNotification) { Enabled = NotifiesQuests(_gameState.Current) };
            }
            _toasts = new ToastView(toastsDocument.rootVisualElement, toastEntryLayout, _ui.Notifications);
            var loadingView = new LoadingScreenView(loadingDocument.rootVisualElement);
            if (_loadingProxy != null)
            {
                _loadingProxy.Attach(loadingView);
            }

            _director = new UiStateDirector(_ui, _gameState, _input.Gameplay, _input.WasPausePressedThisFrame, _flow, _mainMenu, _pauseMenu,
                _deathScreen, deathScreenDelay);
            _director.AttachJournal(_journal);
            _director.AttachMenu(_trade);
            _director.AttachMenu(_dice);
            _ui.AttachLayerHost(this);
            _input.SetPauseButtonRouting(false);
            _glyphs.SetStyleOverride(_preferences.GlyphStyle);
            _ready = true;
            Subscribe();
            ApplyUiScale(true);
            _director.Apply(_gameState.Current);
            ApplyMenuCamera(_gameState.Current);
            HandOverPlayer();
            Log.Info(LogCategory.UI, "UIRoot: user interface ready (main menu, pause menu, death screen, HUD, messages, loading screen" +
                                     (_journal != null ? ", journal" : string.Empty) + (tracker != null ? ", quest tracker" : string.Empty) + ").");
        }

        private void OnEnable()
        {
            Subscribe();
        }

        private void OnDisable()
        {
            if (!_subscribed)
            {
                return;
            }

            _eventBus.Unsubscribe<GameStateChanged>(OnGameStateChanged);
            _eventBus.Unsubscribe<PlayerDied>(OnPlayerDied);
            _eventBus.Unsubscribe<PlayerSpawned>(OnPlayerSpawned);
            _eventBus.Unsubscribe<GameLoaded>(OnGameLoaded);
            _eventBus.Unsubscribe<GameSaved>(OnGameSaved);
            _eventBus.Unsubscribe<ItemPickedUp>(OnItemPickedUp);
            _eventBus.Unsubscribe<CurrencyChanged>(OnCurrencyChanged);
            _eventBus.Unsubscribe<XpGained>(OnXpGained);
            _eventBus.Unsubscribe<LevelUp>(OnLevelUp);
            _eventBus.Unsubscribe<CombatStateChanged>(OnCombatStateChanged);
            _eventBus.Unsubscribe<QuestStarted>(OnQuestStarted);
            _eventBus.Unsubscribe<QuestStageChanged>(OnQuestStageChanged);
            _eventBus.Unsubscribe<ObjectiveProgressed>(OnObjectiveProgressed);
            _eventBus.Unsubscribe<QuestCompleted>(OnQuestCompleted);
            _eventBus.Unsubscribe<QuestFailed>(OnQuestFailed);
            _glyphs.Changed -= OnGlyphsChanged;
            _preferences.Changed -= OnPreferencesChanged;
            _flow.Failed -= OnFlowFailed;
            if (_dialogues != null)
            {
                _dialogues.Ended -= OnDialogueEnded;
            }

            _players.Changed -= HandOverPlayer;
            _ui.ScreenOpened -= OnScreenOpened;
            if (_bosses != null)
            {
                _bosses.Changed -= OnBossBarChanged;
            }

            _subscribed = false;
        }

        private void OnDestroy()
        {
            if (_ready)
            {
                _ui.AttachLayerHost(null);
                _input.SetPauseButtonRouting(true);
                if (_loadingProxy != null)
                {
                    _loadingProxy.Attach(null);
                }

                if (_deathScreenPlayer != null)
                {
                    _deathScreenPlayer.SetAutoRespawn(true);
                }
            }

            if (_runtimePanelSettings != null)
            {
                Destroy(_runtimePanelSettings);
            }
        }

        private void Update()
        {
            if (!_ready)
            {
                return;
            }

            float dt = Time.unscaledDeltaTime;
            _director.Update(dt);
            if (_pendingMenu != null && _gameState.Current == GameState.Playing)
            {
                // The conversation that ended with "Handeln" or "Würfeln" has handed the game back: now the screen can open.
                _director.OpenMenu(_pendingMenu, _pendingMenuArgs, _pendingMenuReason);
                _pendingMenu = null;
                _pendingMenuArgs = null;
            }

            if (_dialogueDirector != null)
            {
                _dialogueDirector.Update();
            }

            if (_director.PeekRequested)
            {
                _hud.Peek();
            }

            _hud.Tick(dt);
            _bossBar.Tick(dt);
            if (_notifier != null)
            {
                _notifier.Update(Time.realtimeSinceStartupAsDouble);
            }

            _toasts.SetProgressTop(_hud.QuestTrackerBottom);
            _toasts.Tick(dt, _saves.IsBusy && _gameState.Current != GameState.Loading);
            ApplyUiScale(false);
        }

        private void Subscribe()
        {
            if (!_ready || _subscribed || !isActiveAndEnabled)
            {
                return;
            }

            _eventBus.Subscribe<GameStateChanged>(OnGameStateChanged);
            _eventBus.Subscribe<PlayerDied>(OnPlayerDied);
            _eventBus.Subscribe<PlayerSpawned>(OnPlayerSpawned);
            _eventBus.Subscribe<GameLoaded>(OnGameLoaded);
            _eventBus.Subscribe<GameSaved>(OnGameSaved);
            _eventBus.Subscribe<ItemPickedUp>(OnItemPickedUp);
            _eventBus.Subscribe<CurrencyChanged>(OnCurrencyChanged);
            _eventBus.Subscribe<XpGained>(OnXpGained);
            _eventBus.Subscribe<LevelUp>(OnLevelUp);
            _eventBus.Subscribe<CombatStateChanged>(OnCombatStateChanged);
            _eventBus.Subscribe<QuestStarted>(OnQuestStarted);
            _eventBus.Subscribe<QuestStageChanged>(OnQuestStageChanged);
            _eventBus.Subscribe<ObjectiveProgressed>(OnObjectiveProgressed);
            _eventBus.Subscribe<QuestCompleted>(OnQuestCompleted);
            _eventBus.Subscribe<QuestFailed>(OnQuestFailed);
            _glyphs.Changed += OnGlyphsChanged;
            _preferences.Changed += OnPreferencesChanged;
            _flow.Failed += OnFlowFailed;
            _players.Changed += HandOverPlayer;
            _ui.ScreenOpened += OnScreenOpened;
            if (_dialogues != null)
            {
                _dialogues.Ended += OnDialogueEnded;
            }

            if (_bosses != null)
            {
                _bosses.Changed += OnBossBarChanged;
                OnBossBarChanged(_bosses.Current);
            }

            _subscribed = true;
        }

        private void OnBossBarChanged(BossBarState state)
        {
            _bossBar.Apply(state);
            _hud.SetTargetHidden(state.Visible);
        }

        private void OnGameStateChanged(GameStateChanged evt)
        {
            if (_notifier != null)
            {
                // A loaded game recounts its objectives: no messages while loading or outside the game.
                _notifier.Enabled = NotifiesQuests(evt.Current);
                if (evt.Current == GameState.MainMenu)
                {
                    _notifier.Reset();
                }
            }

            _director.Apply(evt.Current);
            ApplyMenuCamera(evt.Current);
        }

        private void ApplyMenuCamera(GameState state)
        {
            if (menuCamera != null)
            {
                menuCamera.enabled = UiFlowRules.UsesMenuCamera(state);
            }
        }

        private void OnPlayerDied(PlayerDied evt)
        {
            _director.OnPlayerDied();
        }

        private void OnPlayerSpawned(PlayerSpawned evt)
        {
            _director.OnPlayerSpawned();
        }

        private void OnGameLoaded(GameLoaded evt)
        {
            _director.OnGameLoaded();
            _hud.ResetState();
            if (_notifier != null)
            {
                _notifier.Reset();
            }

            // The tracked quests show for a moment, so the player sees where the game continues.
            _hud.Rules.NotifyQuestActivity();
            if (!string.IsNullOrEmpty(evt.SlotId))
            {
                _ui.ShowToast(Notification.Message(NotificationPriority.Progress, UiTexts.Get(UiTextKeys.NoteLoaded), "saved"));
            }
        }

        private void OnGameSaved(GameSaved evt)
        {
            if (!evt.Success)
            {
                _ui.ShowToast(Notification.Message(NotificationPriority.Progress, UiTexts.Get(UiTextKeys.NoteSaveFailed), "warning"));
                return;
            }

            // Autosaves only show the save indicator (GDD 05 1.2); manual and quick saves also a message.
            if (evt.Kind == SaveKind.Quick || evt.Kind == SaveKind.Manual)
            {
                string key = evt.Kind == SaveKind.Quick ? UiTextKeys.NoteSavedQuick : UiTextKeys.NoteSaved;
                _ui.ShowToast(Notification.Message(NotificationPriority.Progress, UiTexts.Get(key), "saved"));
            }
        }

        private void OnItemPickedUp(ItemPickedUp evt)
        {
            string name = evt.ItemId;
            string accent = string.Empty;
            if (_inventory != null && _inventory.Catalog.TryGetItem(evt.ItemId, out ItemSpec spec))
            {
                name = spec.DisplayName;
                accent = UiColorTokens.RarityAccent((int)NewestRarity(evt.ItemId, spec.BaseRarity));
            }

            _ui.ShowToast(Notification.Item(name, evt.ItemId, evt.Amount, accent));
        }

        private void OnCurrencyChanged(CurrencyChanged evt)
        {
            if (evt.Delta == 0)
            {
                return;
            }

            _ui.ShowToast(Notification.Currency(CurrencyIds.GermanName(evt.CurrencyId), evt.CurrencyId, evt.Delta));
        }

        private void OnXpGained(XpGained evt)
        {
            _ui.ShowToast(Notification.Experience(evt.Amount));
            _hud.Rules.NotifyXpGained();
        }

        private void OnLevelUp(LevelUp evt)
        {
            _hud.Rules.NotifyXpGained();
            if (_notifier != null)
            {
                _notifier.OnLevelUp(evt.NewLevel, Time.realtimeSinceStartupAsDouble);
            }
            else
            {
                _ui.ShowToast(Notification.LevelUp(evt.NewLevel));
            }
        }

        private void OnQuestStarted(QuestStarted evt)
        {
            _hud.Rules.NotifyQuestActivity();
            if (_notifier != null)
            {
                _notifier.OnQuestStarted(evt.QuestId);
            }
        }

        private void OnQuestStageChanged(QuestStageChanged evt)
        {
            _hud.Rules.NotifyQuestActivity();
            if (_notifier != null)
            {
                _notifier.OnStageChanged(evt.QuestId, evt.StageId, evt.PreviousStageId);
            }
        }

        private void OnObjectiveProgressed(ObjectiveProgressed evt)
        {
            _hud.Rules.NotifyQuestActivity();
            if (_hud.QuestTracker != null)
            {
                _hud.QuestTracker.OnObjectiveProgressed(evt.QuestId, evt.ObjectiveId, evt.Current, evt.Required);
            }

            if (_notifier != null)
            {
                _notifier.OnObjectiveProgressed(evt.QuestId, evt.ObjectiveId, evt.Current, evt.Required, Time.realtimeSinceStartupAsDouble);
            }
        }

        private void OnQuestCompleted(QuestCompleted evt)
        {
            _hud.Rules.NotifyQuestActivity();
            if (_notifier != null)
            {
                _notifier.OnQuestCompleted(evt.QuestId);
            }
        }

        private void OnQuestFailed(QuestFailed evt)
        {
            _hud.Rules.NotifyQuestActivity();
            if (_notifier != null)
            {
                _notifier.OnQuestFailed(evt.QuestId);
            }
        }

        private void ShowNotification(Notification notification)
        {
            _ui.ShowToast(notification);
        }

        /// <summary>Opens the journal on a page like its keys do (J, K; tools and check runs use it too).</summary>
        /// <param name="page">Page.</param>
        /// <returns>False if the journal cannot open now (no layouts, wrong game state).</returns>
        public bool OpenJournal(JournalPage page)
        {
            return _director != null && _director.OpenJournal(page);
        }

        private bool OpenJournalFromPause()
        {
            return _director != null && _director.OpenJournal(JournalPage.Quests);
        }

        private void OnJournalCloseRequested()
        {
            _director.CloseJournal();
            // GDD 05 1.2: the tracked quests show for a moment after closing the quest log.
            _hud.Rules.NotifyQuestActivity();
        }

        private void OnTradeCloseRequested()
        {
            _director.CloseMenu(_trade);
        }

        private void OnDiceCloseRequested()
        {
            _director.CloseMenu(_dice);
        }

        private void OnDialogueEnded(DialogueEndInfo info)
        {
            if (info.Cancelled)
            {
                return;
            }

            if (info.FollowUp == DialogueFollowUp.Trade && _trade != null && _merchants != null && _merchants.TryGetForNpc(info.NpcId, out MerchantDefinition merchant))
            {
                RequestMenu(_trade, merchant.Id, "Trade");
            }
            else if (info.FollowUp == DialogueFollowUp.Minigame && _dice != null && info.ExitId == CrowThrowGame.DialogueExitId)
            {
                string opponent = _speakers != null && _speakers.TryGetSpeaker(info.NpcId, out DialogueSpeakerInfo speaker) ? speaker.Name : string.Empty;
                RequestMenu(_dice, opponent, "Dice game");
            }
        }

        private void RequestMenu(UIScreen screen, object args, string reason)
        {
            _pendingMenu = screen;
            _pendingMenuArgs = args;
            _pendingMenuReason = reason;
        }

        private static bool NotifiesQuests(GameState state)
        {
            return state != GameState.Loading && state != GameState.MainMenu && state != GameState.Boot;
        }

        private bool HasJournalLayouts()
        {
            return journalLayout != null && questRowLayout != null && objectiveRowLayout != null && journalLineLayout != null &&
                   attributeRowLayout != null && valueRowLayout != null;
        }

        private void OnCombatStateChanged(CombatStateChanged evt)
        {
            _ui.Notifications.SetInCombat(evt.InCombat, Time.realtimeSinceStartupAsDouble);
            _hud.SetInCombat(evt.InCombat);
        }

        private void OnGlyphsChanged()
        {
            _mainMenu.RefreshGlyphs();
            _pauseMenu.RefreshGlyphs();
            _deathScreen.RefreshGlyphs();
            if (_dialogueScreen != null)
            {
                _dialogueScreen.RefreshGlyphs();
            }

            if (_journal != null)
            {
                _journal.RefreshGlyphs();
            }

            if (_trade != null)
            {
                _trade.RefreshGlyphs();
            }

            if (_dice != null)
            {
                _dice.RefreshGlyphs();
            }

            _hud.RefreshGlyphs();
        }

        private void OnPreferencesChanged()
        {
            _glyphs.SetStyleOverride(_preferences.GlyphStyle);
            ApplyUiScale(true);
        }

        private void OnFlowFailed(string message)
        {
            _director.ShowFailure(message);
        }

        private void OnScreenOpened(UIScreen screen)
        {
            var opened = new ScreenOpened(screen.ScreenId);
            _eventBus.Publish(in opened);
        }

        private void OnDeathLoadLast()
        {
            _director.LoadLastSave();
        }

        private void OnDeathRespawn()
        {
            _director.RespawnAtSpawnPoint();
        }

        private void HandOverPlayer()
        {
            // The death screen decides about respawning, so the automatic respawn of the player is switched off.
            IPlayerHudSource player = _players.Current;
            if (ReferenceEquals(player, _deathScreenPlayer))
            {
                return;
            }

            _deathScreenPlayer = player;
            if (player != null)
            {
                player.SetAutoRespawn(false);
            }
        }

        private ItemRarity NewestRarity(string itemId, ItemRarity fallback)
        {
            // The event carries no rarity: the newest unseen instance of this item in the bag is the one just picked up.
            InventoryContainer bag = _inventory.PlayerContainer;
            ItemRarity best = fallback;
            bool found = false;
            for (int i = 0; i < bag.Entries.Count; i++)
            {
                ItemInstance instance = bag.Entries[i];
                if (instance.IsNew && string.Equals(instance.ItemId, itemId, StringComparison.Ordinal) && (!found || instance.Rarity > best))
                {
                    best = instance.Rarity;
                    found = true;
                }
            }

            return best;
        }

        private void ApplyUiScale(bool force)
        {
            if (_runtimePanelSettings == null || (!force && Screen.width == _screenWidth && Screen.height == _screenHeight))
            {
                return;
            }

            _screenWidth = Screen.width;
            _screenHeight = Screen.height;
            _runtimePanelSettings.scale = UiScaleRules.PanelScale(_preferences.UiPercent, _screenWidth, _screenHeight);
        }

        private bool CheckReferences()
        {
            if (screensDocument == null || hudDocument == null || toastsDocument == null || loadingDocument == null ||
                mainMenuLayout == null || pauseMenuLayout == null || deathScreenLayout == null || loadPageLayout == null ||
                saveSlotRowLayout == null || optionsPageLayout == null || toastEntryLayout == null)
            {
                Log.Error(LogCategory.UI, "UIRoot on '" + name + "': UIDocuments or UXML layouts are missing. Run Aetherfall > Oberflaeche " +
                                          "einrichten to set them.");
                return false;
            }

            return true;
        }

        private void AssignPanel(UIDocument document, int sortingOrder)
        {
            if (document == null)
            {
                return;
            }

            document.panelSettings = _runtimePanelSettings;
            document.sortingOrder = sortingOrder;
        }

        private UIDocument DocumentOf(UILayer layer)
        {
            switch (layer)
            {
                case UILayer.Hud: return hudDocument;
                case UILayer.Screens: return screensDocument;
                case UILayer.Toasts: return toastsDocument;
                case UILayer.Loading: return loadingDocument;
                default: return null;
            }
        }

        private void BuildDialogueScreen(VisualElement screensRoot)
        {
            // Without DialogueInstaller in the BootConfig, or without the layout, there is simply no dialogue screen.
            if (dialogueLayout == null || !Services.Locator.TryGet(out IDialogueService dialogues))
            {
                Log.Warning(LogCategory.UI, "UIRoot: no dialogue screen (field 'Dialogue Layout' empty or DialogueInstaller missing).");
                return;
            }

            _dialogues = dialogues;
            var source = new DialogueServiceScreenSource(dialogues);
            _dialogueScreen = new DialogueScreen(CloneScreen(dialogueLayout, screensRoot), _glyphs, source, new DialogMapScreenInput(_input),
                _dialoguePreferences);
            _ui.RegisterScreen(_dialogueScreen);
            _dialogueDirector = new DialogueScreenDirector(_ui, _dialogueScreen, source);
        }

        private static VisualElement CloneScreen(VisualTreeAsset layout, VisualElement parent)
        {
            // CloneTree into the parent: the screen root (first element of the layout) becomes a direct child.
            int before = parent.childCount;
            layout.CloneTree(parent);
            return parent.childCount > before ? parent[before] : null;
        }
    }
}
