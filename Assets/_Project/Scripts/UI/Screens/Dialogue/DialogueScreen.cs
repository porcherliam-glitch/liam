using System;
using System.Collections.Generic;
using Aetherfall.Core;
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
    /// Built by the UI root from <c>Dialogue.uxml</c> (styles: <c>Dialogue.uss</c> through the theme) and registered with the UI manager;
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

        /// <summary>Class of the speaker label (Dialogue.uxml).</summary>
        public const string SpeakerClass = "af-dialogue__speaker";

        /// <summary>Class of the subtitle text label.</summary>
        public const string TextClass = "af-dialogue__text";

        /// <summary>Class of the continue mark (▼).</summary>
        public const string ContinueClass = "af-dialogue__continue";

        /// <summary>Class of the label "Automatisch weiter".</summary>
        public const string AutoClass = "af-dialogue__auto";

        /// <summary>Class of the hint text next to the confirm glyph ("Weiter" / "Auswaehlen").</summary>
        public const string ActionHintClass = "af-dialogue__hint-action";

        /// <summary>Class of the hint text next to the back glyph ("Gespraech beenden").</summary>
        public const string EndHintClass = "af-dialogue__hint-end";

        /// <summary>Class of an answer row; the rows are taken in document order.</summary>
        public const string OptionClass = "af-dialogue__option";

        /// <summary>Class of the quest symbol in an answer row.</summary>
        public const string SymbolClass = "af-dialogue__symbol";

        /// <summary>Class of the tag in an answer row ("[Ueberzeugen 12]").</summary>
        public const string TagClass = "af-dialogue__tag";

        /// <summary>Class of the answer text in an answer row.</summary>
        public const string OptionTextClass = "af-dialogue__option-text";

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
        private readonly Label _endHint;
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

            // Named labels (glyphs, "dialogue-hint-hold") get their texts from UiTexts; the rest is found by class (Dialogue.uxml).
            UiElementUtility.ApplyTexts(root);
            _speaker = root.Q<Label>(className: SpeakerClass);
            _text = root.Q<Label>(className: TextClass);
            _continueMark = root.Q<Label>(className: ContinueClass);
            _autoLabel = root.Q<Label>(className: AutoClass);
            _actionHint = root.Q<Label>(className: ActionHintClass);
            _endHint = root.Q<Label>(className: EndHintClass);
            _optionsBox = root.Q<VisualElement>("dialogue-options");
            _backHint = root.Q<VisualElement>("dialogue-hint-back-group");
            _holdHint = root.Q<VisualElement>("dialogue-hint-hold-group");
            _backGlyph = root.Q<Label>("dialogue-hint-glyph-back");
            UiElementUtility.SetText(_continueMark, DialogueScreenTexts.Get(DialogueScreenTexts.ContinueMark));
            UiElementUtility.SetText(_autoLabel, DialogueScreenTexts.Get(DialogueScreenTexts.AutoOn));
            UiElementUtility.SetText(_endHint, DialogueScreenTexts.Get(DialogueScreenTexts.HintEnd));

            List<VisualElement> rows = _optionsBox != null ? _optionsBox.Query<VisualElement>(className: OptionClass).ToList() : new List<VisualElement>();
            if (rows.Count < DialogueScreenPresenter.MaxOptions)
            {
                Log.Error(LogCategory.UI, "Dialogue.uxml has " + rows.Count + " answer rows, the screen needs " + DialogueScreenPresenter.MaxOptions + ".");
            }

            for (int i = 0; i < DialogueScreenPresenter.MaxOptions; i++)
            {
                VisualElement row = i < rows.Count ? rows[i] : null;
                _rows[i] = row;
                _symbols[i] = row != null ? row.Q<Label>(className: SymbolClass) : null;
                _tags[i] = row != null ? row.Q<Label>(className: TagClass) : null;
                _texts[i] = row != null ? row.Q<Label>(className: OptionTextClass) : null;
                _fills[i] = row != null ? row.Q<VisualElement>(className: "af-button__hold-fill") : null;
                int index = i;
                // The left mouse button is part of DialogSubmit: a click confirms through the input path, so the click itself
                // and the button hold do nothing here (otherwise an answer would be chosen twice).
                UiElementUtility.BindItem(row, () => _presenter.PointerEnter(index), held => { }, () => { });
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
    }
}
