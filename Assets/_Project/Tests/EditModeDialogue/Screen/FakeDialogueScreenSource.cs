using System.Collections.Generic;
using Aetherfall.UI.Screens.Dialogue;

namespace Aetherfall.Tests.EditMode.DialogueScreen
{
    /// <summary>
    /// <see cref="IDialogueScreenSource"/> test double: the test sets a line or a choice; continue, choose and back are recorded
    /// and, like the real service, end the shown state (the source then shows nothing until the test sets the next state).
    /// </summary>
    public sealed class FakeDialogueScreenSource : IDialogueScreenSource
    {
        private readonly List<DialogueScreenOption> _options = new List<DialogueScreenOption>();
        private string[] _pages = new string[0];

        /// <inheritdoc />
        public int Revision { get; private set; }

        /// <inheritdoc />
        public DialogueScreenMode Mode { get; private set; }

        /// <inheritdoc />
        public string SpeakerName { get; private set; } = string.Empty;

        /// <inheritdoc />
        public IReadOnlyList<string> LinePages => _pages;

        /// <inheritdoc />
        public float LineSeconds { get; private set; }

        /// <inheritdoc />
        public int OptionCount => _options.Count;

        /// <inheritdoc />
        public int BackOptionIndex { get; private set; } = -1;

        /// <inheritdoc />
        public bool CanCancel { get; private set; }

        /// <summary>Number of continue calls.</summary>
        public int Continues { get; private set; }

        /// <summary>Chosen indices.</summary>
        public List<int> Chosen { get; } = new List<int>();

        /// <summary>Number of back calls.</summary>
        public int Backs { get; private set; }

        /// <summary>Shows a line.</summary>
        /// <param name="speaker">Speaker name.</param>
        /// <param name="seconds">Display duration of the whole line.</param>
        /// <param name="canCancel">True if B cancels.</param>
        /// <param name="pages">Subtitle pages.</param>
        public void ShowLine(string speaker, float seconds, bool canCancel, params string[] pages)
        {
            Mode = DialogueScreenMode.Line;
            SpeakerName = speaker;
            LineSeconds = seconds;
            CanCancel = canCancel;
            _pages = pages;
            _options.Clear();
            BackOptionIndex = -1;
            Revision++;
        }

        /// <summary>Shows a choice.</summary>
        /// <param name="backIndex">Index of the end answer (-1 = none).</param>
        /// <param name="canCancel">True if B cancels without end answer.</param>
        /// <param name="options">Answers.</param>
        public void ShowChoice(int backIndex, bool canCancel, params DialogueScreenOption[] options)
        {
            Mode = DialogueScreenMode.Choice;
            CanCancel = canCancel;
            BackOptionIndex = backIndex;
            _options.Clear();
            _options.AddRange(options);
            Revision++;
        }

        /// <summary>Shows nothing (conversation over).</summary>
        public void Clear()
        {
            Mode = DialogueScreenMode.None;
            _options.Clear();
            _pages = new string[0];
            Revision++;
        }

        /// <inheritdoc />
        public DialogueScreenOption GetOption(int index)
        {
            return _options[index];
        }

        /// <inheritdoc />
        public void Continue()
        {
            Continues++;
            Clear();
        }

        /// <inheritdoc />
        public void Choose(int index)
        {
            Chosen.Add(index);
            Clear();
        }

        /// <inheritdoc />
        public void Back()
        {
            Backs++;
            Clear();
        }

        /// <summary>A selectable answer without tag.</summary>
        /// <param name="text">Text.</param>
        public static DialogueScreenOption Answer(string text)
        {
            return new DialogueScreenOption(text, string.Empty, DialogueScreenTag.None, string.Empty, true, false, false, string.Empty);
        }

        /// <summary>A greyed check answer.</summary>
        /// <param name="text">Text.</param>
        public static DialogueScreenOption Greyed(string text)
        {
            return new DialogueScreenOption(text, "[Überzeugen 12 · dein Wert 9]", DialogueScreenTag.Check, string.Empty, false, false, false, "charisma");
        }

        /// <summary>An irreversible answer with hold to confirm.</summary>
        /// <param name="text">Text.</param>
        public static DialogueScreenOption Kill(string text)
        {
            return new DialogueScreenOption(text, "[Töten]", DialogueScreenTag.Kill, string.Empty, true, false, true, string.Empty);
        }

        /// <summary>A "[Angriff]" answer (selectable, no hold).</summary>
        /// <param name="text">Text.</param>
        public static DialogueScreenOption Combat(string text)
        {
            return new DialogueScreenOption(text, "[Angriff]", DialogueScreenTag.Combat, string.Empty, true, false, false, string.Empty);
        }

        /// <summary>The "[Ende]" answer.</summary>
        /// <param name="text">Text.</param>
        public static DialogueScreenOption End(string text)
        {
            return new DialogueScreenOption(text, "[Ende]", DialogueScreenTag.End, string.Empty, true, false, false, string.Empty);
        }
    }
}
