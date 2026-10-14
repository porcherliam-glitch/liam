using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Pause menu (GDD 05 1.3, tab "System"; GDD 05 5.4: quick save is the second entry): tabs System / Laden / Optionen,
    /// switched with LB/RB (Q/E) or by mouse. System: Fortsetzen, Schnellspeichern, Laden, Optionen, Hauptmenue (hold),
    /// Spiel beenden (hold). Loading a save in the game also needs holding (the progress since then is lost).
    /// </summary>
    /// <remarks>
    /// The screen follows the game state: it opens when <c>Paused</c> is pushed and closes when it is popped (see
    /// <see cref="UiStateDirector"/>). B / Esc on a tab page returns to System, on System it resumes; Start / Esc / Tab
    /// resume from every tab.
    /// </remarks>
    public sealed class PauseMenuScreen : MenuScreen
    {
        /// <summary>Screen id (telemetry).</summary>
        public const string Id = "screen.pause";

        private const int SystemTab = 0;
        private const int LoadTab = 1;
        private const int OptionsTab = 2;
        private const int TabCount = 3;

        private const int ResumeItem = 0;
        private const int QuickSaveItem = 1;
        private const int LoadItem = 2;
        private const int OptionsItem = 3;
        private const int MainMenuItem = 4;
        private const int QuitItem = 5;

        private readonly IGameFlow _flow;
        private readonly IGameStateService _gameState;
        private readonly ISaveManager _saves;
        private readonly MenuItemList _systemList;
        private readonly MenuItemList _loadList;
        private readonly MenuItemList _optionsList;
        private readonly SaveSlotListView _loadPage;
        private readonly OptionsPageView _optionsPage;
        private readonly VisualElement[] _pages = new VisualElement[TabCount];
        private readonly VisualElement[] _tabButtons = new VisualElement[TabCount];
        private readonly Label _status;
        private int _tab;
        private int _systemIndex;

        /// <summary>Builds the screen from PauseMenu.uxml.</summary>
        /// <param name="root">Instantiated PauseMenu.uxml.</param>
        /// <param name="loadPageAsset">LoadPage.uxml.</param>
        /// <param name="slotRowAsset">SaveSlotRow.uxml.</param>
        /// <param name="optionsPageAsset">OptionsPage.uxml.</param>
        /// <param name="glyphs">Glyph service.</param>
        /// <param name="flow">Game flow.</param>
        /// <param name="gameState">Game state (resume = Pop(Paused)).</param>
        /// <param name="saves">Save manager (is saving allowed?).</param>
        /// <param name="preferences">UI options.</param>
        public PauseMenuScreen(VisualElement root, VisualTreeAsset loadPageAsset, VisualTreeAsset slotRowAsset, VisualTreeAsset optionsPageAsset,
            IGlyphService glyphs, IGameFlow flow, IGameStateService gameState, ISaveManager saves, UiPreferences preferences) : base(Id, root, glyphs)
        {
            _flow = flow;
            _gameState = gameState;
            _saves = saves;
            _systemList = CreateList("system");
            _systemList.Add(root.Q<VisualElement>("pause-resume"));
            _systemList.Add(root.Q<VisualElement>("pause-quicksave"));
            _systemList.Add(root.Q<VisualElement>("pause-load"));
            _systemList.Add(root.Q<VisualElement>("pause-options"));
            _systemList.Add(root.Q<VisualElement>("pause-main-menu"), true);
            _systemList.Add(root.Q<VisualElement>("pause-quit"), true);
            _status = root.Q<Label>("pause-status");

            _pages[SystemTab] = root.Q<VisualElement>("pause-system-page");
            _pages[LoadTab] = root.Q<VisualElement>("pause-load-page");
            _pages[OptionsTab] = root.Q<VisualElement>("pause-options-page");
            _tabButtons[SystemTab] = root.Q<VisualElement>("pause-tab-system");
            _tabButtons[LoadTab] = root.Q<VisualElement>("pause-tab-load");
            _tabButtons[OptionsTab] = root.Q<VisualElement>("pause-tab-options");
            for (int i = 0; i < TabCount; i++)
            {
                int tab = i;
                UiElementUtility.BindItem(_tabButtons[i], () => { }, held => { }, () => SelectTab(tab, true));
            }

            _loadList = CreateList("load");
            _loadPage = new SaveSlotListView(_pages[LoadTab], loadPageAsset, slotRowAsset, _loadList, true);
            _optionsList = CreateList("options");
            _optionsPage = new OptionsPageView(_pages[OptionsTab], optionsPageAsset, _optionsList, preferences);
            BindGlyphs();
            SelectTab(SystemTab, false);
        }

        /// <summary>Shows an error or status line (e.g. a failed load).</summary>
        /// <param name="message">German text.</param>
        /// <param name="isError">True = red, false = green.</param>
        public void ShowStatus(string message, bool isError)
        {
            if (_tab == LoadTab)
            {
                _loadPage.SetStatus(message);
            }

            UiElementUtility.SetText(_status, message);
            _status.EnableInClassList("is-error", isError && !string.IsNullOrEmpty(message));
            _status.EnableInClassList("is-ok", !isError && !string.IsNullOrEmpty(message));
        }

        /// <inheritdoc />
        public override void Submit(int index)
        {
            if (_flow.IsBusy)
            {
                return;
            }

            if (_tab == LoadTab)
            {
                _flow.LoadSlot(_loadPage.SlotIdAt(index));
                return;
            }

            if (_tab == OptionsTab)
            {
                _optionsPage.Submit(index);
                return;
            }

            switch (index)
            {
                case ResumeItem:
                    Resume();
                    break;
                case QuickSaveItem:
                    QuickSave();
                    break;
                case LoadItem:
                    SelectTab(LoadTab, true);
                    break;
                case OptionsItem:
                    SelectTab(OptionsTab, true);
                    break;
                case MainMenuItem:
                    _flow.ReturnToMainMenu();
                    break;
                case QuitItem:
                    _flow.QuitGame();
                    break;
            }
        }

        /// <inheritdoc />
        public override bool TryAdjust(int index, int delta)
        {
            return _tab == OptionsTab && _optionsPage.TryAdjust(index, delta);
        }

        /// <inheritdoc />
        public override void Tab(int delta)
        {
            SelectTab(((_tab + delta) % TabCount + TabCount) % TabCount, true);
        }

        /// <inheritdoc />
        public override BackOutcome Back(bool closeHub)
        {
            if (!closeHub && _tab != SystemTab)
            {
                SelectTab(SystemTab, true);
                return BackOutcome.Handled;
            }

            Resume();
            return BackOutcome.Handled;
        }

        /// <inheritdoc />
        protected override void OnOpen(object args)
        {
            ShowStatus(string.Empty, false);
            _systemIndex = ResumeItem;
            _systemList.Focus.FocusFirst();
            SelectTab(SystemTab, false);
            RefreshSaveState();
            base.OnOpen(args);
        }

        private void Resume()
        {
            if (_gameState.Current == GameState.Paused)
            {
                _gameState.Pop(GameState.Paused);
            }
        }

        private void QuickSave()
        {
            if (!_saves.IsSaveAllowed(out string reasonKey))
            {
                ShowStatus(UiTexts.Format(UiTextKeys.SaveBlocked, SaveReasonKeys.ToGermanText(reasonKey)), true);
                return;
            }

            ShowStatus(UiTexts.Get(UiTextKeys.SaveBusy), false);
            _flow.QuickSave(result =>
            {
                if (!IsOpen)
                {
                    return;
                }

                ShowStatus(result.Success
                    ? UiTexts.Format(UiTextKeys.SaveOk, SaveSlotText.KindName(SaveKind.Quick))
                    : UiTexts.Format(UiTextKeys.SaveFailed, SaveReasonKeys.ToGermanText(result.ReasonKey)), !result.Success);
                RefreshSaveState();
            });
        }

        private void RefreshSaveState()
        {
            bool allowed = _saves.IsSaveAllowed(out string reasonKey);
            _systemList.SetEnabled(QuickSaveItem, allowed);
            if (!allowed)
            {
                ShowStatus(UiTexts.Format(UiTextKeys.SaveBlocked, SaveReasonKeys.ToGermanText(reasonKey)), true);
            }
        }

        private void SelectTab(int tab, bool focusPage)
        {
            if (_tab == SystemTab && tab != SystemTab && _systemList.Focus.HasFocus)
            {
                _systemIndex = _systemList.Focus.Current;
            }

            _tab = tab;
            for (int i = 0; i < TabCount; i++)
            {
                UiElementUtility.SetDisplayed(_pages[i], i == tab);
                _tabButtons[i].EnableInClassList("is-selected", i == tab);
            }

            switch (tab)
            {
                case LoadTab:
                    _loadPage.SetStatus(string.Empty);
                    _loadPage.Refresh(_flow.ListSaves());
                    Activate(_loadList, 0);
                    break;
                case OptionsTab:
                    Activate(_optionsList, 0);
                    break;
                default:
                    Activate(_systemList, focusPage ? _systemIndex : ResumeItem);
                    break;
            }
        }
    }
}
