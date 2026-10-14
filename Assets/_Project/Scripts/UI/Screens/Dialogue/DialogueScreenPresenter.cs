using System;
using System.Collections.Generic;
using Aetherfall.UI.Framework;

namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// The logic of the dialogue screen (pure C#, tested without Unity): subtitles page by page with typewriter (first confirm
    /// shows the page at once, the second continues, GDD 02 12.7), automatic continue after the display duration × reading
    /// factor, answer list with controller focus (up/down with auto repeat, greyed answers are skipped, GDD 05 1.4), A / Cross
    /// chooses, hold to confirm for "[Toeten]" (1.0 s), B / Circle chooses "[Ende]" or cancels where allowed, keys 1-9 choose
    /// directly, X / F switches the automatic continue. During a choice the last line stays visible as context.
    /// </summary>
    /// <remarks>
    /// <para><b>Mouse:</b> the focus follows the pointer onto selectable answers; the row under the pointer is remembered
    /// separately (<see cref="PointerOver"/>, <see cref="PointerLeave"/>), also over greyed answers. A left click
    /// (<see cref="DialogueInputFrame.PointerSubmitPressed"/>) only chooses the answer under the pointer: a click on a greyed
    /// answer or beside the answers chooses nothing, never the answer focused before. "[Toeten]" starts its hold only on
    /// the focused row under the pointer, and leaving that row cancels a hold started by the mouse.</para>
    /// <para>The view (<see cref="DialogueScreen"/>) renders <see cref="Version"/> changes. The source is polled every frame
    /// (<see cref="IDialogueScreenSource.Revision"/>), so the presenter never shows an outdated choice after a command.</para>
    /// </remarks>
    public sealed class DialogueScreenPresenter
    {
        /// <summary>Most answers the screen shows (hub, GDD 02 12.2).</summary>
        public const int MaxOptions = 9;

        private static readonly IReadOnlyList<string> EmptyPages = new[] { string.Empty };

        private readonly IDialogueScreenSource _source;
        private readonly DialogueScreenPreferences _preferences;
        private readonly FocusGroup _focus = new FocusGroup(0, FocusLayout.Vertical, 1, true);
        private readonly NavigationRepeater _repeater = new NavigationRepeater();
        private readonly HoldToConfirm _hold;
        private readonly DialogueTypewriter _typewriter = new DialogueTypewriter();
        private readonly DialogueScreenOption[] _options = new DialogueScreenOption[MaxOptions];
        private readonly List<string> _pages = new List<string>();
        private int _optionCount;
        private int _pointerIndex = -1;
        private bool _holdByPointer;
        private int _revision = int.MinValue;
        private int _page;
        private float _autoTimer;
        private float _lineSeconds;

        /// <summary>Creates the presenter.</summary>
        /// <param name="source">Dialogue source.</param>
        /// <param name="preferences">Subtitle options.</param>
        /// <param name="holdDuration">Hold to confirm duration in seconds (GDD 05 1.4: 1.0).</param>
        public DialogueScreenPresenter(IDialogueScreenSource source, DialogueScreenPreferences preferences, float holdDuration = HoldToConfirm.DefaultDuration)
        {
            _source = source ?? throw new ArgumentNullException(nameof(source));
            _preferences = preferences ?? new DialogueScreenPreferences();
            _hold = new HoldToConfirm(holdDuration);
        }

        /// <summary>Counter that grows with every visible change (the view renders when it changed).</summary>
        public int Version { get; private set; }

        /// <summary>What is shown.</summary>
        public DialogueScreenMode Mode { get; private set; }

        /// <summary>Speaker of the shown line (or of the last line during a choice).</summary>
        public string SpeakerName { get; private set; } = string.Empty;

        /// <summary>Visible text: the revealed part of the page, or the last line during a choice.</summary>
        public string VisibleText => Mode == DialogueScreenMode.Line ? _typewriter.VisibleText : ContextText;

        /// <summary>Full last line without page breaks (shown dimmed above the answers).</summary>
        public string ContextText { get; private set; } = string.Empty;

        /// <summary>True if the current page is fully visible.</summary>
        public bool IsPageComplete => _typewriter.IsComplete;

        /// <summary>Index of the current subtitle page.</summary>
        public int PageIndex => _page;

        /// <summary>Number of subtitle pages of the line.</summary>
        public int PageCount => _pages.Count;

        /// <summary>True if the continue mark (▼) is shown: the page is complete in line mode.</summary>
        public bool ShowsContinueMark => Mode == DialogueScreenMode.Line && _typewriter.IsComplete;

        /// <summary>Focus over the answers.</summary>
        public FocusGroup Focus => _focus;

        /// <summary>Number of shown answers.</summary>
        public int OptionCount => _optionCount;

        /// <summary>Answer whose hold to confirm runs (-1 if none).</summary>
        public int HoldIndex => _hold.Target;

        /// <summary>Progress of the hold to confirm (0-1).</summary>
        public float HoldProgress => _hold.Progress;

        /// <summary>Answer row under the mouse pointer (-1 if none), also a greyed one.</summary>
        public int PointerIndex => _pointerIndex;

        /// <summary>True if B / Circle does something now (end answer or cancel).</summary>
        public bool CanGoBack => Mode == DialogueScreenMode.Choice ? _source.BackOptionIndex >= 0 || _source.CanCancel : Mode == DialogueScreenMode.Line && _source.CanCancel;

        /// <summary>True if the focused answer needs hold to confirm.</summary>
        public bool FocusedRequiresHold => _focus.HasFocus && _focus.Current < _optionCount && _options[_focus.Current].RequiresHold;

        /// <summary>Automatic continue is on.</summary>
        public bool AutoContinue => _preferences.AutoContinue;

        /// <summary>Returns a shown answer.</summary>
        /// <param name="index">0 .. <see cref="OptionCount"/> - 1.</param>
        public DialogueScreenOption GetOption(int index)
        {
            if (index < 0 || index >= _optionCount)
            {
                throw new ArgumentOutOfRangeException(nameof(index), index, "Option index out of range (count " + _optionCount + ").");
            }

            return _options[index];
        }

        /// <summary>Reads the source if it changed.</summary>
        /// <returns>True if the content was rebuilt.</returns>
        public bool Sync()
        {
            int revision = _source.Revision;
            if (revision == _revision)
            {
                return false;
            }

            _revision = revision;
            Rebuild();
            return true;
        }

        /// <summary>Advances one frame: typewriter, automatic continue and the dialogue input.</summary>
        /// <param name="unscaledDeltaTime">Frame time in seconds.</param>
        /// <param name="input">Input of this frame.</param>
        /// <param name="inputActive">False while the Dialog map is off (pause menu over the dialogue).</param>
        public void Tick(float unscaledDeltaTime, in DialogueInputFrame input, bool inputActive)
        {
            float dt = float.IsNaN(unscaledDeltaTime) || unscaledDeltaTime < 0f ? 0f : unscaledDeltaTime;
            Sync();
            if (inputActive && input.AutoTogglePressed)
            {
                _preferences.SetAutoContinue(!_preferences.AutoContinue, _preferences.ReadingFactor);
                _autoTimer = 0f;
                Version++;
            }

            if (Mode == DialogueScreenMode.Line)
            {
                TickLine(dt, input, inputActive);
            }
            else if (Mode == DialogueScreenMode.Choice)
            {
                TickChoice(dt, input, inputActive);
            }
        }

        /// <summary>
        /// The mouse pointer entered an answer row: it is remembered as the row under the pointer, and a selectable answer
        /// gets the focus (greyed answers stay unfocused; their tag shows the reason). Leaving the row of a hold started by the
        /// mouse cancels it.
        /// </summary>
        /// <param name="index">Row index (answer index); -1 = over no answer.</param>
        public void PointerOver(int index)
        {
            _pointerIndex = index >= 0 && index < MaxOptions ? index : -1;
            if (_hold.IsHolding && _holdByPointer && _hold.Target != _pointerIndex)
            {
                _hold.Cancel();
                Version++;
            }

            if (Mode != DialogueScreenMode.Choice || _pointerIndex < 0 || _pointerIndex >= _optionCount || _focus.Current == _pointerIndex)
            {
                return;
            }

            if (_focus.SetCurrent(_pointerIndex))
            {
                _hold.Cancel();
                Version++;
            }
        }

        /// <summary>The mouse pointer left an answer row (ignored if the pointer is already over another row).</summary>
        /// <param name="index">Row index.</param>
        public void PointerLeave(int index)
        {
            if (index == _pointerIndex)
            {
                PointerOver(-1);
            }
        }

        /// <summary>Chooses an answer if it is selectable and needs no holding (direct choice, pointer).</summary>
        /// <param name="index">Answer index.</param>
        /// <returns>True if it was chosen.</returns>
        public bool ChooseDirect(int index)
        {
            if (Mode != DialogueScreenMode.Choice || index < 0 || index >= _optionCount)
            {
                return false;
            }

            DialogueScreenOption option = _options[index];
            if (!option.IsEnabled)
            {
                return false;
            }

            if (option.RequiresHold)
            {
                // Irreversible answers are only chosen by holding (GDD 05 1.4): focus it so the hold can start.
                _focus.SetCurrent(index);
                Version++;
                return false;
            }

            Choose(index);
            return true;
        }

        private void TickLine(float dt, in DialogueInputFrame input, bool inputActive)
        {
            if (_typewriter.Tick(dt, DialogueScreenPreferences.CharactersPerSecond(_preferences.TextSpeed)))
            {
                Version++;
            }

            // In a line any confirm continues, also a click anywhere.
            if (inputActive && (input.SubmitPressed || input.PointerSubmitPressed))
            {
                AdvanceLine();
                return;
            }

            if (inputActive && input.BackPressed && _source.CanCancel)
            {
                _source.Back();
                Sync();
                return;
            }

            if (_preferences.AutoContinue && _typewriter.IsComplete)
            {
                _autoTimer += dt;
                float pageSeconds = _lineSeconds * _preferences.ReadingFactor / Math.Max(1, _pages.Count);
                if (_autoTimer >= pageSeconds)
                {
                    AdvanceLine();
                }
            }
        }

        private void AdvanceLine()
        {
            if (!_typewriter.IsComplete)
            {
                _typewriter.Complete();
                Version++;
                return;
            }

            if (_page + 1 < _pages.Count)
            {
                _page++;
                StartPage();
                return;
            }

            _source.Continue();
            Sync();
        }

        private void TickChoice(float dt, in DialogueInputFrame input, bool inputActive)
        {
            if (!inputActive)
            {
                _repeater.Reset();
                if (_hold.IsHolding)
                {
                    _hold.Cancel();
                    Version++;
                }

                return;
            }

            NavDirection direction = _repeater.Update(input.NavigateX, input.NavigateY, dt);
            if (direction != NavDirection.None && _focus.Move(direction))
            {
                _hold.Cancel();
                Version++;
            }

            if (_hold.IsHolding)
            {
                HoldStep step = _hold.Update(input.SubmitHeld, dt);
                int target = _focus.Current;
                if (step == HoldStep.Completed)
                {
                    Choose(target);
                    return;
                }

                Version++;
                return;
            }

            if (input.DirectNumber > 0)
            {
                ChooseDirect(input.DirectNumber - 1);
                return;
            }

            if (input.PointerSubmitPressed)
            {
                PointerSubmit();
                return;
            }

            if (input.SubmitPressed && _focus.HasFocus && _focus.Current < _optionCount)
            {
                int index = _focus.Current;
                DialogueScreenOption option = _options[index];
                if (!option.IsEnabled)
                {
                    return;
                }

                if (option.RequiresHold)
                {
                    _hold.Begin(index);
                    _holdByPointer = false;
                    Version++;
                    return;
                }

                Choose(index);
                return;
            }

            if (input.BackPressed && CanGoBack)
            {
                _source.Back();
                Sync();
            }
        }

        /// <summary>A left click: chooses the answer under the pointer only (never the focused one).</summary>
        private void PointerSubmit()
        {
            int index = _pointerIndex;
            if (index < 0 || index >= _optionCount || !_options[index].IsEnabled)
            {
                // Beside the answers or on a greyed answer: nothing; a click never confirms another (focused) answer.
                return;
            }

            if (_options[index].RequiresHold)
            {
                // "[Toeten]" is only confirmed by holding, and only on the focused row under the pointer.
                if (_focus.Current == index)
                {
                    _hold.Begin(index);
                    _holdByPointer = true;
                    Version++;
                }

                return;
            }

            Choose(index);
        }

        private void Choose(int index)
        {
            _hold.Cancel();
            _source.Choose(index);
            Sync();
        }

        private void Rebuild()
        {
            Mode = _source.Mode;
            _hold.Cancel();
            switch (Mode)
            {
                case DialogueScreenMode.Line:
                    SpeakerName = _source.SpeakerName ?? string.Empty;
                    _pages.Clear();
                    IReadOnlyList<string> pages = _source.LinePages;
                    if (pages == null || pages.Count == 0)
                    {
                        pages = EmptyPages;
                    }

                    for (int i = 0; i < pages.Count; i++)
                    {
                        _pages.Add(pages[i] ?? string.Empty);
                    }

                    _lineSeconds = Math.Max(0f, _source.LineSeconds);
                    // As context above the answers the line flows over the full width (the page breaks are for subtitles).
                    ContextText = string.Join(" ", _pages).Replace('\n', ' ');
                    _optionCount = 0;
                    _focus.SetCount(0);
                    _page = 0;
                    StartPage();
                    break;
                case DialogueScreenMode.Choice:
                    _optionCount = Math.Min(MaxOptions, Math.Max(0, _source.OptionCount));
                    _focus.SetCount(_optionCount);
                    for (int i = 0; i < _optionCount; i++)
                    {
                        _options[i] = _source.GetOption(i);
                        _focus.SetEnabled(i, _options[i].IsEnabled);
                    }

                    _focus.FocusFirst();
                    // A direction held while the line ended must not move the focus at once.
                    _repeater.BlockUntilNeutral();
                    break;
                default:
                    _optionCount = 0;
                    _focus.SetCount(0);
                    _pages.Clear();
                    _typewriter.Start(string.Empty);
                    SpeakerName = string.Empty;
                    ContextText = string.Empty;
                    break;
            }

            Version++;
        }

        private void StartPage()
        {
            _typewriter.Start(_page < _pages.Count ? _pages[_page] : string.Empty);
            _autoTimer = 0f;
            if (_preferences.TextSpeed == DialogueTextSpeed.Instant)
            {
                _typewriter.Complete();
            }

            Version++;
        }
    }
}
