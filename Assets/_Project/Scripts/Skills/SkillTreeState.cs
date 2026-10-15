using System;
using System.Collections.Generic;

namespace Aetherfall.Skills
{
    /// <summary>Why a node cannot be learned now (GDD 03 11.3).</summary>
    public enum SkillCheck
    {
        /// <summary>It can be learned.</summary>
        Ok = 0,

        /// <summary>No such node.</summary>
        Unknown = 1,

        /// <summary>All ranks learned.</summary>
        MaxRank = 2,

        /// <summary>Too few free skill points.</summary>
        NotEnoughPoints = 3,

        /// <summary>The character level is too low (key nodes: 20).</summary>
        LevelTooLow = 4,

        /// <summary>Too few points in the lower stages of the branch.</summary>
        TierLocked = 5,

        /// <summary>A required node is missing.</summary>
        NeedsRequirement = 6,

        /// <summary>The other side of the fork is learned.</summary>
        ForkTaken = 7,

        /// <summary>The core of the tree is not learned.</summary>
        NeedsCore = 8
    }

    /// <summary>
    /// Learned ranks of the nodes of a skill tree and the rules for learning and taking back (GDD 03 11.3, 11.9). Ranks
    /// learned since the skill page was opened (the "session") can be taken back until it closes, unless another node needs
    /// them. Pure C#.
    /// </summary>
    /// <remarks>
    /// Stage rule: a node of stage II needs 3 points in the same branch spent on nodes of lower stages (III: 6, IV: 10, V: 14),
    /// so a node never unlocks itself.
    /// </remarks>
    public sealed class SkillTreeState
    {
        private readonly Dictionary<string, int> _ranks = new Dictionary<string, int>(StringComparer.Ordinal);
        private readonly Dictionary<string, int> _session = new Dictionary<string, int>(StringComparer.Ordinal);

        /// <summary>Counts every change.</summary>
        public int Revision { get; private set; }

        /// <summary>Points a stage needs in its branch (GDD 03 11.3: I 0, II 3, III 6, IV 10, V 14).</summary>
        /// <param name="tier">Stage 1–5.</param>
        public static int TierPoints(int tier)
        {
            switch (tier)
            {
                case 2:
                    return 3;
                case 3:
                    return 6;
                case 4:
                    return 10;
                case 5:
                    return 14;
                default:
                    return 0;
            }
        }

        /// <summary>Learned rank of a node (0 = not learned).</summary>
        /// <param name="nodeId">Node id.</param>
        public int Rank(string nodeId)
        {
            return nodeId != null && _ranks.TryGetValue(nodeId, out int rank) ? rank : 0;
        }

        /// <summary>Ranks learned since the page was opened.</summary>
        /// <param name="nodeId">Node id.</param>
        public int SessionRank(string nodeId)
        {
            return nodeId != null && _session.TryGetValue(nodeId, out int rank) ? rank : 0;
        }

        /// <summary>Points spent in a branch on nodes below a stage (all stages: <paramref name="belowTier"/> = 6).</summary>
        /// <param name="tree">Tree.</param>
        /// <param name="branch">Branch 1–3.</param>
        /// <param name="belowTier">Only nodes of lower stages count.</param>
        public int PointsInBranch(SkillTree tree, int branch, int belowTier = 6)
        {
            int points = 0;
            IReadOnlyList<SkillNode> nodes = tree.Nodes;
            for (int i = 0; i < nodes.Count; i++)
            {
                SkillNode node = nodes[i];
                if (node.Branch == branch && node.Tier < belowTier)
                {
                    points += Rank(node.Id) * Math.Max(1, node.Cost);
                }
            }

            return points;
        }

        /// <summary>Skill points spent in the whole tree.</summary>
        /// <param name="tree">Tree.</param>
        public int SpentPoints(SkillTree tree)
        {
            int points = 0;
            IReadOnlyList<SkillNode> nodes = tree.Nodes;
            for (int i = 0; i < nodes.Count; i++)
            {
                points += Rank(nodes[i].Id) * nodes[i].Cost;
            }

            return points;
        }

