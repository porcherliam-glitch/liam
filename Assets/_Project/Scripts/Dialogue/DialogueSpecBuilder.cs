using System.Collections.Generic;
using Aetherfall.Events;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Builds a <see cref="DialogueSpec"/> in code: test data, generators and the example dialogue fixtures. The same structure
    /// is entered in the inspector of a <see cref="DialogueDefinition"/>.
    /// </summary>
    public sealed class DialogueSpecBuilder
    {
        private readonly string _id;
        private readonly List<DialogueNode> _nodes = new List<DialogueNode>();
        private readonly List<string> _questExits = new List<string>();
        private string _title = string.Empty;
        private DialogueMode _mode = DialogueMode.Full;
        private string _speakerId = string.Empty;
        private string _startNodeId = string.Empty;
        private bool _cancelable;
        private string _questId = string.Empty;

        /// <summary>Starts a dialogue.</summary>
        /// <param name="id">Dialogue id.</param>
        public DialogueSpecBuilder(string id)
        {
            _id = id ?? string.Empty;
        }

        /// <summary>Sets the internal title.</summary>
        /// <param name="title">Title.</param>
        public DialogueSpecBuilder Title(string title)
        {
            _title = title ?? string.Empty;
            return this;
        }

        /// <summary>Sets the conversation mode.</summary>
        /// <param name="mode">Mode.</param>
        public DialogueSpecBuilder Mode(DialogueMode mode)
        {
            _mode = mode;
            return this;
        }

        /// <summary>Sets the default speaker.</summary>
        /// <param name="speakerId">NPC id.</param>
        public DialogueSpecBuilder Speaker(string speakerId)
        {
            _speakerId = speakerId ?? string.Empty;
            return this;
        }

        /// <summary>Sets the start node (default: the first node).</summary>
        /// <param name="nodeId">Node id.</param>
        public DialogueSpecBuilder Start(string nodeId)
        {
            _startNodeId = nodeId ?? string.Empty;
            return this;
        }

        /// <summary>Allows cancelling with B / Esc where no end option exists.</summary>
        /// <param name="cancelable">True = cancelable.</param>
        public DialogueSpecBuilder Cancelable(bool cancelable = true)
        {
            _cancelable = cancelable;
            return this;
        }

        /// <summary>Links the dialogue to a quest and names the exits that advance it.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="exits">Exits that advance the quest.</param>
        public DialogueSpecBuilder Quest(string questId, params string[] exits)
        {
            _questId = questId ?? string.Empty;
            if (exits != null)
            {
                _questExits.AddRange(exits);
            }

            return this;
        }

        /// <summary>Adds a node.</summary>
        /// <param name="node">Node.</param>
        public DialogueSpecBuilder Node(DialogueNode node)
        {
            _nodes.Add(node);
            return this;
        }

        /// <summary>Adds several nodes.</summary>
        /// <param name="nodes">Nodes.</param>
        public DialogueSpecBuilder Nodes(params DialogueNode[] nodes)
        {
            if (nodes != null)
            {
                _nodes.AddRange(nodes);
            }

            return this;
        }

        /// <summary>Creates the spec.</summary>
        public DialogueSpec Build()
        {
            return new DialogueSpec(_id, _title, _mode, _speakerId, _startNodeId, _cancelable, _questId, _questExits, _nodes);
        }
    }
}
