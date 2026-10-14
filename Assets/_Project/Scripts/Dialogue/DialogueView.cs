using System.Collections.Generic;
using Aetherfall.Events;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// What the dialogue screen shows (presentation model of <see cref="IDialogueService"/>): state (line, choice, ended),
    /// the current line or the visible options, dialogue and partner. Rebuilt by the runner on every step; the
    /// <see cref="Revision"/> grows with every change.
    /// </summary>
    public sealed class DialogueView
    {
        private readonly List<DialogueOptionView> _options = new List<DialogueOptionView>();

        /// <summary>Current state.</summary>
        public DialogueViewState State { get; private set; }

        /// <summary>Counter that grows with every change (cheap "did anything change" check for views).</summary>
        public int Revision { get; private set; }

        /// <summary>Running dialogue (the one that was started, also while a jumped-to dialogue runs).</summary>
        public string DialogueId { get; private set; } = string.Empty;

        /// <summary>Dialogue of the current node (differs from <see cref="DialogueId"/> after a jump).</summary>
        public string CurrentDialogueId { get; private set; } = string.Empty;

        /// <summary>Conversation partner.</summary>
        public string NpcId { get; private set; } = string.Empty;

        /// <summary>Full or short mode.</summary>
        public DialogueMode Mode { get; private set; }

        /// <summary>Current node id.</summary>
        public string NodeId { get; private set; } = string.Empty;

        /// <summary>The current line (state <see cref="DialogueViewState.Line"/>), otherwise null.</summary>
        public DialogueLineView Line { get; private set; }

        /// <summary>The visible options (state <see cref="DialogueViewState.Choice"/>), otherwise empty.</summary>
        public IReadOnlyList<DialogueOptionView> Options => _options;

        /// <summary>True if B / Esc may cancel the conversation here (no end option, dialogue cancelable).</summary>
        public bool CanCancel { get; private set; }

        /// <summary>Index of the option chosen by B / Circle / Esc (the last selectable "[Ende]" or "Zurueck" answer); -1 if none.</summary>
        public int BackOptionIndex
        {
            get
            {
                for (int i = _options.Count - 1; i >= 0; i--)
                {
                    if (_options[i].IsBackOption && _options[i].IsEnabled)
                    {
                        return i;
                    }
                }

                return -1;
            }
        }

        /// <summary>Exit of the ended conversation (state <see cref="DialogueViewState.Ended"/>).</summary>
        public string ExitId { get; private set; } = string.Empty;

        internal void Begin(string dialogueId, string npcId, DialogueMode mode)
        {
            DialogueId = dialogueId ?? string.Empty;
            CurrentDialogueId = DialogueId;
            NpcId = npcId ?? string.Empty;
            Mode = mode;
            ExitId = string.Empty;
        }

        internal void ShowLine(string currentDialogueId, DialogueLineView line, bool canCancel)
        {
            State = DialogueViewState.Line;
            CurrentDialogueId = currentDialogueId ?? string.Empty;
            NodeId = line != null ? line.NodeId : string.Empty;
            Line = line;
            _options.Clear();
            CanCancel = canCancel;
            Revision++;
        }

        internal void ShowChoice(string currentDialogueId, string nodeId, List<DialogueOptionView> options, bool canCancel)
        {
            State = DialogueViewState.Choice;
            CurrentDialogueId = currentDialogueId ?? string.Empty;
            NodeId = nodeId ?? string.Empty;
            Line = null;
            _options.Clear();
            if (options != null)
            {
                _options.AddRange(options);
            }

            CanCancel = canCancel;
            Revision++;
        }

        internal void ShowEnded(string exitId)
        {
            State = DialogueViewState.Ended;
            Line = null;
            _options.Clear();
            CanCancel = false;
            ExitId = exitId ?? string.Empty;
            Revision++;
        }

        internal void Clear()
        {
            State = DialogueViewState.None;
            DialogueId = string.Empty;
            CurrentDialogueId = string.Empty;
            NpcId = string.Empty;
            NodeId = string.Empty;
            Line = null;
            _options.Clear();
            CanCancel = false;
            ExitId = string.Empty;
            Revision++;
        }
    }
}
