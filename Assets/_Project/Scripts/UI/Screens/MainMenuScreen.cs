using Aetherfall.SaveSystem;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Main menu (GDD 05 1.3): "Neues Spiel", "Fortsetzen" (newest save, with kind and date), "Laden" (list of saves),
    /// "Optionen" (placeholder page) and "Beenden"; title "Chroniken von Aetherfall". Load and options open as a page on the
    /// right; B / Esc returns to the button list.
    /// </summary>
    public sealed class MainMenuScreen : MenuScreen, IErrorDisplay
    {
        /// <summary>Screen id (telemetry).</summary>
        public const string Id = "screen.mainmenu";

        private const int NewGameItem = 0;
        private const int ContinueItem = 1;
        private const int LoadItem = 2;
        private const int OptionsItem = 3;
        private const int QuitItem = 4;

        private readonly IGameFlow _flow;
        private readonly MenuItemList _mainList;
        private readonly MenuItemList _loadList;
        private readonly MenuItemList _optionsList;
        private readonly SaveSlotListView _loadPage;
        private readonly OptionsPageView _optionsPage;
        private readonly VisualElement _pagePanel;
        private readonly VisualElement _loadHost;
        private readonly VisualElement _optionsHost;
        private readonly VisualElement _backHint;
        private readonly Label _continueInfo;
        private readonly Label _status;
        private int _mainIndex;

        /// <summary>Builds the screen from MainMenu.uxml.</summary>
        /// <param name="root">Instantiated MainMenu.uxml.</param>
        /// <param name="loadPageAsset">LoadPage.uxml.</param>
        /// <param name="slotRowAsset">SaveSlotRow.uxml.</param>
        /// <param name="optionsPageAsset">OptionsPage.uxml.</param>
        /// <param name="glyphs">Glyph service.</param>
        /// <param name="flow">Game flow.</param>
        /// <param name="preferences">UI options.</param>
        /// <param name="versionText">Text of the version label (e.g. "Version 0.1.0").</param>
        public MainMenuScreen(VisualElement root, VisualTreeAsset loadPageAsset, VisualTreeAsset slotRowAsset, VisualTreeAsset optionsPageAsset,
            IGlyphService glyphs, IGameFlow flow, UiPreferences preferences, string versionText) : base(Id, root, glyphs)
        {
            _flow = flow;
            _mainList = CreateList("main");
            _mainList.Add(root.Q<VisualElement>("mainmenu-new-game"));
            _mainList.Add(root.Q<VisualElement>("mainmenu-continue"));
            _mainList.Add(root.Q<VisualElement>("mainmenu-load"));
            _mainList.Add(root.Q<VisualElement>("mainmenu-options"));
            _mainList.Add(root.Q<VisualElement>("mainmenu-quit"));

            _pagePanel = root.Q<VisualElement>("mainmenu-page");
            _loadHost = root.Q<VisualElement>("mainmenu-load-page");
            _optionsHost = root.Q<VisualElement>("mainmenu-options-page");
            _backHint = root.Q<VisualElement>("mainmenu-hint-back-group");
            _continueInfo = root.Q<Label>("mainmenu-continue-info");
            _status = root.Q<Label>("mainmenu-status");
            _loadList = CreateList("load");
            _loadPage = new SaveSlotListView(_loadHost, loadPageAsset, slotRowAsset, _loadList, false);
            _optionsList = CreateList("options");
            _optionsPage = new OptionsPageView(_optionsHost, optionsPageAsset, _optionsList, preferences);
            UiElementUtility.SetText(root.Q<Label>("mainmenu-version"), versionText);
            BindGlyphs();
            ShowMainPage(NewGameItem);
        }

        /// <summary>Shows an error (e.g. a failed load) under the buttons.</summary>
        /// <param name="message">German text; empty hides it.</param>
        public void ShowStatus(string message)
        {
            UiElementUtility.SetText(_status, message);
            UiElementUtility.SetDisplayed(_status, !string.IsNullOrEmpty(message));
        }

        /// <inheritdoc />
        public void ShowError(string message)
        {
            ShowStatus(message);
        }

        /// <inheritdoc />
        public override void Submit(int index)
        {
            if (_flow.IsBusy)
            {
                return;
            }

            if (ReferenceEquals(ActiveList, _loadList))
            {
                _flow.LoadSlot(_loadPage.SlotIdAt(index));
                return;
            }

            if (ReferenceEquals(ActiveList, _optionsList))
            {
                _optionsPage.Submit(index);
                return;
            }

            ShowStatus(string.Empty);
            switch (index)
            {
                case NewGameItem:
                    _flow.StartNewGame();
                    break;
                case ContinueItem:
                    _flow.ContinueLatest();
                    break;
                case LoadItem:
                    ShowLoadPage();
                    break;
                case OptionsItem:
                    ShowOptionsPage();
                    break;
                case QuitItem:
                    _flow.QuitGame();
                    break;
            }
        }

        /// <inheritdoc />
        public override bool TryAdjust(int index, int delta)
        {
            return ReferenceEquals(ActiveList, _optionsList) && _optionsPage.TryAdjust(index, delta);
        }

        /// <inheritdoc />
        public override BackOutcome Back(bool closeHub)
        {
            if (ReferenceEquals(ActiveList, _mainList))
            {
                return BackOutcome.Ignored;
            }

            ShowMainPage(_mainIndex);
            return BackOutcome.Handled;
        }

        /// <inheritdoc />
        protected override void OnOpen(object args)
        {
            ShowStatus(string.Empty);
            RefreshContinue();
            ShowMainPage(NewGameItem);
            base.OnOpen(args);
        }

        private void RefreshContinue()
        {
            bool hasSave = _flow.TryGetLatestSave(out SaveSlotInfo latest);
            _mainList.SetEnabled(ContinueItem, hasSave);
            UiElementUtility.SetText(_continueInfo, hasSave
                ? UiTexts.Format(UiTextKeys.ContinueInfo, SaveSlotText.KindName(latest.Kind), SaveSlotText.DateTime(latest.CreatedUtc))
                : UiTexts.Get(UiTextKeys.NoSave));
        }

        private void ShowMainPage(int focusIndex)
        {
            UiElementUtility.SetDisplayed(_pagePanel, false);
            UiElementUtility.SetDisplayed(_backHint, false);
            Activate(_mainList, focusIndex);
        }

        private void ShowLoadPage()
        {
            _mainIndex = _mainList.Focus.Current;
            _loadPage.SetStatus(string.Empty);
            _loadPage.Refresh(_flow.ListSaves());
            ShowPage(_loadHost);
            Activate(_loadList, 0);
        }

        private void ShowOptionsPage()
        {
            _mainIndex = _mainList.Focus.Current;
            ShowPage(_optionsHost);
            Activate(_optionsList, 0);
        }

        private void ShowPage(VisualElement page)
        {
            UiElementUtility.SetDisplayed(_pagePanel, true);
            UiElementUtility.SetDisplayed(_loadHost, ReferenceEquals(page, _loadHost));
            UiElementUtility.SetDisplayed(_optionsHost, ReferenceEquals(page, _optionsHost));
            UiElementUtility.SetDisplayed(_backHint, true);
            _mainList.RefreshFocus(false);
        }
    }
}
