using System;
using System.Threading;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Input;
using Aetherfall.Inventory;
using Aetherfall.Items;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Framework;
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
        private LoadingScreenProxy _loadingProxy;
        private UiStateDirector _director;
        private HudView _hud;
        private ToastView _toasts;
        private MainMenuScreen _mainMenu;
        private PauseMenuScreen _pauseMenu;
        private DeathScreen _deathScreen;
        private IPlayerHudSource _deathScreenPlayer;
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
                _flow, _preferences, UiTexts.Format(UiTextKeys.Version, Application.version));
            _pauseMenu = new PauseMenuScreen(CloneScreen(pauseMenuLayout, screensRoot), loadPageLayout, saveSlotRowLayout, optionsPageLayout, _glyphs,
                _flow, _gameState, _saves, _preferences);
            _deathScreen = new DeathScreen(CloneScreen(deathScreenLayout, screensRoot), _glyphs, _flow, OnDeathLoadLast, OnDeathRespawn);
            _ui.RegisterScreen(_mainMenu);
            _ui.RegisterScreen(_pauseMenu);
            _ui.RegisterScreen(_deathScreen);

            _hud = new HudView(hudDocument.rootVisualElement, _players, _inventory, _glyphs, _preferences);
            _toasts = new ToastView(toastsDocument.rootVisualElement, toastEntryLayout, _ui.Notifications);
            var loadingView = new LoadingScreenView(loadingDocument.rootVisualElement);
            if (_loadingProxy != null)
            {
                _loadingProxy.Attach(loadingView);
            }

            _director = new UiStateDirector(_ui, _gameState, _input.Gameplay, _input.WasPausePressedThisFrame, _flow, _mainMenu, _pauseMenu,
                _deathScreen, deathScreenDelay);
            _ui.AttachLayerHost(this);
            _input.SetPauseButtonRouting(false);
            _glyphs.SetStyleOverride(_preferences.GlyphStyle);
            _ready = true;
            Subscribe();
            ApplyUiScale(true);
            _director.Apply(_gameState.Current);
            ApplyMenuCamera(_gameState.Current);
            HandOverPlayer();
            Log.Info(LogCategory.UI, "UIRoot: user interface ready (main menu, pause menu, death screen, HUD, messages, loading screen).");
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
            _eventBus.Unsubscribe<GameLoaded>(OnGameLoaded);
            _eventBus.Unsubscribe<GameSaved>(OnGameSaved);
            _eventBus.Unsubscribe<ItemPickedUp>(OnItemPickedUp);
            _eventBus.Unsubscribe<CurrencyChanged>(OnCurrencyChanged);
            _eventBus.Unsubscribe<XpGained>(OnXpGained);
            _eventBus.Unsubscribe<LevelUp>(OnLevelUp);
            _eventBus.Unsubscribe<CombatStateChanged>(OnCombatStateChanged);
            _glyphs.Changed -= OnGlyphsChanged;
            _preferences.Changed -= OnPreferencesChanged;
            _flow.Failed -= OnFlowFailed;
            _players.Changed -= HandOverPlayer;
            _ui.ScreenOpened -= OnScreenOpened;
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
            if (_director.PeekRequested)
            {
                _hud.Peek();
            }

            _hud.Tick(dt);
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
            _eventBus.Subscribe<GameLoaded>(OnGameLoaded);
            _eventBus.Subscribe<GameSaved>(OnGameSaved);
            _eventBus.Subscribe<ItemPickedUp>(OnItemPickedUp);
            _eventBus.Subscribe<CurrencyChanged>(OnCurrencyChanged);
            _eventBus.Subscribe<XpGained>(OnXpGained);
            _eventBus.Subscribe<LevelUp>(OnLevelUp);
            _eventBus.Subscribe<CombatStateChanged>(OnCombatStateChanged);
            _glyphs.Changed += OnGlyphsChanged;
            _preferences.Changed += OnPreferencesChanged;
            _flow.Failed += OnFlowFailed;
            _players.Changed += HandOverPlayer;
            _ui.ScreenOpened += OnScreenOpened;
            _subscribed = true;
        }

        private void OnGameStateChanged(GameStateChanged evt)
        {
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

        private void OnGameLoaded(GameLoaded evt)
        {
            _director.OnGameLoaded();
            _hud.ResetState();
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
        }

        private void OnLevelUp(LevelUp evt)
        {
            _ui.ShowToast(Notification.LevelUp(evt.NewLevel));
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

        private static VisualElement CloneScreen(VisualTreeAsset layout, VisualElement parent)
        {
            // CloneTree into the parent: the screen root (first element of the layout) becomes a direct child.
            int before = parent.childCount;
            layout.CloneTree(parent);
            return parent.childCount > before ? parent[before] : null;
        }
    }
}
