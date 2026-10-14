using System;
using System.Collections.Generic;
using Aetherfall.Dialogue;

namespace Aetherfall.UI.Screens.Dialogue
{
    /// <summary>
    /// Connects the dialogue screen with the dialogue service: turns the <see cref="DialogueView"/> into what the screen shows
    /// (mode, speaker, subtitle pages, answers with tag and symbol) and passes continue, choose and back on.
    /// </summary>
    public sealed class DialogueServiceScreenSource : IDialogueScreenSource
    {
        private static readonly IReadOnlyList<string> NoPages = Array.Empty<string>();

        private readonly IDialogueService _service;

        /// <summary>Creates the adapter.</summary>
        /// <param name="service">Dialogue service.</param>
        public DialogueServiceScreenSource(IDialogueService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public int Revision => _service.View.Revision;

        /// <inheritdoc />
        public DialogueScreenMode Mode
        {
            get
            {
                switch (_service.View.State)
                {
                    case DialogueViewState.Line: return DialogueScreenMode.Line;
                    case DialogueViewState.Choice: return DialogueScreenMode.Choice;
                    default: return DialogueScreenMode.None;
                }
            }
        }

        /// <inheritdoc />
        public string SpeakerName => _service.View.Line != null ? _service.View.Line.SpeakerName : string.Empty;

        /// <inheritdoc />
        public IReadOnlyList<string> LinePages => _service.View.Line != null ? _service.View.Line.Pages : NoPages;

        /// <inheritdoc />
        public float LineSeconds => _service.View.Line != null ? _service.View.Line.DisplaySeconds : 0f;

        /// <inheritdoc />
        public int OptionCount => _service.View.Options.Count;

        /// <inheritdoc />
        public int BackOptionIndex => _service.View.BackOptionIndex;

        /// <inheritdoc />
        public bool CanCancel => _service.View.CanCancel;

        /// <inheritdoc />
        public DialogueScreenOption GetOption(int index)
        {
            DialogueOptionView option = _service.View.Options[index];
            return new DialogueScreenOption(option.Text, option.TagText, TagOf(option.Tag), DialogueOptionFormatter.SymbolText(option.Symbol),
                option.IsEnabled, option.IsAlreadyChosen, option.RequiresHold, option.AttributeKey);
        }

        /// <inheritdoc />
        public void Continue()
        {
            _service.Continue();
        }

        /// <inheritdoc />
        public void Choose(int index)
        {
            _service.Choose(index);
        }

        /// <inheritdoc />
        public void Back()
        {
            _service.Back();
        }

        private static DialogueScreenTag TagOf(DialogueOptionTag tag)
        {
            switch (tag)
            {
                case DialogueOptionTag.Check: return DialogueScreenTag.Check;
                case DialogueOptionTag.Bribe: return DialogueScreenTag.Bribe;
                case DialogueOptionTag.Requirement: return DialogueScreenTag.Requirement;
                case DialogueOptionTag.Combat: return DialogueScreenTag.Combat;
                case DialogueOptionTag.Kill: return DialogueScreenTag.Kill;
                case DialogueOptionTag.Trade: return DialogueScreenTag.Trade;
                case DialogueOptionTag.End: return DialogueScreenTag.End;
                default: return DialogueScreenTag.None;
            }
        }
    }
}
