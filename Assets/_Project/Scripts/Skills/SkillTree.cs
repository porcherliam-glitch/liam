using System;
using System.Collections.Generic;

namespace Aetherfall.Skills
{
    /// <summary>
    /// The skill tree of one class (GDD 03 11.3–11.5): a core and three branches with their nodes. Built from
    /// <see cref="SkillTreeDefinition"/> or in tests directly.
    /// </summary>
    public sealed class SkillTree
    {
        private readonly List<SkillNode> _nodes = new List<SkillNode>();
        private readonly Dictionary<string, SkillNode> _byId = new Dictionary<string, SkillNode>(StringComparer.Ordinal);

        /// <summary>Creates the tree.</summary>
        /// <param name="classId">Class id, e.g. <c>class.krieger</c>.</param>
        /// <param name="displayName">Name, e.g. "Krieger".</param>
        /// <param name="branchNames">Names of branches 1–3 (index 0 is the core).</param>
        /// <param name="nodes">Nodes (duplicates are dropped).</param>
        public SkillTree(string classId, string displayName, string[] branchNames, IEnumerable<SkillNode> nodes)
        {
            ClassId = classId ?? string.Empty;
            DisplayName = displayName ?? string.Empty;
            BranchNames = new string[4];
            BranchNames[0] = "Kern";
            for (int i = 1; i < 4; i++)
            {
                BranchNames[i] = branchNames != null && i - 1 < branchNames.Length && branchNames[i - 1] != null ? branchNames[i - 1] : "Ast " + i;
            }

            if (nodes == null)
            {
                return;
            }

            foreach (SkillNode node in nodes)
            {
                if (node != null && node.Id.Length > 0 && !_byId.ContainsKey(node.Id))
                {
                    _nodes.Add(node);
                    _byId[node.Id] = node;
                }
            }
        }

        /// <summary>Class id.</summary>
        public string ClassId { get; }

        /// <summary>Name.</summary>
        public string DisplayName { get; }

        /// <summary>Branch names, index 0 = core, 1–3 = branches.</summary>
        public string[] BranchNames { get; }

        /// <summary>Nodes in their order (core first, then branch by branch).</summary>
        public IReadOnlyList<SkillNode> Nodes => _nodes;

        /// <summary>The core node, or null.</summary>
        public SkillNode Core
        {
            get
            {
                for (int i = 0; i < _nodes.Count; i++)
                {
                    if (_nodes[i].Kind == SkillNodeKind.Core)
                    {
                        return _nodes[i];
                    }
                }

                return null;
            }
        }

        /// <summary>The node with this id, or null.</summary>
        /// <param name="nodeId">Node id.</param>
        public SkillNode Find(string nodeId)
        {
            return nodeId != null && _byId.TryGetValue(nodeId, out SkillNode node) ? node : null;
        }

        /// <summary>Returns an error text if the tree is broken (unknown requirements or fork partners, no core), otherwise empty.</summary>
        public string Validate()
        {
            if (ClassId.Length == 0)
            {
                return "Skill tree without class id.";
            }

            if (Core == null)
            {
                return "Skill tree '" + ClassId + "' has no core node.";
            }

            for (int i = 0; i < _nodes.Count; i++)
            {
                SkillNode node = _nodes[i];
                if (!node.Id.StartsWith("skill.", StringComparison.Ordinal))
                {
                    return "Node '" + node.Id + "': the id must start with 'skill.'.";
                }

                string[] requires = node.Requires;
                for (int r = 0; r < requires.Length; r++)
                {
                    if (Find(requires[r]) == null)
                    {
                        return "Node '" + node.Id + "' needs the unknown node '" + requires[r] + "'.";
                    }
                }

                if (node.ForkWith.Length > 0)
                {
                    SkillNode partner = Find(node.ForkWith);
                    if (partner == null || partner.ForkWith != node.Id)
                    {
                        return "Node '" + node.Id + "': fork partner '" + node.ForkWith + "' is missing or does not point back.";
                    }
                }

                if (node.Kind == SkillNodeKind.Active && node.AbilityId.Length == 0)
                {
                    return "Active node '" + node.Id + "' teaches no ability.";
                }
            }

            return string.Empty;
        }
    }
}