        /// <summary>Checks whether one more rank of the node can be learned.</summary>
        /// <param name="tree">Tree.</param>
        /// <param name="node">Node.</param>
        /// <param name="freePoints">Free skill points.</param>
        /// <param name="level">Character level.</param>
        public SkillCheck Check(SkillTree tree, SkillNode node, int freePoints, int level)
        {
            if (tree == null || node == null || tree.Find(node.Id) == null)
            {
                return SkillCheck.Unknown;
            }

            if (Rank(node.Id) >= node.MaxRank)
            {
                return SkillCheck.MaxRank;
            }

            SkillNode core = tree.Core;
            if (node.Kind != SkillNodeKind.Core && core != null && Rank(core.Id) == 0)
            {
                return SkillCheck.NeedsCore;
            }

            if (level < node.MinLevel)
            {
                return SkillCheck.LevelTooLow;
            }

            if (node.Branch > 0 && PointsInBranch(tree, node.Branch, node.Tier) < TierPoints(node.Tier))
            {
                return SkillCheck.TierLocked;
            }

            string[] requires = node.Requires;
            for (int i = 0; i < requires.Length; i++)
            {
                if (Rank(requires[i]) == 0)
                {
                    return SkillCheck.NeedsRequirement;
                }
            }

            if (node.ForkWith.Length > 0 && Rank(node.ForkWith) > 0)
            {
                return SkillCheck.ForkTaken;
            }

            return freePoints >= node.Cost ? SkillCheck.Ok : SkillCheck.NotEnoughPoints;
        }

        /// <summary>Adds one rank (the caller checked and paid).</summary>
        /// <param name="nodeId">Node id.</param>
        /// <param name="takeBackable">True: counts for the session and can be taken back until <see cref="LockSession"/>.</param>
        public void Add(string nodeId, bool takeBackable)
        {
            _ranks[nodeId] = Rank(nodeId) + 1;
            if (takeBackable)
            {
                _session[nodeId] = SessionRank(nodeId) + 1;
            }

            Revision++;
        }

        /// <summary>
        /// True if the last rank of the node was learned in this session and taking it back leaves every other learned node
        /// valid (its requirements and its stage).
        /// </summary>
        /// <param name="tree">Tree.</param>
        /// <param name="node">Node.</param>
        public bool CanRefund(SkillTree tree, SkillNode node)
        {
            if (tree == null || node == null || node.Kind == SkillNodeKind.Core || SessionRank(node.Id) <= 0 || Rank(node.Id) <= 0)
            {
                return false;
            }

            _ranks[node.Id] = Rank(node.Id) - 1;
            bool valid = true;
            IReadOnlyList<SkillNode> nodes = tree.Nodes;
            for (int i = 0; i < nodes.Count && valid; i++)
            {
                SkillNode other = nodes[i];
                if (Rank(other.Id) == 0)
                {
                    continue;
                }

                if (other.Branch > 0 && PointsInBranch(tree, other.Branch, other.Tier) < TierPoints(other.Tier))
                {
                    valid = false;
                }

                string[] requires = other.Requires;
                for (int r = 0; r < requires.Length && valid; r++)
                {
                    valid = Rank(requires[r]) > 0;
                }
            }

            _ranks[node.Id] = Rank(node.Id) + 1;
            return valid;
        }

        /// <summary>Takes back one rank (the caller checked <see cref="CanRefund"/> and gives the points back).</summary>
        /// <param name="nodeId">Node id.</param>
        public void Remove(string nodeId)
        {
            int rank = Rank(nodeId) - 1;
            if (rank > 0)
            {
                _ranks[nodeId] = rank;
            }
            else
            {
                _ranks.Remove(nodeId);
            }

            int session = SessionRank(nodeId) - 1;
            if (session > 0)
            {
                _session[nodeId] = session;
            }
            else
            {
                _session.Remove(nodeId);
            }

            Revision++;
        }

        /// <summary>Makes the ranks of the session final (the page closes).</summary>
        public void LockSession()
        {
            _session.Clear();
        }

        /// <summary>Forgets everything (new game).</summary>
        public void Clear()
        {
            _ranks.Clear();
            _session.Clear();
            Revision++;
        }

        /// <summary>Loads saved ranks (unknown or broken entries are dropped by the caller's tree check later).</summary>
        /// <param name="nodeIds">Node ids.</param>
        /// <param name="ranks">Ranks in the same order.</param>
        public void Load(string[] nodeIds, int[] ranks)
        {
            Clear();
            if (nodeIds == null || ranks == null)
            {
                return;
            }

            for (int i = 0; i < nodeIds.Length && i < ranks.Length; i++)
            {
                if (!string.IsNullOrEmpty(nodeIds[i]) && ranks[i] > 0)
                {
                    _ranks[nodeIds[i]] = ranks[i];
                }
            }
        }

        /// <summary>The learned ranks for saving.</summary>
        /// <param name="nodeIds">Node ids.</param>
        /// <param name="ranks">Ranks.</param>
        public void Capture(out string[] nodeIds, out int[] ranks)
        {
            nodeIds = new string[_ranks.Count];
            ranks = new int[_ranks.Count];
            int i = 0;
            foreach (KeyValuePair<string, int> entry in _ranks)
            {
                nodeIds[i] = entry.Key;
                ranks[i] = entry.Value;
                i++;
            }
        }
    }
}
