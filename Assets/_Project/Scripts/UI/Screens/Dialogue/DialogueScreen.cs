using System;
using System.Collections.Generic;
using Aetherfall.Events;
using Aetherfall.UI.Framework;
using UnityEngine.UIElements;

namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// Dialogue screen (GDD 02 12.4 and 12.7, GDD 05 4.2): subtitle with speaker name at the bottom, answer list with quest
    /// symbols, tags ("[Ueberzeugen 12]" in the attribute colour, "[Angriff]" and "[Toeten]" in red, "[80 Gold]", "[Ende]"), greyed
    /// answers, answers chosen before at 60 % opacity, hold progress for irreversible answers, and button hints that follow the
    /// device. Fully usable with a controller: the input comes from the action map "Dialog" (<see cref="IDialogueScreenInput"/>),
    /// the logic is in <see cref="DialogueScreenPresenter"/>; the mouse only moves the focus (the left button is part of
    /// DialogSubmit, so a click confirms through the same path).
    /// </summary>
    /// <remarks>
    /// Built by the UI root from <c>Dialogue.uxml</c> (which loads <c>Dialogue.uss</c>) and registered with the UI manager;
    /// <see cref="DialogueScreenDirector"/> opens it while a conversation runs. The UI manager ticks every open screen, also
    /// while the UI map is off (game state Dialogue). Back / Close of the UI map are ignored: the conversation decides.
    /// </remarks>
    public sealed class DialogueScreen : UIScreen
    {
        /// <summary>Screen id (telemetry).</summary>
        public const string Id = "screen.dialogue";

        private const string ChosenClass = "is-chosen";
        private const string HoldingClass = "is-holding";
        private const string ChoiceModeClass = "is-choice";
        private const string TagClassPrefix = "af-dialogue__tag--";
        private const string SymbolClassPrefix = "af-dialogue__symbol--";
        private const string AttributeClassPrefix = "af-attr--";

        private static readonly string[] TagClasses =
        {
            TagClassPrefix + "check", TagClassPrefix + "bribe", TagClassPrefix + "requirement", TagClassPrefix + "combat", TagClassPrefix + "kill",
            TagClassPrefix + "trade", TagClassPrefix + "end"
        };

        private static readonly string[] AttributeClasses =
        {
            AttributeClassPrefix + "strength", AttributeClassPrefix + "dexterity", AttributeClassPrefix + "intelligence", AttributeClassPrefix + "wisdom",
            AttributeClassPrefix + "constitution", AttributeClassPrefix + "charisma"
        };

        private readonly VisualElement _root;
        private readonly Label _speaker;
        private readonly Label _text;
        private readonly Label _continueMark;
        private readonly Label _autoLabel;
        private readonly VisualElement _optionsBox;
        private readonly VisualElement[] _rows = new VisualElement[DialogueScreenPresenter.MaxOptions];
        private readonly Label[] _symbols = new Label[DialogueScreenPresenter.MaxOptions];
        private readonly Label[] _tags = new Label[DialogueScreenPresenter.MaxOptions];
        private readonly Label[] _texts = new Label[DialogueScreenPresenter.MaxOptions];
        private readonly VisualElement[] _fills = new VisualElement[DialogueScreenPresenter.MaxOptions];
        private readonly Label _actionHint;
        private readonly VisualElement _backHint;
        private readonly VisualElement _holdHint;
        private readonly Label _backGlyph;
        private readonly List<KeyValuePair<Label, UiGlyph>> _glyphLabels = new List<KeyValuePair<Label, UiGlyph>>();
        private readonly IGlyphService _glyphs;
        private readonly IDialogueScreenInput _input;
        private readonly DialogueScreenPresenter _presenter;
        private DialogueInputFrame _frame;
        private int _renderedVersion = -1;

        /// <summary>Builds the screen from Dialogue.uxml.</summary>
        /// <param name="root">Instantiated Dialogue.uxml (element <c>dialogue</c>).</param>
        /// <param name="glyphs">Glyph service.</param>
        /// <param name="source">Dialogue source.</param>
        /// <param name="input">Dialog map input (may be null: mouse only).</param>
        /// <param name="preferences">Subtitle options.</param>
        /// <param name="holdDuration">Hold to confirm duration in seconds.</param>
        public DialogueScreen(VisualElement root, IGlyphService glyphs, IDialogueScreenSource source, IDialogueScreenInput input,
            DialogueScreenPreferences preferences, float holdDuration = HoldToConfirm.DefaultDuration) : base(Id, UILayer.Screens)
        {
            _root = root ?? throw new ArgumentNullException(nameof(root));
            _glyphs = glyphs;
            _input = input;
            _presenter = new DialogueScreenPresenter(source, preferences, holdDuration);
            Focus = _presenter.Focus;

            UiElementUtility.ApplyTexts(root);
            ApplyOwnTexts(root);
            _speaker = root.Q<Label>("dialogue-speaker");
            _text = root.Q<Label>("dialogue-text");
            _continueMark = root.Q<Label>("dialogue-continue");
            _autoLabel = root.Q<Label>("dialogue-auto-on");
            _optionsBox = root.Q<VisualElement>("dialogue-options");
            _actionHint = root.Q<Label>("dialogue-hint-action");
            _backHint = root.Q<VisualElement>("dialogue-hint-back-group");
            _holdHint = root.Q<VisualElement>("dialogue-hint-hold-group");
            _backGlyph = root.Q<Label>("dialogue-hint-glyph-back");
            for (int i = 0; i < DialogueScreenPresenter.MaxOptions; i++)
            {
                string prefix = "dialogue-option-" + i;
                _rows[i] = root.Q<VisualElement>(prefix);
                _symbols[i] = root.Q<Label>(prefix + "-symbol");
                _tags[i] = root.Q<Label>(prefix + "-tag");
                _texts[i] = root.Q<Label>(prefix + "-text");
                _fills[i] = _rows[i] != null ? _rows[i].Q<VisualElement>(className: "af-button__hold-fill") : null;
                int index = i;
                UiElementUtility.BindItem(_rows[i], () => _presenter.PointerEnter(index), held => { }, () => { });
            }

            UiElementUtility.CollectGlyphLabels(root, _glyphLabels);
            RefreshGlyphs();
            UiElementUtility.HideImmediately(root);
        }

        /// <summary>The logic behind the screen (tests, debug).</summary>
        public DialogueScreenPresenter Presenter => _presenter;

        /// <summary>Shows the glyphs of the current device (call when the glyph service changed).</summary>
        public void RefreshGlyphs()
        {
            UiElementUtility.RefreshGlyphs(_root, _glyphLabels, _glyphs);
            if (_glyphs != null && _glyphs.Family == GlyphFamily.KeyboardMouse)
            {
                // GDD 03 1.5: DialogBack on keyboard and mouse is the right mouse button (Esc opens the pause menu).
                UiElementUtility.SetText(_backGlyph, DialogueScreenTexts.Get(DialogueScreenTexts.BackGlyphKeyboard));
            }
        }

        /// <inheritdoc />
        public override void Tick(float unscaledDeltaTime)
        {
            _frame.Clear();
            bool active = _input != null && _input.IsActive;
            if (active)
            {
                _input.Read(ref _frame);
            }

            _presenter.Tick(unscaledDeltaTime, _frame, active);
            if (_presenter.Version != _renderedVersion)
            {
                Render();
            }
        }

        /// <inheritdoc />
        public override void Submit(int index)
        {
            _presenter.ChooseDirect(index);
        }

        /// <inheritdoc />
        public override bool RequiresHold(int index)
        {
            return index >= 0 && index < _presenter.OptionCount && _presenter.GetOption(index).RequiresHold;
        }

        /// <inheritdoc />
        public override BackOutcome Back(bool closeHub)
        {
            // B / Esc of the UI map (not active in the game state Dialogue) never closes the conversation from outside.
            return BackOutcome.Ignored;
        }

        /// <inheritdoc />
        protected override void OnOpen(object args)
        {
            RefreshGlyphs();
            _presenter.Sync();
            Render();
            UiElementUtility.ShowAnimated(_root);
        }

        /// <inheritdoc />
        protected override void OnClose()
        {
            UiElementUtility.HideAnimated(_root);
        }

        private void Render()
        {
            _renderedVersion = _presenter.Version;
            DialogueScreenMode mode = _presenter.Mode;
            bool choice = mode == DialogueScreenMode.Choice;
            _root.EnableInClassList(ChoiceModeClass, choice);
            UiElementUtility.SetText(_speaker, _presenter.SpeakerName);
            UiElementUtility.SetDisplayed(_speaker, _presenter.SpeakerName.Length > 0);
            UiElementUtility.SetText(_text, _presenter.VisibleText);
            UiElementUtility.SetDisplayed(_continueMark, _presenter.ShowsContinueMark);
            UiElementUtility.SetDisplayed(_autoLabel, _presenter.AutoContinue);
            UiElementUtility.SetDisplayed(_optionsBox, choice);

            for (int i = 0; i < _rows.Length; i++)
            {
                bool shown = choice && i < _presenter.OptionCount;
                UiElementUtility.SetDisplayed(_rows[i], shown);
                if (shown)
                {
                    RenderOption(i, _presenter.GetOption(i));
                }
            }

            UiElementUtility.SetText(_actionHint, DialogueScreenTexts.Get(choice ? DialogueScreenTexts.HintSelect : DialogueScreenTexts.HintContinue));
            UiElementUtility.SetDisplayed(_backHint, _presenter.CanGoBack);
            UiElementUtility.SetDisplayed(_holdHint, choice && _presenter.FocusedRequiresHold);
        }

        private void RenderOption(int index, in DialogueScreenOption option)
        {
            VisualElement row = _rows[index];
            bool focused = _presenter.Focus.Current == index;
            UiElementUtility.SetFocused(row, focused);
            UiElementUtility.SetDisabled(row, !option.IsEnabled);
            row.EnableInClassList(ChosenClass, option.IsAlreadyChosen && option.IsEnabled);
            bool holding = _presenter.HoldIndex == index;
            row.EnableInClassList(HoldingClass, holding);
            UiElementUtility.SetFill(_fills[index], holding ? _presenter.HoldProgress : 0f);

            UiElementUtility.SetText(_symbols[index], option.SymbolText);
            UiElementUtility.SetDisplayed(_symbols[index], option.SymbolText.Length > 0);
            ApplySymbolClass(_symbols[index], option.SymbolText);

            UiElementUtility.SetText(_tags[index], option.TagText);
            UiElementUtility.SetDisplayed(_tags[index], option.TagText.Length > 0);
            ApplyTagClasses(_tags[index], option);

            UiElementUtility.SetText(_texts[index], option.Text);
        }

        private static void ApplySymbolClass(Label symbol, string symbolText)
        {
            if (symbol == null)
            {
                return;
            }

            symbol.EnableInClassList(SymbolClassPrefix + "progress", symbolText == "◆");
            symbol.EnableInClassList(SymbolClassPrefix + "new", symbolText == "!");
            symbol.EnableInClassList(SymbolClassPrefix + "complete", symbolText == "★");
        }

        private static void ApplyTagClasses(Label tag, in DialogueScreenOption option)
        {
            if (tag == null)
            {
                return;
            }

            for (int i = 0; i < TagClasses.Length; i++)
            {
                tag.EnableInClassList(TagClasses[i], (int)option.Tag == i + 1);
            }

            for (int i = 0; i < AttributeClasses.Length; i++)
            {
                tag.EnableInClassList(AttributeClasses[i], option.Tag == DialogueScreenTag.Check && AttributeClasses[i] == AttributeClassPrefix + option.AttributeKey);
            }
        }

        private static void ApplyOwnTexts(VisualElement root)
        {
            root.Query<TextElement>().ForEach(element =>
            {
                if (DialogueScreenTexts.TryGet(element.name, out string text))
                {
                    element.text = text;
                }
            });
        }
    }
}
