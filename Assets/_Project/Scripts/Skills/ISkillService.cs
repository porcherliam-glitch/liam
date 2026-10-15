using System;

namespace Aetherfall.Skills
{
    /// <summary>
    /// The skill trees (GDD 03 11): the tree of the current class, the learned nodes, learning with skill points and taking
    /// back while the skill page is open, and what the learned nodes give (<see cref="Bonuses"/>). Saved in the section
    /// <c>skills</c>.
    /// </summary>
    public interface ISkillService
    {
        /// <summary>Counts every change (learned nodes, class, points).</summary>
        int Revision { get; }

        /// <summary>The tree of the class of the running game, or null.</summary>
        SkillTree CurrentTree { get; }

        /// <summary>Free skill points.</summary>
        int FreePoints { get; }

        /// <summary>Character level (stage V and key nodes need levels).</summary>
        int Level { get; }

        /// <summary>What the learned nodes of the current tree give.</summary>
        SkillBonuses Bonuses { get; }

        /// <summary>The player's ability bar (null while there is no player).</summary>
        ISkillLoadout Loadout { get; set; }

        /// <summary>Raised after every change.</summary>
        event Action Changed;

        /// <summary>Learned rank of a node of the current tree.</summary>
        /// <param name="nodeId">Node id.</param>
        int Rank(string nodeId);

        /// <summary>Checks whether one more rank of the node can be learned now.</summary>
        /// <param name="nodeId">Node id.</param>
        SkillCheck Check(string nodeId);

        /// <summary>Learns one rank and pays the skill points.</summary>
        /// <param name="nodeId">Node id.</param>
        /// <returns>False if <see cref="Check"/> refuses.</returns>
        bool TryLearn(string nodeId);

        /// <summary>True if the last rank can be taken back (learned since the page was opened, nothing depends on it).</summary>
        /// <param name="nodeId">Node id.</param>
        bool CanRefund(string nodeId);

        /// <summary>Takes back one rank learned since the page was opened; the points come back.</summary>
        /// <param name="nodeId">Node id.</param>
        bool TryRefund(string nodeId);

        /// <summary>Makes the ranks learned on the page final (it closes).</summary>
        void LockSession();
    }
}
