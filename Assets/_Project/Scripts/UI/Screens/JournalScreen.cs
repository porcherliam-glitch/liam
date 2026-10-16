using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Player;
using Aetherfall.Progression;
using Aetherfall.Quests;
using Aetherfall.SaveSystem;
using Aetherfall.Skills;
using Aetherfall.UI.Framework;
using Aetherfall.World.Exploration;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// The journal (Journal.uxml): hub tabs "Questlog", "Charakter" and "Fähigkeiten" (GDD 05 1.3), switched with LB/RB (Q/E).
    /// <para><b>Questlog</b> (GDD 02 7): categories with LT/RT (Z/C), the quest list on the left (5 rows visible, "▲/▼ weitere"),
    /// the details of the focused quest on the right (description, current stage text, objectives with counters, earlier
    /// stages and decisions). A / Enter / click: track on or off (at most 3); X / F: make it the focus quest.</para>
    /// <para><b>Charakter</b> (GDD 03 11.3, 12): level, experience bar, free points, the six attributes and derived values.
    /// A / ► / click: place a point; X / F / ◄: take back a point placed while the menu is open (closing locks them).</para>
    /// <para><b>Fähigkeiten</b> (GDD 03 11, key K): the nodes of the class tree, branch by branch, with the details of the focused
    /// node. A / ► / click: learn a rank; X / F / ◄: take back a rank learned while the page is open; LT/RT (Z/C): move a
    /// learned ability along the slots of the ability bar (GDD 03 11.8).</para>
    /// </summary>
    /// <remarks>
    /// <para>The screen follows the game state like the pause menu: <see cref="UiStateDirector"/> opens it when it pushed
    /// <c>Menu</c> for the journal (key J, or "Questlog &amp; Charakter" in the pause menu) and closes it when the state leaves
    /// <c>Menu</c>. B / Esc / Start / J ask the director to pop <c>Menu</c> (<see cref="Back"/>).</para>
    /// <para>Lists are rebuilt only when the quest or progression revision changes (polled in <see cref="Tick"/>).</para>
    /// </remarks>
    public sealed class JournalScreen : MenuScreen
    {
        /// <summary>Screen id (telemetry).</summary>
        public const string Id = "screen.journal";

        /// <summary>Quest rows that fit into the list column.</summary>
        public const int VisibleQuestRows = 5;

        /// <summary>Skill rows that fit into the list column.</summary>
        public const int VisibleSkillRows = 6;

        private const int PageCount = 4;

        // GDD 05 1.3: the map is the first hub tab.
        private static readonly JournalPage[] TabOrder = { JournalPage.Map, JournalPage.Quests, JournalPage.Character, JournalPage.Skills };

        private readonly MapPageView _map;
        private readonly MenuItemList _mapList;
        private readonly VisualElement _mapFocus;
        private readonly IFastTravelService _fastTravel;

        private readonly IQuestService _quests;
        private readonly IProgressionService _progression;
        private readonly ISkillService _skills;
        private readonly MenuItemList _skillList;
        private readonly ListWindow _skillWindow = new ListWindow(VisibleSkillRows);
        private readonly List<SkillNode> _skillNodes = new List<SkillNode>();
        private readonly VisualElement _skillRows;
        private readonly Label _skillPoints;
        private readonly Label _skillMoreUp;
        private readonly Label _skillMoreDown;
        private readonly Label _skillEmpty;
        private readonly VisualElement _skillDetails;
        private readonly Label _skillTitle;
        private readonly Label _skillMeta;
        private readonly Label _skillDescription;
        private readonly Label _skillState;
        private readonly Label _skillBar;
        private int _skillRevision = -1;
        private readonly Action _closeRequested;
        private readonly VisualTreeAsset _questRowAsset;
        private readonly VisualTreeAsset _objectiveRowAsset;
        private readonly VisualTreeAsset _lineAsset;
        private readonly MenuItemList _questList;
        private readonly MenuItemList _attributeList;
        private readonly VisualElement[] _pages = new VisualElement[PageCount];
        private readonly VisualElement[] _pageTabs = new VisualElement[PageCount];
        private readonly VisualElement[] _categoryTabs = new VisualElement[QuestLogRules.TabCount];
        private readonly Label _title;
        private readonly VisualElement _questRows;
        private readonly Label _moreUp;
        private readonly Label _moreDown;
        private readonly Label _empty;
        private readonly VisualElement _details;
        private readonly Label _detailTitle;
        private readonly Label _detailMeta;
        private readonly Label _detailDescription;
        private readonly Label _detailStageTitle;
        private readonly Label _detailStage;
        private readonly VisualElement _detailObjectives;
        private readonly Label _detailHistoryTitle;
        private readonly VisualElement _detailHistory;
        private readonly Label _level;
        private readonly VisualElement _xpFill;
        private readonly Label _xpText;
        private readonly Label _points;
        private readonly VisualElement _derivedRows;
        private readonly List<VisualElement> _attributeElements = new List<VisualElement>(6);
        private readonly Label _hintConfirm;
        private readonly Label _hintSecondary;
        private readonly VisualElement _hintSecondaryGroup;
        private readonly VisualElement _hintSubtabs;
        private readonly Label _hintSubtabText;
        private readonly List<QuestLogEntry> _entries = new List<QuestLogEntry>();
        private readonly QuestDetails _shown = new QuestDetails();
        private readonly ListWindow _window = new ListWindow(VisibleQuestRows);
        private readonly List<CharacterAttributeRow> _attributes = new List<CharacterAttributeRow>(6);
        private readonly List<CharacterValueRow> _derived = new List<CharacterValueRow>(8);
        private JournalPage _page;
        private QuestLogTab _tab;
        private int _questRevision = -1;
        private int _progressionRevision = -1;

        /// <summary>Builds the screen from Journal.uxml.</summary>
        /// <param name="root">Instantiated Journal.uxml.</param>
        /// <param name="questRowAsset">QuestRow.uxml.</param>
        /// <param name="objectiveRowAsset">ObjectiveRow.uxml.</param>
        /// <param name="lineAsset">JournalLine.uxml.</param>
        /// <param name="attributeRowAsset">AttributeRow.uxml.</param>
        /// <param name="valueRowAsset">ValueRow.uxml.</param>
        /// <param name="glyphs">Glyph service.</param>
        /// <param name="quests">Quest service (null: the quest log stays empty).</param>
        /// <param name="progression">Progression (null: the character page shows "–").</param>
        /// <param name="closeRequested">
        /// Called for B / Esc / J (the director pops <c>Menu</c>); null: the screen closes itself.
        /// </param>
        /// <param name="skills">Skill trees (null: the skill page stays empty).</param>
        /// <param name="exploration">Exploration (null: the map page shows "keine Karte").</param>
        /// <param name="players">Player locator (null: no player arrow on the map).</param>
        /// <param name="fastTravel">Fast travel (null: the map shows no travel list).</param>
        /// <param name="questMarkers">Quest targets for the map (null: none).</param>
        public JournalScreen(VisualElement root, VisualTreeAsset questRowAsset, VisualTreeAsset objectiveRowAsset, VisualTreeAsset lineAsset,
            VisualTreeAsset attributeRowAsset, VisualTreeAsset valueRowAsset, IGlyphService glyphs, IQuestService quests, IProgressionService progression,
            Action closeRequested, ISkillService skills = null, IExplorationService exploration = null, IPlayerLocator players = null, IFastTravelService fastTravel = null,
            QuestMarkerModel questMarkers = null)
            : base(Id, root, glyphs)
        {
            if (questRowAsset == null || objectiveRowAsset == null || lineAsset == null || attributeRowAsset == null || valueRowAsset == null)
            {
                throw new ArgumentNullException(questRowAsset == null ? nameof(questRowAsset)
                    : objectiveRowAsset == null ? nameof(objectiveRowAsset)
                    : lineAsset == null ? nameof(lineAsset)
                    : attributeRowAsset == null ? nameof(attributeRowAsset)
                    : nameof(valueRowAsset));
            }

            _questRowAsset = questRowAsset;
            _objectiveRowAsset = objectiveRowAsset;
            _lineAsset = lineAsset;

            _quests = quests;
            _progression = progression;
            _skills = skills;
            _closeRequested = closeRequested;

            _title = root.Q<Label>("journal-title");
            _pages[(int)JournalPage.Quests] = root.Q<VisualElement>("journal-quests-page");
            _pages[(int)JournalPage.Character] = root.Q<VisualElement>("journal-character-page");
            _pageTabs[(int)JournalPage.Quests] = root.Q<VisualElement>("journal-tab-quests");
            _pageTabs[(int)JournalPage.Character] = root.Q<VisualElement>("journal-tab-character");
            _pages[(int)JournalPage.Skills] = root.Q<VisualElement>("journal-skills-page");
            _pageTabs[(int)JournalPage.Skills] = root.Q<VisualElement>("journal-tab-skills");
            _pages[(int)JournalPage.Map] = root.Q<VisualElement>("journal-map-page");
            _pageTabs[(int)JournalPage.Map] = root.Q<VisualElement>("journal-tab-map");
            _fastTravel = fastTravel;
            _map = new MapPageView(_pages[(int)JournalPage.Map], exploration, players, fastTravel, questMarkers);
            for (int i = 0; i < PageCount; i++)
            {
                var page = (JournalPage)i;
                UiElementUtility.BindItem(_pageTabs[i], () => { }, held => { }, () => SelectPage(page));
            }

            for (int i = 0; i < QuestLogRules.TabCount; i++)
            {
                var tab = (QuestLogTab)i;
                _categoryTabs[i] = root.Q<VisualElement>(QuestLogRules.TabElementName(tab));
                UiElementUtility.BindItem(_categoryTabs[i], () => { }, held => { }, () => SelectCategory(tab));
            }

            _questRows = root.Q<VisualElement>("questlog-list");
            _moreUp = root.Q<Label>("questlog-more-up");
            _moreDown = root.Q<Label>("questlog-more-down");
            _empty = root.Q<Label>("questlog-empty");
            _details = root.Q<VisualElement>("questlog-details");
            _detailTitle = root.Q<Label>("questlog-detail-title");
            _detailMeta = root.Q<Label>("questlog-detail-meta");
            _detailDescription = root.Q<Label>("questlog-detail-description");
            _detailStageTitle = root.Q<Label>("questlog-detail-stage-title");
            _detailStage = root.Q<Label>("questlog-detail-stage");
            _detailObjectives = root.Q<VisualElement>("questlog-detail-objectives");
            _detailHistoryTitle = root.Q<Label>("questlog-detail-history-title");
            _detailHistory = root.Q<VisualElement>("questlog-detail-history");

            _level = root.Q<Label>("character-level");
            _xpFill = root.Q<VisualElement>("character-xp-fill");
            _xpText = root.Q<Label>("character-xp-text");
            _points = root.Q<Label>("character-points");
            _derivedRows = root.Q<VisualElement>("character-derived");
            _hintConfirm = root.Q<Label>("journal-hint-confirm");
            _hintSecondary = root.Q<Label>("journal-hint-secondary");
            _hintSecondaryGroup = root.Q<VisualElement>("journal-hint-secondary-group");
            _hintSubtabs = root.Q<VisualElement>("journal-hint-subtabs-group");
            _hintSubtabText = root.Q<Label>("journal-hint-subtabs");

            _skillRows = root.Q<VisualElement>("skills-list");
            _skillPoints = root.Q<Label>("skills-points");
            _skillMoreUp = root.Q<Label>("skills-more-up");
            _skillMoreDown = root.Q<Label>("skills-more-down");
            _skillEmpty = root.Q<Label>("skills-empty");
            _skillDetails = root.Q<VisualElement>("skills-details");
            _skillTitle = root.Q<Label>("skills-detail-title");
            _skillMeta = root.Q<Label>("skills-detail-meta");
            _skillDescription = root.Q<Label>("skills-detail-description");
            _skillState = root.Q<Label>("skills-detail-state");
            _skillBar = root.Q<Label>("skills-detail-bar");

            _questList = CreateList("quests");
            _attributeList = CreateList("attributes");
            _skillList = CreateList("skills");
            _mapList = CreateList("map");
            // Without travel targets one invisible item keeps the page focusable (Tab and Back reach it).
            _mapFocus = new VisualElement { pickingMode = PickingMode.Ignore };
            _mapFocus.AddToClassList("af-map__focus");
            _pages[(int)JournalPage.Map]?.Add(_mapFocus);
            _mapList.Add(_mapFocus);
            BuildCharacterRows(root.Q<VisualElement>("character-attributes"), attributeRowAsset, valueRowAsset);
            BindGlyphs();
            SelectPage(JournalPage.Quests);
        }

        /// <summary>The page shown.</summary>
        public JournalPage Page => _page;

        /// <summary>The map page (tests, tour).</summary>
        public MapPageView Map => _map;

        /// <summary>The quest log category shown.</summary>
        public QuestLogTab Category => _tab;

        /// <summary>Rows of the quest list (for tests and tools).</summary>
        public IReadOnlyList<QuestLogEntry> Entries => _entries;

        /// <inheritdoc />
        public override void Tick(float unscaledDeltaTime)
        {
            if (!IsOpen)
            {
                return;
            }

            if (_page == JournalPage.Map)
            {
                _map.Refresh();
                RefreshMapList(false);
            }

            if (_quests != null && _quests.Revision != _questRevision)
            {
                RebuildQuests(FocusedQuestId());
            }

            if (_progression != null && _progression.Revision != _progressionRevision)
            {
                RefreshCharacter();
            }

            if (_skills != null && _skills.Revision != _skillRevision)
            {
                RebuildSkills();
            }
        }

        /// <summary>Nodes shown on the skill page (tests and tools).</summary>
        public IReadOnlyList<SkillNode> SkillNodes => _skillNodes;

        /// <inheritdoc />
        public override void Submit(int index)
        {
            if (_page == JournalPage.Map)
            {
                SubmitTravel(index);
                return;
            }

            if (_page == JournalPage.Character)
            {
                Spend(index);
                return;
            }

            if (_page == JournalPage.Skills)
            {
                Learn(index);
                return;
            }

            if (_quests == null || index < 0 || index >= _entries.Count || _entries[index].Finished)
            {
                return;
            }

            string questId = _entries[index].QuestId;
            _quests.TrySetTracked(questId, !_quests.IsTracked(questId));
        }

        /// <inheritdoc />
        public override void Secondary(int index)
        {
            if (_page == JournalPage.Map)
            {
                return;
            }

            if (_page == JournalPage.Character)
            {
                Refund(index);
                return;
            }

            if (_page == JournalPage.Skills)
            {
                Unlearn(index);
                return;
            }

            if (_quests != null && index >= 0 && index < _entries.Count && !_entries[index].Finished)
            {
                _quests.TrySetFocus(_entries[index].QuestId);
            }
        }

        /// <inheritdoc />
        public override bool TryAdjust(int index, int delta)
        {
            if (_page == JournalPage.Skills)
            {
                if (delta > 0)
                {
                    Learn(index);
                }
                else
                {
                    Unlearn(index);
                }

                return true;
            }

            if (_page != JournalPage.Character)
            {
                return false;
            }

            if (delta > 0)
            {
                Spend(index);
            }
            else
            {
                Refund(index);
            }

            return true;
        }

        /// <inheritdoc />
        public override void Tab(int delta)
        {
            int index = Array.IndexOf(TabOrder, _page);
            SelectPage(TabOrder[((index + delta) % TabOrder.Length + TabOrder.Length) % TabOrder.Length]);
        }

        /// <inheritdoc />
        public override void SubTab(int delta)
        {
            if (_page == JournalPage.Skills)
            {
                MoveOnBar(delta);
                return;
            }

            if (_page == JournalPage.Quests)
            {
                SelectCategory((QuestLogTab)((((int)_tab + delta) % QuestLogRules.TabCount + QuestLogRules.TabCount) % QuestLogRules.TabCount));
            }
        }

        /// <inheritdoc />
        public override BackOutcome Back(bool closeHub)
        {
            if (_closeRequested == null)
            {
                return BackOutcome.Close;
            }

            _closeRequested();
            return BackOutcome.Handled;
        }

        /// <inheritdoc />
        public override void FocusChanged(int previous, int current)
        {
            base.FocusChanged(previous, current);
            if (_page == JournalPage.Quests && ReferenceEquals(ActiveList, _questList))
            {
                if (_window.EnsureVisible(current))
                {
                    ApplyWindow();
                }

                ShowDetails();
            }

            if (_page == JournalPage.Map && current != previous)
            {
                // Another target: the confirmation starts again.
                _map.SetConfirm(-1);
                _map.SetStatus(string.Empty);
            }

            if (_page == JournalPage.Skills && ReferenceEquals(ActiveList, _skillList))
            {
                if (_skillWindow.EnsureVisible(current))
                {
                    ApplySkillWindow();
                }

                ShowSkillDetails();
            }
        }

        /// <inheritdoc />
        protected override void OnOpen(object args)
        {
            _page = args is JournalPage page ? page : JournalPage.Quests;
            _tab = QuestLogModel.DefaultTab(_quests);
            _window.Reset();
            _questList.Focus.FocusFirst();
            _attributeList.Focus.FocusFirst();
            _skillList.Focus.FocusFirst();
            _skillWindow.Reset();
            RebuildQuests(string.Empty);
            RefreshCharacter();
            RebuildSkills();
            SelectPage(_page);
            base.OnOpen(args);
        }

        /// <inheritdoc />
        protected override void OnClose()
        {
            // GDD 03 11.3: points placed in this menu can be taken back until it closes.
            if (_progression != null)
            {
                _progression.LockAllocation();
            }

            if (_skills != null)
            {
                _skills.LockSession();
            }

            base.OnClose();
        }

        private void SelectPage(JournalPage page)
        {
            _page = page;
            for (int i = 0; i < PageCount; i++)
            {
                UiElementUtility.SetDisplayed(_pages[i], i == (int)page);
                if (_pageTabs[i] != null)
                {
                    _pageTabs[i].EnableInClassList("is-selected", i == (int)page);
                }
            }

            bool quests = page == JournalPage.Quests;
            bool skills = page == JournalPage.Skills;
            bool map = page == JournalPage.Map;
            UiElementUtility.SetText(_title, UiTexts.Get(map ? UiTextKeys.JournalMap : quests ? UiTextKeys.JournalQuests : skills ? UiTextKeys.JournalSkills : UiTextKeys.JournalCharacter));
            UiElementUtility.SetText(_hintConfirm, UiTexts.Get(map ? UiTextKeys.HintTravel : quests ? UiTextKeys.HintTrack : skills ? UiTextKeys.HintLearn : UiTextKeys.HintSpend));
            UiElementUtility.SetText(_hintSecondary, UiTexts.Get(quests ? UiTextKeys.HintFocus : UiTextKeys.HintRefund));
            UiElementUtility.SetText(_hintSubtabText, UiTexts.Get(skills ? UiTextKeys.HintBar : UiTextKeys.HintSubtabs));
            UiElementUtility.SetDisplayed(_hintSubtabs, quests || skills);
            UpdateActionHints();
            if (map)
            {
                _map.Refresh();
                _map.SetConfirm(-1);
                _map.SetStatus(string.Empty);
                RefreshMapList(true);
            }
            else if (quests)
            {
                Activate(_questList, _questList.Focus.HasFocus ? _questList.Focus.Current : 0);
                ApplyWindow();
                ShowDetails();
            }
            else if (skills)
            {
                Activate(_skillList, _skillList.Focus.HasFocus ? _skillList.Focus.Current : 0);
                ApplySkillWindow();
                ShowSkillDetails();
            }
            else
            {
                Activate(_attributeList, _attributeList.Focus.HasFocus ? _attributeList.Focus.Current : 0);
            }
        }

        private void SelectCategory(QuestLogTab tab)
        {
            _tab = tab;
            _window.Reset();
            _questList.Focus.FocusFirst();
            RebuildQuests(string.Empty);
            UpdateActionHints();
            if (_page != JournalPage.Quests)
            {
                SelectPage(JournalPage.Quests);
            }
        }

        private void RefreshMapList(bool force)
        {
            // The list is rebuilt only when its items differ from the rows: adding the same row again would bind its pointer
            // callbacks twice (one click = two presses = travel without the question).
            _map.RefreshTravel();
            if (MapListMatchesRows())
            {
                if (force && _page == JournalPage.Map)
                {
                    Activate(_mapList, 0);
                    UpdateActionHints();
                }

                return;
            }

            _mapList.Clear();
            if (_map.TravelRows.Count == 0)
            {
                _mapList.Add(_mapFocus);
            }
            else
            {
                foreach (Label row in _map.TravelRows)
                {
                    _mapList.Add(row);
                }
            }

            if (_page == JournalPage.Map)
            {
                Activate(_mapList, 0);
                UpdateActionHints();
            }
        }

        private bool MapListMatchesRows()
        {
            IReadOnlyList<Label> rows = _map.TravelRows;
            if (rows.Count == 0)
            {
                return _mapList.Count == 1 && ReferenceEquals(_mapList[0], _mapFocus);
            }

            if (_mapList.Count != rows.Count)
            {
                return false;
            }

            for (int i = 0; i < rows.Count; i++)
            {
                if (!ReferenceEquals(_mapList[i], rows[i]))
                {
                    return false;
                }
            }

            return true;
        }

        private void SubmitTravel(int index)
        {
            // S50: the first press asks, the second travels (the journal closes, the loading screen covers the jump).
            if (_fastTravel == null || index < 0 || index >= _map.TravelTargets.Count)
            {
                return;
            }

            string placeId = _map.TravelTargets[index].Id;
            FastTravelBlock block = _fastTravel.Check(placeId, out string reasonKey);
            if (block != FastTravelBlock.None)
            {
                _map.SetConfirm(-1);
                _map.SetStatus(TravelBlockText(block, reasonKey));
                return;
            }

            if (_map.ConfirmIndex != index)
            {
                _map.SetStatus(string.Empty);
                _map.SetConfirm(index);
                return;
            }

            _map.SetConfirm(-1);
            _closeRequested?.Invoke();
            _ = _fastTravel.TravelAsync(placeId);
        }

        private static string TravelBlockText(FastTravelBlock block, string reasonKey)
        {
            switch (block)
            {
                case FastTravelBlock.InCombat:
                    return UiTexts.Get(UiTextKeys.MapTravelCombat);
                case FastTravelBlock.Overloaded:
                    return UiTexts.Get(UiTextKeys.MapTravelOverloaded);
                case FastTravelBlock.SaveLocked:
                    return UiTexts.Format(UiTextKeys.MapTravelLocked, SaveReasonKeys.ToGermanText(reasonKey));
                case FastTravelBlock.AlreadyThere:
                    return UiTexts.Get(UiTextKeys.MapTravelHere);
                case FastTravelBlock.NoMap:
                    return UiTexts.Get(UiTextKeys.MapTravelNoMap);
                default:
                    return UiTexts.Get(UiTextKeys.MapTravelUnknown);
            }
        }

        private void UpdateActionHints()
        {
            // Finished quests cannot be tracked or focused: the hints for A and X are hidden on the tab "Abgeschlossen".
            bool travel = _page == JournalPage.Map && _map.TravelRows.Count > 0;
            bool actions = travel || (_page != JournalPage.Map && (_page != JournalPage.Quests || _tab != QuestLogTab.Completed));
            UiElementUtility.SetDisplayed(_hintConfirm != null ? _hintConfirm.parent : null, actions);
            UiElementUtility.SetDisplayed(_hintSecondaryGroup, actions && _page != JournalPage.Map);
        }

        private void RebuildQuests(string keepQuestId)
        {
            int previousIndex = _questList.Focus.HasFocus ? _questList.Focus.Current : 0;
            _questRevision = _quests != null ? _quests.Revision : 0;
            QuestLogModel.Collect(_quests, _tab, _entries);

            _questList.Clear();
            _questRows.Clear();
            int keepIndex = -1;
            for (int i = 0; i < _entries.Count; i++)
            {
                QuestLogEntry entry = _entries[i];
                _questRowAsset.CloneTree(_questRows);
                VisualElement row = _questRows[_questRows.childCount - 1];
                UiElementUtility.SetText(row.Q<Label>("quest-row-title"), entry.Title);
                UiElementUtility.SetText(row.Q<Label>("quest-row-info"), entry.Info);
                UiElementUtility.SetText(row.Q<Label>("quest-row-badge"), entry.Badge);
                VisualElement stripe = row.Q<VisualElement>("quest-row-stripe");
                if (stripe != null && entry.CategoryClass.Length > 0)
                {
                    stripe.AddToClassList(entry.CategoryClass);
                }

                row.EnableInClassList("is-tracked", entry.Tracked);
                row.EnableInClassList("is-focus-quest", entry.Focus);
                row.EnableInClassList("is-finished", entry.Finished);
                row.EnableInClassList("is-failed", entry.Failed);
                _questList.Add(row);
                if (entry.QuestId == keepQuestId)
                {
                    keepIndex = i;
                }
            }

            for (int i = 0; i < QuestLogRules.TabCount; i++)
            {
                if (_categoryTabs[i] != null)
                {
                    _categoryTabs[i].EnableInClassList("is-selected", i == (int)_tab);
                    _categoryTabs[i].EnableInClassList("is-empty", QuestLogModel.Count(_quests, (QuestLogTab)i) == 0);
                }
            }

            int focus = keepIndex >= 0 ? keepIndex : Math.Min(previousIndex, _entries.Count - 1);
            _window.SetCount(_entries.Count);
            if (focus >= 0)
            {
                _questList.Focus.Restore(focus);
                _window.EnsureVisible(_questList.Focus.Current);
            }

            UiElementUtility.SetDisplayed(_empty, _entries.Count == 0);
            UiElementUtility.SetDisplayed(_details, _entries.Count > 0);
            _questList.RefreshFocus(_page == JournalPage.Quests && IsOpen);
            ApplyWindow();
            ShowDetails();
        }

        private void ApplyWindow()
        {
            for (int i = 0; i < _questList.Count; i++)
            {
                UiElementUtility.SetDisplayed(_questList[i], _window.IsVisible(i));
            }

            if (_moreUp != null)
            {
                _moreUp.EnableInClassList("is-off", !_window.HasMoreAbove);
            }

            if (_moreDown != null)
            {
                _moreDown.EnableInClassList("is-off", !_window.HasMoreBelow);
            }
        }

        private string FocusedQuestId()
        {
            int index = _questList.Focus.HasFocus ? _questList.Focus.Current : -1;
            return index >= 0 && index < _entries.Count ? _entries[index].QuestId : string.Empty;
        }

        private void ShowDetails()
        {
            QuestDetailsBuilder.Fill(_quests, FocusedQuestId(), _shown);
            SetLine(_detailTitle, _shown.HasQuest ? _shown.Title : UiTexts.Get(UiTextKeys.QuestNoneSelected));
            SetLine(_detailMeta, _shown.Meta);
            SetLine(_detailDescription, _shown.Description);
            SetLine(_detailStageTitle, _shown.CurrentTitle);
            SetLine(_detailStage, _shown.CurrentText);
            SetLine(_detailHistoryTitle, _shown.HistoryTitle);

            ObjectiveRowView.EnsureRows(_detailObjectives, _objectiveRowAsset, _shown.Objectives.Count);
            for (int i = 0; i < _shown.Objectives.Count; i++)
            {
                ObjectiveRowView.Bind(_detailObjectives[i], _shown.Objectives[i], false);
            }

            UiElementUtility.SetDisplayed(_detailObjectives, _shown.Objectives.Count > 0);
            while (_detailHistory != null && _detailHistory.childCount < _shown.History.Count)
            {
                _lineAsset.CloneTree(_detailHistory);
            }

            for (int i = 0; _detailHistory != null && i < _detailHistory.childCount; i++)
            {
                bool used = i < _shown.History.Count;
                VisualElement element = _detailHistory[i];
                UiElementUtility.SetDisplayed(element, used);
                if (!used)
                {
                    continue;
                }

                QuestDetailLine line = _shown.History[i];
                UiElementUtility.SetText(element as Label ?? element.Q<Label>("journal-line"), line.Text);
                element.EnableInClassList("is-decision", line.Kind == QuestDetailLineKind.Decision);
                element.EnableInClassList("is-consequence", line.Kind == QuestDetailLineKind.Consequence);
            }
        }

        private void BuildCharacterRows(VisualElement attributeHost, VisualTreeAsset attributeRowAsset, VisualTreeAsset valueRowAsset)
        {
            CharacterSheetModel.CollectAttributes(_progression, _attributes);
            for (int i = 0; i < _attributes.Count && attributeHost != null; i++)
            {
                attributeRowAsset.CloneTree(attributeHost);
                VisualElement row = attributeHost[attributeHost.childCount - 1];
                VisualElement color = row.Q<VisualElement>("attribute-color");
                if (color != null)
                {
                    color.AddToClassList(_attributes[i].ColorClass);
                }

                _attributeElements.Add(row);
                _attributeList.Add(row);
            }

            CharacterSheetModel.CollectDerived(_progression, _derived);
            for (int i = 0; i < _derived.Count && _derivedRows != null; i++)
            {
                valueRowAsset.CloneTree(_derivedRows);
            }

            RefreshCharacter();
        }

        private void RefreshCharacter()
        {
            _progressionRevision = _progression != null ? _progression.Revision : 0;
            UiElementUtility.SetText(_level, CharacterSheetModel.LevelText(_progression));
            UiElementUtility.SetFill(_xpFill, CharacterSheetModel.XpFill(_progression));
            UiElementUtility.SetText(_xpText, CharacterSheetModel.XpText(_progression));
            UiElementUtility.SetText(_points, CharacterSheetModel.PointsText(_progression));
            if (_points != null)
            {
                _points.EnableInClassList("has-points", _progression != null && _progression.UnspentAttributePoints > 0);
            }

            CharacterSheetModel.CollectAttributes(_progression, _attributes);
            for (int i = 0; i < _attributes.Count && i < _attributeElements.Count; i++)
            {
                VisualElement row = _attributeElements[i];
                CharacterAttributeRow attribute = _attributes[i];
                UiElementUtility.SetText(row.Q<Label>("attribute-name"), attribute.Name);
                UiElementUtility.SetText(row.Q<Label>("attribute-value"), attribute.Value);
                UiElementUtility.SetText(row.Q<Label>("attribute-bonus"), attribute.Bonus);
            }

            CharacterSheetModel.CollectDerived(_progression, _derived);
            for (int i = 0; _derivedRows != null && i < _derived.Count && i < _derivedRows.childCount; i++)
            {
                UiElementUtility.SetText(_derivedRows[i].Q<Label>("value-label"), _derived[i].Label);
                UiElementUtility.SetText(_derivedRows[i].Q<Label>("value-number"), _derived[i].Value);
            }
        }

        private void Spend(int index)
        {
            if (_progression != null && index >= 0 && index < _attributes.Count)
            {
                _progression.TrySpendAttributePoint(_attributes[index].Stat);
            }
        }

        private void Refund(int index)
        {
            if (_progression != null && index >= 0 && index < _attributes.Count)
            {
                _progression.TryRefundAttributePoint(_attributes[index].Stat);
            }
        }

        private void RebuildSkills()
        {
            int previous = _skillList.Focus.HasFocus ? _skillList.Focus.Current : 0;
            _skillRevision = _skills != null ? _skills.Revision : 0;
            SkillTree tree = _skills != null ? _skills.CurrentTree : null;
            _skillNodes.Clear();
            if (tree != null)
            {
                for (int i = 0; i < tree.Nodes.Count; i++)
                {
                    _skillNodes.Add(tree.Nodes[i]);
                }
            }

            // Rows are reused: the tree only changes with the class, the texts with every learned rank.
            if (_skillRows != null && _skillList.Count != _skillNodes.Count)
            {
                _skillList.Clear();
                _skillRows.Clear();
                for (int i = 0; i < _skillNodes.Count; i++)
                {
                    _questRowAsset.CloneTree(_skillRows);
                    _skillList.Add(_skillRows[_skillRows.childCount - 1]);
                }
            }

            for (int i = 0; i < _skillNodes.Count && i < _skillList.Count; i++)
            {
                SkillNode node = _skillNodes[i];
                int rank = _skills.Rank(node.Id);
                SkillCheck check = _skills.Check(node.Id);
                VisualElement row = _skillList[i];
                UiElementUtility.SetText(row.Q<Label>("quest-row-title"), node.DisplayName);
                UiElementUtility.SetText(row.Q<Label>("quest-row-info"), SkillPageModel.RowInfo(tree, node, rank));
                UiElementUtility.SetText(row.Q<Label>("quest-row-badge"), SkillPageModel.Badge(node, rank, check));
                row.EnableInClassList("is-learned", rank > 0);
                row.EnableInClassList("is-available", check == SkillCheck.Ok);
                row.EnableInClassList("is-finished", rank == 0 && check != SkillCheck.Ok);
                VisualElement stripe = row.Q<VisualElement>("quest-row-stripe");
                if (stripe != null)
                {
                    for (int b = 0; b < 4; b++)
                    {
                        stripe.EnableInClassList("af-skill-branch-" + b, b == node.Branch);
                    }
                }
            }

            UiElementUtility.SetText(_skillPoints, _skills != null ? SkillPageModel.PointsText(_skills.FreePoints, _skills.Level) : string.Empty);
            if (_skillPoints != null)
            {
                _skillPoints.EnableInClassList("has-points", _skills != null && _skills.FreePoints > 0);
            }

            _skillWindow.SetCount(_skillNodes.Count);
            if (_skillNodes.Count > 0)
            {
                _skillList.Focus.Restore(Math.Min(previous, _skillNodes.Count - 1));
                _skillWindow.EnsureVisible(_skillList.Focus.Current);
            }

            UiElementUtility.SetDisplayed(_skillEmpty, _skillNodes.Count == 0);
            UiElementUtility.SetDisplayed(_skillDetails, _skillNodes.Count > 0);
            _skillList.RefreshFocus(_page == JournalPage.Skills && IsOpen);
            ApplySkillWindow();
            ShowSkillDetails();
        }

        private void ApplySkillWindow()
        {
            for (int i = 0; i < _skillList.Count; i++)
            {
                UiElementUtility.SetDisplayed(_skillList[i], _skillWindow.IsVisible(i));
            }

            if (_skillMoreUp != null)
            {
                _skillMoreUp.EnableInClassList("is-off", !_skillWindow.HasMoreAbove);
            }

            if (_skillMoreDown != null)
            {
                _skillMoreDown.EnableInClassList("is-off", !_skillWindow.HasMoreBelow);
            }
        }

        private SkillNode FocusedNode()
        {
            int index = _skillList.Focus.HasFocus ? _skillList.Focus.Current : -1;
            return index >= 0 && index < _skillNodes.Count ? _skillNodes[index] : null;
        }

        private void ShowSkillDetails()
        {
            SkillNode node = FocusedNode();
            if (node == null || _skills == null)
            {
                return;
            }

            SkillTree tree = _skills.CurrentTree;
            SetLine(_skillTitle, node.DisplayName);
            SetLine(_skillMeta, SkillPageModel.Meta(tree, node));
            SetLine(_skillDescription, node.Description);
            SetLine(_skillState, SkillPageModel.StateText(tree, node, _skills.Check(node.Id), _skills.CanRefund(node.Id)));
            string abilityId = node.AbilityId;
            bool onBar = node.Kind == SkillNodeKind.Active && abilityId.Length > 0 && _skills.Rank(node.Id) > 0 && _skills.Loadout != null;
            SetLine(_skillBar, onBar ? SkillPageModel.BarText(_skills.Loadout.SlotOf(abilityId)) : string.Empty);
        }

        private void Learn(int index)
        {
            if (_skills != null && index >= 0 && index < _skillNodes.Count)
            {
                _skills.TryLearn(_skillNodes[index].Id);
                RebuildSkills();
            }
        }

        private void Unlearn(int index)
        {
            if (_skills != null && index >= 0 && index < _skillNodes.Count)
            {
                _skills.TryRefund(_skillNodes[index].Id);
                RebuildSkills();
            }
        }

        private void MoveOnBar(int delta)
        {
            SkillNode node = FocusedNode();
            if (_skills == null || node == null || node.Kind != SkillNodeKind.Active || node.AbilityId.Length == 0 || _skills.Loadout == null ||
                _skills.Rank(node.Id) == 0)
            {
                return;
            }

            _skills.Loadout.MoveToNextSlot(node.AbilityId, delta);
            ShowSkillDetails();
        }

        private static void SetLine(Label label, string text)
        {
            UiElementUtility.SetText(label, text ?? string.Empty);
            UiElementUtility.SetDisplayed(label, !string.IsNullOrEmpty(text));
        }
    }
}
