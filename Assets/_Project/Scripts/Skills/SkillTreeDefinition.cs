using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.Skills
{
    /// <summary>
    /// The skill tree of a class as content (GDD 03 11.3–11.5): core and three branches. Lives in
    /// <c>Assets/_Project/Data/Skills/</c>; the <see cref="SkillInstaller"/> lists the trees (Stufe A: Krieger and Magier with
    /// about 15 nodes each).
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Charakter/Skill-Baum", fileName = "SkillBaum", order = 41)]
    public sealed class SkillTreeDefinition : ScriptableObject
    {
        [Tooltip("Klasse des Baums, z. B. class.krieger.")]
        [SerializeField] private string classId = "class.neu";

        [Tooltip("Name des Baums.")]
        [SerializeField] private string displayName = "Neuer Baum";

        [Tooltip("Namen der drei Äste (z. B. Waffenmeister, Bollwerk, Kriegsherr).")]
        [SerializeField] private string[] branchNames = { "Ast 1", "Ast 2", "Ast 3" };

        [Tooltip("Knoten: zuerst der Kern, dann Ast für Ast.")]
        [SerializeField] private List<SkillNode> nodes = new List<SkillNode>();

        /// <summary>Class id.</summary>
        public string ClassId => classId ?? string.Empty;

        /// <summary>Sets all values (generators and tests; the values follow the GDD in code, not in the asset).</summary>
        /// <param name="newClassId">Class id.</param>
        /// <param name="newDisplayName">Name.</param>
        /// <param name="newBranchNames">Names of the three branches.</param>
        /// <param name="newNodes">Nodes.</param>
        public void Fill(string newClassId, string newDisplayName, string[] newBranchNames, IEnumerable<SkillNode> newNodes)
        {
            classId = newClassId ?? string.Empty;
            displayName = newDisplayName ?? string.Empty;
            branchNames = newBranchNames ?? new string[0];
            nodes = newNodes != null ? new List<SkillNode>(newNodes) : new List<SkillNode>();
        }

        /// <summary>Builds the tree.</summary>
        public SkillTree CreateTree()
        {
            return new SkillTree(ClassId, displayName, branchNames, nodes);
        }
    }
}
