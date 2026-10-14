using Aetherfall.Classes;
using Aetherfall.SaveSystem;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// Main menu (GDD 05 1.3): "Neues Spiel" (first the class choice, GDD 03 11.2), "Fortsetzen" (newest save, with kind and
    /// date), "Laden" (list of saves), "Optionen" (placeholder page) and "Beenden"; title "Chroniken von Aetherfall". Class
    /// choice, load and options open as a page on the right; B / Esc returns to the button list.
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
        private readonly IClassService _classes;
        private readonly MenuItemList _mainList;
        private readonly MenuItemList _loadList;
        private readonly MenuItemList _optionsList;
        private readonly MenuItemList _classList;
        private readonly VisualElement _classHost;
        private readonly Button[] _classButtons = new Button[2];
        private readonly Label _classMotto;
        private readonly Label _classDescription;
        private readonly Label _classValues;
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
        /// <param name="classes">Classes of a new game (null or only one class: "Neues Spiel" starts at once).</param>
        public MainMenuScreen(VisualElement root, VisualTreeAsset loadPageAsset, VisualTreeAsset slotRowAsset, VisualTreeAsset optionsPageAsset,
            IGlyphService glyphs, IGameFlow flow, UiPreferences preferences, string versionText, IClassService classes = null) : base(Id, root, glyphs)
        {
            _flow = flow;
            _classes = classes;
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
            _classHost = root.Q<VisualElement>("mainmenu-class-page");
            _classButtons[0] = root.Q<Button>("mainmenu-class-0");
            _classButtons[1] = root.Q<Button>("mainmenu-class-1");
            _classMotto = root.Q<Label>("mainmenu-class-motto");
            _classDescription = root.Q<Label>("mainmenu-class-description");
            _classValues = root.Q<Label>("mainmenu-class-values");
            _classList = CreateList("class");
            for (int i = 0; i < _classButtons.Length; i++)
            {
                bool used = _classes != null && i < _classes.Classes.Count;
                UiElementUtility.SetDisplayed(_classButtons[i], used);
                if (used)
                {
                    UiElementUtility.SetText(_classButtons[i], _classes.Classes[i].Name);
                    _classList.Add(_classButtons[i]);
                }
            }

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

            if (ReferenceEquals(ActiveList, _classList))
            {
                // GDD 03 11.2: the chosen class sets start values and kit of the new game.
                if (index >= 0 && index < _classes.Classes.Count && _classes.ChooseForNewGame(_classes.Classes[index].Id))
                {
                    _flow.StartNewGame();
                }

                return;
            }

            ShowStatus(string.Empty);
            switch (index)
            {
                case NewGameItem:
                    if (_classes != null && _classes.Classes.Count > 1)
                    {
                        ShowClassPage();
                    }
                    else
                    {
                        _flow.StartNewGame();
                    }

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

        private void ShowClassPage()
        {
            _mainIndex = _mainList.Focus.Current;
            ShowPage(_classHost);
            int pending = 0;
            for (int i = 0; i < _classes.Classes.Count; i++)
            {
                if (_classes.Classes[i] == _classes.Pending)
                {
                    pending = i;
                }
            }

            Activate(_classList, pending);
            ShowClassDetails(pending);
        }

        /// <inheritdoc />
        public override void FocusChanged(int previous, int current)
        {
            base.FocusChanged(previous, current);
            if (ReferenceEquals(ActiveList, _classList))
            {
                ShowClassDetails(current);
            }
        }

        private void ShowClassDetails(int index)
        {
            if (_classes == null || index < 0 || index >= _classes.Classes.Count)
            {
                return;
            }

            ClassSpec spec = _classes.Classes[index];
            UiElementUtility.SetText(_classMotto, spec.Motto.Length > 0 ? "„" + spec.Motto + "“" : string.Empty);
            UiElementUtility.SetText(_classDescription, spec.Description);
            float[] a = spec.Attributes;
            UiElementUtility.SetText(_classValues, UiTexts.Format("fmt-class-values", a[0], a[1], a[2], a[3], a[4], a[5]));
        }

        private void ShowPage(VisualElement page)
        {
            UiElementUtility.SetDisplayed(_pagePanel, true);
            UiElementUtility.SetDisplayed(_loadHost, ReferenceEquals(page, _loadHost));
            UiElementUtility.SetDisplayed(_optionsHost, ReferenceEquals(page, _optionsHost));
            UiElementUtility.SetDisplayed(_classHost, ReferenceEquals(page, _classHost));
            UiElementUtility.SetDisplayed(_backHint, true);
            _mainList.RefreshFocus(false);
        }
    }
}
