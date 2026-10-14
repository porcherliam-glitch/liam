using System;
using System.Collections.Generic;
using Aetherfall.Events;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Read-only form of a dialogue used by the runner and the validator (pure C#, built by
    /// <see cref="DialogueDefinition.CreateSpec"/> or <see cref="DialogueSpecBuilder"/> in tests). The node objects are shared
    /// with the asset and never changed at run time.
    /// </summary>
    public sealed class DialogueSpec
    {
        private readonly List<DialogueNode> _nodes;
        private readonly Dictionary<string, DialogueNode> _byId = new Dictionary<string, DialogueNode>(StringComparer.Ordinal);
        private readonly HashSet<string> _questExits;
        private readonly List<string> _duplicateNodeIds = new List<string>();

        /// <summary>Creates the spec.</summary>
        /// <param name="id">Dialogue id (<c>dlg.…</c>).</param>
        /// <param name="title">Internal title for lists.</param>
        /// <param name="mode">Full or short mode.</param>
        /// <param name="speakerId">Default speaker (NPC id) of the lines.</param>
        /// <param name="startNodeId">Start node; empty = first node.</param>
        /// <param name="cancelable">True if B / Esc may cancel the conversation where no end option exists.</param>
        /// <param name="questId">Quest the dialogue belongs to (information for editors and the validator).</param>
        /// <param name="questExitIds">Exits that advance a quest (options leading there get the diamond).</param>
        /// <param name="nodes">Nodes.</param>
        public DialogueSpec(string id, string title, DialogueMode mode, string speakerId, string startNodeId, bool cancelable, string questId,
            IEnumerable<string> questExitIds, IEnumerable<DialogueNode> nodes)
        {
            Id = id ?? string.Empty;
            Title = title ?? string.Empty;
            Mode = mode;
            SpeakerId = speakerId ?? string.Empty;
            Cancelable = cancelable;
            QuestId = questId ?? string.Empty;
            _questExits = new HashSet<string>(StringComparer.Ordinal);
            if (questExitIds != null)
            {
                foreach (string exit in questExitIds)
                {
                    if (!string.IsNullOrEmpty(exit))
                    {
                        _questExits.Add(exit);
                    }
                }
            }

            _nodes = nodes != null ? new List<DialogueNode>(nodes) : new List<DialogueNode>();
            for (int i = 0; i < _nodes.Count; i++)
            {
                DialogueNode node = _nodes[i];
                if (node == null || node.Id.Length == 0)
                {
                    continue;
                }

                if (_byId.ContainsKey(node.Id))
                {
                    _duplicateNodeIds.Add(node.Id);
                    continue;
                }

                _byId.Add(node.Id, node);
            }

            StartNodeId = !string.IsNullOrEmpty(startNodeId) ? startNodeId : FirstNodeId();
        }

        /// <summary>Dialogue id.</summary>
        public string Id { get; }

        /// <summary>Internal title.</summary>
        public string Title { get; }

        /// <summary>Conversation mode.</summary>
        public DialogueMode Mode { get; }

        /// <summary>Default speaker of the lines.</summary>
        public string SpeakerId { get; }

        /// <summary>Start node (resolved: the first node if none was set).</summary>
        public string StartNodeId { get; }

        /// <summary>True if B / Esc may cancel the conversation where no end option exists.</summary>
        public bool Cancelable { get; }

        /// <summary>Quest the dialogue belongs to; empty if none.</summary>
        public string QuestId { get; }

        /// <summary>Exits that advance a quest.</summary>
        public IReadOnlyCollection<string> QuestExitIds => _questExits;

        /// <summary>All nodes in list order (may contain null entries of missing types).</summary>
        public IReadOnlyList<DialogueNode> Nodes => _nodes;

        /// <summary>Node ids that appear more than once (the first wins; validator V01).</summary>
        public IReadOnlyList<string> DuplicateNodeIds => _duplicateNodeIds;

        /// <summary>Returns a node by id.</summary>
        /// <param name="nodeId">Node id.</param>
        /// <param name="node">The node.</param>
        public bool TryGetNode(string nodeId, out DialogueNode node)
        {
            if (nodeId != null && _byId.TryGetValue(nodeId, out node))
            {
                return true;
            }

            node = null;
            return false;
        }

        /// <summary>True if a node with this id exists.</summary>
        /// <param name="nodeId">Node id.</param>
        public bool HasNode(string nodeId)
        {
            return nodeId != null && _byId.ContainsKey(nodeId);
        }

        /// <summary>True if the exit advances a quest (diamond on options that lead there).</summary>
        /// <param name="exitId">Exit id.</param>
        public bool IsQuestExit(string exitId)
        {
            return !string.IsNullOrEmpty(exitId) && _questExits.Contains(exitId);
        }

        /// <inheritdoc />
        public override string ToString()
        {
            return "DialogueSpec(" + Id + ", " + _nodes.Count + " nodes)";
        }

        private string FirstNodeId()
        {
            for (int i = 0; i < _nodes.Count; i++)
            {
                if (_nodes[i] != null && _nodes[i].Id.Length > 0)
                {
                    return _nodes[i].Id;
                }
            }

            return string.Empty;
        }
    }
}
